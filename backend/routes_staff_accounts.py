"""Super-admin lifecycle management for manager and reception accounts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from auth import get_current_user
from phone_auth import (
    OtpDeliveryError,
    OtpRateLimitError,
    PhoneValidationError,
    invited_user_document,
    issue_invitation,
    issue_otp,
    normalize_phone,
)


router = APIRouter(prefix="/staff-accounts", tags=["Staff Accounts"])
security = HTTPBearer()
MANAGED_ROLES = {"manager", "reception"}


class StaffAccountCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=9, max_length=30)
    email: Optional[EmailStr] = None
    role: Literal["manager", "reception"]
    language_preference: Literal["en", "ru", "uz"] = "ru"


class StaffAccountUpdate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: Optional[EmailStr] = None
    language_preference: Literal["en", "ru", "uz"] = "ru"


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db

    return await get_current_user(credentials, db)


def require_super_admin(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _public_account(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "phone": user.get("phone_normalized") or user.get("phone"),
        "email": user.get("email"),
        "role": user.get("role"),
        "language_preference": user.get("language_preference", "ru"),
        "account_status": user.get("account_status", "active"),
        "phone_verified": bool(user.get("phone_verified", False)),
        "is_active": bool(user.get("is_active", False)),
        "invite_delivery_status": user.get("invite_delivery_status"),
        "invite_sent_at": user.get("invite_sent_at"),
        "last_login": user.get("last_login"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }


async def _managed_user(db, account_id: str) -> dict:
    try:
        object_id = ObjectId(account_id)
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid account ID") from error
    user = await db.users.find_one({"_id": object_id, "role": {"$in": list(MANAGED_ROLES)}})
    if not user:
        raise HTTPException(status_code=404, detail="Staff account not found")
    return user


@router.get("")
async def list_staff_accounts(
    include_inactive: bool = True,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    require_super_admin(current_user)
    query: dict = {"role": {"$in": list(MANAGED_ROLES)}}
    if not include_inactive:
        query.update({"is_active": True, "account_status": "active"})
    users = await db.users.find(query).sort([("role", 1), ("full_name", 1)]).to_list(500)
    return [_public_account(user) for user in users]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_staff_account(
    payload: StaffAccountCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    try:
        normalized = normalize_phone(payload.phone)
    except PhoneValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if await db.users.find_one({"phone_normalized": normalized}):
        raise HTTPException(status_code=409, detail="An account with this phone number already exists")

    document = invited_user_document(
        phone=normalized,
        full_name=payload.full_name,
        role=payload.role,
        email=str(payload.email) if payload.email else None,
        branch_id=None,
        language_preference=payload.language_preference,
        created_by=str(current_user["_id"]),
    )
    try:
        result = await db.users.insert_one(document)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="An account with this phone number already exists") from error
    document["_id"] = result.inserted_id

    delivery_status = "failed"
    delivery_error = None
    try:
        invitation = await issue_invitation(
            db,
            document,
            actor_id=str(current_user["_id"]),
            request_ip=_client_ip(request),
        )
        delivery_status = invitation.delivery_status
    except (OtpDeliveryError, OtpRateLimitError) as error:
        delivery_error = str(error)
        await db.users.update_one(
            {"_id": document["_id"]},
            {"$set": {"invite_delivery_status": "failed", "updated_at": datetime.utcnow()}},
        )

    await create_audit_log(
        str(current_user["_id"]),
        "create",
        "staff_account",
        str(document["_id"]),
        {"role": payload.role, "phone": normalized, "invite_delivery_status": delivery_status},
        _client_ip(request),
    )
    created = await db.users.find_one({"_id": document["_id"]})
    response = _public_account(created)
    response["invite_delivery_status"] = delivery_status
    if delivery_error:
        response["invite_delivery_message"] = "Account created, but the SMS was not sent. Check SMS configuration and resend."
    return response


@router.put("/{account_id}")
async def update_staff_account(
    account_id: str,
    payload: StaffAccountUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    now = datetime.utcnow()
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "full_name": payload.full_name.strip(),
            "email": str(payload.email) if payload.email else None,
            "language_preference": payload.language_preference,
            "updated_at": now,
        }},
    )
    await create_audit_log(
        str(current_user["_id"]), "update", "staff_account", account_id,
        {"role": user["role"]}, _client_ip(request),
    )
    return _public_account(await db.users.find_one({"_id": user["_id"]}))


@router.post("/{account_id}/send-access-code", status_code=status.HTTP_202_ACCEPTED)
async def send_staff_access_code(
    account_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    if user.get("account_status") == "deactivated":
        raise HTTPException(status_code=409, detail="Reactivate the account before sending a code")
    purpose = "invite" if user.get("account_status") == "pending_invite" else "password_reset"
    try:
        issued = await issue_otp(
            db,
            user=user,
            purpose=purpose,
            requested_by=str(current_user["_id"]),
            request_ip=_client_ip(request),
        )
    except OtpRateLimitError as error:
        raise HTTPException(
            status_code=429,
            detail=str(error),
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
    except OtpDeliveryError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    await create_audit_log(
        str(current_user["_id"]), "send_access_code", "staff_account", account_id,
        {"purpose": purpose}, _client_ip(request),
    )
    return {
        "message": "Invitation sent" if purpose == "invite" else "Password reset code sent",
        "purpose": purpose,
        "delivery_status": issued.delivery_status,
        "retry_after_seconds": issued.retry_after_seconds,
    }


@router.patch("/{account_id}/deactivate")
async def deactivate_staff_account(
    account_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    now = datetime.utcnow()
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_active": False, "account_status": "deactivated", "updated_at": now},
         "$inc": {"token_version": 1}},
    )
    await db.auth_challenges.update_many(
        {"user_id": account_id, "consumed_at": None, "invalidated_at": None},
        {"$set": {"invalidated_at": now, "invalidation_reason": "account_deactivated"}},
    )
    await create_audit_log(
        str(current_user["_id"]), "deactivate", "staff_account", account_id,
        {"role": user["role"]}, _client_ip(request),
    )
    return {"message": "Account deactivated", "is_active": False, "account_status": "deactivated"}


@router.patch("/{account_id}/reactivate")
async def reactivate_staff_account(
    account_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    now = datetime.utcnow()
    already_activated = bool(user.get("phone_verified") and user.get("password_hash"))
    account_status = "active" if already_activated else "pending_invite"
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "is_active": already_activated,
            "account_status": account_status,
            "updated_at": now,
        }},
    )
    delivery_status = None
    if not already_activated:
        refreshed = await db.users.find_one({"_id": user["_id"]})
        try:
            issued = await issue_invitation(
                db,
                refreshed,
                actor_id=str(current_user["_id"]),
                request_ip=_client_ip(request),
            )
            delivery_status = issued.delivery_status
        except (OtpDeliveryError, OtpRateLimitError):
            delivery_status = "failed"
    await create_audit_log(
        str(current_user["_id"]), "reactivate", "staff_account", account_id,
        {"role": user["role"], "account_status": account_status}, _client_ip(request),
    )
    return {
        "message": "Account reactivated" if already_activated else "Account awaiting invitation activation",
        "is_active": already_activated,
        "account_status": account_status,
        "invite_delivery_status": delivery_status,
    }
