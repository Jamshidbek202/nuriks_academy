"""
Routes for Support Booking Management
Students can book support sessions, Support staff can manage them
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from auth import get_current_user, generate_unique_id

router = APIRouter(prefix="/support-bookings", tags=["Support Bookings"])
support_staff_router = APIRouter(prefix="/support", tags=["Support Staff"])
security = HTTPBearer()

# Pydantic models for Support Booking
class SupportBookingCreate(BaseModel):
    support_staff_id: str
    booking_date: str  # YYYY-MM-DD
    start_time: str    # HH:MM
    duration_minutes: int = 40  # Max 40 minutes
    topic: Optional[str] = None
    notes: Optional[str] = None

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
        # Validate duration (max 40 minutes)
        if booking_data.duration_minutes > 40:
            raise HTTPException(status_code=400, detail="Maximum booking duration is 40 minutes")
        
        if booking_data.duration_minutes < 15:
            raise HTTPException(status_code=400, detail="Minimum booking duration is 15 minutes")
        
        # Check if support staff exists
        support_staff = await db.support_staff.find_one({"_id": ObjectId(booking_data.support_staff_id)})
        if not support_staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        
        # Get student profile
        student = await db.students.find_one({"user_id": str(current_user["_id"])})
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
        
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
        
        # Generate booking ID
        booking_id = await get_next_booking_id(db)
        
        # Create booking
        booking = {
            "booking_id": booking_id,
            "student_id": str(student["_id"]),
            "student_user_id": str(current_user["_id"]),
            "support_staff_id": booking_data.support_staff_id,
            "booking_date": booking_data.booking_date,
            "start_time": booking_data.start_time,
            "end_time": end_time,
            "duration_minutes": booking_data.duration_minutes,
            "topic": booking_data.topic,
            "notes": booking_data.notes,
            "status": "scheduled",
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
    
    try:
        query = {}
        
        # Role-based filtering
        if current_user["role"] == "student":
            # Students see only their own bookings
            student = await db.students.find_one({"user_id": str(current_user["_id"])})
            if student:
                query["student_id"] = str(student["_id"])
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
                query["student_id"] = {"$in": parent["student_ids"]}
            else:
                return []
        
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
            # Get student info
            student = await db.students.find_one({"_id": ObjectId(booking["student_id"])})
            if student:
                booking["student_name"] = f"{student['first_name']} {student['last_name']}"
                booking["student_code"] = student["student_id"]
            
            # Get support staff info
            support = await db.support_staff.find_one({"_id": ObjectId(booking["support_staff_id"])})
            if support:
                booking["support_name"] = f"{support['first_name']} {support['last_name']}"
        
        return [serialize_doc(b) for b in bookings]
        
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
        # Get support staff and their available hours
        support_staff = await db.support_staff.find_one({"_id": ObjectId(support_staff_id)})
        if not support_staff:
            raise HTTPException(status_code=404, detail="Support staff not found")
        
        # Get system settings for working hours
        settings = await db.system_settings.find_one()
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
            "status": {"$in": ["scheduled", "confirmed"]}
        }).to_list(100)
        
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
        
        return {
            "support_staff": serialize_doc(support_staff),
            "date": date,
            "available_slots": available_slots
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        
        # Support staff can only confirm their own bookings
        if current_user["role"] == "support":
            support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
            if not support or str(support["_id"]) != booking["support_staff_id"]:
                raise HTTPException(status_code=403, detail="You can only confirm your own bookings")
        
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
        
        # Check permissions
        if current_user["role"] == "student":
            if booking["student_user_id"] != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="You can only cancel your own bookings")
        elif current_user["role"] == "support":
            support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
            if not support or str(support["_id"]) != booking["support_staff_id"]:
                raise HTTPException(status_code=403, detail="You can only cancel your own bookings")
        elif current_user["role"] not in ["super_admin", "manager"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        
        # Update status
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
        
        # Support staff can only complete their own bookings
        if current_user["role"] == "support":
            support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
            if not support or str(support["_id"]) != booking["support_staff_id"]:
                raise HTTPException(status_code=403, detail="You can only complete your own bookings")
        
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
        
        # Support staff can only update their own bookings
        if current_user["role"] == "support":
            support = await db.support_staff.find_one({"user_id": str(current_user["_id"])})
            if not support or str(support["_id"]) != booking["support_staff_id"]:
                raise HTTPException(status_code=403, detail="You can only update notes for your own bookings")
        
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
        support_staff = await db.support_staff.find({}).to_list(100)
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
    
    try:
        support = await db.support_staff.find_one({"_id": ObjectId(staff_id)})
        if not support:
            raise HTTPException(status_code=404, detail="Support staff not found")
        return serialize_doc(support)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
