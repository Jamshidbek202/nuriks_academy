"""
Routes for Attendance Management
"""
import logging

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, date, timedelta, timezone
from models import Attendance, AttendanceBase, AttendanceStatus
from auth import get_current_user
from academic_access import (
    require_group_academic_read_access,
    require_group_academic_staff_access,
    require_student_academic_read_access,
)
from validation import require_date_window
from finance_ledger import _membership_active

router = APIRouter(prefix="/attendance", tags=["Attendance"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

def group_has_class_on_day(group: dict, attendance_day: datetime) -> bool:
    schedule = group.get("schedule", [])
    if not schedule:
        return False

    weekday = attendance_day.strftime("%A").lower()
    return any(str(item.get("day", "")).lower() == weekday for item in schedule)


def _utc_naive(value: datetime) -> datetime:
    """Normalize Mongo/API instants for comparisons with ``datetime.utcnow``."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def attendance_window_state(occurrence: dict, now_utc: Optional[datetime] = None) -> str:
    """Return the server-authoritative write state for one lesson.

    Attendance opens at the scheduled start and remains editable afterwards.
    Finance resolution and ledger locking must never prevent the assigned
    teacher from correcting an academic record. A superseded occurrence is not
    an actual lesson and therefore has no editable register.
    """
    if occurrence.get("superseded"):
        return "closed"

    starts_at = occurrence.get("starts_at")
    ends_at = occurrence.get("ends_at")
    if not isinstance(starts_at, datetime) or not isinstance(ends_at, datetime):
        return "unavailable"

    now = _utc_naive(now_utc or datetime.utcnow())
    starts = _utc_naive(starts_at)
    ends = _utc_naive(ends_at)
    if now < starts:
        return "upcoming"
    if now <= ends:
        return "in_progress"
    return "ended_unresolved"


def attendance_is_open(occurrence: dict, now_utc: Optional[datetime] = None) -> bool:
    return attendance_window_state(occurrence, now_utc) in {
        "in_progress",
        "ended_unresolved",
    }


async def complete_attendance_side_effects(
    db,
    student: dict,
    record_id: str,
    status: str,
    attendance_date: str,
    previous_status: Optional[str],
    actor_id: str,
    client_ip: Optional[str],
) -> None:
    """Keep audit and notification failures outside the attendance save result."""
    try:
        from server import create_audit_log
        await create_audit_log(
            actor_id,
            "mark_attendance",
            "attendance",
            record_id,
            {"student_id": str(student["_id"]), "status": status},
            client_ip,
        )
    except Exception:
        logger.exception("Could not write attendance audit log")

    if previous_status == status:
        return

    try:
        from notification_helpers import notify_attendance_marked

        parent = None
        if student.get("parent_id"):
            parent_id = student["parent_id"]
            parent_key = ObjectId(parent_id) if ObjectId.is_valid(str(parent_id)) else parent_id
            parent = await db.parents.find_one({"_id": parent_key})
        if not parent:
            parent = await db.parents.find_one({"student_ids": str(student["_id"])})
        await notify_attendance_marked(
            db,
            student.get("user_id", str(student["_id"])),
            status,
            attendance_date,
            parent.get("user_id") if parent else None,
        )
    except Exception:
        logger.exception(
            "Could not deliver attendance notification for student %s",
            student.get("_id"),
        )

@router.post("", response_model=Attendance)
async def mark_attendance(
    attendance_data: AttendanceBase,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Mark attendance for a student"""
    from server import db, serialize_doc
    
    current_role = str(current_user.get("role", "")).lower()

    # Attendance is an academic fact entered by the assigned teacher. Managers
    # and admins retain read access, but cannot create or rewrite the register.
    if current_role != "teacher":
        raise HTTPException(
            status_code=403,
            detail="Only the assigned teacher can mark attendance",
        )
    
    try:
        if not ObjectId.is_valid(attendance_data.group_id):
            raise HTTPException(status_code=400, detail="Invalid group ID")
        if not ObjectId.is_valid(attendance_data.student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        group = await db.groups.find_one({"_id": ObjectId(attendance_data.group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        await require_group_academic_staff_access(db, current_user, group)

        teacher = await db.teachers.find_one({
            "user_id": str(current_user["_id"]),
            "status": {"$ne": "archived"},
        })
        if not teacher:
            raise HTTPException(status_code=400, detail="Teacher not found")
        teacher_id = str(teacher["_id"])
        
        attendance_date = require_date_window(
            attendance_data.date, past_days=366, label="Attendance date"
        )
        attendance_day = attendance_date.replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = attendance_day + timedelta(days=1)

        occurrence = None
        occurrences = await db.lesson_occurrences.find({
            "group_id": attendance_data.group_id,
            "local_date": attendance_day.date().isoformat(),
            "counts_as_scheduled": True,
            "superseded": {"$ne": True},
        }).sort("starts_at", 1).to_list(100)
        if attendance_data.occurrence_id:
            if not ObjectId.is_valid(attendance_data.occurrence_id):
                raise HTTPException(status_code=400, detail="Invalid lesson occurrence ID")
            occurrence = next(
                (row for row in occurrences if str(row["_id"]) == attendance_data.occurrence_id),
                None,
            )
            if not occurrence:
                raise HTTPException(
                    status_code=409,
                    detail="The selected lesson does not match this group and date",
                )
        elif len(occurrences) == 1:
            occurrence = occurrences[0]
        elif len(occurrences) > 1:
            raise HTTPException(
                status_code=409,
                detail="Select the exact lesson time before marking attendance",
            )

        if not occurrence:
            raise HTTPException(
                status_code=409,
                detail="No generated lesson occurrence is available for this group and date",
            )
        if occurrence.get("teacher_id") != teacher_id:
            raise HTTPException(
                status_code=403,
                detail="Only the teacher assigned to this lesson can mark attendance",
            )

        window_state = attendance_window_state(occurrence)
        if window_state == "upcoming":
            raise HTTPException(
                status_code=409,
                detail="Attendance opens at the scheduled lesson start time",
            )
        if not attendance_is_open(occurrence):
            raise HTTPException(
                status_code=409,
                detail="Attendance is unavailable for this lesson occurrence",
            )

        student = await db.students.find_one({
            "_id": ObjectId(attendance_data.student_id),
            "status": {"$ne": "archived"}
        })
        historical_membership_active = False
        if occurrence:
            memberships = await db.group_memberships.find({
                "student_id": attendance_data.student_id,
                "group_id": attendance_data.group_id,
            }).to_list(1_000)
            historical_membership_active = _membership_active(
                memberships,
                attendance_data.group_id,
                occurrence["local_date"],
                occurrence.get("starts_at"),
            )
        if (
            not student
            or (
                attendance_data.group_id not in student.get("group_ids", [])
                and attendance_data.student_id not in group.get("student_ids", [])
                and not historical_membership_active
            )
        ):
            raise HTTPException(status_code=400, detail="Student is not active in this group")

        # Check if attendance already exists for this student on this calendar date
        attendance_query = {
            "student_id": attendance_data.student_id,
            "group_id": attendance_data.group_id,
        }
        if occurrence:
            attendance_query["occurrence_id"] = str(occurrence["_id"])
        else:
            attendance_query["date"] = {"$gte": attendance_day, "$lt": next_day}
        existing = await db.attendance.find_one(attendance_query)
        
        if existing:
            # Update existing
            await db.attendance.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "status": attendance_data.status,
                    "notes": attendance_data.notes,
                    **({"occurrence_id": str(occurrence["_id"])} if occurrence else {}),
                    "updated_at": datetime.utcnow()
                }}
            )
            result_id = existing["_id"]
        else:
            # Create new
            attendance = {
                "student_id": attendance_data.student_id,
                "group_id": attendance_data.group_id,
                "occurrence_id": str(occurrence["_id"]) if occurrence else None,
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
        
        record = await db.attendance.find_one({"_id": result_id})
        if not record:
            raise HTTPException(status_code=500, detail="Saved attendance record could not be loaded")
        previous_status = existing.get("status") if existing else None
        if hasattr(previous_status, "value"):
            previous_status = previous_status.value
        background_tasks.add_task(
            complete_attendance_side_effects,
            db,
            student,
            str(result_id),
            attendance_data.status.value,
            attendance_day.date().isoformat(),
            previous_status,
            str(current_user["_id"]),
            request.client.host if request.client else None,
        )
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
    occurrence_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get attendance for a group"""
    from server import db, serialize_doc
    
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        await require_group_academic_read_access(db, current_user, group)

        query = {"group_id": group_id}
        if occurrence_id:
            if not ObjectId.is_valid(occurrence_id):
                raise HTTPException(status_code=400, detail="Invalid lesson occurrence ID")
            query["occurrence_id"] = occurrence_id

        current_role = str(current_user.get("role", "")).lower()
        if current_role == "student":
            student = await db.students.find_one({
                "user_id": str(current_user["_id"]),
                "status": {"$ne": "archived"}
            })
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
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            return []
        await require_student_academic_read_access(db, current_user, student)
        
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
