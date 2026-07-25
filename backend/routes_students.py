"""
Routes for Student Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from models import Student, StudentCreate, StudentStatus
from auth import get_current_user, require_role, generate_student_id
from phone_auth import (
    OtpDeliveryError, OtpRateLimitError, PhoneValidationError,
    invited_user_document, issue_invitation, normalize_phone,
    phone_required_user_document,
)
from pymongo import ReturnDocument
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
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return generate_student_id(result["seq"])


def require_branch_scope(current_user: dict, requested_branch_id: Optional[str] = None) -> Optional[str]:
    """Return the branch visible to a branch-scoped role and reject overrides."""
    if current_user.get("role") == "super_admin":
        return requested_branch_id

    own_branch_id = current_user.get("branch_id")
    if requested_branch_id and requested_branch_id != own_branch_id:
        raise HTTPException(status_code=403, detail="Cannot access another branch")
    return own_branch_id


async def require_student_read_access(db, current_user: dict, student: dict) -> None:
    """Keep direct student records private to the user's permitted scope."""
    role = current_user.get("role")
    student_id = str(student["_id"])
    if role == "super_admin":
        return
    if role in {"manager", "reception", "support"}:
        if student.get("branch_id") != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Student belongs to another branch")
        return
    if role == "student":
        if str(student.get("user_id")) != str(current_user.get("_id")):
            raise HTTPException(status_code=403, detail="Access denied")
        return
    if role == "parent":
        parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
        if not parent or student_id not in parent.get("student_ids", []):
            raise HTTPException(status_code=403, detail="Access denied")
        return
    if role == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher:
            raise HTTPException(status_code=403, detail="Access denied")
        teacher_group_ids = [
            ObjectId(group_id)
            for group_id in teacher.get("group_ids", [])
            if ObjectId.is_valid(group_id)
        ]
        assigned = await db.groups.find_one({
            "$and": [
                {"$or": [
                    {"_id": {"$in": teacher_group_ids}},
                    {"teacher_id": str(teacher["_id"])},
                ]},
                {"$or": [
                    {"student_ids": student_id},
                    {"_id": {"$in": [
                        ObjectId(group_id)
                        for group_id in student.get("group_ids", [])
                        if ObjectId.is_valid(group_id)
                    ]}},
                ]},
            ]
        })
        if not assigned:
            raise HTTPException(status_code=403, detail="Student is not assigned to this teacher")
        return
    raise HTTPException(status_code=403, detail="Access denied")

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

    student_branch_id = require_branch_scope(current_user, student_data.branch_id)
    
    try:
        # Admin-created students should inherit the creator's branch unless an
        # explicit branch was selected. Otherwise branch-scoped staff cannot
        # see the new profile.
        student_branch_id = student_branch_id or current_user.get("branch_id")

        # Generate student ID
        student_id = await get_next_student_id(db)
        
        # Create parent if parent info provided
        parent_id = None
        parent_phone = None
        invitation_users = []
        if student_data.parent_name and not student_data.parent_phone:
            raise HTTPException(status_code=400, detail="Parent phone is required when parent information is provided")
        if student_data.parent_phone:
            try:
                parent_phone = normalize_phone(student_data.parent_phone)
            except PhoneValidationError as error:
                raise HTTPException(status_code=400, detail=f"Parent phone: {error}") from error
            # Check if parent already exists
            existing_parent_user = await db.users.find_one({"phone_normalized": parent_phone})
            existing_parent = None
            if existing_parent_user:
                if existing_parent_user.get("role") != "parent":
                    raise HTTPException(status_code=409, detail="Parent phone is already used by another account")
                existing_parent = await db.parents.find_one({"user_id": str(existing_parent_user["_id"])})
            
            if existing_parent:
                parent_id = str(existing_parent["_id"])
            else:
                parent_names = student_data.parent_name.split() if student_data.parent_name else ["Parent", "User"]
                if existing_parent_user:
                    parent_user = existing_parent_user
                    parent_user_id = existing_parent_user["_id"]
                    if existing_parent_user.get("account_status") == "pending_invite":
                        invitation_users.append(existing_parent_user)
                else:
                    parent_user = invited_user_document(
                        phone=parent_phone,
                        full_name=student_data.parent_name or "Parent",
                        role="parent",
                        email=None,
                        branch_id=student_branch_id,
                        language_preference=current_user.get("language_preference", "ru"),
                        created_by=str(current_user["_id"]),
                    )
                    parent_user_result = await db.users.insert_one(parent_user)
                    parent_user["_id"] = parent_user_result.inserted_id
                    parent_user_id = parent_user_result.inserted_id
                    invitation_users.append(parent_user)
                
                # Create parent profile
                parent_profile = {
                    "user_id": str(parent_user_id),
                    "first_name": parent_names[0],
                    "last_name": parent_names[-1] if len(parent_names) > 1 else "",
                    "phone": parent_phone,
                    "email": None,
                    "student_ids": [],
                    "created_at": datetime.utcnow()
                }
                parent_result = await db.parents.insert_one(parent_profile)
                parent_id = str(parent_result.inserted_id)
        
        student_phone = None
        student_contact_phone = None
        if student_data.phone:
            try:
                student_phone = normalize_phone(student_data.phone)
                student_contact_phone = student_phone
            except PhoneValidationError as error:
                raise HTTPException(status_code=400, detail=f"Student phone: {error}") from error
            duplicate_phone = await db.users.find_one({"phone_normalized": student_phone})
            if duplicate_phone:
                if duplicate_phone.get("role") == "parent" and student_phone == parent_phone:
                    # A child may share the parent's contact number, but one
                    # phone cannot authenticate two separate accounts.
                    student_phone = None
                else:
                    raise HTTPException(status_code=409, detail="Student phone is already used by another account")
        if student_phone:
            student_user = invited_user_document(
                phone=student_phone,
                full_name=f"{student_data.first_name} {student_data.last_name}",
                role="student",
                email=student_data.email,
                branch_id=student_branch_id,
                language_preference=current_user.get("language_preference", "ru"),
                created_by=str(current_user["_id"]),
            )
        else:
            student_user = phone_required_user_document(
                login=student_id.lower(),
                full_name=f"{student_data.first_name} {student_data.last_name}",
                role="student",
                email=student_data.email,
                branch_id=student_branch_id,
                language_preference=current_user.get("language_preference", "ru"),
                created_by=str(current_user["_id"]),
            )
        student_user_result = await db.users.insert_one(student_user)
        student_user["_id"] = student_user_result.inserted_id
        if student_phone:
            invitation_users.append(student_user)
        
        # Create student profile
        student = {
            "student_id": student_id,
            "user_id": str(student_user_result.inserted_id),
            "parent_id": parent_id,
            "first_name": student_data.first_name,
            "last_name": student_data.last_name,
            "date_of_birth": student_data.date_of_birth,
            "phone": student_contact_phone,
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

        invite_status = {}
        telegram_invites = {}
        for invited_user in invitation_users:
            try:
                delivery = await issue_invitation(
                    db, invited_user, actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )
                invite_status[invited_user["role"]] = delivery.delivery_status
                if delivery.telegram_invite_url:
                    telegram_invites[invited_user["role"]] = {
                        "telegram_invite_url": delivery.telegram_invite_url,
                        "telegram_invite_qr": delivery.telegram_invite_qr,
                        "telegram_invite_expires_at": delivery.telegram_invite_expires_at,
                    }
            except (OtpDeliveryError, OtpRateLimitError):
                invite_status[invited_user["role"]] = "failed"
        
        # Create audit log
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "student",
            str(result.inserted_id),
            {"student_id": student_id, "invite_delivery_status": invite_status},
            request.client.host if request.client else None
        )

        student["id"] = str(result.inserted_id)
        student["invite_delivery_status"] = invite_status
        student["telegram_invites"] = telegram_invites
        return serialize_doc(student)
        
    except HTTPException:
        raise
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
        
        # Filter by branch. A query parameter must never let a scoped role
        # escape the branch stored on its authenticated account.
        if current_user["role"] == "super_admin":
            if branch_id:
                query["branch_id"] = branch_id
        elif current_user["role"] not in ["parent", "student", "teacher"]:
            query["branch_id"] = require_branch_scope(current_user, branch_id)

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

    except HTTPException:
        raise
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
        
        await require_student_read_access(db, current_user, student)
        
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
        require_student_manager(current_user, existing)
        
        normalized_contact = None
        if student_data.phone:
            try:
                normalized_contact = normalize_phone(student_data.phone)
            except PhoneValidationError as error:
                raise HTTPException(status_code=400, detail=f"Student phone: {error}") from error
        update_data = {
            "first_name": student_data.first_name,
            "last_name": student_data.last_name,
            "date_of_birth": student_data.date_of_birth,
            "phone": normalized_contact,
            "email": student_data.email,
            "photo": student_data.photo,
            "address": student_data.address,
            "updated_at": datetime.utcnow()
        }
        
        await db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": update_data}
        )
        
        user = await db.users.find_one({"_id": ObjectId(existing["user_id"])})
        if not user:
            raise HTTPException(status_code=404, detail="Student user account not found")
        auth_phone = normalized_contact
        if normalized_contact and existing.get("parent_id"):
            parent = await db.parents.find_one({"_id": ObjectId(existing["parent_id"])})
            if parent:
                parent_user = await db.users.find_one({"_id": ObjectId(parent["user_id"])})
                if parent_user and parent_user.get("phone_normalized") == normalized_contact:
                    auth_phone = None
        if auth_phone:
            duplicate = await db.users.find_one({
                "phone_normalized": auth_phone,
                "_id": {"$ne": user["_id"]},
            })
            if duplicate:
                raise HTTPException(status_code=409, detail="Student phone is already used by another account")
        phone_changed = user.get("phone_normalized") != auth_phone
        user_updates = {
            "full_name": f"{student_data.first_name} {student_data.last_name}",
            "email": student_data.email,
            "phone": auth_phone,
            "phone_normalized": auth_phone,
            "updated_at": datetime.utcnow(),
        }
        user_update: dict = {"$set": user_updates}
        if phone_changed:
            user_updates.update({
                "login": auth_phone or existing["student_id"].lower(),
                "password_hash": None,
                "phone_verified": False,
                "is_active": False,
                "account_status": "pending_invite" if auth_phone else "phone_required",
                "invite_delivery_status": "pending" if auth_phone else None,
            })
            user_update["$inc"] = {"token_version": 1}
        await db.users.update_one(
            {"_id": ObjectId(existing["user_id"])},
            user_update,
        )
        if phone_changed and auth_phone:
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
