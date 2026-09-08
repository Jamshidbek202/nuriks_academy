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
    issue_access_code,
    issue_invitation,
    normalize_phone,
)
from telegram_auth import disconnect_telegram
from worker_lifecycle import account_was_activated, permanently_remove_worker


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


class StaffRoleChange(BaseModel):
    role: Literal["manager", "reception", "support"]
    reason: str = Field(..., min_length=5, max_length=500)


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import create_audit_log, db

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
        "telegram_connected": user.get("telegram_link_status") == "linked",
        "telegram_link_status": user.get("telegram_link_status", "not_connected"),
        "telegram_link_expires_at": user.get("telegram_link_expires_at"),
        "can_delete_permanently": True,
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
    user = await db.users.find_one({
        "_id": object_id,
        "role": {"$in": list(MANAGED_ROLES)},
        "is_deleted": {"$ne": True},
    })
    if not user:
        raise HTTPException(status_code=404, detail="Staff account not found")
    return user


async def _operational_user(db, account_id: str) -> tuple[dict, Optional[dict]]:
    """Resolve either a user ID or the support-profile ID shown in the UI."""
    if not ObjectId.is_valid(account_id):
        raise HTTPException(status_code=400, detail="Invalid staff account ID")
    object_id = ObjectId(account_id)
    user = await db.users.find_one({
        "_id": object_id,
        "role": {"$in": ["manager", "reception", "support"]},
        "is_deleted": {"$ne": True},
    })
    support_profile = None
    if not user:
        support_profile = await db.support_staff.find_one({
            "_id": object_id,
            "is_deleted": {"$ne": True},
        })
        if support_profile and ObjectId.is_valid(support_profile.get("user_id", "")):
            user = await db.users.find_one({
                "_id": ObjectId(support_profile["user_id"]),
                "role": "support",
                "is_deleted": {"$ne": True},
            })
    if not user:
        raise HTTPException(status_code=404, detail="Operational staff account not found")
    if user.get("role") == "support" and not support_profile:
        support_profile = await db.support_staff.find_one({
            "user_id": str(user["_id"]),
            "is_deleted": {"$ne": True},
        })
    return user, support_profile


@router.get("")
async def list_staff_accounts(
    include_inactive: bool = True,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    require_super_admin(current_user)
    query: dict = {
        "role": {"$in": list(MANAGED_ROLES)},
        "is_deleted": {"$ne": True},
    }
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
    invitation = None
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
    if invitation and invitation.telegram_invite_url:
        response.update({
            "telegram_invite_url": invitation.telegram_invite_url,
            "telegram_invite_qr": invitation.telegram_invite_qr,
            "telegram_invite_expires_at": invitation.telegram_invite_expires_at,
        })
    if delivery_error:
        response["invite_delivery_message"] = "Account created, but Telegram access could not be prepared. Check Telegram configuration and try again."
    return response


@router.put("/{account_id}")
async def update_staff_account(
    account_id: str,
    payload: StaffAccountUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

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


@router.patch("/{account_id}/role")
async def change_staff_role(
    account_id: str,
    payload: StaffRoleChange,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Correct an operational role without creating a second login identity.

    Teacher conversions are intentionally excluded because groups, payroll,
    and historical teaching records require a separate migration workflow.
    """
    from server import create_audit_log, db

    require_super_admin(current_user)
    user, support_profile = await _operational_user(db, account_id)
    old_role = user["role"]
    if payload.role == old_role:
        raise HTTPException(status_code=409, detail="The account already has this role")

    if old_role == "support" and support_profile:
        booking_count = await db.support_bookings.count_documents({
            "support_staff_id": str(support_profile["_id"]),
            "is_deleted": {"$ne": True},
        })
        if booking_count:
            raise HTTPException(
                status_code=409,
                detail="This support teacher has booking history. Reassign or preserve that role instead of changing it.",
            )

    now = datetime.utcnow()
    async with await db.client.start_session() as session:
        async with session.start_transaction():
            if payload.role == "support":
                names = user.get("full_name", "").strip().split(maxsplit=1)
                first_name = names[0] if names else "Staff"
                last_name = names[1] if len(names) > 1 else "Member"
                profile = {
                    "user_id": str(user["_id"]),
                    "first_name": first_name,
                    "last_name": last_name,
                    "phone": user.get("phone_normalized") or user.get("phone"),
                    "email": user.get("email"),
                    "photo": None,
                    "available_hours": {},
                    "branch_id": user.get("branch_id"),
                    "created_at": now,
                    "role_correction_reason": payload.reason.strip(),
                }
                await db.support_staff.insert_one(profile, session=session)
            elif support_profile:
                await db.support_staff.delete_one({"_id": support_profile["_id"]}, session=session)

            result = await db.users.update_one(
                {"_id": user["_id"], "role": old_role},
                {"$set": {
                    "role": payload.role,
                    "updated_at": now,
                    "last_role_change_reason": payload.reason.strip(),
                    "last_role_changed_by": str(current_user["_id"]),
                    "last_role_changed_at": now,
                }, "$inc": {"token_version": 1}},
                session=session,
            )
            if result.modified_count != 1:
                raise HTTPException(status_code=409, detail="Staff account changed concurrently; reload and try again")

    await create_audit_log(
        str(current_user["_id"]),
        "change_role",
        "staff_account",
        str(user["_id"]),
        {"old_role": old_role, "new_role": payload.role, "reason": payload.reason.strip()},
        _client_ip(request),
    )
    updated = await db.users.find_one({"_id": user["_id"]})
    return {
        "message": f"Role changed from {old_role} to {payload.role}; existing sessions were ended",
        "account": _public_account(updated),
    }


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
        issued = await issue_access_code(
            db, user, purpose=purpose, actor_id=str(current_user["_id"]),
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
        "message": (
            "Telegram invitation link created"
            if issued.delivery_status == "link_ready"
            else ("Invitation code sent through Telegram" if purpose == "invite" else "Password reset code sent through Telegram")
        ),
        "purpose": purpose,
        "delivery_status": issued.delivery_status,
        "retry_after_seconds": issued.retry_after_seconds,
        "telegram_invite_url": issued.telegram_invite_url,
        "telegram_invite_qr": issued.telegram_invite_qr,
        "telegram_invite_expires_at": issued.telegram_invite_expires_at,
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
    # A deactivated account must not reserve a Telegram identity. This also
    # revokes any unused pairing links before access is removed.
    async with await db.client.start_session() as session:
        async with session.start_transaction():
            await disconnect_telegram(db, user, session=session)
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"is_active": False, "account_status": "deactivated", "updated_at": now},
                 "$inc": {"token_version": 1}},
                session=session,
            )
            await db.auth_challenges.update_many(
                {"user_id": account_id, "consumed_at": None, "invalidated_at": None},
                {"$set": {"invalidated_at": now, "invalidation_reason": "account_deactivated"}},
                session=session,
            )
    await create_audit_log(
        str(current_user["_id"]), "deactivate", "staff_account", account_id,
        {"role": user["role"], "telegram_released": True}, _client_ip(request),
    )
    return {
        "message": "Account deactivated and Telegram released",
        "is_active": False,
        "account_status": "deactivated",
        "telegram_connected": False,
    }


@router.delete("/{account_id}/telegram")
async def release_staff_telegram(
    account_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Release a staff Telegram identity without erasing the staff account."""
    from server import create_audit_log, db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    now = datetime.utcnow()
    async with await db.client.start_session() as session:
        async with session.start_transaction():
            await disconnect_telegram(db, user, session=session)
            await db.auth_challenges.update_many(
                {"user_id": account_id, "consumed_at": None, "invalidated_at": None},
                {"$set": {"invalidated_at": now, "invalidation_reason": "telegram_released_by_admin"}},
                session=session,
            )
            # Force existing sessions to revalidate after a security-channel change.
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$inc": {"token_version": 1}, "$set": {"updated_at": now}},
                session=session,
            )
    await create_audit_log(
        str(current_user["_id"]),
        "release_telegram",
        "staff_account",
        account_id,
        {"role": user["role"]},
        _client_ip(request),
    )
    return {"message": "Telegram released from this account", "telegram_connected": False}


@router.delete("/{account_id}")
async def delete_staff_account(
    account_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Permanently remove a manager or reception account.

    The canonical user document and all private account artifacts are removed;
    the phone and Telegram identity are released immediately.
    """
    from server import db

    require_super_admin(current_user)
    user = await _managed_user(db, account_id)
    deleted_snapshot = {
        "role": user["role"],
        "phone": user.get("phone_normalized") or user.get("phone"),
        "full_name": user.get("full_name", ""),
        "account_status": user.get("account_status"),
        "telegram_released": True,
    }
    was_activated = account_was_activated(user)
    result = await permanently_remove_worker(
        db,
        user,
        actor_id=str(current_user["_id"]),
        audit_action="delete" if was_activated else "delete_unactivated",
        audit_resource_type="staff_account",
        audit_resource_id=account_id,
        audit_changes=deleted_snapshot,
        audit_ip=_client_ip(request),
    )
    return {
        "message": "Staff account permanently removed and login identity released",
        **result,
    }


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
    already_activated = bool(
        user.get("password_hash")
        and (user.get("telegram_verified") or user.get("phone_verified"))
    )
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
    invitation = None
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
            invitation = issued
        except (OtpDeliveryError, OtpRateLimitError):
            delivery_status = "failed"
    await create_audit_log(
        str(current_user["_id"]), "reactivate", "staff_account", account_id,
        {"role": user["role"], "account_status": account_status}, _client_ip(request),
    )
    response = {
        "message": "Account reactivated" if already_activated else "Account awaiting invitation activation",
        "is_active": already_activated,
        "account_status": account_status,
        "invite_delivery_status": delivery_status,
    }
    if invitation and invitation.telegram_invite_url:
        response.update({
            "telegram_invite_url": invitation.telegram_invite_url,
            "telegram_invite_qr": invitation.telegram_invite_qr,
            "telegram_invite_expires_at": invitation.telegram_invite_expires_at,
        })
    return response
