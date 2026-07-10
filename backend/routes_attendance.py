"""
Routes for Attendance Management
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, date, timedelta
from models import Attendance, AttendanceBase, AttendanceStatus
from auth import get_current_user

router = APIRouter(prefix="/attendance", tags=["Attendance"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

def group_has_class_on_day(group: dict, attendance_day: datetime) -> bool:
    schedule = group.get("schedule", [])
    if not schedule:
        return False

    weekday = attendance_day.strftime("%A").lower()
    return any(str(item.get("day", "")).lower() == weekday for item in schedule)

@router.post("", response_model=Attendance)
async def mark_attendance(
    attendance_data: AttendanceBase,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Mark attendance for a student"""
    from server import db, serialize_doc, create_audit_log
    
    current_role = str(current_user.get("role", "")).lower()

    # Only teachers, managers, and super admins can mark attendance
    if current_role not in ["super_admin", "manager", "teacher"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(attendance_data.group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Get teacher ID
        teacher_id = None
        if current_role == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_id = str(teacher["_id"])
                if (
                    attendance_data.group_id not in teacher.get("group_ids", [])
                    and group.get("teacher_id") != teacher_id
                ):
                    raise HTTPException(status_code=403, detail="You can only mark attendance for your own groups")
        else:
            # For managers/admins, get teacher from group
            teacher_id = group["teacher_id"]
        
        if not teacher_id:
            raise HTTPException(status_code=400, detail="Teacher not found")
        
        attendance_day = attendance_data.date.replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = attendance_day + timedelta(days=1)

        if not group_has_class_on_day(group, attendance_day):
            raise HTTPException(status_code=400, detail="This group does not have a class scheduled on this date")

        student = await db.students.find_one({
            "_id": ObjectId(attendance_data.student_id),
            "status": {"$ne": "archived"}
        })
        if (
            not student
            or (
                attendance_data.group_id not in student.get("group_ids", [])
                and attendance_data.student_id not in group.get("student_ids", [])
            )
        ):
            raise HTTPException(status_code=400, detail="Student is not active in this group")

        # Check if attendance already exists for this student on this calendar date
        existing = await db.attendance.find_one({
            "student_id": attendance_data.student_id,
            "group_id": attendance_data.group_id,
            "date": {"$gte": attendance_day, "$lt": next_day}
        })
        
        if existing:
            # Update existing
            await db.attendance.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "status": attendance_data.status,
                    "notes": attendance_data.notes,
                    "updated_at": datetime.utcnow()
                }}
            )
            result_id = existing["_id"]
        else:
            # Create new
            attendance = {
                "student_id": attendance_data.student_id,
                "group_id": attendance_data.group_id,
                "teacher_id": teacher_id,
                "date": attendance_day,
                "status": attendance_data.status,
                "notes": attendance_data.notes,
                "marked_by": str(current_user["_id"]),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            result = await db.attendance.insert_one(attendance)
            result_id = result.inserted_id
        
        await create_audit_log(
            str(current_user["_id"]),
            "mark_attendance",
            "attendance",
            str(result_id),
            {"student_id": attendance_data.student_id, "status": attendance_data.status},
            request.client.host if request.client else None
        )
        
        record = await db.attendance.find_one({"_id": result_id})
        return serialize_doc(record)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/group/{group_id}", response_model=List[Attendance])
async def get_group_attendance(
    group_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get attendance for a group"""
    from server import db, serialize_doc
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        query = {"group_id": group_id}

        current_role = str(current_user.get("role", "")).lower()
        if current_role == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if (
                not teacher
                or (
                    group_id not in teacher.get("group_ids", [])
                    and group.get("teacher_id") != str(teacher["_id"])
                )
            ):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_role == "student":
            student = await db.students.find_one({
                "user_id": str(current_user["_id"]),
                "status": {"$ne": "archived"}
            })
            if (
                not student
                or (
                    group_id not in student.get("group_ids", [])
                    and str(student["_id"]) not in group.get("student_ids", [])
                )
            ):
                raise HTTPException(status_code=403, detail="Access denied")
            query["student_id"] = str(student["_id"])
        elif current_role == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent:
                raise HTTPException(status_code=403, detail="Access denied")
            active_children = await db.students.find({
                "_id": {"$in": [ObjectId(sid) for sid in parent.get("student_ids", []) if ObjectId.is_valid(sid)]},
                "status": {"$ne": "archived"}
            }).to_list(100)
            child_ids = [
                str(child["_id"])
                for child in active_children
                if group_id in child.get("group_ids", []) or str(child["_id"]) in group.get("student_ids", [])
            ]
            if not child_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            query["student_id"] = {"$in": child_ids}
        elif current_role not in ["super_admin", "manager"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        if start_date and end_date:
            query["date"] = {
                "$gte": datetime.fromisoformat(start_date),
                "$lte": datetime.fromisoformat(end_date)
            }
        
        attendance = await db.attendance.find(query).sort("date", -1).to_list(1000)
        return [serialize_doc(a) for a in attendance]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/student/{student_id}", response_model=List[Attendance])
async def get_student_attendance(
    student_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get attendance for a student"""
    from server import db, serialize_doc
    
    try:
        # Check permissions
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or student_id not in parent.get("student_ids", []):
                raise HTTPException(status_code=403, detail="Access denied")
            student = await db.students.find_one({
                "_id": ObjectId(student_id),
                "status": {"$ne": "archived"}
            })
            if not student:
                return []
        elif current_user["role"] == "student":
            student = await db.students.find_one({
                "_id": ObjectId(student_id),
                "status": {"$ne": "archived"}
            })
            if not student or str(student["user_id"]) != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            student = await db.students.find_one({
                "_id": ObjectId(student_id),
                "status": {"$ne": "archived"}
            })
            if not student:
                return []
        
        query = {"student_id": student_id}
        
        if start_date and end_date:
            query["date"] = {
                "$gte": datetime.fromisoformat(start_date),
                "$lte": datetime.fromisoformat(end_date)
            }
        
        attendance = await db.attendance.find(query).sort("date", -1).to_list(1000)
        return [serialize_doc(a) for a in attendance]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
