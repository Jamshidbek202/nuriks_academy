"""
Routes for Support Staff Management
Complete CRUD operations with deactivate/reactivate and password reset
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from auth import get_current_user
from phone_auth import (
    OtpDeliveryError, OtpRateLimitError, PhoneValidationError,
    invited_user_document, issue_invitation, issue_otp, normalize_phone,
)
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/support-staff", tags=["Support Staff"])
security = HTTPBearer()

class SupportStaffBase(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: Optional[str] = None
    photo: Optional[str] = None
    available_hours: Optional[dict] = None
    branch_id: Optional[str] = None

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)


def require_support_manager(current_user: dict, staff: dict):
    if current_user.get("role") not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if (
        current_user.get("role") == "manager"
        and staff.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Support staff belongs to another branch")


def support_branch_for_write(current_user: dict, requested_branch_id: Optional[str]) -> Optional[str]:
    if current_user.get("role") == "super_admin":
        return requested_branch_id
    own_branch_id = current_user.get("branch_id")
    if requested_branch_id and requested_branch_id != own_branch_id:
        raise HTTPException(status_code=403, detail="Cannot manage support staff in another branch")
    return own_branch_id

@router.post("")
async def create_support_staff(
    data: SupportStaffBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new support staff member"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    support_branch_id = support_branch_for_write(current_user, data.branch_id)
    
    try:
        normalized_phone = normalize_phone(data.phone)
        # Phone number is the global login identity across every role.
        existing = await db.users.find_one({"phone_normalized": normalized_phone})
        if existing:
            raise HTTPException(status_code=409, detail="An account with this phone number already exists")
        user = invited_user_document(
            phone=normalized_phone,
            full_name=f"{data.first_name} {data.last_name}",
            role="support",
            email=data.email,
            branch_id=support_branch_id,
            language_preference=current_user.get("language_preference", "ru"),
            created_by=str(current_user["_id"]),
        )
        user_result = await db.users.insert_one(user)
        user["_id"] = user_result.inserted_id
        
        # Create support profile
        support = {
            "user_id": str(user_result.inserted_id),
            "first_name": data.first_name,
            "last_name": data.last_name,
            "phone": normalized_phone,
            "email": data.email,
            "photo": data.photo,
            "available_hours": data.available_hours or {},
            "branch_id": support_branch_id,
            "created_at": datetime.utcnow()
        }
        try:
            result = await db.support_staff.insert_one(support)
        except Exception:
            await db.users.delete_one({"_id": user_result.inserted_id})
            raise

        invite_delivery_status = "failed"
        try:
            invite_delivery_status = (await issue_invitation(
                db, user, actor_id=str(current_user["_id"]),
                request_ip=request.client.host if request.client else None,
            )).delivery_status
        except (OtpDeliveryError, OtpRateLimitError):
            await db.users.update_one(
                {"_id": user_result.inserted_id},
                {"$set": {"invite_delivery_status": "failed", "updated_at": datetime.utcnow()}},
            )
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "support_staff",
            str(result.inserted_id),
            {"name": f"{data.first_name} {data.last_name}", "invite_delivery_status": invite_delivery_status},
            request.client.host if request.client else None
        )
        
        support["id"] = str(result.inserted_id)
        response = serialize_doc(support)
        response.update({
            "account_status": "pending_invite",
            "phone_verified": False,
            "is_active": False,
            "invite_delivery_status": invite_delivery_status,
        })
        return response
    except (PhoneValidationError, DuplicateKeyError) as e:
        raise HTTPException(status_code=409 if isinstance(e, DuplicateKeyError) else 400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def get_all_support_staff(
    branch_id: Optional[str] = None,
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all support staff members"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {}
        if current_user["role"] == "super_admin":
            if branch_id:
                query["branch_id"] = branch_id
        else:
            own_branch_id = current_user.get("branch_id")
            if branch_id and branch_id != own_branch_id:
                raise HTTPException(status_code=403, detail="Cannot view support staff in another branch")
            query["branch_id"] = own_branch_id
        
        support_staff = await db.support_staff.find(query).skip(skip).limit(limit).to_list(limit)
        
        result = []
        for staff in support_staff:
            staff_data = serialize_doc(staff)
            # Get user status
            user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
            if user:
                staff_data["is_active"] = user.get("is_active", True)
                staff_data["account_status"] = user.get("account_status", "active")
                staff_data["phone_verified"] = bool(user.get("phone_verified", False))
                staff_data["invite_delivery_status"] = user.get("invite_delivery_status")
                staff_data["last_login"] = user.get("last_login")
                
                if not include_inactive and not user.get("is_active", True):
                    continue
            
            result.append(staff_data)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{staff_id}")
async def get_support_staff(
    staff_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get support staff by ID"""
    from server import db, serialize_doc
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        staff_data = serialize_doc(staff)
        
        # Get user status
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if user:
            staff_data["is_active"] = user.get("is_active", True)
            staff_data["account_status"] = user.get("account_status", "active")
            staff_data["phone_verified"] = bool(user.get("phone_verified", False))
            staff_data["invite_delivery_status"] = user.get("invite_delivery_status")
            staff_data["last_login"] = user.get("last_login")
        
        return staff_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{staff_id}")
async def update_support_staff(
    staff_id: str,
    data: SupportStaffBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update support staff"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        try:
            normalized_phone = normalize_phone(data.phone)
        except PhoneValidationError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        update_data = {
            "first_name": data.first_name,
            "last_name": data.last_name,
            "phone": normalized_phone,
            "email": data.email,
            "photo": data.photo,
            "available_hours": data.available_hours or staff.get("available_hours", {}),
            "branch_id": staff.get("branch_id"),
            "updated_at": datetime.utcnow()
        }
        
        await db.support_staff.update_one(
            {"_id": ObjectId(staff_id)},
            {"$set": update_data}
        )
        
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        phone_changed = user.get("phone_normalized") != normalized_phone
        if phone_changed and await db.users.find_one({
            "phone_normalized": normalized_phone, "_id": {"$ne": user["_id"]},
        }):
            raise HTTPException(status_code=409, detail="An account with this phone number already exists")
        user_updates = {
            "full_name": f"{data.first_name} {data.last_name}",
            "email": data.email,
            "phone": normalized_phone,
            "phone_normalized": normalized_phone,
            "login": normalized_phone,
            "updated_at": datetime.utcnow(),
        }
        user_update: dict = {"$set": user_updates}
        if phone_changed:
            user_updates.update({
                "password_hash": None,
                "phone_verified": False,
                "is_active": False,
                "account_status": "pending_invite",
                "invite_delivery_status": "pending",
            })
            user_update["$inc"] = {"token_version": 1}
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            user_update,
        )
        if phone_changed:
            refreshed = await db.users.find_one({"_id": user["_id"]})
            try:
                await issue_invitation(
                    db, refreshed, actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )
            except (OtpDeliveryError, OtpRateLimitError):
                await db.users.update_one(
                    {"_id": user["_id"]}, {"$set": {"invite_delivery_status": "failed"}},
                )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "support_staff",
            staff_id,
            {"name": f"{data.first_name} {data.last_name}"},
            request.client.host if request.client else None
        )
        
        updated = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{staff_id}/deactivate")
async def deactivate_support_staff(
    staff_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Deactivate support staff (they cannot login)"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        # Deactivate user account
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            {"$set": {"is_active": False, "account_status": "deactivated", "updated_at": datetime.utcnow()},
             "$inc": {"token_version": 1}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "deactivate",
            "support_staff",
            staff_id,
            {"name": f"{staff['first_name']} {staff['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {"message": "Support staff deactivated successfully", "is_active": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{staff_id}/reactivate")
async def reactivate_support_staff(
    staff_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Reactivate support staff"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        activated = bool(user.get("phone_verified") and user.get("password_hash"))
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "is_active": activated,
                "account_status": "active" if activated else "pending_invite",
                "updated_at": datetime.utcnow(),
            }},
        )
        delivery = None
        if not activated:
            refreshed = await db.users.find_one({"_id": user["_id"]})
            try:
                delivery = (await issue_invitation(
                    db, refreshed, actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )).delivery_status
            except (OtpDeliveryError, OtpRateLimitError):
                delivery = "failed"
        
        await create_audit_log(
            str(current_user["_id"]),
            "reactivate",
            "support_staff",
            staff_id,
            {"name": f"{staff['first_name']} {staff['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {
            "message": "Support staff reactivated successfully" if activated else "Invitation sent for account activation",
            "is_active": activated,
            "account_status": "active" if activated else "pending_invite",
            "invite_delivery_status": delivery,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{staff_id}/reset-password")
async def reset_support_password(
    staff_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Send an invitation or password-reset code to the staff phone."""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        if user.get("account_status") == "deactivated":
            raise HTTPException(status_code=409, detail="Reactivate the account before sending a code")
        purpose = "invite" if user.get("account_status") == "pending_invite" else "password_reset"
        try:
            issued = await issue_otp(
                db, user=user, purpose=purpose, requested_by=str(current_user["_id"]),
                request_ip=request.client.host if request.client else None,
            )
        except OtpRateLimitError as error:
            raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after_seconds)}) from error
        except OtpDeliveryError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        
        await create_audit_log(
            str(current_user["_id"]),
            "send_access_code",
            "support_staff",
            staff_id,
            {"name": f"{staff['first_name']} {staff['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {
            "message": "Invitation sent" if purpose == "invite" else "Password reset code sent",
            "purpose": purpose,
            "delivery_status": issued.delivery_status,
            "retry_after_seconds": issued.retry_after_seconds,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{staff_id}/status")
async def get_support_status(
    staff_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get support staff account status"""
    from server import db
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_support_manager(current_user, staff)
        
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        return {
            "staff_id": staff_id,
            "name": f"{staff['first_name']} {staff['last_name']}",
            "phone": user.get("phone_normalized") or user.get("phone"),
            "is_active": user.get("is_active", False),
            "account_status": user.get("account_status", "active"),
            "phone_verified": user.get("phone_verified", False),
            "invite_delivery_status": user.get("invite_delivery_status"),
            "last_login": user.get("last_login")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
