"""
Routes for Teacher Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from models import Teacher, TeacherBase
from auth import get_current_user
from phone_auth import (
    OtpDeliveryError, OtpRateLimitError, PhoneValidationError,
    invited_user_document, issue_access_code, issue_invitation, normalize_phone,
)
from pymongo.errors import DuplicateKeyError

router = APIRouter(prefix="/teachers", tags=["Teachers"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)


def require_teacher_manager(current_user: dict, teacher: dict):
    """Authorize management and enforce manager branch ownership."""
    if current_user.get("role") not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if (
        current_user.get("role") == "manager"
        and teacher.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Teacher belongs to another branch")


def teacher_branch_for_write(current_user: dict, requested_branch_id: Optional[str]) -> Optional[str]:
    if current_user.get("role") == "super_admin":
        return requested_branch_id
    own_branch_id = current_user.get("branch_id")
    if requested_branch_id and requested_branch_id != own_branch_id:
        raise HTTPException(status_code=403, detail="Cannot manage teachers in another branch")
    return own_branch_id

@router.post("")
async def create_teacher(
    teacher_data: TeacherBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new teacher (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    teacher_branch_id = teacher_branch_for_write(current_user, teacher_data.branch_id)
    
    try:
        normalized_phone = normalize_phone(teacher_data.phone)
        if await db.users.find_one({"phone_normalized": normalized_phone}):
            raise HTTPException(status_code=409, detail="An account with this phone number already exists")
        teacher_user = invited_user_document(
            phone=normalized_phone,
            full_name=f"{teacher_data.first_name} {teacher_data.last_name}",
            role="teacher",
            email=teacher_data.email,
            branch_id=teacher_branch_id,
            language_preference=current_user.get("language_preference", "ru"),
            created_by=str(current_user["_id"]),
        )
        user_result = await db.users.insert_one(teacher_user)
        teacher_user["_id"] = user_result.inserted_id
        
        # Create teacher profile
        teacher = {
            "user_id": str(user_result.inserted_id),
            "first_name": teacher_data.first_name,
            "last_name": teacher_data.last_name,
            "phone": normalized_phone,
            "email": teacher_data.email,
            "photo": teacher_data.photo,
            "specialization": teacher_data.specialization,
            "courses": teacher_data.courses,
            "group_ids": [],
            "branch_id": teacher_branch_id,
            "created_at": datetime.utcnow()
        }
        try:
            result = await db.teachers.insert_one(teacher)
        except Exception:
            await db.users.delete_one({"_id": user_result.inserted_id})
            raise

        invite_delivery_status = "failed"
        invitation = None
        try:
            invitation = await issue_invitation(
                db,
                teacher_user,
                actor_id=str(current_user["_id"]),
                request_ip=request.client.host if request.client else None,
            )
            invite_delivery_status = invitation.delivery_status
        except (OtpDeliveryError, OtpRateLimitError):
            await db.users.update_one(
                {"_id": user_result.inserted_id},
                {"$set": {"invite_delivery_status": "failed", "updated_at": datetime.utcnow()}},
            )
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "teacher",
            str(result.inserted_id),
            {"name": f"{teacher_data.first_name} {teacher_data.last_name}", "invite_delivery_status": invite_delivery_status},
            request.client.host if request.client else None
        )
        
        teacher["id"] = str(result.inserted_id)
        response = serialize_doc(teacher)
        response.update({
            "account_status": "pending_invite",
            "phone_verified": False,
            "is_active": False,
            "invite_delivery_status": invite_delivery_status,
            "telegram_invite_url": invitation.telegram_invite_url if invitation else None,
            "telegram_invite_qr": invitation.telegram_invite_qr if invitation else None,
            "telegram_invite_expires_at": invitation.telegram_invite_expires_at if invitation else None,
        })
        return response
    except (PhoneValidationError, DuplicateKeyError) as e:
        raise HTTPException(status_code=409 if isinstance(e, DuplicateKeyError) else 400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def get_teachers(
    branch_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all teachers"""
    from server import db, serialize_doc
    
    try:
        query = {}
        if current_user["role"] == "super_admin":
            if branch_id:
                query["branch_id"] = branch_id
        else:
            own_branch_id = current_user.get("branch_id")
            if branch_id and branch_id != own_branch_id:
                raise HTTPException(status_code=403, detail="Cannot view teachers in another branch")
            query["branch_id"] = own_branch_id
        
        teachers = await db.teachers.find(query).skip(skip).limit(limit).to_list(limit)
        result = []
        for teacher in teachers:
            item = serialize_doc(teacher)
            try:
                user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
            except Exception:
                user = None
            if user:
                item.update({
                    "is_active": bool(user.get("is_active", False)),
                    "account_status": user.get("account_status", "active"),
                    "phone_verified": bool(user.get("phone_verified", False)),
                    "invite_delivery_status": user.get("invite_delivery_status"),
                    "telegram_connected": user.get("telegram_link_status") == "linked",
                    "last_login": user.get("last_login"),
                })
            result.append(item)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/me", response_model=Teacher)
async def get_my_teacher_profile(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get current teacher profile"""
    from server import db, serialize_doc

    if current_user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")

    try:
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        return serialize_doc(teacher)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{teacher_id}", response_model=Teacher)
async def get_teacher(
    teacher_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get teacher by ID"""
    from server import db, serialize_doc
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        role = current_user.get("role")
        if role == "manager":
            require_teacher_manager(current_user, teacher)
        elif role not in ["super_admin", "teacher", "student", "parent", "support", "reception"]:
            raise HTTPException(status_code=403, detail="Access denied")
        elif role != "super_admin" and teacher.get("branch_id") != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Teacher belongs to another branch")
        return serialize_doc(teacher)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{teacher_id}", response_model=Teacher)
async def update_teacher(
    teacher_id: str,
    teacher_data: TeacherBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update teacher"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        try:
            normalized_phone = normalize_phone(teacher_data.phone)
        except PhoneValidationError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        update_data = {
            "first_name": teacher_data.first_name,
            "last_name": teacher_data.last_name,
            "phone": normalized_phone,
            "email": teacher_data.email,
            "photo": teacher_data.photo,
            "specialization": teacher_data.specialization,
            "courses": teacher_data.courses,
            "updated_at": datetime.utcnow()
        }

        existing = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Teacher not found")
        require_teacher_manager(current_user, existing)
        
        result = await db.teachers.update_one(
            {"_id": ObjectId(teacher_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Teacher not found")

        user = await db.users.find_one({"_id": ObjectId(existing["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        phone_changed = user.get("phone_normalized") != normalized_phone
        if phone_changed and await db.users.find_one({
            "phone_normalized": normalized_phone,
            "_id": {"$ne": user["_id"]},
        }):
            raise HTTPException(status_code=409, detail="An account with this phone number already exists")
        user_updates = {
            "full_name": f"{teacher_data.first_name} {teacher_data.last_name}",
            "email": teacher_data.email,
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
            {"_id": ObjectId(existing["user_id"])},
            user_update,
        )

        if phone_changed:
            refreshed_user = await db.users.find_one({"_id": user["_id"]})
            try:
                await issue_invitation(
                    db, refreshed_user, actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )
            except (OtpDeliveryError, OtpRateLimitError):
                await db.users.update_one(
                    {"_id": user["_id"]}, {"$set": {"invite_delivery_status": "failed"}},
                )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "teacher",
            teacher_id,
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{teacher_id}/deactivate")
async def deactivate_teacher(
    teacher_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Deactivate a teacher (sets is_active to False)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        require_teacher_manager(current_user, teacher)
        
        # Deactivate user account
        await db.users.update_one(
            {"_id": ObjectId(teacher["user_id"])},
            {"$set": {"is_active": False, "account_status": "deactivated", "updated_at": datetime.utcnow()},
             "$inc": {"token_version": 1}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "deactivate",
            "teacher",
            teacher_id,
            {"name": f"{teacher['first_name']} {teacher['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {"message": "Teacher deactivated successfully", "is_active": False}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{teacher_id}/reactivate")
async def reactivate_teacher(
    teacher_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Reactivate a teacher (sets is_active to True)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        require_teacher_manager(current_user, teacher)
        
        user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        activated = bool(
            user.get("password_hash")
            and (user.get("telegram_verified") or user.get("phone_verified"))
        )
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {
                "is_active": activated,
                "account_status": "active" if activated else "pending_invite",
                "updated_at": datetime.utcnow(),
            }},
        )
        delivery = None
        invitation = None
        if not activated:
            refreshed = await db.users.find_one({"_id": user["_id"]})
            try:
                invitation = await issue_invitation(
                    db, refreshed, actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )
                delivery = invitation.delivery_status
            except (OtpDeliveryError, OtpRateLimitError):
                delivery = "failed"
        
        await create_audit_log(
            str(current_user["_id"]),
            "reactivate",
            "teacher",
            teacher_id,
            {"name": f"{teacher['first_name']} {teacher['last_name']}"},
            request.client.host if request.client else None
        )
        
        response = {
            "message": "Teacher reactivated successfully" if activated else "Invitation sent for teacher activation",
            "is_active": activated,
            "account_status": "active" if activated else "pending_invite",
            "invite_delivery_status": delivery,
        }
        if invitation and invitation.telegram_invite_url:
            response.update({
                "telegram_invite_url": invitation.telegram_invite_url,
                "telegram_invite_qr": invitation.telegram_invite_qr,
                "telegram_invite_expires_at": invitation.telegram_invite_expires_at,
            })
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{teacher_id}/reset-password")
async def reset_teacher_password(
    teacher_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Send an invitation or password-reset code to the teacher's phone."""
    from server import db, create_audit_log
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        require_teacher_manager(current_user, teacher)
        
        user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        if user.get("account_status") == "deactivated":
            raise HTTPException(status_code=409, detail="Reactivate the teacher before sending a code")
        purpose = "invite" if user.get("account_status") == "pending_invite" else "password_reset"
        try:
            issued = await issue_access_code(
                db, user, purpose=purpose, actor_id=str(current_user["_id"]),
                request_ip=request.client.host if request.client else None,
            )
        except OtpRateLimitError as error:
            raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": str(error.retry_after_seconds)}) from error
        except OtpDeliveryError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        
        await create_audit_log(
            str(current_user["_id"]),
            "send_access_code",
            "teacher",
            teacher_id,
            {"name": f"{teacher['first_name']} {teacher['last_name']}"},
            request.client.host if request.client else None
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{teacher_id}/status")
async def get_teacher_status(
    teacher_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get teacher account status"""
    from server import db, serialize_doc
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        require_teacher_manager(current_user, teacher)
        
        user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        return {
            "teacher_id": teacher_id,
            "name": f"{teacher['first_name']} {teacher['last_name']}",
            "phone": user.get("phone_normalized") or user.get("phone"),
            "is_active": user.get("is_active", False),
            "account_status": user.get("account_status", "active"),
            "phone_verified": user.get("phone_verified", False),
            "invite_delivery_status": user.get("invite_delivery_status"),
            "telegram_connected": user.get("telegram_link_status") == "linked",
            "last_login": user.get("last_login")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
