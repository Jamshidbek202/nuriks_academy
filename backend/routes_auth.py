"""Phone-and-password authentication, invitation activation, and recovery."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator

from auth import create_access_token, get_current_user, get_password_hash, verify_password
from phone_auth import (
    PasswordPolicyError,
    PhoneValidationError,
    issue_access_code,
    normalize_phone,
    validate_password,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15


class PhonePasswordLogin(BaseModel):
    phone: Optional[str] = None
    # Students without their own phone use their generated student ID here.
    login: Optional[str] = None
    password: str = Field(..., min_length=1, max_length=128)

    @model_validator(mode="after")
    def require_identity(self):
        if not (self.phone or self.login):
            raise ValueError("Phone number or account login is required")
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


async def get_password_change_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db, allow_password_change=True)


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


@router.post("/managed-credentials/{user_id}")
async def reset_managed_credentials(
    user_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Create a one-time password for an account within the actor's authority."""
    from server import create_audit_log, db

    if current_user.get("role") not in {"super_admin", "manager"}:
        raise HTTPException(status_code=403, detail="Administrator or manager access required")
    try:
        target = await db.users.find_one({"_id": ObjectId(user_id), "is_deleted": {"$ne": True}})
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid user id") from error
    if not target:
        raise HTTPException(status_code=404, detail="Account not found")
    if target.get("account_status") == "deactivated":
        raise HTTPException(status_code=409, detail="Reactivate the account before resetting its password")
    if current_user.get("role") == "manager":
        if target.get("role") in {"super_admin", "manager"}:
            raise HTTPException(status_code=403, detail="Managers cannot reset leadership accounts")
        if target.get("branch_id") != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Cannot reset an account from another branch")

    issued = await issue_access_code(
        db,
        target,
        purpose="password_reset" if target.get("password_hash") else "invite",
        actor_id=str(current_user["_id"]),
        request_ip=_client_ip(request),
    )
    await create_audit_log(
        str(current_user["_id"]),
        "issue_managed_credentials",
        "user",
        user_id,
        {"role": target.get("role"), "sessions_revoked": True},
        _client_ip(request),
    )
    return {
        "message": "Temporary credentials created. They are shown only once.",
        "credentials": issued.credentials,
    }


@router.post("/managed-credentials/pending/issue")
async def issue_pending_managed_credentials(
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Issue credentials for accounts that never completed activation."""
    from server import create_audit_log, db

    if current_user.get("role") not in {"super_admin", "manager"}:
        raise HTTPException(status_code=403, detail="Administrator or manager access required")
    query: dict = {
        "account_status": {"$in": ["pending_invite", "credentials_required"]},
        "is_deleted": {"$ne": True},
    }
    if current_user.get("role") == "manager":
        query.update({
            "branch_id": current_user.get("branch_id"),
            "role": {"$nin": ["super_admin", "manager"]},
        })
    pending = await db.users.find(query).sort("full_name", 1).to_list(500)
    prepared = []
    for target in pending:
        issued = await issue_access_code(
            db,
            target,
            purpose="invite",
            actor_id=str(current_user["_id"]),
            request_ip=_client_ip(request),
        )
        prepared.append({
            "user_id": str(target["_id"]),
            "label": target.get("full_name") or target.get("login"),
            "role": target.get("role"),
            **(issued.credentials or {}),
        })
    await create_audit_log(
        str(current_user["_id"]),
        "issue_pending_managed_credentials",
        "user",
        "bulk",
        {"count": len(prepared)},
        _client_ip(request),
    )
    return {"message": f"Prepared {len(prepared)} account(s)", "credentials": prepared}


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
    return result


def _password_error(error: PasswordPolicyError) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": "PASSWORD_POLICY", "message": str(error)})


async def _find_login_user(db, credentials: PhonePasswordLogin) -> Optional[dict]:
    identity = (credentials.phone or credentials.login or "").strip()
    try:
        normalized = normalize_phone(identity)
    except PhoneValidationError:
        login = (credentials.login or identity).strip()
        if not login:
            return None
        return await db.users.find_one({"login": login})
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
        raise HTTPException(status_code=401, detail="Invalid login or password")

    account_status = user.get("account_status", "active")
    if account_status in {"pending_invite", "credentials_required", "phone_required"} or not user.get("password_hash"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ACCOUNT_ACTIVATION_REQUIRED",
                "message": "Ask an administrator or manager to issue your account credentials.",
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


@router.post("/invitations/resend", status_code=status.HTTP_410_GONE)
@router.post("/invitations/accept", status_code=status.HTTP_410_GONE)
@router.post("/password-reset/request", status_code=status.HTTP_410_GONE)
@router.post("/password-reset/confirm", status_code=status.HTTP_410_GONE)
async def retired_telegram_otp():
    raise HTTPException(
        status_code=410,
        detail="Telegram verification was retired. Ask an administrator or manager for new credentials.",
    )


@router.post("/password/change")
async def change_password(
    payload: PasswordChange,
    request: Request,
    current_user: dict = Depends(get_password_change_user_dep),
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
            "must_change_password": False,
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
