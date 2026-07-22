"""
Routes for Electronic Teacher Journal
"""
import logging

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from auth import get_current_user
from validation import require_date_window

router = APIRouter(prefix="/journal", tags=["Journal"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

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


async def has_group_membership(db, group: dict, group_id: str, student_id: str) -> bool:
    """Recognize current and historical membership without exposing another group."""
    if student_id in group.get("student_ids", []):
        return True
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if student and group_id in student.get("group_ids", []):
        return True
    membership_collection = getattr(db, "group_memberships", None)
    if membership_collection is None:
        return False
    return bool(await membership_collection.find_one({
        "group_id": group_id,
        "student_id": student_id,
    }))


def require_manager_group_access(current_user: dict, group: dict) -> None:
    if (
        current_user.get("role") == "manager"
        and group.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Managers can only access groups in their branch")

class StudentPerformance(BaseModel):
    student_id: str
    participation: int = Field(..., ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=1000)
    student_name: Optional[str] = Field(None, max_length=300)

class JournalEntryCreate(BaseModel):
    group_id: str
    lesson_date: datetime
    lesson_number: int = Field(..., ge=1, le=10000)
    topic: str = Field(..., min_length=1, max_length=300)
    materials_covered: str = Field(..., min_length=1, max_length=5000)
    homework_assigned: Optional[str] = Field(None, max_length=5000)
    student_performance: List[StudentPerformance] = Field(default_factory=list)

class LessonFeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)

class JournalEntry(BaseModel):
    id: str
    group_id: str
    teacher_id: str
    lesson_date: datetime
    lesson_number: int
    topic: str
    materials_covered: str
    homework_assigned: Optional[str] = None
    student_performance: List[StudentPerformance] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

async def notify_performance_changes(db, entry: dict, previous_performance: Optional[List[dict]] = None):
    """Notify students and parents only when a lesson grade is new or changed."""
    from notification_helpers import notify_grade_posted

    previous = {
        item.get("student_id"): item.get("participation")
        for item in (previous_performance or [])
    }
    for performance in entry.get("student_performance", []):
        student_id = performance.get("student_id")
        grade = performance.get("participation")
        if not student_id or previous.get(student_id) == grade:
            continue
        try:
            if not ObjectId.is_valid(str(student_id)):
                continue
            student = await db.students.find_one({"_id": ObjectId(student_id)})
            if not student or not student.get("user_id"):
                continue
            parent_user_id = None
            parent_id = student.get("parent_id")
            if parent_id and ObjectId.is_valid(str(parent_id)):
                parent = await db.parents.find_one({"_id": ObjectId(str(parent_id))})
                if parent:
                    parent_user_id = parent.get("user_id")
            if not parent_user_id:
                parent = await db.parents.find_one({"student_ids": student_id})
                if parent:
                    parent_user_id = parent.get("user_id")
            await notify_grade_posted(
                db,
                student["user_id"],
                entry.get("topic") or f"Lesson #{entry.get('lesson_number')}",
                f"{grade}/5",
                parent_user_id,
                {
                    "entry_id": str(entry.get("_id", "")),
                    "group_id": entry.get("group_id"),
                    "student_id": student_id,
                },
            )
        except Exception:
            # A notification provider/database problem must never turn a saved
            # journal entry into an apparent failed save.
            logger.exception(
                "Could not deliver journal grade notification for student %s",
                student_id,
            )


async def build_performance_documents(
    db,
    performance: List[StudentPerformance],
    previous_performance: Optional[List[dict]] = None,
) -> List[dict]:
    """Attach trusted name snapshots so historical journal rows stay readable."""
    student_ids = {
        item.student_id for item in performance if ObjectId.is_valid(item.student_id)
    }
    students = []
    if student_ids:
        students = await db.students.find({
            "_id": {"$in": [ObjectId(student_id) for student_id in student_ids]}
        }).to_list(len(student_ids))
    names = {
        str(student["_id"]): " ".join(filter(None, [
            student.get("first_name"), student.get("last_name")
        ])).strip()
        for student in students
    }
    previous_names = {
        item.get("student_id"): item.get("student_name")
        for item in (previous_performance or [])
        if item.get("student_id") and item.get("student_name")
    }
    result = []
    for item in performance:
        document = item.model_dump(exclude={"student_name"})
        student_name = names.get(item.student_id) or previous_names.get(item.student_id)
        if student_name:
            document["student_name"] = student_name
        result.append(document)
    return result


async def complete_journal_side_effects(
    db,
    entry: dict,
    previous_performance: Optional[List[dict]],
    actor_id: str,
    action: str,
    audit_details: dict,
    client_ip: Optional[str],
) -> None:
    """Run non-critical post-save work without changing the save result."""
    try:
        from server import create_audit_log
        await create_audit_log(
            actor_id,
            action,
            "journal",
            str(entry.get("_id", "")),
            audit_details,
            client_ip,
        )
    except Exception:
        logger.exception("Could not write %s journal audit log", action)

    try:
        await notify_performance_changes(db, entry, previous_performance)
    except Exception:
        logger.exception("Could not process journal grade notifications")


async def write_feedback_audit_safely(
    actor_id: str,
    entry_id: str,
    rating: int,
    client_ip: Optional[str],
) -> None:
    try:
        from server import create_audit_log
        await create_audit_log(
            actor_id,
            "lesson_feedback",
            "journal",
            entry_id,
            {"rating": rating},
            client_ip,
        )
    except Exception:
        logger.exception("Could not write lesson feedback audit log")

@router.post("", response_model=JournalEntry)
async def create_journal_entry(
    entry_data: JournalEntryCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a journal entry (Teachers only)"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["teacher", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        entry_data.lesson_date = require_date_window(
            entry_data.lesson_date, past_days=366, label="Lesson date"
        )
        if not ObjectId.is_valid(entry_data.group_id):
            raise HTTPException(status_code=400, detail="Invalid group ID")
        group = await db.groups.find_one({"_id": ObjectId(entry_data.group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        require_manager_group_access(current_user, group)

        # Get teacher ID
        teacher_id = None
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_id = str(teacher["_id"])
                if group.get("teacher_id") != teacher_id and entry_data.group_id not in teacher.get("group_ids", []):
                    raise HTTPException(status_code=403, detail="You can only edit your own groups")
        else:
            teacher_id = group.get("teacher_id")
        
        if not teacher_id:
            raise HTTPException(status_code=400, detail="Teacher not found")

        active_student_ids = await get_active_group_student_ids(db, entry_data.group_id)
        submitted_student_ids = [item.student_id for item in entry_data.student_performance]
        if len(set(submitted_student_ids)) != len(submitted_student_ids):
            raise HTTPException(status_code=400, detail="Each student can have only one lesson grade")
        if any(student_id not in active_student_ids for student_id in submitted_student_ids):
            raise HTTPException(status_code=400, detail="A graded student is not active in this group")
        
        entry = {
            "group_id": entry_data.group_id,
            "teacher_id": teacher_id,
            "lesson_date": entry_data.lesson_date,
            "lesson_number": entry_data.lesson_number,
            "topic": entry_data.topic,
            "materials_covered": entry_data.materials_covered,
            "homework_assigned": entry_data.homework_assigned,
            "student_performance": await build_performance_documents(
                db, entry_data.student_performance
            ),
            "lesson_key": (
                f"{entry_data.group_id}:"
                f"{entry_data.lesson_date.date().isoformat()}:"
                f"{entry_data.lesson_number}"
            ),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        idempotency_key = (request.headers.get("Idempotency-Key") or "").strip()
        if len(idempotency_key) > 200:
            raise HTTPException(status_code=400, detail="Idempotency key is too long")

        created_new = True
        if idempotency_key:
            entry["creation_key"] = f'{current_user["_id"]}:{idempotency_key}'
            existing_by_creation = await db.teacher_journal.find_one({
                "creation_key": entry["creation_key"]
            })
            if existing_by_creation:
                return serialize_doc(existing_by_creation)

        lesson_day_start = entry_data.lesson_date.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        existing_lesson = await db.teacher_journal.find_one({
            "group_id": entry_data.group_id,
            "lesson_number": entry_data.lesson_number,
            "lesson_date": {
                "$gte": lesson_day_start,
                "$lt": lesson_day_start + timedelta(days=1),
            },
        })
        if existing_lesson:
            raise HTTPException(
                status_code=409,
                detail="A journal entry already exists for this group lesson",
            )

        if idempotency_key:
            try:
                result = await db.teacher_journal.update_one(
                    {"creation_key": entry["creation_key"]},
                    {"$setOnInsert": entry},
                    upsert=True,
                )
            except DuplicateKeyError:
                persisted_entry = await db.teacher_journal.find_one({
                    "creation_key": entry["creation_key"]
                })
                if not persisted_entry:
                    if await db.teacher_journal.find_one({"lesson_key": entry["lesson_key"]}):
                        raise HTTPException(
                            status_code=409,
                            detail="A journal entry already exists for this group lesson",
                        )
                    raise
                created_new = False
            else:
                if result.upserted_id is None:
                    persisted_entry = await db.teacher_journal.find_one({
                        "creation_key": entry["creation_key"]
                    })
                    if not persisted_entry:
                        raise HTTPException(
                            status_code=409,
                            detail="Journal creation could not be reconciled",
                        )
                    created_new = False
                else:
                    persisted_entry = await db.teacher_journal.find_one({
                        "_id": result.upserted_id
                    })
        else:
            try:
                result = await db.teacher_journal.insert_one(entry)
            except DuplicateKeyError:
                raise HTTPException(
                    status_code=409,
                    detail="A journal entry already exists for this group lesson",
                )
            persisted_entry = await db.teacher_journal.find_one({"_id": result.inserted_id})

        if not persisted_entry:
            raise HTTPException(status_code=500, detail="Created journal entry could not be loaded")

        if created_new:
            background_tasks.add_task(
                complete_journal_side_effects,
                db,
                persisted_entry,
                None,
                str(current_user["_id"]),
                "create",
                {"group_id": entry_data.group_id, "topic": entry_data.topic},
                request.client.host if request.client else None,
            )

        return serialize_doc(persisted_entry)
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

    allowed_roles = {"teacher", "super_admin", "manager", "student", "parent"}
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not ObjectId.is_valid(group_id):
            raise HTTPException(status_code=400, detail="Invalid group ID")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        require_manager_group_access(current_user, group)

        visible_student_ids = None
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if not teacher or (group.get("teacher_id") != str(teacher["_id"]) and group_id not in teacher.get("group_ids", [])):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            student = await db.students.find_one({"user_id": str(current_user["_id"])})
            if not student or not await has_group_membership(
                db, group, group_id, str(student["_id"])
            ):
                raise HTTPException(status_code=403, detail="Access denied")
            visible_student_ids = {str(student["_id"])}
        elif current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent:
                raise HTTPException(status_code=403, detail="Access denied")
            visible_student_ids = {
                student_id
                for student_id in parent.get("student_ids", [])
                if ObjectId.is_valid(student_id)
                and await has_group_membership(db, group, group_id, student_id)
            }
            if not visible_student_ids:
                raise HTTPException(status_code=403, detail="Access denied")

        entries = await db.teacher_journal.find(
            {"group_id": group_id}
        ).sort("lesson_date", -1).skip(skip).limit(limit).to_list(limit)
        
        result = []
        for entry in entries:
            entry_data = serialize_doc(entry)
            entry_data["student_performance"] = [
                performance for performance in entry_data.get("student_performance", [])
                if visible_student_ids is None
                or performance.get("student_id") in visible_student_ids
            ]
            result.append(entry_data)

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{entry_id}", response_model=JournalEntry)
async def update_journal_entry(
    entry_id: str,
    entry_data: JournalEntryCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update journal entry"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["teacher", "super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        entry_data.lesson_date = require_date_window(
            entry_data.lesson_date, past_days=366, label="Lesson date"
        )
        if not ObjectId.is_valid(entry_id):
            raise HTTPException(status_code=400, detail="Invalid journal entry ID")
        existing = await db.teacher_journal.find_one({"_id": ObjectId(entry_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        group_id = existing.get("group_id")
        if not group_id or not ObjectId.is_valid(group_id):
            raise HTTPException(status_code=409, detail="Journal entry has an invalid group")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        require_manager_group_access(current_user, group)
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if not teacher or existing.get("teacher_id") != str(teacher["_id"]):
                raise HTTPException(status_code=403, detail="You can only edit your own journal entries")
        if entry_data.group_id != existing.get("group_id"):
            raise HTTPException(status_code=400, detail="A journal entry cannot be moved to another group")

        active_student_ids = await get_active_group_student_ids(db, entry_data.group_id)
        existing_student_ids = {
            item.get("student_id")
            for item in existing.get("student_performance", [])
            if item.get("student_id")
        }
        allowed_student_ids = active_student_ids | existing_student_ids
        submitted_student_ids = [item.student_id for item in entry_data.student_performance]
        if len(set(submitted_student_ids)) != len(submitted_student_ids):
            raise HTTPException(status_code=400, detail="Each student can have only one lesson grade")
        if any(student_id not in allowed_student_ids for student_id in submitted_student_ids):
            raise HTTPException(status_code=400, detail="A graded student is not active in this group")

        update_data = {
            "lesson_date": entry_data.lesson_date,
            "lesson_number": entry_data.lesson_number,
            "topic": entry_data.topic,
            "materials_covered": entry_data.materials_covered,
            "homework_assigned": entry_data.homework_assigned,
            "student_performance": await build_performance_documents(
                db,
                entry_data.student_performance,
                existing.get("student_performance", []),
            ),
            "lesson_key": (
                f"{entry_data.group_id}:"
                f"{entry_data.lesson_date.date().isoformat()}:"
                f"{entry_data.lesson_number}"
            ),
            "updated_at": datetime.utcnow()
        }

        lesson_day_start = entry_data.lesson_date.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        duplicate_entry = await db.teacher_journal.find_one({
            "_id": {"$ne": ObjectId(entry_id)},
            "group_id": entry_data.group_id,
            "lesson_number": entry_data.lesson_number,
            "lesson_date": {
                "$gte": lesson_day_start,
                "$lt": lesson_day_start + timedelta(days=1),
            },
        })
        if duplicate_entry:
            raise HTTPException(
                status_code=409,
                detail="A journal entry already exists for this group lesson",
            )

        try:
            result = await db.teacher_journal.update_one(
                {"_id": ObjectId(entry_id)},
                {"$set": update_data}
            )
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail="A journal entry already exists for this group lesson",
            )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        
        updated = await db.teacher_journal.find_one({"_id": ObjectId(entry_id)})
        if not updated:
            raise HTTPException(status_code=500, detail="Updated journal entry could not be loaded")
        background_tasks.add_task(
            complete_journal_side_effects,
            db,
            updated,
            existing.get("student_performance", []),
            str(current_user["_id"]),
            "update",
            {"group_id": entry_data.group_id, "topic": entry_data.topic},
            request.client.host if request.client else None,
        )
        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{entry_id}/feedback")
async def submit_lesson_feedback(
    entry_id: str,
    feedback_data: LessonFeedbackCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create or update the signed-in student's feedback for one lesson."""
    from server import db, serialize_doc

    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can submit lesson feedback")
    if not ObjectId.is_valid(entry_id):
        raise HTTPException(status_code=400, detail="Invalid journal entry ID")

    entry = await db.teacher_journal.find_one({"_id": ObjectId(entry_id)})
    student = await db.students.find_one({"user_id": str(current_user["_id"]), "status": {"$ne": "archived"}})
    if not entry or not student:
        raise HTTPException(status_code=404, detail="Lesson or student not found")
    student_id = str(student["_id"])
    group = await db.groups.find_one({"_id": ObjectId(entry["group_id"])})
    if not group or not await has_group_membership(db, group, entry["group_id"], student_id):
        raise HTTPException(status_code=403, detail="You can only review lessons from your groups")

    now = datetime.utcnow()
    await db.lesson_feedback.update_one(
        {"entry_id": entry_id, "student_id": student_id},
        {
            "$set": {
                "group_id": entry["group_id"],
                "teacher_id": entry["teacher_id"],
                "rating": feedback_data.rating,
                "comment": feedback_data.comment,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    saved = await db.lesson_feedback.find_one({"entry_id": entry_id, "student_id": student_id})
    background_tasks.add_task(
        write_feedback_audit_safely,
        str(current_user["_id"]),
        entry_id,
        feedback_data.rating,
        request.client.host if request.client else None,
    )
    return serialize_doc(saved)
