"""Role-scoped academic calendar.

The calendar is intentionally one read model.  It combines scheduled lessons,
homework deadlines and tests without exposing groups outside the signed-in
user's academic or branch scope.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth import get_current_user


router = APIRouter(prefix="/calendar", tags=["Calendar"])
security = HTTPBearer()
ACADEMY_ZONE = ZoneInfo("Asia/Tashkent")
UTC_ZONE = ZoneInfo("UTC")


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db

    return await get_current_user(credentials, db)


def _parse_day(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from error


async def _visible_groups(db, current_user: dict) -> list[dict]:
    role = current_user.get("role")
    user_id = str(current_user.get("_id"))
    query: dict = {"status": {"$ne": "archived"}}

    if role == "super_admin":
        pass
    elif role in {"manager", "reception"}:
        query["branch_id"] = current_user.get("branch_id")
    elif role == "teacher":
        teacher = await db.teachers.find_one({"user_id": user_id, "status": {"$ne": "archived"}})
        if not teacher:
            return []
        teacher_group_ids = [
            ObjectId(value) for value in teacher.get("group_ids", []) if ObjectId.is_valid(value)
        ]
        query["$or"] = [
            {"teacher_id": str(teacher["_id"])},
            {"_id": {"$in": teacher_group_ids}},
        ]
    elif role == "student":
        student = await db.students.find_one({"user_id": user_id, "status": {"$ne": "archived"}})
        if not student:
            return []
        group_ids = [ObjectId(value) for value in student.get("group_ids", []) if ObjectId.is_valid(value)]
        query["$or"] = [
            {"_id": {"$in": group_ids}},
            {"student_ids": str(student["_id"])},
        ]
    elif role == "parent":
        parent = await db.parents.find_one({"user_id": user_id})
        if not parent:
            return []
        child_ids = [
            ObjectId(value) for value in parent.get("student_ids", []) if ObjectId.is_valid(value)
        ]
        children = await db.students.find({
            "$or": [
                {"_id": {"$in": child_ids}},
                {"parent_id": str(parent["_id"])},
            ],
            "status": {"$ne": "archived"},
        }).to_list(100)
        group_ids = [
            ObjectId(value)
            for child in children
            for value in child.get("group_ids", [])
            if ObjectId.is_valid(value)
        ]
        child_id_strings = [str(child["_id"]) for child in children]
        query["$or"] = [
            {"_id": {"$in": group_ids}},
            {"student_ids": {"$in": child_id_strings}},
        ]
    else:
        raise HTTPException(status_code=403, detail="Calendar is not available for this role")

    return await db.groups.find(query).sort("name", 1).to_list(2_000)


@router.get("")
async def academic_calendar(
    start: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db, serialize_doc

    start_day = _parse_day(start, "start date")
    end_day = _parse_day(end, "end date")
    if end_day < start_day or end_day - start_day > timedelta(days=62):
        raise HTTPException(status_code=400, detail="Calendar range must be between 1 and 63 days")

    groups = await _visible_groups(db, current_user)
    group_ids = [str(group["_id"]) for group in groups]
    if not group_ids:
        return {"start": start, "end": end, "events": [], "groups": []}
    group_names = {str(group["_id"]): group.get("name", "Group") for group in groups}

    local_start = datetime.combine(start_day, time.min, tzinfo=ACADEMY_ZONE)
    local_end = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=ACADEMY_ZONE)
    utc_start = local_start.astimezone(UTC_ZONE).replace(tzinfo=None)
    utc_end = local_end.astimezone(UTC_ZONE).replace(tzinfo=None)

    occurrences = await db.lesson_occurrences.find({
        "group_id": {"$in": group_ids},
        "starts_at": {"$gte": utc_start, "$lt": utc_end},
        "counts_as_scheduled": True,
        "superseded": {"$ne": True},
    }).sort("starts_at", 1).to_list(20_000)
    homework = await db.homework.find({
        "group_id": {"$in": group_ids},
        "due_date": {"$gte": utc_start, "$lt": utc_end},
    }).sort("due_date", 1).to_list(10_000)
    tests = await db.tests.find({
        "group_id": {"$in": group_ids},
        "test_date": {"$gte": utc_start, "$lt": utc_end},
    }).sort("test_date", 1).to_list(10_000)

    events = []
    for row in occurrences:
        events.append({
            "id": str(row["_id"]),
            "type": "class",
            "title": group_names.get(row.get("group_id"), "Class"),
            "group_id": row.get("group_id"),
            "group_name": group_names.get(row.get("group_id"), "Group"),
            "starts_at": row.get("starts_at"),
            "ends_at": row.get("ends_at"),
            "date": row.get("local_date"),
            "status": row.get("lesson_status", "scheduled"),
            "detail": row.get("room") or "Scheduled class",
        })
    for row in homework:
        events.append({
            "id": str(row["_id"]),
            "type": "homework",
            "title": row.get("title", "Homework"),
            "group_id": row.get("group_id"),
            "group_name": group_names.get(row.get("group_id"), "Group"),
            "starts_at": row.get("due_date"),
            "ends_at": row.get("due_date"),
            "date": row.get("due_date").astimezone(ACADEMY_ZONE).date().isoformat() if row.get("due_date") and row.get("due_date").tzinfo else row.get("due_date").date().isoformat(),
            "status": "due",
            "detail": "Homework deadline",
        })
    for row in tests:
        events.append({
            "id": str(row["_id"]),
            "type": "test",
            "title": row.get("title", "Test"),
            "group_id": row.get("group_id"),
            "group_name": group_names.get(row.get("group_id"), "Group"),
            "starts_at": row.get("test_date"),
            "ends_at": row.get("test_date"),
            "date": row.get("test_date").astimezone(ACADEMY_ZONE).date().isoformat() if row.get("test_date") and row.get("test_date").tzinfo else row.get("test_date").date().isoformat(),
            "status": row.get("test_type", "scheduled"),
            "detail": "Academic assessment",
        })

    events.sort(key=lambda row: (row.get("starts_at") or datetime.min, row["type"], row["title"]))
    return serialize_doc({
        "start": start,
        "end": end,
        "events": events,
        "groups": [{"id": str(group["_id"]), "name": group.get("name", "Group")} for group in groups],
    })
