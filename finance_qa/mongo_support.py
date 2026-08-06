"""Disposable MongoDB fixtures shared by integration and browser QA."""

from __future__ import annotations

import argparse
import asyncio
from datetime import date, datetime
import json
import os
from pathlib import Path
import sys
from typing import Optional
from zoneinfo import ZoneInfo

from bson import ObjectId


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from auth import get_password_hash  # noqa: E402
from database import assert_disposable_database_name, create_mongo_client  # noqa: E402
from finance_accounting import ensure_accounting_indexes  # noqa: E402
from finance_controls import ensure_finance_control_indexes  # noqa: E402
from finance_ledger import ensure_finance_ledger_indexes  # noqa: E402
from finance_live import ensure_finance_live_indexes  # noqa: E402
from finance_card_payments import ensure_card_payment_indexes  # noqa: E402
from finance_models import (  # noqa: E402
    GroupFinanceVersionCreate,
    GroupFormat,
    LessonResolution,
    LessonResolutionCreate,
    ProgramCode,
    ScheduleSlot,
)
from finance_service import (  # noqa: E402
    create_group_finance_version,
    ensure_finance_indexes,
    record_lesson_resolution,
    seed_default_finance_configuration,
)


QA_PASSWORD = "FinanceQA@2026"
QA_USERS = {
    "super_admin": "qa_superadmin",
    "manager_a": "qa_manager_a",
    "manager_b": "qa_manager_b",
    "reception_a": "qa_reception_a",
    "teacher_a": "qa_teacher_a",
    "student_a": "qa_student_a",
    "parent_a": "qa_parent_a",
    "support_a": "qa_support_a",
}


async def ensure_qa_indexes(db) -> None:
    await db.users.create_index("login", unique=True)
    await db.audit_logs.create_index([("timestamp", -1)])
    await ensure_finance_indexes(db)
    await ensure_finance_ledger_indexes(db)
    await ensure_accounting_indexes(db)
    await ensure_finance_control_indexes(db)
    await ensure_finance_live_indexes(db)
    await ensure_card_payment_indexes(db)


async def seed_finance_qa_database(db) -> dict:
    """Seed two branches and finance roles without depending on production data."""
    assert_disposable_database_name(db.name)
    await ensure_qa_indexes(db)
    now = datetime.utcnow()

    branch_a = await db.branches.find_one({"qa_key": "branch-a"})
    if not branch_a:
        branch_a = {
            "_id": ObjectId(),
            "qa_key": "branch-a",
            "name": "QA Branch A",
            "address": "Finance QA only",
            "phone": "+998900000001",
            "is_active": True,
            "created_at": now,
        }
        await db.branches.insert_one(branch_a)
    branch_b = await db.branches.find_one({"qa_key": "branch-b"})
    if not branch_b:
        branch_b = {
            "_id": ObjectId(),
            "qa_key": "branch-b",
            "name": "QA Branch B",
            "address": "Finance QA only",
            "phone": "+998900000002",
            "is_active": True,
            "created_at": now,
        }
        await db.branches.insert_one(branch_b)

    password_hash = get_password_hash(QA_PASSWORD)
    user_templates = (
        (QA_USERS["super_admin"], "QA Super Admin", "super_admin", None),
        (QA_USERS["manager_a"], "QA Manager A", "manager", str(branch_a["_id"])),
        (QA_USERS["manager_b"], "QA Manager B", "manager", str(branch_b["_id"])),
        (QA_USERS["reception_a"], "QA Reception A", "reception", str(branch_a["_id"])),
        (QA_USERS["teacher_a"], "Live Teacher", "teacher", str(branch_a["_id"])),
        (QA_USERS["student_a"], "Live Student", "student", str(branch_a["_id"])),
        (QA_USERS["parent_a"], "Live Parent", "parent", str(branch_a["_id"])),
        (QA_USERS["support_a"], "Live Support", "support", str(branch_a["_id"])),
    )
    users = {}
    for login, full_name, role, branch_id in user_templates:
        await db.users.update_one(
            {"login": login},
            {"$setOnInsert": {
                "login": login,
                "password_hash": password_hash,
                "full_name": full_name,
                "role": role,
                "branch_id": branch_id,
                "is_active": True,
                "two_factor_enabled": False,
                "language_preference": "en",
                "created_at": now,
                "updated_at": now,
                "qa_fixture": True,
            }},
            upsert=True,
        )
        users[login] = await db.users.find_one({"login": login})

    for counter_id in (
        "student_id",
        "payment_id",
        "lead_id",
        "booking_id",
        "certificate_id",
        "finance_receipt_number",
    ):
        await db.counters.update_one(
            {"_id": counter_id},
            {"$setOnInsert": {"seq": 0}},
            upsert=True,
        )
    policies = await seed_default_finance_configuration(
        db, str(users[QA_USERS["super_admin"]]["_id"])
    )
    return {
        "database": db.name,
        "branch_a_id": str(branch_a["_id"]),
        "branch_b_id": str(branch_b["_id"]),
        "users": {
            key: {
                "id": str(users[login]["_id"]),
                "login": login,
                "role": users[login]["role"],
                "branch_id": users[login].get("branch_id"),
            }
            for key, login in QA_USERS.items()
        },
        "policy_seed": policies,
    }


async def seed_finance_browser_fixture(db, fixture: dict) -> dict:
    """Add real group/schedule data for finance-wide browser synchronization."""
    assert_disposable_database_name(db.name)
    branch_id = fixture["branch_a_id"]
    manager = await db.users.find_one({"login": QA_USERS["manager_a"]})
    teacher_user = await db.users.find_one({"login": QA_USERS["teacher_a"]})
    student_user = await db.users.find_one({"login": QA_USERS["student_a"]})
    parent_user = await db.users.find_one({"login": QA_USERS["parent_a"]})
    support_user = await db.users.find_one({"login": QA_USERS["support_a"]})
    service_month = date.today().strftime("%Y-%m")
    month_start = date.fromisoformat(f"{service_month}-01")
    fixture_day = datetime.now(ZoneInfo("Asia/Tashkent")).strftime("%A").lower()
    now = datetime.utcnow()

    course = await db.courses.find_one({"qa_key": "finance-live-course"})
    if not course:
        course = {
            "_id": ObjectId(),
            "qa_key": "finance-live-course",
            "name": "QA General English",
            "name_key": "qa general english",
            "program_code": "general",
            "description": "Disposable finance live synchronization fixture",
            "levels": ["General"],
            "is_active": True,
            "created_at": now,
        }
        await db.courses.insert_one(course)

    teacher = await db.teachers.find_one({"qa_key": "finance-live-teacher"})
    if not teacher:
        teacher = {
            "_id": ObjectId(),
            "qa_key": "finance-live-teacher",
            "user_id": str(teacher_user["_id"]),
            "first_name": "Live",
            "last_name": "Teacher",
            "phone": "+998900001101",
            "email": None,
            "photo": None,
            "specialization": ["General English"],
            "courses": [str(course["_id"])],
            "group_ids": [],
            "branch_id": branch_id,
            "status": "active",
            "created_at": now,
        }
        await db.teachers.insert_one(teacher)
    else:
        await db.teachers.update_one(
            {"_id": teacher["_id"]},
            {"$set": {"user_id": str(teacher_user["_id"]), "branch_id": branch_id}},
        )
        teacher = await db.teachers.find_one({"_id": teacher["_id"]})

    parent = await db.parents.find_one({"qa_key": "finance-live-parent"})
    if not parent:
        parent = {
            "_id": ObjectId(),
            "qa_key": "finance-live-parent",
            "user_id": str(parent_user["_id"]),
            "first_name": "Live",
            "last_name": "Parent",
            "phone": "+998900001103",
            "email": None,
            "student_ids": [],
            "created_at": now,
        }
        await db.parents.insert_one(parent)
    else:
        await db.parents.update_one(
            {"_id": parent["_id"]},
            {"$set": {"user_id": str(parent_user["_id"])}},
        )
        parent = await db.parents.find_one({"_id": parent["_id"]})

    student = await db.students.find_one({"qa_key": "finance-live-student"})
    if not student:
        student = {
            "_id": ObjectId(),
            "qa_key": "finance-live-student",
            "student_id": "QA-LIVE-001",
            "user_id": str(student_user["_id"]),
            "parent_id": str(parent["_id"]),
            "first_name": "Live",
            "last_name": "Student",
            "date_of_birth": None,
            "phone": "+998900001102",
            "email": None,
            "photo": None,
            "address": "Finance QA only",
            "course_ids": [str(course["_id"])],
            "group_ids": [],
            "status": "active",
            "enrollment_date": now,
            "branch_id": branch_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.students.insert_one(student)
        await db.parents.update_one(
            {"_id": parent["_id"]},
            {"$addToSet": {"student_ids": str(student["_id"])}},
        )
    else:
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$set": {
                "user_id": str(student_user["_id"]),
                "parent_id": str(parent["_id"]),
                "branch_id": branch_id,
            }},
        )
        await db.parents.update_one(
            {"_id": parent["_id"]},
            {"$addToSet": {"student_ids": str(student["_id"])}},
        )
        student = await db.students.find_one({"_id": student["_id"]})

    support = await db.support_staff.find_one({"qa_key": "whole-app-live-support"})
    if not support:
        support = {
            "_id": ObjectId(),
            "qa_key": "whole-app-live-support",
            "user_id": str(support_user["_id"]),
            "first_name": "Live",
            "last_name": "Support",
            "phone": "+998900001104",
            "email": None,
            "photo": None,
            "available_hours": {"start": "09:00", "end": "18:00"},
            "branch_id": branch_id,
            "created_at": now,
        }
        await db.support_staff.insert_one(support)
    else:
        await db.support_staff.update_one(
            {"_id": support["_id"]},
            {"$set": {"user_id": str(support_user["_id"]), "branch_id": branch_id}},
        )
        support = await db.support_staff.find_one({"_id": support["_id"]})

    group = await db.groups.find_one({"qa_key": "finance-live-group"})
    if not group:
        group = {
            "_id": ObjectId(),
            "qa_key": "finance-live-group",
            "name": "QA Live Finance Group",
            "course_id": str(course["_id"]),
            "teacher_id": str(teacher["_id"]),
            "schedule": [{
                "day": fixture_day,
                "start_time": "18:00",
                "end_time": "19:30",
                "room": "QA Live",
            }],
            "start_date": datetime(month_start.year, month_start.month, 1),
            "end_date": None,
            "branch_id": branch_id,
            "program_code": "general",
            "group_format": "normal",
            "finance_effective_from": datetime(month_start.year, month_start.month, 1),
            "finance_change_reason": "Finance-wide browser synchronization fixture",
            "student_ids": [str(student["_id"])],
            "status": "active",
            "finance_setup_status": "pending",
            "created_at": now,
        }
        await db.groups.insert_one(group)
        await db.students.update_one(
            {"_id": student["_id"]},
            {"$addToSet": {"group_ids": str(group["_id"])}},
        )
        await db.teachers.update_one(
            {"_id": teacher["_id"]},
            {"$addToSet": {"group_ids": str(group["_id"])}},
        )

    if not await db.group_finance_versions.find_one({"group_id": str(group["_id"])}):
        await create_group_finance_version(
            db,
            group,
            GroupFinanceVersionCreate(
                program_code=ProgramCode.GENERAL,
                group_format=GroupFormat.NORMAL,
                effective_from=month_start,
                schedule=[ScheduleSlot(
                    day=fixture_day,
                    start_time="18:00",
                    end_time="19:30",
                    room="QA Live",
                )],
                reason="Finance-wide browser synchronization fixture",
            ),
            str(manager["_id"]),
        )

    await db.group_memberships.update_one(
        {"group_id": str(group["_id"]), "student_id": str(student["_id"])},
        {"$setOnInsert": {
            "group_id": str(group["_id"]),
            "student_id": str(student["_id"]),
            "effective_from": month_start.isoformat(),
            "effective_from_at": None,
            "effective_to": None,
            "effective_to_at": None,
            "created_by": str(manager["_id"]),
            "created_at": now,
            "immutable_history": True,
        }},
        upsert=True,
    )

    occurrences = await db.lesson_occurrences.find({
        "group_id": str(group["_id"]),
        "generation_month": service_month,
        "counts_as_scheduled": True,
        "superseded": {"$ne": True},
    }).sort("starts_at", 1).to_list(100)
    if len(occurrences) < 3:
        raise RuntimeError("Browser fixture requires at least three scheduled lessons")
    # Leave exactly three lessons unresolved, always including today's class.
    # The browser campaign completes today's through attendance (proving
    # rolling student/teacher UI accrual), then closes one and resolves the
    # last before finalization.
    academy_today = datetime.now(ZoneInfo("Asia/Tashkent")).date().isoformat()
    today_occurrence = next(
        (row for row in occurrences if row["local_date"] == academy_today),
        None,
    )
    if not today_occurrence:
        raise RuntimeError("Browser fixture requires a scheduled lesson today")
    unresolved_occurrences = [today_occurrence]
    unresolved_occurrences.extend(
        row for row in occurrences
        if row["_id"] != today_occurrence["_id"]
    )
    unresolved_occurrences = unresolved_occurrences[:3]
    unresolved_ids = {row["_id"] for row in unresolved_occurrences}
    for occurrence in occurrences:
        if occurrence["_id"] in unresolved_ids:
            continue
        if occurrence.get("resolution_status") == "unresolved":
            await record_lesson_resolution(
                db,
                occurrence,
                LessonResolutionCreate(
                    resolution=LessonResolution.HELD,
                    idempotency_key=f"qa:browser:held:{occurrence['_id']}",
                ),
                manager,
            )

    return {
        "service_month": service_month,
        "course_id": str(course["_id"]),
        "group_id": str(group["_id"]),
        "student_id": str(student["_id"]),
        "teacher_id": str(teacher["_id"]),
        "parent_id": str(parent["_id"]),
        "support_staff_id": str(support["_id"]),
        "unresolved_occurrence_ids": [str(row["_id"]) for row in unresolved_occurrences],
    }


async def open_qa_database(
    mongo_url: Optional[str] = None,
    database_name: Optional[str] = None,
):
    name = database_name or os.environ.get("DB_NAME", "")
    assert_disposable_database_name(name)
    client = create_mongo_client(mongo_url or os.environ.get("MONGO_URL"))
    await client.admin.command("ping")
    hello = await client.admin.command("hello")
    if not hello.get("setName"):
        client.close()
        raise RuntimeError("Finance QA MongoDB must be a replica set")
    return client, client[name]


async def _main_async(reset: bool, browser: bool) -> None:
    client, db = await open_qa_database()
    try:
        if reset:
            await client.drop_database(db.name)
        report = await seed_finance_qa_database(db)
        if browser:
            report["browser_fixture"] = await seed_finance_browser_fixture(db, report)
        print(json.dumps(report, sort_keys=True))
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a disposable finance QA database")
    parser.add_argument("--reset", action="store_true", help="Drop only the validated QA database first")
    parser.add_argument("--browser", action="store_true", help="Add scheduled finance browser fixtures")
    args = parser.parse_args()
    asyncio.run(_main_async(args.reset, args.browser))


if __name__ == "__main__":
    main()
