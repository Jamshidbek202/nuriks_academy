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
from auth import get_current_user, get_password_hash
import secrets
import string

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
    
    try:
        # Check if phone already exists
        existing = await db.users.find_one({"phone": data.phone, "role": "support"})
        if existing:
            raise HTTPException(status_code=400, detail="Support staff with this phone already exists")
        
        login = f"support_{data.phone}"
        default_password = "Support@2025"
        
        # Create user account
        user = {
            "login": login,
            "password_hash": get_password_hash(default_password),
            "email": data.email,
            "phone": data.phone,
            "full_name": f"{data.first_name} {data.last_name}",
            "role": "support",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": data.branch_id
        }
        user_result = await db.users.insert_one(user)
        
        # Create support profile
        support = {
            "user_id": str(user_result.inserted_id),
            "first_name": data.first_name,
            "last_name": data.last_name,
            "phone": data.phone,
            "email": data.email,
            "photo": data.photo,
            "available_hours": data.available_hours or {},
            "branch_id": data.branch_id,
            "created_at": datetime.utcnow()
        }
        result = await db.support_staff.insert_one(support)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "support_staff",
            str(result.inserted_id),
            {"name": f"{data.first_name} {data.last_name}"},
            request.client.host if request.client else None
        )
        
        support["id"] = str(result.inserted_id)
        response = serialize_doc(support)
        response["credentials"] = {
            "login": login,
            "password": default_password
        }
        return response
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
        if branch_id:
            query["branch_id"] = branch_id
        
        support_staff = await db.support_staff.find(query).skip(skip).limit(limit).to_list(limit)
        
        result = []
        for staff in support_staff:
            staff_data = serialize_doc(staff)
            # Get user status
            user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
            if user:
                staff_data["is_active"] = user.get("is_active", True)
                staff_data["login"] = user.get("login")
                staff_data["last_login"] = user.get("last_login")
                
                if not include_inactive and not user.get("is_active", True):
                    continue
            
            result.append(staff_data)
        
        return result
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
        
        staff_data = serialize_doc(staff)
        
        # Get user status
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if user:
            staff_data["is_active"] = user.get("is_active", True)
            staff_data["login"] = user.get("login")
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
        
        update_data = {
            "first_name": data.first_name,
            "last_name": data.last_name,
            "phone": data.phone,
            "email": data.email,
            "photo": data.photo,
            "available_hours": data.available_hours or staff.get("available_hours", {}),
            "branch_id": data.branch_id,
            "updated_at": datetime.utcnow()
        }
        
        await db.support_staff.update_one(
            {"_id": ObjectId(staff_id)},
            {"$set": update_data}
        )
        
        # Update user full name
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            {"$set": {
                "full_name": f"{data.first_name} {data.last_name}",
                "email": data.email,
                "updated_at": datetime.utcnow()
            }}
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
        
        # Deactivate user account
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
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
        
        # Reactivate user account
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            {"$set": {"is_active": True, "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "reactivate",
            "support_staff",
            staff_id,
            {"name": f"{staff['first_name']} {staff['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {"message": "Support staff reactivated successfully", "is_active": True}
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
    """Reset support staff password"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        staff = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        
        # Generate new password
        new_password = "Support@" + ''.join(secrets.choice(string.digits) for _ in range(4))
        
        # Get user login
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        # Update password
        await db.users.update_one(
            {"_id": ObjectId(staff["user_id"])},
            {"$set": {"password_hash": get_password_hash(new_password), "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "reset_password",
            "support_staff",
            staff_id,
            {"name": f"{staff['first_name']} {staff['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {
            "message": "Password reset successfully",
            "login": user["login"],
            "new_password": new_password
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
        
        user = await db.users.find_one({"_id": ObjectId(staff["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        return {
            "staff_id": staff_id,
            "name": f"{staff['first_name']} {staff['last_name']}",
            "login": user["login"],
            "is_active": user.get("is_active", True),
            "last_login": user.get("last_login")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
