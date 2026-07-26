"""Audited academy course catalog management."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.errors import DuplicateKeyError

from auth import get_current_user
from finance_models import ProgramCode


router = APIRouter(prefix="/courses", tags=["Courses"])
security = HTTPBearer()


class CourseWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=120)
    program_code: ProgramCode
    description: Optional[str] = Field(default=None, max_length=1000)
    levels: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("levels")
    @classmethod
    def normalize_levels(cls, levels: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_level in levels:
            level = raw_level.strip()
            if not level:
                continue
            if len(level) > 60:
                raise ValueError("Each course level must be 60 characters or fewer")
            key = level.casefold()
            if key not in seen:
                seen.add(key)
                normalized.append(level)
        return normalized


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db

    return await get_current_user(credentials, db)


def require_super_admin(user: dict) -> None:
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _course_id(course_id: str) -> ObjectId:
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=400, detail="Invalid course ID")
    return ObjectId(course_id)


def program_for_course(course: dict) -> Optional[str]:
    if course.get("program_code"):
        return course["program_code"]
    name = course.get("name", "").casefold()
    if "pre-ielts" in name or "pre ielts" in name:
        return ProgramCode.PRE_IELTS.value
    if "ielts" in name:
        return ProgramCode.IELTS.value
    if "general" in name or "english" in name:
        return ProgramCode.GENERAL.value
    return None


def public_course(course: dict) -> dict:
    return {
        "id": str(course["_id"]),
        "name": course.get("name", ""),
        "program_code": program_for_course(course),
        "description": course.get("description"),
        "levels": course.get("levels", []),
        "is_active": bool(course.get("is_active", True)),
        "created_at": course.get("created_at"),
        "updated_at": course.get("updated_at"),
    }


async def ensure_course_indexes(db) -> None:
    await db.courses.create_index(
        "name_key",
        unique=True,
        partialFilterExpression={"name_key": {"$type": "string"}},
    )


@router.get("")
async def list_courses(
    include_inactive: bool = Query(default=False),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    if include_inactive:
        require_super_admin(current_user)
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    courses = await db.courses.find(query).sort([("program_code", 1), ("name", 1)]).to_list(500)
    return [public_course(course) for course in courses]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_course(
    payload: CourseWrite,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    now = datetime.utcnow()
    document = {
        "name": payload.name,
        "name_key": payload.name.casefold(),
        "program_code": payload.program_code.value,
        "description": payload.description or None,
        "levels": payload.levels,
        "is_active": True,
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await db.courses.insert_one(document)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="A course with this name already exists") from error
    document["_id"] = result.inserted_id
    await create_audit_log(
        str(current_user["_id"]),
        "create",
        "course",
        str(result.inserted_id),
        {"name": payload.name, "program_code": payload.program_code.value},
        _client_ip(request),
    )
    return public_course(document)


@router.put("/{course_id}")
async def update_course(
    course_id: str,
    payload: CourseWrite,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    object_id = _course_id(course_id)
    existing = await db.courses.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Course not found")

    existing_program = program_for_course(existing)
    if existing_program and existing_program != payload.program_code.value:
        if await db.groups.find_one({"course_id": course_id}, {"_id": 1}):
            raise HTTPException(
                status_code=409,
                detail="The billing program cannot be changed after this course has been used by a group",
            )

    now = datetime.utcnow()
    update = {
        "name": payload.name,
        "name_key": payload.name.casefold(),
        "program_code": payload.program_code.value,
        "description": payload.description or None,
        "levels": payload.levels,
        "updated_at": now,
    }
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                await db.courses.update_one({"_id": object_id}, {"$set": update}, session=session)
                if existing.get("name") != payload.name:
                    await db.leads.update_many(
                        {"interested_course": existing.get("name")},
                        {"$set": {"interested_course": payload.name, "updated_at": now}},
                        session=session,
                    )
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="A course with this name already exists") from error

    await create_audit_log(
        str(current_user["_id"]),
        "update",
        "course",
        course_id,
        {
            "before": {
                "name": existing.get("name"),
                "program_code": existing_program,
                "description": existing.get("description"),
                "levels": existing.get("levels", []),
            },
            "after": {
                "name": payload.name,
                "program_code": payload.program_code.value,
                "description": payload.description,
                "levels": payload.levels,
            },
        },
        _client_ip(request),
    )
    return public_course(await db.courses.find_one({"_id": object_id}))


@router.patch("/{course_id}/archive")
async def archive_course(
    course_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    object_id = _course_id(course_id)
    course = await db.courses.find_one({"_id": object_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if not course.get("is_active", True):
        return public_course(course)

    active_group = await db.groups.find_one(
        {"course_id": course_id, "status": "active"}, {"_id": 1},
    )
    active_student = await db.students.find_one(
        {"course_ids": course_id, "status": "active"}, {"_id": 1},
    )
    open_lead = await db.leads.find_one(
        {
            "interested_course": course.get("name"),
            "status": {"$nin": ["enrolled", "lost"]},
        },
        {"_id": 1},
    )
    if active_group or active_student or open_lead:
        raise HTTPException(
            status_code=409,
            detail="This course is still used by an active group, student, or lead and cannot be archived",
        )

    now = datetime.utcnow()
    await db.courses.update_one(
        {"_id": object_id},
        {"$set": {"is_active": False, "archived_at": now, "updated_at": now}},
    )
    await create_audit_log(
        str(current_user["_id"]), "archive", "course", course_id,
        {"name": course.get("name")}, _client_ip(request),
    )
    return public_course(await db.courses.find_one({"_id": object_id}))


@router.patch("/{course_id}/reactivate")
async def reactivate_course(
    course_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    require_super_admin(current_user)
    object_id = _course_id(course_id)
    course = await db.courses.find_one({"_id": object_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.get("is_active", True):
        return public_course(course)

    now = datetime.utcnow()
    await db.courses.update_one(
        {"_id": object_id},
        {"$set": {"is_active": True, "updated_at": now}, "$unset": {"archived_at": ""}},
    )
    await create_audit_log(
        str(current_user["_id"]), "reactivate", "course", course_id,
        {"name": course.get("name")}, _client_ip(request),
    )
    return public_course(await db.courses.find_one({"_id": object_id}))
