"""
Routes for Electronic Teacher Journal
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from auth import get_current_user
from validation import require_date_window

router = APIRouter(prefix="/journal", tags=["Journal"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

async def get_active_group_student_ids(db, group_id: str) -> set[str]:
    group = await db.groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        return set()

    student_ids = set(group.get("student_ids", []))
    students = await db.students.find({
        "$or": [
            {"_id": {"$in": [ObjectId(sid) for sid in student_ids if ObjectId.is_valid(sid)]}},
            {"group_ids": group_id}
        ],
        "status": {"$ne": "archived"}
    }).to_list(500)

    return {str(student["_id"]) for student in students}

class StudentPerformance(BaseModel):
    student_id: str
    participation: int = Field(..., ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=1000)

class JournalEntryCreate(BaseModel):
    group_id: str
    lesson_date: datetime
    lesson_number: int = Field(..., ge=1, le=10000)
    topic: str = Field(..., min_length=1, max_length=300)
    materials_covered: str = Field(..., min_length=1, max_length=5000)
    homework_assigned: Optional[str] = Field(None, max_length=5000)
    student_performance: List[StudentPerformance] = []

class JournalEntry(BaseModel):
    id: str
    group_id: str
    teacher_id: str
    lesson_date: datetime
    lesson_number: int
    topic: str
    materials_covered: str
    homework_assigned: Optional[str] = None
    student_performance: List[StudentPerformance] = []
    created_at: datetime
    updated_at: datetime

@router.post("", response_model=JournalEntry)
async def create_journal_entry(
    entry_data: JournalEntryCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a journal entry (Teachers only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["teacher", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        entry_data.lesson_date = require_date_window(
            entry_data.lesson_date, past_days=366, label="Lesson date"
        )
        # Get teacher ID
        teacher_id = None
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_id = str(teacher["_id"])
        else:
            # For managers/admins, get teacher from group
            group = await db.groups.find_one({"_id": ObjectId(entry_data.group_id)})
            if group:
                teacher_id = group["teacher_id"]
        
        if not teacher_id:
            raise HTTPException(status_code=400, detail="Teacher not found")
        
        entry = {
            "group_id": entry_data.group_id,
            "teacher_id": teacher_id,
            "lesson_date": entry_data.lesson_date,
            "lesson_number": entry_data.lesson_number,
            "topic": entry_data.topic,
            "materials_covered": entry_data.materials_covered,
            "homework_assigned": entry_data.homework_assigned,
            "student_performance": [p.dict() for p in entry_data.student_performance],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await db.teacher_journal.insert_one(entry)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "journal",
            str(result.inserted_id),
            {"group_id": entry_data.group_id, "topic": entry_data.topic},
            request.client.host if request.client else None
        )
        
        entry["id"] = str(result.inserted_id)
        return serialize_doc(entry)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/group/{group_id}", response_model=List[JournalEntry])
async def get_group_journal(
    group_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get journal entries for a group"""
    from server import db, serialize_doc
    
    try:
        entries = await db.teacher_journal.find(
            {"group_id": group_id}
        ).sort("lesson_date", -1).skip(skip).limit(limit).to_list(limit)
        
        active_student_ids = await get_active_group_student_ids(db, group_id)
        result = []
        for entry in entries:
            entry_data = serialize_doc(entry)
            entry_data["student_performance"] = [
                performance for performance in entry_data.get("student_performance", [])
                if performance.get("student_id") in active_student_ids
            ]
            result.append(entry_data)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{entry_id}", response_model=JournalEntry)
async def update_journal_entry(
    entry_id: str,
    entry_data: JournalEntryCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update journal entry"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["teacher", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        entry_data.lesson_date = require_date_window(
            entry_data.lesson_date, past_days=366, label="Lesson date"
        )
        update_data = {
            "lesson_date": entry_data.lesson_date,
            "lesson_number": entry_data.lesson_number,
            "topic": entry_data.topic,
            "materials_covered": entry_data.materials_covered,
            "homework_assigned": entry_data.homework_assigned,
            "student_performance": [p.dict() for p in entry_data.student_performance],
            "updated_at": datetime.utcnow()
        }
        
        result = await db.teacher_journal.update_one(
            {"_id": ObjectId(entry_id)},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "journal",
            entry_id,
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.teacher_journal.find_one({"_id": ObjectId(entry_id)})
        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
