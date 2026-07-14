"""
Routes for Student Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from models import Student, StudentCreate, StudentStatus
from auth import get_current_user, require_role, generate_student_id, get_password_hash
from student_lifecycle import (
    StudentLifecycleConflict,
    archive_student_account,
    permanently_delete_student_account,
    restore_student_account,
)

router = APIRouter(prefix="/students", tags=["Students"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

async def get_db():
    from server import db
    return db

async def get_next_student_id(db):
    """Get next student ID using atomic counter"""
    result = await db.counters.find_one_and_update(
        {"_id": "student_id"},
        {"$inc": {"seq": 1}},
        return_document=True
    )
    return generate_student_id(result["seq"])

@router.post("", response_model=Student)
async def create_student(
    student_data: StudentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new student (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    # Check permissions
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Admin-created students should inherit the creator's branch unless an
        # explicit branch was selected. Otherwise branch-scoped staff cannot
        # see the new profile.
        student_branch_id = student_data.branch_id or current_user.get("branch_id")

        # Generate student ID
        student_id = await get_next_student_id(db)
        
        # Create parent if parent info provided
        parent_id = None
        if student_data.parent_phone or student_data.parent_name:
            # Check if parent already exists
            existing_parent = await db.parents.find_one({"phone": student_data.parent_phone})
            
            if existing_parent:
                parent_id = str(existing_parent["_id"])
            else:
                # Create new parent user
                parent_names = student_data.parent_name.split() if student_data.parent_name else ["Parent", "User"]
                parent_user = {
                    "login": f"parent_{student_data.parent_phone}",
                    "password_hash": get_password_hash("Parent@2025"),
                    "email": None,
                    "phone": student_data.parent_phone,
                    "full_name": student_data.parent_name or "Parent",
                    "role": "parent",
                    "is_active": True,
                    "two_factor_enabled": False,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "branch_id": student_branch_id
                }
                parent_user_result = await db.users.insert_one(parent_user)
                
                # Create parent profile
                parent_profile = {
                    "user_id": str(parent_user_result.inserted_id),
                    "first_name": parent_names[0],
                    "last_name": parent_names[-1] if len(parent_names) > 1 else "",
                    "phone": student_data.parent_phone,
                    "email": None,
                    "student_ids": [],
                    "created_at": datetime.utcnow()
                }
                parent_result = await db.parents.insert_one(parent_profile)
                parent_id = str(parent_result.inserted_id)
        
        # Create student user
        student_user = {
            "login": student_id.lower(),
            "password_hash": get_password_hash("Student@2025"),
            "email": student_data.email,
            "phone": student_data.phone,
            "full_name": f"{student_data.first_name} {student_data.last_name}",
            "role": "student",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": student_branch_id
        }
        student_user_result = await db.users.insert_one(student_user)
        
        # Create student profile
        student = {
            "student_id": student_id,
            "user_id": str(student_user_result.inserted_id),
            "parent_id": parent_id,
            "first_name": student_data.first_name,
            "last_name": student_data.last_name,
            "date_of_birth": student_data.date_of_birth,
            "phone": student_data.phone,
            "email": student_data.email,
            "photo": student_data.photo,
            "address": student_data.address,
            "course_ids": student_data.courses if student_data.courses else [],
            "group_ids": [],
            "status": "active",
            "enrollment_date": datetime.utcnow(),
            "branch_id": student_branch_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await db.students.insert_one(student)
        
        # Update parent's student list
        if parent_id:
            await db.parents.update_one(
                {"_id": ObjectId(parent_id)},
                {"$push": {"student_ids": str(result.inserted_id)}}
            )
        
        # Create audit log
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "student",
            str(result.inserted_id),
            {"student_id": student_id},
            request.client.host if request.client else None
        )

        student["id"] = str(result.inserted_id)
        return serialize_doc(student)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[Student])
async def get_students(
    status: Optional[StudentStatus] = None,
    branch_id: Optional[str] = None,
    course_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all students with filters"""
    from server import db, serialize_doc
    
    try:
        query = {}
        
        if status:
            query["status"] = status
        else:
            query["status"] = {"$ne": StudentStatus.ARCHIVED}
        
        # Filter by branch
        if branch_id:
            query["branch_id"] = branch_id
        elif current_user["role"] not in ["super_admin", "parent", "student"]:
            # Non-super admins see only their branch
            query["branch_id"] = current_user.get("branch_id")

        # Teachers must always receive the active students in their assigned
        # groups. This also handles legacy records whose branch is missing or
        # differs, while still limiting visibility to the teacher's classes.
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if not teacher:
                return []

            teacher_id = str(teacher["_id"])
            teacher_group_ids = [
                gid for gid in teacher.get("group_ids", []) if ObjectId.is_valid(gid)
            ]
            assigned_groups = await db.groups.find({
                "$or": [
                    {"_id": {"$in": [ObjectId(gid) for gid in teacher_group_ids]}},
                    {"teacher_id": teacher_id}
                ]
            }).to_list(500)
            assigned_group_ids = [str(group["_id"]) for group in assigned_groups]
            assigned_student_ids = {
                sid
                for group in assigned_groups
                for sid in group.get("student_ids", [])
                if ObjectId.is_valid(sid)
            }
            query.pop("branch_id", None)
            query["$or"] = [
                {"_id": {"$in": [ObjectId(sid) for sid in assigned_student_ids]}},
                {"group_ids": {"$in": assigned_group_ids}}
            ]
        
        # Filter by course
        if course_id:
            query["course_ids"] = course_id
        
        # Parents see only their children
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if parent:
                query["_id"] = {"$in": [ObjectId(sid) for sid in parent.get("student_ids", [])]}
            else:
                return []
        elif current_user["role"] == "student":
            student = await db.students.find_one({
                "user_id": str(current_user["_id"]),
                "status": {"$ne": StudentStatus.ARCHIVED}
            })
            if not student:
                return []

            # A student-facing profile request must be deterministic and private.
            # Returning classmates made screens that selected the first record show
            # another student's name and also exposed unnecessary profile data.
            query["_id"] = student["_id"]
        
        students = await db.students.find(query).skip(skip).limit(limit).to_list(limit)
        return [serialize_doc(s) for s in students]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{student_id}", response_model=Student)
async def get_student(
    student_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get student by ID"""
    from server import db, serialize_doc
    
    try:
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": StudentStatus.ARCHIVED}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Check permissions
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or student_id not in parent.get("student_ids", []):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            if str(student["user_id"]) != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="Access denied")
        
        return serialize_doc(student)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{student_id}", response_model=Student)
async def update_student(
    student_id: str,
    student_data: StudentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update student (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        existing = await db.students.find_one({"_id": ObjectId(student_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Student not found")
        
        update_data = {
            "first_name": student_data.first_name,
            "last_name": student_data.last_name,
            "date_of_birth": student_data.date_of_birth,
            "phone": student_data.phone,
            "email": student_data.email,
            "photo": student_data.photo,
            "address": student_data.address,
            "updated_at": datetime.utcnow()
        }
        
        await db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": update_data}
        )
        
        # Update user info
        await db.users.update_one(
            {"_id": ObjectId(existing["user_id"])},
            {"$set": {
                "full_name": f"{student_data.first_name} {student_data.last_name}",
                "email": student_data.email,
                "phone": student_data.phone,
                "updated_at": datetime.utcnow()
            }}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "student",
            student_id,
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.students.find_one({"_id": ObjectId(student_id)})
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def require_student_manager(current_user: dict, student: dict):
    """Ensure managers cannot change students belonging to another branch."""
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Only Manager or Super Admin can manage student accounts")
    if (
        current_user["role"] == "manager"
        and student.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Student belongs to another branch")


@router.delete("/{student_id}")
async def archive_student(
    student_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Archive a student and deactivate the linked login account."""
    from server import db, create_audit_log
    
    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=404, detail="Student not found")
        student = await db.students.find_one({"_id": ObjectId(student_id)})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        require_student_manager(current_user, student)

        lifecycle = await archive_student_account(
            db,
            student,
            str(current_user["_id"]),
        )

        await create_audit_log(
            str(current_user["_id"]),
            "archive",
            "student",
            student_id,
            lifecycle,
            request.client.host if request.client else None
        )

        return {"message": "Student archived and login deactivated", **lifecycle}

    except StudentLifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{student_id}/restore")
async def restore_student(
    student_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Restore an archived student and reactivate the linked login account."""
    from server import db, create_audit_log

    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=404, detail="Student not found")
        student = await db.students.find_one({"_id": ObjectId(student_id)})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        require_student_manager(current_user, student)

        lifecycle = await restore_student_account(
            db,
            student,
            str(current_user["_id"]),
        )
        await create_audit_log(
            str(current_user["_id"]),
            "restore",
            "student",
            student_id,
            lifecycle,
            request.client.host if request.client else None,
        )
        return {"message": "Student restored successfully", **lifecycle}

    except StudentLifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{student_id}/permanent")
async def permanently_delete_student(
    student_id: str,
    confirmation: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Permanently delete an unused archived student (Super Admin only)."""
    from server import db, create_audit_log

    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can permanently delete students")

    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=404, detail="Student not found")
        student = await db.students.find_one({"_id": ObjectId(student_id)})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        if confirmation.strip() != student.get("student_id"):
            raise HTTPException(status_code=400, detail="Type the exact student ID to confirm permanent deletion")

        lifecycle = await permanently_delete_student_account(db, student)
        await create_audit_log(
            str(current_user["_id"]),
            "permanent_delete",
            "student",
            student_id,
            {"student_id": student.get("student_id"), **lifecycle},
            request.client.host if request.client else None,
        )
        return {"message": "Student permanently deleted", **lifecycle}

    except StudentLifecycleConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Import get_password_hash for parent creation
from auth import get_password_hash
