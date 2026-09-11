"""Phone-and-password authentication, invitation activation, and recovery."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from auth import create_access_token, get_current_user, get_password_hash, verify_password
from phone_auth import (
    OtpCodeError,
    OtpDeliveryError,
    OtpRateLimitError,
    PasswordPolicyError,
    PhoneValidationError,
    consume_otp,
    get_user_by_phone,
    issue_otp,
    legacy_login_allowed,
    normalize_phone,
    validate_password,
)
from telegram_auth import create_telegram_link, disconnect_telegram
from telegram_service import (
    TelegramDeliveryError,
    bot_username,
    telegram_provider_health,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15


class PhonePasswordLogin(BaseModel):
    phone: Optional[str] = None
    # Kept as a request alias for disposable QA fixtures only. Production
    # accounts are always resolved by normalized phone number.
    login: Optional[str] = None
    password: str = Field(..., min_length=1, max_length=128)

    @model_validator(mode="after")
    def require_identity(self):
        if not (self.phone or self.login):
            raise ValueError("Phone number is required")
        return self


class PhoneRequest(BaseModel):
    phone: str = Field(..., min_length=9, max_length=30)


class CodeAndPassword(BaseModel):
    phone: str = Field(..., min_length=9, max_length=30)
    code: str = Field(..., pattern=r"^\d{6}$")
    password: str = Field(..., min_length=10, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=10, max_length=128)


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _public_user(user: dict) -> dict:
    from server import serialize_doc

    result = serialize_doc(user.copy())
    for key in (
        "password_hash",
        "two_factor_secret",
        "two_factor_secret_temp",
        "failed_login_attempts",
        "locked_until",
        "token_version",
        "telegram_user_id",
        "telegram_chat_id",
        "telegram_first_name",
        "telegram_last_name",
    ):
        result.pop(key, None)
    result["telegram_connected"] = user.get("telegram_link_status") == "linked"
    return result


def _otp_error(error: OtpCodeError) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": error.code, "message": str(error)})


def _password_error(error: PasswordPolicyError) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": "PASSWORD_POLICY", "message": str(error)})


async def _find_login_user(db, credentials: PhonePasswordLogin) -> Optional[dict]:
    identity = (credentials.phone or credentials.login or "").strip()
    try:
        normalized = normalize_phone(identity)
    except PhoneValidationError:
        if legacy_login_allowed() and credentials.login:
            return await db.users.find_one({"login": credentials.login.strip()})
        return None
    return await db.users.find_one({"phone_normalized": normalized})


@router.post("/login")
async def phone_password_login(credentials: PhonePasswordLogin, request: Request):
    from server import create_audit_log, db

    user = await _find_login_user(db, credentials)
    now = datetime.utcnow()
    if user and user.get("locked_until") and user["locked_until"] > now:
        raise HTTPException(
            status_code=429,
            detail={"code": "LOGIN_LOCKED", "message": "Too many attempts. Try again later."},
            headers={"Retry-After": str(int((user["locked_until"] - now).total_seconds()))},
        )

    valid_password = bool(
        user
        and user.get("password_hash")
        and verify_password(credentials.password, user["password_hash"])
    )
    if not valid_password:
        if user:
            attempts = int(user.get("failed_login_attempts", 0)) + 1
            update = {"failed_login_attempts": attempts, "last_failed_login_at": now}
            if attempts >= MAX_LOGIN_ATTEMPTS:
                update["locked_until"] = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
            await db.users.update_one({"_id": user["_id"]}, {"$set": update})
        raise HTTPException(status_code=401, detail="Invalid phone number or password")

    account_status = user.get("account_status", "active")
    if user.get("identity_verified_via") == "telegram":
        identity_verified = bool(user.get("telegram_verified"))
    else:
        identity_verified = bool(user.get("phone_verified", True))
    if account_status == "pending_invite" or not identity_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ACCOUNT_ACTIVATION_REQUIRED",
                "message": "Activate this account using the code from the Nurik's Academy Telegram bot before signing in.",
            },
        )
    if not user.get("is_active", True) or account_status == "deactivated":
        raise HTTPException(status_code=403, detail="Account is inactive")

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": now, "failed_login_attempts": 0}, "$unset": {"locked_until": ""}},
    )
    await create_audit_log(
        str(user["_id"]),
        "login",
        "user",
        str(user["_id"]),
        {"method": "phone_password"},
        _client_ip(request),
    )
    access_token = create_access_token(data={
        "sub": str(user["_id"]),
        "role": user["role"],
        "token_version": int(user.get("token_version", 0)),
    })
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _public_user(user),
    }


async def _request_code(
    db,
    *,
    phone: str,
    purpose: str,
    request: Request,
) -> dict:
    generic = {
        "message": "If the account is eligible and Telegram is connected, a verification code has been sent.",
        "retry_after_seconds": 60,
    }
    try:
        user = await get_user_by_phone(db, phone)
    except PhoneValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not user:
        return generic
    if purpose == "invite" and user.get("account_status") != "pending_invite":
        return generic
    if purpose == "password_reset" and (
        not user.get("is_active", False) or user.get("account_status") != "active"
    ):
        return generic
    try:
        result = await issue_otp(
            db,
            user=user,
            purpose=purpose,
            requested_by=str(user["_id"]),
            request_ip=_client_ip(request),
        )
        generic["retry_after_seconds"] = result.retry_after_seconds
    except OtpRateLimitError as error:
        generic["retry_after_seconds"] = error.retry_after_seconds
    except OtpDeliveryError as error:
        # Do not tell a real account holder that a code was sent when the
        # provider rejected it. Failed challenges contain no usable plaintext
        # code and remain visible to administrators for diagnosis.
        raise HTTPException(
            status_code=503,
            detail={
                "code": error.code,
                "message": (
                    "Telegram could not send the verification code. "
                    "Open @nuriksacademy_bot, make sure it is not blocked, and try again. "
                    "If it still fails, ask an administrator to check Telegram delivery."
                ),
            },
        ) from error
    return generic


@router.post("/invitations/resend", status_code=status.HTTP_202_ACCEPTED)
async def resend_invitation(payload: PhoneRequest, request: Request):
    from server import db

    return await _request_code(db, phone=payload.phone, purpose="invite", request=request)


@router.post("/invitations/accept")
async def accept_invitation(payload: CodeAndPassword, request: Request):
    from server import create_audit_log, db

    try:
        normalized = normalize_phone(payload.phone)
        validate_password(payload.password)
    except PhoneValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except PasswordPolicyError as error:
        raise _password_error(error) from error

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                user = await db.users.find_one(
                    {"phone_normalized": normalized, "account_status": "pending_invite"},
                    session=session,
                )
                if not user:
                    raise OtpCodeError("INVITATION_NOT_FOUND", "No pending invitation was found")
                await consume_otp(
                    db,
                    phone=normalized,
                    purpose="invite",
                    code=payload.code,
                    session=session,
                )
                activated_at = datetime.utcnow()
                result = await db.users.update_one(
                    {"_id": user["_id"], "account_status": "pending_invite"},
                    {"$set": {
                        "password_hash": get_password_hash(payload.password),
                        "telegram_verified": True,
                        "identity_verified_via": "telegram",
                        "is_active": True,
                        "account_status": "active",
                        "invitation_accepted_at": activated_at,
                        "updated_at": activated_at,
                        "failed_login_attempts": 0,
                    }, "$unset": {"locked_until": ""}},
                    session=session,
                )
                if result.modified_count != 1:
                    raise OtpCodeError("INVITATION_ALREADY_USED", "Invitation has already been accepted")
    except OtpCodeError as error:
        raise _otp_error(error) from error

    await create_audit_log(
        str(user["_id"]),
        "accept_invitation",
        "user",
        str(user["_id"]),
        {"identity_verified_via": "telegram"},
        _client_ip(request),
    )
    return {"message": "Account activated. You can now sign in."}


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(payload: PhoneRequest, request: Request):
    from server import db

    return await _request_code(db, phone=payload.phone, purpose="password_reset", request=request)


@router.post("/password-reset/confirm")
async def confirm_password_reset(payload: CodeAndPassword, request: Request):
    from server import create_audit_log, db

    try:
        normalized = normalize_phone(payload.phone)
        validate_password(payload.password)
    except PhoneValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except PasswordPolicyError as error:
        raise _password_error(error) from error

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                user = await db.users.find_one(
                    {
                        "phone_normalized": normalized,
                        "account_status": "active",
                        "is_active": True,
                    },
                    session=session,
                )
                if not user:
                    raise OtpCodeError("RESET_NOT_FOUND", "Password reset request was not found")
                await consume_otp(
                    db,
                    phone=normalized,
                    purpose="password_reset",
                    code=payload.code,
                    session=session,
                )
                if user.get("password_hash") and verify_password(payload.password, user["password_hash"]):
                    raise OtpCodeError("PASSWORD_REUSED", "Choose a password you have not just used")
                changed_at = datetime.utcnow()
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "password_hash": get_password_hash(payload.password),
                        "password_changed_at": changed_at,
                        "updated_at": changed_at,
                        "failed_login_attempts": 0,
                    }, "$inc": {"token_version": 1}, "$unset": {"locked_until": ""}},
                    session=session,
                )
    except OtpCodeError as error:
        raise _otp_error(error) from error

    await create_audit_log(
        str(user["_id"]),
        "password_reset",
        "user",
        str(user["_id"]),
        {"sessions_revoked": True},
        _client_ip(request),
    )
    return {"message": "Password changed. Sign in with the new password."}


@router.post("/password/change")
async def change_password(
    payload: PasswordChange,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    if not current_user.get("password_hash") or not verify_password(
        payload.current_password, current_user["password_hash"]
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    try:
        validate_password(payload.new_password)
    except PasswordPolicyError as error:
        raise _password_error(error) from error
    if verify_password(payload.new_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="New password must be different")
    changed_at = datetime.utcnow()
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "password_hash": get_password_hash(payload.new_password),
            "password_changed_at": changed_at,
            "updated_at": changed_at,
        }, "$inc": {"token_version": 1}},
    )
    await create_audit_log(
        str(current_user["_id"]),
        "change_password",
        "user",
        str(current_user["_id"]),
        {"sessions_revoked": True},
        _client_ip(request),
    )
    return {"message": "Password changed. Please sign in again."}


@router.get("/telegram/status")
async def telegram_connection_status(current_user: dict = Depends(get_current_user_dep)):
    return {
        "connected": current_user.get("telegram_link_status") == "linked",
        "bot_username": bot_username(),
        "telegram_username": current_user.get("telegram_username"),
        "linked_at": current_user.get("telegram_linked_at"),
    }


@router.get("/telegram/provider-health")
async def telegram_delivery_health(current_user: dict = Depends(get_current_user_dep)):
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        return await telegram_provider_health()
    except TelegramDeliveryError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/telegram/link")
async def create_my_telegram_link(
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    if not current_user.get("is_active", True) or current_user.get("account_status") != "active":
        raise HTTPException(status_code=409, detail="Only an active account can connect Telegram")
    link = await create_telegram_link(
        db,
        user=current_user,
        purpose="connect",
        actor_id=str(current_user["_id"]),
        request_ip=_client_ip(request),
    )
    await create_audit_log(
        str(current_user["_id"]),
        "create_telegram_connection_link",
        "user",
        str(current_user["_id"]),
        {"expires_at": link.expires_at.isoformat()},
        _client_ip(request),
    )
    return {
        "telegram_invite_url": link.url,
        "telegram_invite_qr": link.qr_data_url,
        "telegram_invite_expires_at": link.expires_at,
        "bot_username": bot_username(),
    }


@router.delete("/telegram/link")
async def disconnect_my_telegram(
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    await disconnect_telegram(db, current_user)
    await create_audit_log(
        str(current_user["_id"]),
        "telegram_disconnected",
        "user",
        str(current_user["_id"]),
        {},
        _client_ip(request),
    )
    return {"message": "Telegram disconnected", "connected": False}
