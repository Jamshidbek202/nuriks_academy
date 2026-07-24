"""Shared authorization checks for group-scoped academic records."""

from bson import ObjectId
from fastapi import HTTPException


def _student_is_in_group(student: dict, group: dict) -> bool:
    student_id = str(student.get("_id", ""))
    group_id = str(group.get("_id", ""))
    return (
        group_id in student.get("group_ids", [])
        or student_id in group.get("student_ids", [])
    )


async def require_group_academic_read_access(db, current_user: dict, group: dict) -> None:
    """Allow only the people who may see academic records for this group."""
    role = current_user.get("role")
    group_id = str(group.get("_id", ""))

    if role == "super_admin":
        return
    if role == "manager":
        if group.get("branch_id") != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Group belongs to another branch")
        return
    if role == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if teacher and (
            group.get("teacher_id") == str(teacher["_id"])
            or group_id in teacher.get("group_ids", [])
        ):
            return
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "student":
        student = await db.students.find_one({
            "user_id": str(current_user["_id"]),
            "status": {"$ne": "archived"},
        })
        if student and _student_is_in_group(student, group):
            return
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "parent":
        parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
        child_ids = [
            ObjectId(student_id)
            for student_id in (parent or {}).get("student_ids", [])
            if ObjectId.is_valid(student_id)
        ]
        if child_ids:
            children = await db.students.find({
                "_id": {"$in": child_ids},
                "status": {"$ne": "archived"},
            }).to_list(100)
            if any(_student_is_in_group(child, group) for child in children):
                return
        raise HTTPException(status_code=403, detail="Access denied")
    raise HTTPException(status_code=403, detail="Insufficient permissions")


async def require_group_academic_staff_access(db, current_user: dict, group: dict) -> None:
    """Allow the assigned teacher or an in-scope administrator to mutate records."""
    if current_user.get("role") not in {"super_admin", "manager", "teacher"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await require_group_academic_read_access(db, current_user, group)


async def require_student_academic_read_access(db, current_user: dict, student: dict) -> None:
    """Authorize direct academic history without exposing unrelated students."""
    role = current_user.get("role")
    student_id = str(student.get("_id", ""))
    if role == "super_admin":
        return
    if role == "manager":
        if student.get("branch_id") != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Student belongs to another branch")
        return
    if role == "student":
        if str(student.get("user_id")) == str(current_user.get("_id")):
            return
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "parent":
        parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
        if parent and student_id in parent.get("student_ids", []):
            return
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher:
            raise HTTPException(status_code=403, detail="Access denied")
        group_ids = [
            ObjectId(group_id)
            for group_id in teacher.get("group_ids", [])
            if ObjectId.is_valid(group_id)
        ]
        assigned_group = await db.groups.find_one({
            "$and": [
                {"$or": [
                    {"_id": {"$in": group_ids}},
                    {"teacher_id": str(teacher["_id"])},
                ]},
                {"$or": [
                    {"student_ids": student_id},
                    {"_id": {"$in": [
                        ObjectId(group_id)
                        for group_id in student.get("group_ids", [])
                        if ObjectId.is_valid(group_id)
                    ]}},
                ]},
            ]
        })
        if assigned_group:
            return
        raise HTTPException(status_code=403, detail="Access denied")
    raise HTTPException(status_code=403, detail="Insufficient permissions")
