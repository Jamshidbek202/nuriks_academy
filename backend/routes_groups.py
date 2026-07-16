"""
Routes for Group Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from models import Group, GroupBase, GroupStatus
from auth import get_current_user

router = APIRouter(prefix="/groups", tags=["Groups"])
security = HTTPBearer()

VALID_SCHEDULE_DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

def validate_group_data(group_data: GroupBase) -> None:
    for session in group_data.schedule:
        if session.day.lower() not in VALID_SCHEDULE_DAYS:
            raise HTTPException(status_code=400, detail="Schedule contains an invalid weekday")
        try:
            start = datetime.strptime(session.start_time, "%H:%M")
            end = datetime.strptime(session.end_time, "%H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail="Schedule times must use valid 24-hour HH:MM values")
        if end <= start:
            raise HTTPException(status_code=400, detail="Schedule end time must be after start time")

    def normalized(value: Optional[datetime]) -> Optional[datetime]:
        if value and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    start_date = normalized(group_data.start_date)
    end_date = normalized(group_data.end_date)
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=400, detail="Group end date must be after its start date")
    if start_date and end_date and end_date - start_date > timedelta(days=3650):
        raise HTTPException(status_code=400, detail="A group date range cannot exceed 10 years")

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

@router.post("", response_model=Group)
async def create_group(
    group_data: GroupBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new group"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        validate_group_data(group_data)
        teacher_id = group_data.teacher_id
        if not await db.teachers.find_one({"_id": ObjectId(teacher_id)}):
            raise HTTPException(status_code=404, detail="Teacher not found")

        group = {
            "name": group_data.name,
            "course_id": group_data.course_id,
            "teacher_id": teacher_id,
            "student_ids": [],
            "schedule": [s.dict() for s in group_data.schedule],
            "start_date": group_data.start_date,
            "end_date": group_data.end_date,
            "status": "active",
            "branch_id": group_data.branch_id or current_user.get("branch_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await db.groups.insert_one(group)
        
        # Add group to teacher's group list
        await db.teachers.update_one(
            {"_id": ObjectId(teacher_id)},
            {"$push": {"group_ids": str(result.inserted_id)}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "group",
            str(result.inserted_id),
            {"name": group_data.name},
            request.client.host if request.client else None
        )
        
        group["id"] = str(result.inserted_id)
        return serialize_doc(group)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[Group])
async def get_groups(
    course_id: Optional[str] = None,
    teacher_id: Optional[str] = None,
    status: Optional[GroupStatus] = None,
    branch_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all groups with filters"""
    from server import db, serialize_doc
    
    try:
        query = {}
        if course_id:
            query["course_id"] = course_id
        if teacher_id:
            query["teacher_id"] = teacher_id
        if status:
            query["status"] = status
        if branch_id:
            query["branch_id"] = branch_id
        elif current_user["role"] not in ["super_admin", "teacher", "student", "parent"]:
            query["branch_id"] = current_user.get("branch_id")
        
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_group_ids = [ObjectId(gid) for gid in teacher.get("group_ids", [])]
                query["$or"] = [
                    {"_id": {"$in": teacher_group_ids}},
                    {"teacher_id": str(teacher["_id"])}
                ]
            else:
                return []
        elif current_user["role"] == "student":
            student = await db.students.find_one({"user_id": str(current_user["_id"])})
            if student:
                student_group_ids = [ObjectId(gid) for gid in student.get("group_ids", [])]
                query["$or"] = [
                    {"_id": {"$in": student_group_ids}},
                    {"student_ids": str(student["_id"])}
                ]
            else:
                return []
        elif current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent:
                return []

            children = await db.students.find(
                {"_id": {"$in": [ObjectId(sid) for sid in parent.get("student_ids", [])]}}
            ).to_list(100)
            group_ids = {
                group_id
                for child in children
                for group_id in child.get("group_ids", [])
            }
            child_ids = [str(child["_id"]) for child in children]
            query["$or"] = [
                {"_id": {"$in": [ObjectId(gid) for gid in group_ids]}},
                {"student_ids": {"$in": child_ids}}
            ]
        
        groups = await db.groups.find(query).skip(skip).limit(limit).to_list(limit)
        teacher_ids = {
            group.get("teacher_id")
            for group in groups
            if ObjectId.is_valid(group.get("teacher_id"))
        }
        teacher_names = {}
        if teacher_ids:
            assigned_teachers = await db.teachers.find({
                "_id": {"$in": [ObjectId(tid) for tid in teacher_ids]}
            }).to_list(len(teacher_ids))
            teacher_names = {
                str(teacher["_id"]): f"{teacher.get('first_name', '')} {teacher.get('last_name', '')}".strip()
                for teacher in assigned_teachers
            }

        all_student_ids = {
            sid
            for group in groups
            for sid in group.get("student_ids", [])
            if ObjectId.is_valid(sid)
        }
        active_student_ids = set()
        if all_student_ids:
            active_students = await db.students.find({
                "_id": {"$in": [ObjectId(sid) for sid in all_student_ids]},
                "status": {"$ne": "archived"}
            }).to_list(len(all_student_ids))
            active_student_ids = {str(student["_id"]) for student in active_students}

        result = []
        for group in groups:
            group_data = serialize_doc(group)
            group_data["teacher_name"] = teacher_names.get(group_data.get("teacher_id"))
            group_data["student_ids"] = [
                sid for sid in group_data.get("student_ids", [])
                if sid in active_student_ids
            ]
            result.append(group_data)

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{group_id}", response_model=Group)
async def update_group(
    group_id: str,
    group_data: GroupBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update group details and schedule (Manager or Super Admin only)."""
    from server import db, serialize_doc, create_audit_log

    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        validate_group_data(group_data)
        existing = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Group not found")

        if not await db.teachers.find_one({"_id": ObjectId(group_data.teacher_id)}):
            raise HTTPException(status_code=404, detail="Teacher not found")

        update_data = {
            "name": group_data.name,
            "course_id": group_data.course_id,
            "teacher_id": group_data.teacher_id,
            "schedule": [s.dict() for s in group_data.schedule],
            "start_date": group_data.start_date,
            "end_date": group_data.end_date,
            "branch_id": group_data.branch_id or existing.get("branch_id") or current_user.get("branch_id"),
            "updated_at": datetime.utcnow()
        }

        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {"$set": update_data}
        )

        if existing.get("teacher_id") != group_data.teacher_id:
            await db.teachers.update_one(
                {"_id": ObjectId(existing["teacher_id"])},
                {"$pull": {"group_ids": group_id}}
            )
            await db.teachers.update_one(
                {"_id": ObjectId(group_data.teacher_id)},
                {"$addToSet": {"group_ids": group_id}}
            )

        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "group",
            group_id,
            {"name": group_data.name},
            request.client.host if request.client else None
        )

        updated = await db.groups.find_one({"_id": ObjectId(group_id)})
        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Permanently delete a group and its group-scoped records (Super Admin only)."""
    from server import db, create_audit_log

    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can delete groups")
    if not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=400, detail="Invalid group ID")

    group = await db.groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    try:
        # Remove denormalized membership references first so every role stops
        # seeing the group as soon as its next live refresh completes.
        await db.teachers.update_many(
            {"group_ids": group_id},
            {"$pull": {"group_ids": group_id}}
        )
        await db.students.update_many(
            {"group_ids": group_id},
            {"$pull": {"group_ids": group_id}}
        )

        # Group-owned academic records cannot be used after the group is gone.
        for collection in (
            db.teacher_journal,
            db.lesson_feedback,
            db.attendance,
            db.attendance_records,
            db.homework,
            db.tests,
        ):
            await collection.delete_many({"group_id": group_id})

        result = await db.groups.delete_one({"_id": ObjectId(group_id)})
        if result.deleted_count != 1:
            raise HTTPException(status_code=409, detail="Group could not be deleted")

        await create_audit_log(
            str(current_user["_id"]),
            "delete",
            "group",
            group_id,
            {"name": group.get("name")},
            request.client.host if request.client else None
        )
        return {"message": "Group deleted successfully", "group_id": group_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{group_id}/students/{student_id}")
async def add_student_to_group(
    group_id: str,
    student_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Add student to group"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        # Add to group
        await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {"$addToSet": {"student_ids": student_id}}
        )
        
        # Add to student
        await db.students.update_one(
            {"_id": ObjectId(student_id)},
            {"$addToSet": {"group_ids": group_id}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "add_student_to_group",
            "group",
            group_id,
            {"student_id": student_id},
            request.client.host if request.client else None
        )
        
        return {"message": "Student added to group successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{group_id}/students/{student_id}")
async def remove_student_from_group(
    group_id: str,
    student_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Remove student from group"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    if not ObjectId.is_valid(group_id) or not ObjectId.is_valid(student_id):
        raise HTTPException(status_code=400, detail="Invalid group or student ID")

    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        student = await db.students.find_one({"_id": ObjectId(student_id)})
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")

        group_result = await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {"$pull": {"student_ids": student_id}}
        )
        
        try:
            student_result = await db.students.update_one(
                {"_id": ObjectId(student_id)},
                {"$pull": {"group_ids": group_id}}
            )
        except Exception:
            if student_id in group.get("student_ids", []):
                await db.groups.update_one(
                    {"_id": ObjectId(group_id)},
                    {"$addToSet": {"student_ids": student_id}},
                )
            raise

        if group_result.matched_count == 0 or student_result.matched_count == 0:
            if student_id in group.get("student_ids", []):
                await db.groups.update_one(
                    {"_id": ObjectId(group_id)},
                    {"$addToSet": {"student_ids": student_id}},
                )
            raise HTTPException(status_code=409, detail="Group membership could not be updated")
        
        await create_audit_log(
            str(current_user["_id"]),
            "remove_student_from_group",
            "group",
            group_id,
            {"student_id": student_id},
            request.client.host if request.client else None
        )
        
        updated_group = await db.groups.find_one({"_id": ObjectId(group_id)})
        updated_student = await db.students.find_one({"_id": ObjectId(student_id)})
        return {
            "message": "Student removed from group successfully",
            "group": serialize_doc(updated_group),
            "student": serialize_doc(updated_student),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
