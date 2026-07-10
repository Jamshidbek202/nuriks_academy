"""
Routes for Homework Management
Phase 3: Homework CRUD, Submissions, Grading
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from auth import get_current_user

router = APIRouter(prefix="/homework", tags=["Homework"])
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

class HomeworkCreate(BaseModel):
    group_id: str
    title: str
    description: str
    due_date: datetime
    attachments: Optional[List[str]] = []

class HomeworkSubmit(BaseModel):
    homework_id: str
    content: str
    attachments: Optional[List[str]] = []

class HomeworkGrade(BaseModel):
    homework_id: str
    student_id: str
    grade: float
    feedback: Optional[str] = None

# ==================== CREATE HOMEWORK ====================

@router.post("") 
async def create_homework(
    homework_data: HomeworkCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create homework assignment (Teachers, Managers, Admins)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["teacher", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get teacher ID
        teacher_id = None
        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if teacher:
                teacher_id = str(teacher["_id"])
                group = await db.groups.find_one({"_id": ObjectId(homework_data.group_id)})
                if (
                    not group
                    or (
                        homework_data.group_id not in teacher.get("group_ids", [])
                        and group.get("teacher_id") != teacher_id
                    )
                ):
                    raise HTTPException(status_code=403, detail="You can only create homework for your own groups")
        else:
            # For managers/admins, get teacher from group
            group = await db.groups.find_one({"_id": ObjectId(homework_data.group_id)})
            if group:
                teacher_id = group["teacher_id"]
        
        if not teacher_id:
            raise HTTPException(status_code=400, detail="Teacher not found")
        
        homework = {
            "group_id": homework_data.group_id,
            "teacher_id": teacher_id,
            "title": homework_data.title,
            "description": homework_data.description,
            "due_date": homework_data.due_date,
            "attachments": homework_data.attachments or [],
            "assigned_date": datetime.utcnow(),
            "submissions": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db.homework.insert_one(homework)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "homework",
            str(result.inserted_id),
            {"title": homework_data.title, "group_id": homework_data.group_id},
            request.client.host if request.client else None
        )
        
        # Send notifications to students in the group
        try:
            group = await db.groups.find_one({"_id": ObjectId(homework_data.group_id)})
            if group:
                student_ids = group.get("student_ids", [])
                if student_ids:
                    from notification_helpers import notify_homework_assigned
                    due_date_str = homework_data.due_date.strftime("%B %d, %Y")
                    await notify_homework_assigned(
                        db,
                        student_ids=student_ids,
                        homework_title=homework_data.title,
                        due_date=due_date_str,
                        group_name=group.get("name", "")
                    )
        except Exception as e:
            # Log but don't fail the request
            import logging
            logging.error(f"Error sending homework notifications: {e}")
        
        homework["id"] = str(result.inserted_id)
        return serialize_doc(homework)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SUBMIT HOMEWORK ====================

@router.post("/submit")
async def submit_homework(
    submission: HomeworkSubmit,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Submit homework (Students only)"""
    from server import db, create_audit_log
    
    if current_user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can submit homework")
    
    try:
        # Check if homework submission is enabled
        feature = await db.feature_flags.find_one({"feature_name": "homework_submission"})
        if not feature or not feature.get("is_enabled", False):
            raise HTTPException(status_code=403, detail="Homework submission is currently disabled")
        
        # Check file upload permissions
        if submission.attachments:
            file_uploads_enabled = await db.feature_flags.find_one({"feature_name": "student_file_uploads"})
            if not file_uploads_enabled or not file_uploads_enabled.get("is_enabled", False):
                raise HTTPException(status_code=403, detail="File uploads are currently disabled")
        
        # Get student ID
        student = await db.students.find_one({"user_id": str(current_user["_id"])})
        if not student:
            raise HTTPException(status_code=404, detail="Student profile not found")
        
        student_id = str(student["_id"])
        
        # Check if already submitted
        homework = await db.homework.find_one({"_id": ObjectId(submission.homework_id)})
        if not homework:
            raise HTTPException(status_code=404, detail="Homework not found")
        
        existing_submission = next(
            (s for s in homework.get("submissions", []) if s["student_id"] == student_id),
            None
        )
        
        submission_data = {
            "student_id": student_id,
            "submitted_at": datetime.utcnow(),
            "content": submission.content,
            "attachments": submission.attachments or [],
            "grade": None,
            "feedback": None,
            "graded_at": None
        }
        
        if existing_submission:
            # Update existing submission
            await db.homework.update_one(
                {
                    "_id": ObjectId(submission.homework_id),
                    "submissions.student_id": student_id
                },
                {"$set": {"submissions.$": submission_data}}
            )
        else:
            # Add new submission
            await db.homework.update_one(
                {"_id": ObjectId(submission.homework_id)},
                {"$push": {"submissions": submission_data}}
            )
        
        await create_audit_log(
            str(current_user["_id"]),
            "submit",
            "homework",
            submission.homework_id,
            {"student_id": student_id},
            request.client.host if request.client else None
        )
        
        return {"message": "Homework submitted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GRADE HOMEWORK ====================

@router.post("/grade")
async def grade_homework(
    grade_data: HomeworkGrade,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Grade homework (Teachers, Managers, Admins)"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["teacher", "manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        homework = await db.homework.find_one({"_id": ObjectId(grade_data.homework_id)})
        if not homework:
            raise HTTPException(status_code=404, detail="Homework not found")

        group = await db.groups.find_one({"_id": ObjectId(homework["group_id"])})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        if current_user["role"] == "teacher":
            teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
            if (
                not teacher
                or (
                    homework["group_id"] not in teacher.get("group_ids", [])
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
                homework["group_id"] not in student.get("group_ids", [])
                and grade_data.student_id not in group.get("student_ids", [])
            )
        ):
            raise HTTPException(status_code=400, detail="Student is not active in this group")

        submission_data = {
            "student_id": grade_data.student_id,
            "submitted_at": None,
            "content": "",
            "attachments": [],
            "grade": grade_data.grade,
            "feedback": grade_data.feedback,
            "graded_at": datetime.utcnow()
        }

        existing_submission = next(
            (s for s in homework.get("submissions", []) if s["student_id"] == grade_data.student_id),
            None
        )

        if existing_submission:
            await db.homework.update_one(
                {
                    "_id": ObjectId(grade_data.homework_id),
                    "submissions.student_id": grade_data.student_id
                },
                {
                    "$set": {
                        "submissions.$.grade": grade_data.grade,
                        "submissions.$.feedback": grade_data.feedback,
                        "submissions.$.graded_at": datetime.utcnow()
                    }
                }
            )
        else:
            await db.homework.update_one(
                {"_id": ObjectId(grade_data.homework_id)},
                {"$push": {"submissions": submission_data}}
            )
        
        await create_audit_log(
            str(current_user["_id"]),
            "grade",
            "homework",
            grade_data.homework_id,
            {"student_id": grade_data.student_id, "grade": grade_data.grade},
            request.client.host if request.client else None
        )
        
        return {"message": "Homework graded successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GET HOMEWORK ====================

@router.get("/group/{group_id}")
async def get_group_homework(
    group_id: str,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get homework for a group"""
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

        homework_list = await db.homework.find(
            {"group_id": group_id}
        ).sort("due_date", -1).skip(skip).limit(limit).to_list(limit)
        active_student_ids = await get_active_group_student_ids(db, group_id)
        
        result = []
        for homework in homework_list:
            homework_data = serialize_doc(homework)
            homework_data["submissions"] = [
                submission for submission in homework_data.get("submissions", [])
                if submission.get("student_id") in active_student_ids
            ]
            result.append(homework_data)

        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/student/{student_id}")
async def get_student_homework(
    student_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get homework for a student"""
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
        
        # Get all homework for student's groups
        homework_list = await db.homework.find(
            {"group_id": {"$in": list(group_ids)}}
        ).sort("due_date", -1).to_list(100)
        
        # Filter submissions for this student
        result = []
        for hw in homework_list:
            hw_data = serialize_doc(hw)
            hw_data["my_submission"] = next(
                (s for s in hw.get("submissions", []) if s["student_id"] == student_id),
                None
            )
            result.append(hw_data)
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
