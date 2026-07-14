"""
Routes for Testing Module
Phase 3: Mid Tests, End of Course Tests, Grading, Progress Tracking
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
import math
from pymongo.errors import DuplicateKeyError
from auth import get_current_user
from validation import require_date_window

router = APIRouter(prefix="/tests", tags=["Tests"])
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
    background_tasks: BackgroundTasks,
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

        # Get teacher ID
        teacher_id = None
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_id = str(teacher["_id"])
                group = await db.groups.find_one({"_id": ObjectId(test_data.group_id)})
                if (
                    not group
                    or (
                        test_data.group_id not in teacher.get("group_ids", [])
                        and group.get("teacher_id") != teacher_id
                    )
                ):
                    raise HTTPException(status_code=403, detail="You can only create tests for your own groups")
        else:
            # For managers/admins, get teacher from group
            group = await db.groups.find_one({"_id": ObjectId(test_data.group_id)})
            if group:
                teacher_id = group["teacher_id"]
        
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
                return serialize_doc(existing)
            if result.upserted_id is None:
                existing = await db.tests.find_one({"creation_key": test["creation_key"]})
                return serialize_doc(existing)
            inserted_id = result.upserted_id
        else:
            result = await db.tests.insert_one(test)
            inserted_id = result.inserted_id
        
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
        try:
            student_ids = list(await get_active_group_student_ids(db, test_data.group_id))
            if student_ids:
                from notification_helpers import notify_test_scheduled
                test_date_str = test_data.test_date.strftime("%B %d, %Y at %I:%M %p")
                background_tasks.add_task(
                    notify_test_scheduled, db,
                    student_ids=student_ids,
                    test_title=test_data.title,
                    test_date=test_date_str,
                    test_type=test_data.test_type,
                    test_id=str(inserted_id),
                )
        except Exception as e:
            import logging
            logging.error(f"Error sending test notifications: {e}")
        
        test["id"] = str(inserted_id)
        return serialize_doc(test)
        
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

    if current_user["role"] == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher or test.get("teacher_id") != str(teacher["_id"]):
            raise HTTPException(status_code=403, detail="You can only delete your own tests")

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

        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if (
                not teacher
                or (
                    test["group_id"] not in teacher.get("group_ids", [])
                    and group.get("teacher_id") != str(teacher["_id"])
                )
            ):
                raise HTTPException(status_code=403, detail="Access denied")

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
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            group = await db.groups.find_one({"_id": ObjectId(group_id)})
            if (
                not teacher
                or not group
                or (
                    group_id not in teacher.get("group_ids", [])
                    and group.get("teacher_id") != str(teacher["_id"])
                )
            ):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            student = await db.students.find_one({"user_id": str(current_user["_id"])})
            group = await db.groups.find_one({"_id": ObjectId(group_id)})
            if (
                not student
                or not group
                or (
                    group_id not in student.get("group_ids", [])
                    and str(student["_id"]) not in group.get("student_ids", [])
                )
            ):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent:
                raise HTTPException(status_code=403, detail="Access denied")

            children = await db.students.find({
                "_id": {"$in": [ObjectId(sid) for sid in parent.get("student_ids", []) if ObjectId.is_valid(sid)]},
                "status": {"$ne": "archived"}
            }).to_list(100)
            group = await db.groups.find_one({"_id": ObjectId(group_id)})
            if not group or not any(
                group_id in child.get("group_ids", []) or str(child["_id"]) in group.get("student_ids", [])
                for child in children
            ):
                raise HTTPException(status_code=403, detail="Access denied")

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
        # Check permissions
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or student_id not in parent.get("student_ids", []):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            student = await db.students.find_one({
                "_id": ObjectId(student_id),
                "status": {"$ne": "archived"}
            })
            if not student or str(student["user_id"]) != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get student's groups
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
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
        # Check permissions
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or student_id not in parent.get("student_ids", []):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            student = await db.students.find_one({
                "_id": ObjectId(student_id),
                "status": {"$ne": "archived"}
            })
            if not student or str(student["user_id"]) != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="Access denied")
        
        # Get student's groups
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        group_ids = set(student.get("group_ids", []))
        groups_by_membership = await db.groups.find({"student_ids": student_id}).to_list(100)
        group_ids.update(str(group["_id"]) for group in groups_by_membership)
        
        # Get attendance stats
        total_attendance = await db.attendance.count_documents({"student_id": student_id})
        present_count = await db.attendance.count_documents({"student_id": student_id, "status": "present"})
        attendance_rate = (present_count / total_attendance * 100) if total_attendance > 0 else 0
        
        # Get test averages
        tests = await db.tests.find({"group_id": {"$in": list(group_ids)}}).to_list(100)
        
        mid_test_scores = []
        end_test_scores = []
        
        for test in tests:
            student_result = next(
                (r for r in test.get("results", []) if r["student_id"] == student_id),
                None
            )
            if student_result:
                if test["test_type"] == "mid_test":
                    mid_test_scores.append(student_result["percentage"])
                elif test["test_type"] == "end_of_course":
                    end_test_scores.append(student_result["percentage"])
        
        mid_test_avg = sum(mid_test_scores) / len(mid_test_scores) if mid_test_scores else 0
        end_test_avg = sum(end_test_scores) / len(end_test_scores) if end_test_scores else 0
        
        # Get homework completion rate
        homework_list = await db.homework.find({"group_id": {"$in": list(group_ids)}}).to_list(100)
        total_homework = len(homework_list)
        submitted_homework = sum(
            1 for hw in homework_list 
            if any(s["student_id"] == student_id for s in hw.get("submissions", []))
        )
        homework_completion_rate = (submitted_homework / total_homework * 100) if total_homework > 0 else 0
        
        return {
            "student_id": student_id,
            "attendance": {
                "total_lessons": total_attendance,
                "present": present_count,
                "attendance_rate": round(attendance_rate, 2)
            },
            "tests": {
                "mid_test_average": round(mid_test_avg, 2),
                "end_test_average": round(end_test_avg, 2),
                "mid_tests_taken": len(mid_test_scores),
                "end_tests_taken": len(end_test_scores)
            },
            "homework": {
                "total_assigned": total_homework,
                "submitted": submitted_homework,
                "completion_rate": round(homework_completion_rate, 2)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
