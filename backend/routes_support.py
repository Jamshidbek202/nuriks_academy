"""
Routes for Support Booking Management
Students can book support sessions, Support staff can manage them
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field
from auth import get_current_user, generate_unique_id
from validation import require_date_string_window, require_time_string

router = APIRouter(prefix="/support-bookings", tags=["Support Bookings"])
support_staff_router = APIRouter(prefix="/support", tags=["Support Staff"])
security = HTTPBearer()
DEFAULT_SUPPORT_SESSION_CAPACITY = 6
MAX_SUPPORT_SESSION_CAPACITY = 12

# Pydantic models for Support Booking
class SupportBookingCreate(BaseModel):
    support_staff_id: str
    booking_date: str  # YYYY-MM-DD
    start_time: str    # HH:MM
    duration_minutes: int = Field(40, ge=15, le=40)
    topic: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=2000)

class SessionNotesUpdate(BaseModel):
    session_notes: str

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

async def get_next_booking_id(db):
    """Get next booking ID using atomic counter"""
    result = await db.counters.find_one_and_update(
        {"_id": "booking_id"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return generate_unique_id("BK", result["seq"])


def _participant_student_ids(booking: dict) -> List[str]:
    values = booking.get("participant_student_ids")
    if isinstance(values, list) and values:
        return list(dict.fromkeys(str(value) for value in values if value))
    return [str(booking["student_id"])] if booking.get("student_id") else []


def _participant_user_ids(booking: dict) -> List[str]:
    values = booking.get("participant_user_ids")
    if isinstance(values, list) and values:
        return list(dict.fromkeys(str(value) for value in values if value))
    return [str(booking["student_user_id"])] if booking.get("student_user_id") else []


def _booking_capacity(booking: dict) -> int:
    try:
        value = int(booking.get("capacity", DEFAULT_SUPPORT_SESSION_CAPACITY))
    except (TypeError, ValueError):
        value = DEFAULT_SUPPORT_SESSION_CAPACITY
    return max(2, min(MAX_SUPPORT_SESSION_CAPACITY, value))


async def ensure_booking_participants(db, booking: dict) -> dict:
    """Upgrade a legacy single-student booking to the shared-session shape."""
    student_ids = _participant_student_ids(booking)
    user_ids = _participant_user_ids(booking)
    capacity = _booking_capacity(booking)
    participant_count = max(len(student_ids), len(user_ids), 1)
    expected = {
        "participant_student_ids": student_ids,
        "participant_user_ids": user_ids,
        "participant_count": participant_count,
        "capacity": capacity,
        "is_group_session": True,
    }
    if any(booking.get(key) != value for key, value in expected.items()):
        await db.support_bookings.update_one(
            {"_id": booking["_id"]},
            {"$set": expected},
        )
        booking.update(expected)
    return booking


async def support_session_capacity(db) -> int:
    settings = await db.system_settings.find_one() or {}
    return _booking_capacity({"capacity": settings.get("support_session_capacity")})


async def get_current_student(db, current_user: dict) -> Optional[dict]:
    return await db.students.find_one({
        "user_id": str(current_user["_id"]),
        "status": {"$ne": "archived"},
    })


def _safe_joinable_session(booking: dict, support: Optional[dict]) -> dict:
    participant_count = max(
        int(booking.get("participant_count", 0) or 0),
        len(_participant_user_ids(booking)),
        1,
    )
    capacity = _booking_capacity(booking)
    return {
        "id": str(booking["_id"]),
        "booking_id": booking.get("booking_id"),
        "booking_date": booking.get("booking_date"),
        "start_time": booking.get("start_time"),
        "end_time": booking.get("end_time"),
        "duration_minutes": booking.get("duration_minutes", 40),
        "topic": booking.get("topic") or "General Support",
        "status": booking.get("status"),
        "support_staff_id": booking.get("support_staff_id"),
        "support_name": (
            f"{support.get('first_name', '')} {support.get('last_name', '')}".strip()
            if support else booking.get("support_name")
        ),
        "participant_count": participant_count,
        "capacity": capacity,
        "remaining_places": max(0, capacity - participant_count),
    }


async def get_booking_branch_id(db, booking: dict) -> Optional[str]:
    if booking.get("branch_id"):
        return booking["branch_id"]
    student_id = booking.get("student_id")
    if not student_id or not ObjectId.is_valid(student_id):
        return None
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    return student.get("branch_id") if student else None


async def require_booking_staff_access(db, current_user: dict, booking: dict) -> None:
    """Enforce ownership for support users and branch scope for managers."""
    role = current_user.get("role")
    if role == "super_admin":
        return
    if role in {"manager", "reception"}:
        if await get_booking_branch_id(db, booking) != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Booking belongs to another branch")
        return
    if role == "support":
        support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
        if not support or str(support["_id"]) != booking.get("support_staff_id"):
            raise HTTPException(status_code=403, detail="You can only manage your own bookings")
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


def require_same_branch(current_user: dict, document: dict, detail: str) -> None:
    if (
        current_user.get("role") != "super_admin"
        and document.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail=detail)

def calculate_end_time(start_time: str, duration_minutes: int) -> str:
    """Calculate end time from start time and duration"""
    hours, minutes = map(int, start_time.split(':'))
    total_minutes = hours * 60 + minutes + duration_minutes
    end_hours = total_minutes // 60
    end_minutes = total_minutes % 60
    return f"{end_hours:02d}:{end_minutes:02d}"

@router.post("")
async def create_booking(
    booking_data: SupportBookingCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a support booking (Students only)"""
    from server import db, serialize_doc, create_audit_log
    
    # Only students can create bookings
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can book support sessions")
    
    try:
        require_date_string_window(booking_data.booking_date, future_days=30, label="Booking date")
        require_time_string(booking_data.start_time, label="Start time")
        # Validate duration (max 40 minutes)
        if booking_data.duration_minutes > 40:
            raise HTTPException(status_code=400, detail="Maximum booking duration is 40 minutes")

        if booking_data.duration_minutes < 15:
            raise HTTPException(status_code=400, detail="Minimum booking duration is 15 minutes")
        
        # Check if support staff exists
        support_staff = await db.support_staff.find_one({
            "_id": ObjectId(booking_data.support_staff_id),
            "is_deleted": {"$ne": True},
        })
        if not support_staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        
        # Get student profile
        student = await get_current_student(db, current_user)
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
        require_same_branch(current_user, support_staff, "Support staff belongs to another branch")
        
        # Check for conflicting bookings
        end_time = calculate_end_time(booking_data.start_time, booking_data.duration_minutes)
        
        # Check if support staff has conflicting bookings
        conflicting = await db.support_bookings.find_one({
            "support_staff_id": booking_data.support_staff_id,
            "booking_date": booking_data.booking_date,
            "status": {"$in": ["scheduled", "confirmed"]},
            "$or": [
                {"start_time": {"$lt": end_time}, "end_time": {"$gt": booking_data.start_time}},
            ]
        })
        
        if conflicting:
            raise HTTPException(status_code=400, detail="This time slot is not available")

        # A student cannot hold overlapping support sessions, even with
        # different support teachers.
        student_conflict = await db.support_bookings.find_one({
            "booking_date": booking_data.booking_date,
            "status": {"$in": ["scheduled", "confirmed"]},
            "is_deleted": {"$ne": True},
            "$and": [
                {"$or": [
                    {"student_user_id": str(current_user["_id"])},
                    {"participant_user_ids": str(current_user["_id"])},
                ]},
                {"start_time": {"$lt": end_time}, "end_time": {"$gt": booking_data.start_time}},
            ],
        })
        if student_conflict:
            raise HTTPException(status_code=409, detail="You already have a support session at this time")
        
        # Generate booking ID
        booking_id = await get_next_booking_id(db)
        
        # Create booking
        capacity = await support_session_capacity(db)
        booking = {
            "booking_id": booking_id,
            "student_id": str(student["_id"]),
            "student_user_id": str(current_user["_id"]),
            "support_staff_id": booking_data.support_staff_id,
            "branch_id": student.get("branch_id"),
            "booking_date": booking_data.booking_date,
            "start_time": booking_data.start_time,
            "end_time": end_time,
            "duration_minutes": booking_data.duration_minutes,
            "topic": (booking_data.topic or "General Support").strip() or "General Support",
            "notes": booking_data.notes,
            "status": "scheduled",
            "participant_student_ids": [str(student["_id"])],
            "participant_user_ids": [str(current_user["_id"])],
            "participant_count": 1,
            "capacity": capacity,
            "is_group_session": True,
            "session_notes": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db.support_bookings.insert_one(booking)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "support_booking",
            str(result.inserted_id),
            {"booking_id": booking_id},
            request.client.host if request.client else None
        )
        
        booking["id"] = str(result.inserted_id)
        return serialize_doc(booking)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def get_bookings(
    support_staff_id: Optional[str] = None,
    status: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get support bookings based on user role"""
    from server import db, serialize_doc

    if current_user.get("role") not in ["student", "support", "parent", "super_admin", "manager", "reception"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {"is_deleted": {"$ne": True}}
        
        participant_scoped = False

        # Role-based filtering
        if current_user["role"] == "student":
            # Students see sessions they created or joined.
            student = await get_current_student(db, current_user)
            if student:
                query["$or"] = [
                    {"student_id": str(student["_id"])},
                    {"participant_student_ids": str(student["_id"])},
                ]
                participant_scoped = True
            else:
                return []
        
        elif current_user["role"] == "support":
            # Support staff see only their assigned bookings
            support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
            if support:
                query["support_staff_id"] = str(support["_id"])
            else:
                return []
        
        elif current_user["role"] == "parent":
            # Parents see their children's bookings
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if parent and parent.get("student_ids"):
                active_children = await db.students.find({
                    "_id": {"$in": [ObjectId(sid) for sid in parent["student_ids"] if ObjectId.is_valid(sid)]},
                    "status": {"$ne": "archived"}
                }).to_list(100)
                child_ids = [str(child["_id"]) for child in active_children]
                query["$or"] = [
                    {"student_id": {"$in": child_ids}},
                    {"participant_student_ids": {"$in": child_ids}},
                ]
                participant_scoped = True
            else:
                return []

        if not participant_scoped:
            student_query = {"status": {"$ne": "archived"}}
            if current_user["role"] in ["manager", "support", "reception"]:
                student_query["branch_id"] = current_user.get("branch_id")
            active_students = await db.students.find(student_query).to_list(5000)
            query["student_id"] = {"$in": [str(student["_id"]) for student in active_students]}
        
        # Admin/Manager can see all (with optional filters)
        if support_staff_id:
            query["support_staff_id"] = support_staff_id
        
        if status:
            query["status"] = status
        
        if date:
            query["booking_date"] = date
        
        bookings = await db.support_bookings.find(query).sort("booking_date", -1).to_list(100)
        
        # Enrich with student and support info
        for booking in bookings:
            booking = await ensure_booking_participants(db, booking)
            # Get student info
            student = await db.students.find_one({
                "_id": ObjectId(booking["student_id"]),
                "status": {"$ne": "archived"}
            })
            if student:
                booking["student_name"] = f"{student['first_name']} {student['last_name']}"
                booking["student_code"] = student["student_id"]
            
            # Get support staff info
            support = await db.support_staff.find_one({"_id": ObjectId(booking["support_staff_id"])})
            if support:
                booking["support_name"] = f"{support['first_name']} {support['last_name']}"

            booking["participant_count"] = max(
                int(booking.get("participant_count", 0) or 0),
                len(_participant_student_ids(booking)),
                1,
            )
            booking["capacity"] = _booking_capacity(booking)

            if current_user["role"] in {"support", "super_admin", "manager", "reception"}:
                participant_ids = [
                    ObjectId(value)
                    for value in _participant_student_ids(booking)
                    if ObjectId.is_valid(value)
                ]
                participants = await db.students.find({
                    "_id": {"$in": participant_ids},
                    "status": {"$ne": "archived"},
                }).to_list(MAX_SUPPORT_SESSION_CAPACITY)
                names_by_id = {
                    str(participant["_id"]): f"{participant.get('first_name', '')} {participant.get('last_name', '')}".strip()
                    for participant in participants
                }
                booking["participant_names"] = [
                    names_by_id[value]
                    for value in _participant_student_ids(booking)
                    if value in names_by_id
                ]

        if current_user["role"] in {"student", "parent"}:
            return [_safe_joinable_session(booking, None) for booking in bookings]
        return [serialize_doc(b) for b in bookings]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/available-slots")
async def get_available_slots(
    support_staff_id: str,
    date: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get available time slots for a support staff on a given date"""
    from server import db, serialize_doc
    
    try:
        require_date_string_window(date, future_days=30, label="Booking date")
        # Get support staff and their available hours
        support_staff = await db.support_staff.find_one({"_id": ObjectId(support_staff_id)})
        if not support_staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_same_branch(current_user, support_staff, "Support staff belongs to another branch")
        
        # Get system settings for working hours
        settings = await db.system_settings.find_one() or {}
        working_hours = settings.get("support_working_hours", {"start": "09:00", "end": "18:00"})
        
        # Generate all possible 40-minute slots
        start_hour, start_min = map(int, working_hours["start"].split(":"))
        end_hour, end_min = map(int, working_hours["end"].split(":"))
        
        all_slots = []
        current_minutes = start_hour * 60 + start_min
        end_minutes = end_hour * 60 + end_min - 40  # Subtract 40 to ensure slot fits
        
        while current_minutes <= end_minutes:
            slot_start = f"{current_minutes // 60:02d}:{current_minutes % 60:02d}"
            slot_end = f"{(current_minutes + 40) // 60:02d}:{(current_minutes + 40) % 60:02d}"
            all_slots.append({"start": slot_start, "end": slot_end})
            current_minutes += 30  # 30-minute intervals
        
        # Get existing bookings for this date
        existing_bookings = await db.support_bookings.find({
            "support_staff_id": support_staff_id,
            "booking_date": date,
            "status": {"$in": ["scheduled", "confirmed"]},
            "is_deleted": {"$ne": True},
        }).to_list(100)
        existing_bookings = [
            await ensure_booking_participants(db, booking)
            for booking in existing_bookings
        ]
        
        # Filter out booked slots
        available_slots = []
        for slot in all_slots:
            is_available = True
            for booking in existing_bookings:
                # Check if slot overlaps with existing booking
                if not (slot["end"] <= booking["start_time"] or slot["start"] >= booking["end_time"]):
                    is_available = False
                    break
            if is_available:
                available_slots.append(slot)
        
        current_student = (
            await get_current_student(db, current_user)
            if current_user.get("role") == "student"
            else None
        )
        current_user_id = str(current_user["_id"])
        joinable_sessions = []
        for booking in existing_bookings:
            participant_count = max(
                int(booking.get("participant_count", 0) or 0),
                len(_participant_user_ids(booking)),
                1,
            )
            if (
                current_student
                and current_user_id not in _participant_user_ids(booking)
                and participant_count < _booking_capacity(booking)
            ):
                joinable_sessions.append(_safe_joinable_session(booking, support_staff))

        return {
            "support_staff": serialize_doc(support_staff),
            "date": date,
            "available_slots": available_slots,
            "joinable_sessions": joinable_sessions,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/joinable")
async def get_joinable_sessions(
    current_user: dict = Depends(get_current_user_dep),
):
    """List upcoming shared support sessions without exposing student identities."""
    from server import db

    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students can join support sessions")

    student = await get_current_student(db, current_user)
    if not student:
        return []
    today = datetime.now(ZoneInfo("Asia/Tashkent")).date().isoformat()
    bookings = await db.support_bookings.find({
        "branch_id": student.get("branch_id"),
        "booking_date": {"$gte": today},
        "status": {"$in": ["scheduled", "confirmed"]},
        "is_deleted": {"$ne": True},
    }).sort([("booking_date", 1), ("start_time", 1)]).to_list(100)

    support_ids = {
        ObjectId(booking["support_staff_id"])
        for booking in bookings
        if ObjectId.is_valid(booking.get("support_staff_id", ""))
    }
    support_rows = await db.support_staff.find({"_id": {"$in": list(support_ids)}}).to_list(100)
    support_by_id = {str(row["_id"]): row for row in support_rows}
    current_user_id = str(current_user["_id"])
    result = []
    for booking in bookings:
        booking = await ensure_booking_participants(db, booking)
        participant_count = max(
            int(booking.get("participant_count", 0) or 0),
            len(_participant_user_ids(booking)),
            1,
        )
        if current_user_id in _participant_user_ids(booking):
            continue
        if participant_count >= _booking_capacity(booking):
            continue
        result.append(_safe_joinable_session(
            booking,
            support_by_id.get(booking.get("support_staff_id")),
        ))
    return result


@router.post("/{booking_id}/join")
async def join_booking(
    booking_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    """Join an existing shared support session (students only)."""
    from server import db, serialize_doc, create_audit_log

    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Only students can join support sessions")
    if not ObjectId.is_valid(booking_id):
        raise HTTPException(status_code=404, detail="Support session not found")

    booking = await db.support_bookings.find_one({
        "_id": ObjectId(booking_id),
        "is_deleted": {"$ne": True},
    })
    if not booking:
        raise HTTPException(status_code=404, detail="Support session not found")
    if booking.get("status") not in {"scheduled", "confirmed"}:
        raise HTTPException(status_code=409, detail="This support session is no longer open")
    require_date_string_window(booking.get("booking_date", ""), future_days=30, label="Booking date")

    student = await get_current_student(db, current_user)
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    if booking.get("branch_id") != student.get("branch_id"):
        raise HTTPException(status_code=403, detail="Support session belongs to another branch")

    booking = await ensure_booking_participants(db, booking)
    current_user_id = str(current_user["_id"])
    if current_user_id in _participant_user_ids(booking):
        raise HTTPException(status_code=409, detail="You already joined this support session")

    conflicting = await db.support_bookings.find_one({
        "_id": {"$ne": booking["_id"]},
        "booking_date": booking.get("booking_date"),
        "status": {"$in": ["scheduled", "confirmed"]},
        "is_deleted": {"$ne": True},
        "$and": [
            {"$or": [
                {"student_user_id": current_user_id},
                {"participant_user_ids": current_user_id},
            ]},
            {
                "start_time": {"$lt": booking.get("end_time")},
                "end_time": {"$gt": booking.get("start_time")},
            },
        ],
    })
    if conflicting:
        raise HTTPException(status_code=409, detail="You already have a support session at this time")

    result = await db.support_bookings.update_one(
        {
            "_id": booking["_id"],
            "status": {"$in": ["scheduled", "confirmed"]},
            "participant_user_ids": {"$ne": current_user_id},
            "$expr": {"$lt": [{"$size": "$participant_user_ids"}, "$capacity"]},
        },
        {
            "$addToSet": {
                "participant_student_ids": str(student["_id"]),
                "participant_user_ids": current_user_id,
            },
            "$inc": {"participant_count": 1},
            "$set": {"updated_at": datetime.utcnow()},
        },
    )
    if result.modified_count != 1:
        latest = await db.support_bookings.find_one({"_id": booking["_id"]})
        if latest and current_user_id in _participant_user_ids(latest):
            raise HTTPException(status_code=409, detail="You already joined this support session")
        raise HTTPException(status_code=409, detail="This support session is full")

    updated = await db.support_bookings.find_one({"_id": booking["_id"]})
    await create_audit_log(
        current_user_id,
        "join",
        "support_booking",
        booking_id,
        {"participant_count": updated.get("participant_count")},
        request.client.host if request.client else None,
    )
    return _safe_joinable_session(updated, None)

@router.put("/{booking_id}/confirm")
async def confirm_booking(
    booking_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Confirm a booking (Support staff only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["support", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get the booking
        booking = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.get("status") not in {"scheduled", "confirmed"}:
            raise HTTPException(status_code=409, detail="Only an upcoming booking can be confirmed")
        
        await require_booking_staff_access(db, current_user, booking)
        
        # Update status
        await db.support_bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": {"status": "confirmed", "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "confirm",
            "support_booking",
            booking_id,
            None,
            request.client.host if request.client else None
        )
        
        updated = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Cancel a booking"""
    from server import db, serialize_doc, create_audit_log
    
    try:
        booking = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.get("status") not in {"scheduled", "confirmed"}:
            raise HTTPException(status_code=409, detail="Only an upcoming booking can be cancelled")
        booking = await ensure_booking_participants(db, booking)
        
        # Check permissions
        if current_user["role"] == "student":
            current_user_id = str(current_user["_id"])
            if current_user_id not in _participant_user_ids(booking):
                raise HTTPException(status_code=403, detail="You can only cancel your own bookings")
            student = await get_current_student(db, current_user)
            if not student:
                raise HTTPException(status_code=404, detail="Student profile not found")

            remaining_user_ids = [
                value for value in _participant_user_ids(booking)
                if value != current_user_id
            ]
            if remaining_user_ids:
                remaining_students = await db.students.find({
                    "user_id": {"$in": remaining_user_ids},
                    "status": {"$ne": "archived"},
                }).to_list(MAX_SUPPORT_SESSION_CAPACITY)
                student_by_user = {
                    str(row.get("user_id")): str(row["_id"])
                    for row in remaining_students
                }
                remaining_student_ids = [
                    student_by_user[user_id]
                    for user_id in remaining_user_ids
                    if user_id in student_by_user
                ]
                if not remaining_student_ids:
                    raise HTTPException(status_code=409, detail="The remaining session participants could not be resolved")
                update = {
                    "participant_user_ids": remaining_user_ids,
                    "participant_student_ids": remaining_student_ids,
                    "participant_count": len(remaining_user_ids),
                    "student_user_id": remaining_user_ids[0],
                    "student_id": remaining_student_ids[0],
                    "updated_at": datetime.utcnow(),
                }
                await db.support_bookings.update_one(
                    {"_id": ObjectId(booking_id), "participant_user_ids": current_user_id},
                    {"$set": update},
                )
                await create_audit_log(
                    current_user_id,
                    "leave",
                    "support_booking",
                    booking_id,
                    {"participant_count": len(remaining_user_ids)},
                    request.client.host if request.client else None,
                )
                updated = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
                return _safe_joinable_session(updated, None)
        elif current_user["role"] == "support":
            await require_booking_staff_access(db, current_user, booking)
        elif current_user["role"] not in ["super_admin", "manager"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        else:
            await require_booking_staff_access(db, current_user, booking)
        
        # The last student, support owner, or authorized manager cancels the
        # complete session.
        await db.support_bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": {"status": "cancelled", "updated_at": datetime.utcnow()}}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "cancel",
            "support_booking",
            booking_id,
            None,
            request.client.host if request.client else None
        )
        
        updated = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        if current_user["role"] == "student":
            return _safe_joinable_session(updated, None)
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{booking_id}/complete")
async def complete_booking(
    booking_id: str,
    notes_data: SessionNotesUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Complete a booking and add session notes (Support staff only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["support", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        booking = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        await require_booking_staff_access(db, current_user, booking)
        
        # Update status and add notes
        await db.support_bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": {
                "status": "completed",
                "session_notes": notes_data.session_notes,
                "completed_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "complete",
            "support_booking",
            booking_id,
            {"session_notes": notes_data.session_notes},
            request.client.host if request.client else None
        )
        
        updated = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{booking_id}/notes")
async def update_session_notes(
    booking_id: str,
    notes_data: SessionNotesUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update session notes for a booking (Support staff only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["support", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        booking = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        await require_booking_staff_access(db, current_user, booking)
        
        await db.support_bookings.update_one(
            {"_id": ObjectId(booking_id)},
            {"$set": {
                "session_notes": notes_data.session_notes,
                "updated_at": datetime.utcnow()
            }}
        )
        
        updated = await db.support_bookings.find_one({"_id": ObjectId(booking_id)})
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ==================== SUPPORT STAFF ROUTES ====================

@support_staff_router.get("")
async def get_support_staff(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get active support staff for booking selection."""
    from server import db, serialize_doc

    if current_user["role"] not in ["student", "parent", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {}
        if current_user["role"] != "super_admin":
            query["branch_id"] = current_user.get("branch_id")
        support_staff = await db.support_staff.find(query).to_list(100)
        active_staff = []

        for staff in support_staff:
            user_id = staff.get("user_id")
            user = await db.users.find_one({"_id": ObjectId(user_id)}) if user_id else None
            if user and not user.get("is_active", True):
                continue

            staff_data = serialize_doc(staff)
            staff_data["is_active"] = user.get("is_active", True) if user else True
            active_staff.append(staff_data)

        return active_staff
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@support_staff_router.get("/{staff_id}")
async def get_support_staff_by_id(
    staff_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get a specific support staff member"""
    from server import db, serialize_doc

    if current_user["role"] not in ["student", "parent", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        support = await db.support_staff.find_one({
            "_id": ObjectId(staff_id),
            "is_deleted": {"$ne": True},
        })
        if not support:
            raise HTTPException(status_code=404, detail="Support staff not found")
        require_same_branch(current_user, support, "Support staff belongs to another branch")
        return serialize_doc(support)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
