"""
Routes for Teacher Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from models import Teacher, TeacherBase
from auth import get_current_user, get_password_hash

router = APIRouter(prefix="/teachers", tags=["Teachers"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

@router.post("", response_model=Teacher)
async def create_teacher(
    teacher_data: TeacherBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new teacher (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Create teacher user
        teacher_user = {
            "login": f"teacher_{teacher_data.phone}",
            "password_hash": get_password_hash("Teacher@2025"),
            "email": teacher_data.email,
            "phone": teacher_data.phone,
            "full_name": f"{teacher_data.first_name} {teacher_data.last_name}",
            "role": "teacher",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": teacher_data.branch_id
        }
        user_result = await db.users.insert_one(teacher_user)
        
        # Create teacher profile
        teacher = {
            "user_id": str(user_result.inserted_id),
            "first_name": teacher_data.first_name,
            "last_name": teacher_data.last_name,
            "phone": teacher_data.phone,
            "email": teacher_data.email,
            "photo": teacher_data.photo,
            "specialization": teacher_data.specialization,
            "courses": teacher_data.courses,
            "group_ids": [],
            "branch_id": teacher_data.branch_id,
            "created_at": datetime.utcnow()
        }
        result = await db.teachers.insert_one(teacher)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "teacher",
            str(result.inserted_id),
            {"name": f"{teacher_data.first_name} {teacher_data.last_name}"},
            request.client.host if request.client else None
        )
        
        teacher["id"] = str(result.inserted_id)
        return serialize_doc(teacher)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[Teacher])
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
        if branch_id:
            query["branch_id"] = branch_id
        elif current_user["role"] != "super_admin":
            query["branch_id"] = current_user.get("branch_id")
        
        teachers = await db.teachers.find(query).skip(skip).limit(limit).to_list(limit)
        return [serialize_doc(t) for t in teachers]
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
        update_data = {
            "first_name": teacher_data.first_name,
            "last_name": teacher_data.last_name,
            "phone": teacher_data.phone,
            "email": teacher_data.email,
            "photo": teacher_data.photo,
            "specialization": teacher_data.specialization,
            "courses": teacher_data.courses,
            "updated_at": datetime.utcnow()
        }
        
        result = await db.teachers.update_one(
            {"_id": ObjectId(teacher_id)},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Teacher not found")
        
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
        
        # Deactivate user account
        await db.users.update_one(
            {"_id": ObjectId(teacher["user_id"])},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
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
        
        # Reactivate user account
        await db.users.update_one(
            {"_id": ObjectId(teacher["user_id"])},
            {"$set": {"is_active": True, "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "reactivate",
            "teacher",
            teacher_id,
            {"name": f"{teacher['first_name']} {teacher['last_name']}"},
            request.client.host if request.client else None
        )
        
        return {"message": "Teacher reactivated successfully", "is_active": True}
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
    """Reset teacher password to default"""
    from server import db, create_audit_log
    import secrets
    import string
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        teacher = await db.teachers.find_one({"_id": ObjectId(teacher_id)})
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        
        # Generate new password
        new_password = "Teacher@" + ''.join(secrets.choice(string.digits) for _ in range(4))
        
        # Get teacher login
        user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        # Update password
        await db.users.update_one(
            {"_id": ObjectId(teacher["user_id"])},
            {"$set": {"password_hash": get_password_hash(new_password), "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "reset_password",
            "teacher",
            teacher_id,
            {"name": f"{teacher['first_name']} {teacher['last_name']}"},
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
        
        user = await db.users.find_one({"_id": ObjectId(teacher["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="User account not found")
        
        return {
            "teacher_id": teacher_id,
            "name": f"{teacher['first_name']} {teacher['last_name']}",
            "login": user["login"],
            "is_active": user.get("is_active", True),
            "last_login": user.get("last_login")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

