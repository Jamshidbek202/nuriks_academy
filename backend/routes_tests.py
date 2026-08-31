"""
Routes for Testing Module
Phase 3: Mid Tests, End of Course Tests, Grading, Progress Tracking
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
import math
from pymongo.errors import DuplicateKeyError
from auth import get_current_user
from academic_access import (
    require_group_academic_read_access,
    require_group_academic_staff_access,
    require_student_academic_read_access,
)
from validation import require_date_window
from finance_ledger import _membership_active

router = APIRouter(prefix="/tests", tags=["Tests"])
security = HTTPBearer()
GRADING_WEIGHTS = {"tests": 50, "homework": 30, "attendance": 20}


def neutral_average(values: List[float]) -> float:
    """Unassessed categories start at 100 instead of lowering a new student."""
    return sum(values) / len(values) if values else 100.0


def weighted_overall_grade(tests_score: float, homework_score: float, attendance_score: float) -> float:
    return (
        tests_score * GRADING_WEIGHTS["tests"]
        + homework_score * GRADING_WEIGHTS["homework"]
        + attendance_score * GRADING_WEIGHTS["attendance"]
    ) / 100

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

class TestCreate(BaseModel):
    test_type: Literal["mid_test", "end_of_course"]
    group_id: str
    course_id: str
    title: str = Field(..., min_length=1, max_length=200)
    test_date: datetime
    max_score: float = Field(..., ge=1, le=10000)

class TestGrade(BaseModel):
    test_id: str
    student_id: str
    score: float
    notes: Optional[str] = Field(None, max_length=2000)

# ==================== CREATE TEST ====================

@router.post("")
async def create_test(
    test_data: TestCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create test (Teachers, Managers, Admins)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["teacher", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not math.isfinite(test_data.max_score):
            raise HTTPException(status_code=400, detail="Max score must be a finite number")
        test_data.test_date = require_date_window(
            test_data.test_date, future_days=730, label="Test date"
        )

        if not ObjectId.is_valid(test_data.group_id):
            raise HTTPException(status_code=400, detail="Invalid group ID")
        group = await db.groups.find_one({"_id": ObjectId(test_data.group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        await require_group_academic_staff_access(db, current_user, group)
        if group.get("course_id") and group.get("course_id") != test_data.course_id:
            raise HTTPException(status_code=400, detail="Test course must match the group's course")
        teacher_id = group.get("teacher_id")
        
        if not teacher_id:
            raise HTTPException(status_code=400, detail="Teacher not found")
        
        idempotency_key = request.headers.get("Idempotency-Key")
        test = {
            "test_type": test_data.test_type,
            "group_id": test_data.group_id,
            "course_id": test_data.course_id,
            "teacher_id": teacher_id,
            "title": test_data.title,
            "test_date": test_data.test_date,
            "max_score": test_data.max_score,
            "results": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }

        created_new = True
        if idempotency_key:
            test["creation_key"] = f'{current_user["_id"]}:{idempotency_key}'
            try:
                result = await db.tests.update_one(
                    {"creation_key": test["creation_key"]},
                    {"$setOnInsert": test},
                    upsert=True
                )
            except DuplicateKeyError:
                existing = await db.tests.find_one({"creation_key": test["creation_key"]})
                if not existing:
                    raise
                test = existing
                inserted_id = existing["_id"]
                created_new = False
            else:
                if result.upserted_id is None:
                    existing = await db.tests.find_one({"creation_key": test["creation_key"]})
                    if not existing:
                        raise HTTPException(status_code=409, detail="Test creation could not be reconciled")
                    test = existing
                    inserted_id = existing["_id"]
                    created_new = False
                else:
                    inserted_id = result.upserted_id
        else:
            result = await db.tests.insert_one(test)
            inserted_id = result.inserted_id
        
        if created_new:
            await create_audit_log(
                str(current_user["_id"]),
                "create",
                "test",
                str(inserted_id),
                {"title": test_data.title, "type": test_data.test_type},
                request.client.host if request.client else None
            )
        
        # Resolve both sides of group membership. Some legacy/partially synced
        # records list the group only on the student profile, so relying on the
        # group's student_ids alone can silently produce zero recipients.
        notification_delivery = {
            "student_notifications": 0,
            "parent_notifications": 0,
            "already_delivered": 0,
            "skipped_by_preference": 0,
            "missing_students": 0,
            "errors": 0,
        }
        try:
            student_ids = list(await get_active_group_student_ids(db, test_data.group_id))
            if student_ids:
                from notification_helpers import notify_test_scheduled
                test_date_str = test_data.test_date.strftime("%B %d, %Y at %I:%M %p")
                notification_delivery = await notify_test_scheduled(
                    db,
                    student_ids=student_ids,
                    test_title=test_data.title,
                    test_date=test_date_str,
                    test_type=test_data.test_type,
                    test_id=str(inserted_id),
                )
        except Exception as e:
            import logging
            notification_delivery["errors"] += 1
            logging.exception(f"Error sending test notifications: {e}")

        await db.tests.update_one(
            {"_id": inserted_id},
            {"$set": {
                "notification_delivery": notification_delivery,
                "notification_delivery_updated_at": datetime.utcnow(),
            }},
        )

        # Always serialize the persisted record. update_one/upsert does not add
        # _id to the in-memory object, which previously caused a 500 after save.
        persisted_test = await db.tests.find_one({"_id": inserted_id})
        if not persisted_test:
            raise HTTPException(status_code=500, detail="Created test could not be loaded")
        return serialize_doc(persisted_test)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{test_id}")
async def delete_test(
    test_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Delete a test (assigned teacher, manager, or super admin)."""
    from server import db, create_audit_log

    if current_user["role"] not in ["teacher", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if not ObjectId.is_valid(test_id):
        raise HTTPException(status_code=400, detail="Invalid test ID")

    test = await db.tests.find_one({"_id": ObjectId(test_id)})
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    group_id = test.get("group_id")
    if not group_id or not ObjectId.is_valid(group_id):
        raise HTTPException(status_code=409, detail="Test has an invalid group")
    group = await db.groups.find_one({"_id": ObjectId(group_id)})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await require_group_academic_staff_access(db, current_user, group)

    await db.tests.delete_one({"_id": ObjectId(test_id)})
    await create_audit_log(
        str(current_user["_id"]), "delete", "test", test_id,
        {"title": test.get("title")},
        request.client.host if request.client else None
    )
    return {"message": "Test deleted successfully"}

# ==================== GRADE TEST ====================

@router.post("/grade")
async def grade_test(
    grade_data: TestGrade,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Grade test (Teachers, Managers, Admins)"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["teacher", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get test to calculate percentage
        test = await db.tests.find_one({"_id": ObjectId(grade_data.test_id)})
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")

        max_score = float(test.get("max_score") or 0)
        if max_score <= 0:
            raise HTTPException(status_code=400, detail="Test max score is invalid")
        if not math.isfinite(grade_data.score) or grade_data.score < 0 or grade_data.score > max_score:
            raise HTTPException(status_code=400, detail=f"Score must be between 0 and {max_score:g}")

        group = await db.groups.find_one({"_id": ObjectId(test["group_id"])})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        await require_group_academic_staff_access(db, current_user, group)

        student = await db.students.find_one({
            "_id": ObjectId(grade_data.student_id),
            "status": {"$ne": "archived"}
        })
        if (
            not student
            or (
                test["group_id"] not in student.get("group_ids", [])
                and grade_data.student_id not in group.get("student_ids", [])
            )
        ):
            raise HTTPException(status_code=400, detail="Student is not active in this group")
        
        percentage = (grade_data.score / max_score) * 100
        
        # Check if student already has a result
        existing = next(
            (r for r in test.get("results", []) if r["student_id"] == grade_data.student_id),
            None
        )
        
        result_data = {
            "student_id": grade_data.student_id,
            "score": grade_data.score,
            "percentage": percentage,
            "notes": grade_data.notes,
            "graded_at": datetime.utcnow()
        }
        
        if existing:
            # Update existing result
            result = await db.tests.update_one(
                {
                    "_id": ObjectId(grade_data.test_id),
                    "results.student_id": grade_data.student_id
                },
                {"$set": {"results.$": result_data}}
            )
        else:
            # Add new result
            result = await db.tests.update_one(
                {"_id": ObjectId(grade_data.test_id)},
                {"$push": {"results": result_data}}
            )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Test not found")
        
        await create_audit_log(
            str(current_user["_id"]),
            "grade",
            "test",
            grade_data.test_id,
            {"student_id": grade_data.student_id, "score": grade_data.score},
            request.client.host if request.client else None
        )

        from notification_helpers import notify_grade_posted
        parent_user_id = None
        parent_id = student.get("parent_id")
        if parent_id and ObjectId.is_valid(str(parent_id)):
            parent = await db.parents.find_one({"_id": ObjectId(str(parent_id))})
            if parent:
                parent_user_id = parent.get("user_id")
        if not parent_user_id:
            parent = await db.parents.find_one({"student_ids": grade_data.student_id})
            if parent:
                parent_user_id = parent.get("user_id")
        await notify_grade_posted(
            db,
            student["user_id"],
            test.get("title", "Test"),
            f"{grade_data.score:g}/{max_score:g} ({percentage:.0f}%)",
            parent_user_id,
            {"test_id": grade_data.test_id, "student_id": grade_data.student_id},
        )
        
        return {"message": "Test graded successfully", "percentage": percentage}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GET TESTS ====================

@router.get("/group/{group_id}")
async def get_group_tests(
    group_id: str,
    test_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get tests for a group"""
    from server import db, serialize_doc
    
    try:
        if not ObjectId.is_valid(group_id):
            raise HTTPException(status_code=400, detail="Invalid group ID")
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        await require_group_academic_read_access(db, current_user, group)

        query = {"group_id": group_id}
        if test_type:
            query["test_type"] = test_type
        
        tests = await db.tests.find(query).sort("test_date", -1).skip(skip).limit(limit).to_list(limit)
        active_student_ids = await get_active_group_student_ids(db, group_id)
        
        result = []
        for test in tests:
            test_data = serialize_doc(test)
            test_data["results"] = [
                result for result in test_data.get("results", [])
                if result.get("student_id") in active_student_ids
            ]
            result.append(test_data)

        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/student/{student_id}")
async def get_student_tests(
    student_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get test results for a student"""
    from server import db, serialize_doc
    
    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        await require_student_academic_read_access(db, current_user, student)
        
        group_ids = set(student.get("group_ids", []))
        groups_by_membership = await db.groups.find({"student_ids": student_id}).to_list(100)
        group_ids.update(str(group["_id"]) for group in groups_by_membership)

        # Get all tests for student's groups
        tests = await db.tests.find(
            {"group_id": {"$in": list(group_ids)}}
        ).sort("test_date", -1).to_list(100)
        
        # Filter results for this student
        result = []
        for test in tests:
            test_data = serialize_doc(test)
            test_data["my_result"] = next(
                (r for r in test.get("results", []) if r["student_id"] == student_id),
                None
            )
            result.append(test_data)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== STUDENT PROGRESS ====================

@router.get("/progress/{student_id}")
async def get_student_progress(
    student_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get comprehensive student progress"""
    from server import db
    
    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        await require_student_academic_read_access(db, current_user, student)
        
        # A progress page is a set of course ledgers, never one blended score.
        # Historical memberships remain visible after a transfer so completed
        # work does not disappear from the student's record.
        memberships = await db.group_memberships.find({"student_id": student_id}).to_list(2_000)
        group_ids = set(student.get("group_ids", []))
        group_ids.update(row.get("group_id") for row in memberships if row.get("group_id"))
        groups_by_membership = await db.groups.find({"student_ids": student_id}).to_list(100)
        group_ids.update(str(group["_id"]) for group in groups_by_membership)
        group_ids.discard(None)

        valid_group_ids = [ObjectId(value) for value in group_ids if ObjectId.is_valid(value)]
        group_rows = await db.groups.find({"_id": {"$in": valid_group_ids}}).to_list(200)
        group_rows_by_id = {str(row["_id"]): row for row in group_rows}
        ordered_group_ids = [
            group_id for group_id in group_ids if group_id in group_rows_by_id
        ]
        ordered_group_ids.sort(key=lambda value: group_rows_by_id[value].get("name", "").lower())

        now = datetime.utcnow()
        tests = await db.tests.find({"group_id": {"$in": ordered_group_ids}}).to_list(2_000)
        homework_list = await db.homework.find({"group_id": {"$in": ordered_group_ids}}).to_list(2_000)
        attendance_rows = await db.attendance.find({
            "student_id": student_id,
            "group_id": {"$in": ordered_group_ids},
        }).to_list(10_000)
        occurrences = await db.lesson_occurrences.find({
            "group_id": {"$in": ordered_group_ids},
            "counts_as_scheduled": True,
            "superseded": {"$ne": True},
            "starts_at": {"$lte": now},
        }).sort("starts_at", 1).to_list(20_000)

        # Lesson grades are the per-lesson participation scores recorded in the
        # teacher journal. Include the student's own feedback so the same view
        # can be updated after a review is submitted.
        journal_entries = await db.teacher_journal.find({
            "group_id": {"$in": ordered_group_ids},
            "student_performance.student_id": student_id,
        }).sort("lesson_date", -1).to_list(100)
        entry_ids = [str(entry["_id"]) for entry in journal_entries]
        feedback_by_entry = {}
        if entry_ids:
            feedback_rows = await db.lesson_feedback.find({
                "entry_id": {"$in": entry_ids}, "student_id": student_id,
            }).to_list(100)
            feedback_by_entry = {row["entry_id"]: row for row in feedback_rows}

        lesson_grades = []
        for entry in journal_entries:
            performance = next(
                (item for item in entry.get("student_performance", []) if item.get("student_id") == student_id),
                None,
            )
            if not performance:
                continue
            entry_id = str(entry["_id"])
            feedback = feedback_by_entry.get(entry_id)
            lesson_grades.append({
                "entry_id": entry_id,
                "group_id": entry.get("group_id"),
                "teacher_id": entry.get("teacher_id"),
                "lesson_date": entry.get("lesson_date"),
                "lesson_number": entry.get("lesson_number"),
                "topic": entry.get("topic"),
                "grade": performance.get("participation"),
                "notes": performance.get("notes"),
                "feedback": ({
                    "rating": feedback.get("rating"),
                    "comment": feedback.get("comment"),
                    "updated_at": feedback.get("updated_at"),
                } if feedback else None),
            })
        
        attendance_by_occurrence = {
            row.get("occurrence_id"): row
            for row in attendance_rows
            if row.get("occurrence_id")
        }
        groups = []
        weights = GRADING_WEIGHTS.copy()

        for group_id in ordered_group_ids:
            group = group_rows_by_id[group_id]
            group_memberships = [row for row in memberships if row.get("group_id") == group_id]
            legacy_active = (
                group_id in student.get("group_ids", [])
                or student_id in group.get("student_ids", [])
            )
            group_occurrences = []
            for occurrence in occurrences:
                if occurrence.get("group_id") != group_id:
                    continue
                if group_memberships and not _membership_active(
                    group_memberships,
                    group_id,
                    occurrence.get("local_date"),
                    occurrence.get("starts_at"),
                ):
                    continue
                if not group_memberships and not legacy_active:
                    continue
                group_occurrences.append(occurrence)

            present = 0
            absent = 0
            late = 0
            marked = 0
            for occurrence in group_occurrences:
                record = attendance_by_occurrence.get(str(occurrence["_id"]))
                status = record.get("status") if record else None
                if status == "present":
                    present += 1
                    marked += 1
                elif status == "late":
                    late += 1
                    marked += 1
                elif status == "absent":
                    absent += 1
                    marked += 1
            total_lessons = len(group_occurrences)
            attendance_score = (
                ((present + late) / total_lessons) * 100
                if total_lessons else 100.0
            )

            group_tests = [row for row in tests if row.get("group_id") == group_id]
            mid_test_scores = []
            end_test_scores = []
            all_test_scores = []
            for test in group_tests:
                result = next(
                    (row for row in test.get("results", []) if row.get("student_id") == student_id),
                    None,
                )
                if not result or result.get("percentage") is None:
                    continue
                score = float(result["percentage"])
                all_test_scores.append(score)
                if test.get("test_type") == "mid_test":
                    mid_test_scores.append(score)
                elif test.get("test_type") == "end_of_course":
                    end_test_scores.append(score)
            tests_score = neutral_average(all_test_scores)

            group_homework = [row for row in homework_list if row.get("group_id") == group_id]
            homework_scores = []
            submitted_homework = 0
            graded_homework = 0
            for homework in group_homework:
                submission = next(
                    (row for row in homework.get("submissions", []) if row.get("student_id") == student_id),
                    None,
                )
                if submission:
                    submitted_homework += 1
                    if submission.get("grade") is not None:
                        graded_homework += 1
                        homework_scores.append(float(submission["grade"]))
                elif isinstance(homework.get("due_date"), datetime) and homework["due_date"] < now:
                    # Once the deadline passes, an unsubmitted assignment is
                    # a real zero. Upcoming and submitted-ungraded work stays
                    # neutral, so a new course genuinely begins at 100.
                    homework_scores.append(0.0)
            homework_score = neutral_average(homework_scores)
            completion_rate = (
                (submitted_homework / len(group_homework)) * 100
                if group_homework else 100.0
            )

            overall_grade = weighted_overall_grade(
                tests_score,
                homework_score,
                attendance_score,
            )
            group_lesson_grades = [row for row in lesson_grades if row.get("group_id") == group_id]
            groups.append({
                "group_id": group_id,
                "group_name": group.get("name", "Group"),
                "course_id": group.get("course_id"),
                "overall_grade": round(overall_grade, 2),
                "weights": weights,
                "attendance": {
                    "total_lessons": total_lessons,
                    "marked": marked,
                    "present": present,
                    "late": late,
                    "absent": absent,
                    "attendance_rate": round(attendance_score, 2),
                },
                "tests": {
                    "score": round(tests_score, 2),
                    "mid_test_average": round(sum(mid_test_scores) / len(mid_test_scores), 2) if mid_test_scores else 100.0,
                    "end_test_average": round(sum(end_test_scores) / len(end_test_scores), 2) if end_test_scores else 100.0,
                    "mid_tests_taken": len(mid_test_scores),
                    "end_tests_taken": len(end_test_scores),
                    "graded_count": len(all_test_scores),
                },
                "homework": {
                    "score": round(homework_score, 2),
                    "total_assigned": len(group_homework),
                    "submitted": submitted_homework,
                    "graded": graded_homework,
                    "completion_rate": round(completion_rate, 2),
                },
                "lesson_grades": group_lesson_grades,
            })

        # Keep the old top-level shape for older clients. New clients render
        # the per-group ledgers above and never combine separate courses.
        primary = groups[0] if groups else {
            "attendance": {"total_lessons": 0, "marked": 0, "present": 0, "late": 0, "absent": 0, "attendance_rate": 100.0},
            "tests": {"score": 100.0, "mid_test_average": 100.0, "end_test_average": 100.0, "mid_tests_taken": 0, "end_tests_taken": 0, "graded_count": 0},
            "homework": {"score": 100.0, "total_assigned": 0, "submitted": 0, "graded": 0, "completion_rate": 100.0},
            "lesson_grades": [],
        }
        return {
            "student_id": student_id,
            "grading_policy": {"starts_at": 100, "weights": weights},
            "groups": groups,
            "group_id": primary.get("group_id"),
            "group_name": primary.get("group_name"),
            "overall_grade": primary.get("overall_grade", 100.0),
            "weights": weights,
            "attendance": primary["attendance"],
            "tests": primary["tests"],
            "homework": primary["homework"],
            "lesson_grades": primary["lesson_grades"],
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
