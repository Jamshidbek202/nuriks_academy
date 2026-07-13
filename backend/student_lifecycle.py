"""Consistent, retry-safe lifecycle operations for student accounts."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId


class StudentLifecycleConflict(Exception):
    """Raised when linked student/account data is unsafe to change."""


def _user_object_id(student: Dict[str, Any]) -> Optional[ObjectId]:
    user_id = student.get("user_id")
    if not user_id or not ObjectId.is_valid(str(user_id)):
        return None
    return ObjectId(str(user_id))


async def _linked_student_user(db, student: Dict[str, Any]):
    user_object_id = _user_object_id(student)
    if user_object_id is None:
        return None

    user = await db.users.find_one({"_id": user_object_id})
    if user and user.get("role") != "student":
        raise StudentLifecycleConflict(
            "The linked account is not a student account. Repair the user link before continuing."
        )
    return user


async def archive_student_account(
    db,
    student: Dict[str, Any],
    archived_by: str,
) -> Dict[str, Any]:
    """Archive a profile, deactivate its login, and preserve academic history."""
    student_id = str(student["_id"])
    now = datetime.utcnow()
    user = await _linked_student_user(db, student)

    stored_group_ids = {
        str(group_id)
        for group_id in student.get("group_ids", [])
        if ObjectId.is_valid(str(group_id))
    }
    linked_groups = await db.groups.find(
        {"student_ids": student_id}, {"_id": 1}
    ).to_list(1000)
    stored_group_ids.update(str(group["_id"]) for group in linked_groups)

    if student.get("status") != "archived":
        # Deactivate first: a partial failure must never leave an archived
        # profile with a login that can still authenticate.
        if user:
            await db.users.update_one(
                {"_id": user["_id"], "role": "student"},
                {"$set": {
                    "is_active": False,
                    "deactivated_at": now,
                    "deactivated_reason": "student_archived",
                    "updated_at": now,
                }},
            )

        await db.students.update_one(
            {"_id": student["_id"], "status": {"$ne": "archived"}},
            {"$set": {
                "status": "archived",
                "pre_archive_status": student.get("status") or "active",
                "account_was_active_before_archive": bool(user and user.get("is_active", True)),
                "archived_group_ids": sorted(stored_group_ids),
                "group_ids": [],
                "archived_at": now,
                "archived_by": archived_by,
                "updated_at": now,
            }},
        )
    elif user and user.get("is_active", True):
        # Make retries repair legacy/partially archived records as well.
        await db.users.update_one(
            {"_id": user["_id"], "role": "student"},
            {"$set": {
                "is_active": False,
                "deactivated_at": now,
                "deactivated_reason": "student_archived",
                "updated_at": now,
            }},
        )

    # Group membership is operational state, not academic history. Tests,
    # homework, attendance, payments, and journal records remain untouched.
    await db.groups.update_many(
        {"student_ids": student_id},
        {"$pull": {"student_ids": student_id}},
    )

    return {
        "status": "archived",
        "account_active": False,
        "linked_account_found": user is not None,
    }


async def restore_student_account(
    db,
    student: Dict[str, Any],
    restored_by: str,
) -> Dict[str, Any]:
    """Restore an archived profile and its linked login account."""
    if student.get("status") != "archived":
        return {"status": student.get("status", "active"), "already_restored": True}

    user = await _linked_student_user(db, student)
    if not user:
        raise StudentLifecycleConflict(
            "The student has no linked login account. Repair the account link before restoring."
        )

    student_id = str(student["_id"])
    archived_group_ids = [
        str(group_id)
        for group_id in student.get("archived_group_ids", [])
        if ObjectId.is_valid(str(group_id))
    ]
    valid_group_ids: List[str] = []
    if archived_group_ids:
        groups = await db.groups.find(
            {"_id": {"$in": [ObjectId(group_id) for group_id in archived_group_ids]}},
            {"_id": 1},
        ).to_list(1000)
        valid_group_ids = [str(group["_id"]) for group in groups]
        await db.groups.update_many(
            {"_id": {"$in": [ObjectId(group_id) for group_id in valid_group_ids]}},
            {"$addToSet": {"student_ids": student_id}},
        )

    previous_status = student.get("pre_archive_status", "active")
    if previous_status not in {"active", "frozen", "graduated"}:
        previous_status = "active"
    now = datetime.utcnow()

    await db.students.update_one(
        {"_id": student["_id"], "status": "archived"},
        {"$set": {
            "status": previous_status,
            "group_ids": valid_group_ids,
            "restored_at": now,
            "restored_by": restored_by,
            "updated_at": now,
        }},
    )

    should_reactivate = student.get("account_was_active_before_archive", True)
    if should_reactivate:
        await db.users.update_one(
            {"_id": user["_id"], "role": "student"},
            {
                "$set": {"is_active": True, "updated_at": now},
                "$unset": {"deactivated_at": "", "deactivated_reason": ""},
            },
        )

    return {
        "status": previous_status,
        "account_active": bool(should_reactivate),
        "restored_group_count": len(valid_group_ids),
    }


async def permanently_delete_student_account(
    db,
    student: Dict[str, Any],
) -> Dict[str, Any]:
    """Delete an unused archived account without breaking historical records."""
    if student.get("status") != "archived":
        raise StudentLifecycleConflict("Archive the student before permanent deletion.")

    user = await _linked_student_user(db, student)
    student_id = str(student["_id"])
    user_id = str(user["_id"]) if user else None

    history_queries = [
        ("payments", db.payments, {"student_id": student_id}),
        ("attendance", db.attendance, {"student_id": student_id}),
        ("attendance records", db.attendance_records, {"student_id": student_id}),
        ("test results", db.test_results, {"student_id": student_id}),
        ("test results", db.tests, {"results.student_id": student_id}),
        ("homework submissions", db.homework, {"submissions.student_id": student_id}),
        ("journal records", db.teacher_journal, {"student_performance.student_id": student_id}),
        ("certificates", db.certificates, {"student_id": student_id}),
        ("support bookings", db.support_bookings, {"student_id": student_id}),
    ]
    if user_id:
        history_queries.extend([
            ("chat messages", db.messages, {"sender_id": user_id}),
            ("chat conversations", db.conversations, {"participants": user_id}),
        ])

    blockers = []
    for label, collection, query in history_queries:
        if await collection.count_documents(query, limit=1):
            blockers.append(label)
    if blockers:
        raise StudentLifecycleConflict(
            "Permanent deletion was blocked because historical data exists: "
            + ", ".join(sorted(set(blockers)))
            + ". Keep this student archived instead."
        )

    # Only operational and personal account data remains at this point.
    await db.groups.update_many(
        {"student_ids": student_id}, {"$pull": {"student_ids": student_id}}
    )
    await db.parents.update_many(
        {"student_ids": student_id}, {"$pull": {"student_ids": student_id}}
    )

    if user_id:
        await db.notifications.delete_many({"user_id": user_id})
        await db.notification_history.delete_many({"user_id": user_id})
        await db.notification_preferences.delete_many({"user_id": user_id})
        await db.push_tokens.delete_many({"user_id": user_id})

    result = await db.students.delete_one({"_id": student["_id"], "status": "archived"})
    if result.deleted_count != 1:
        raise StudentLifecycleConflict("The archived student changed; permanent deletion was cancelled.")

    # Delete the inactive account last. If infrastructure fails between these
    # operations, the worst case is an inert orphan account, never a live
    # student profile whose login was unexpectedly removed.
    account_deleted = False
    if user:
        user_result = await db.users.delete_one({"_id": user["_id"], "role": "student"})
        account_deleted = user_result.deleted_count == 1

    return {"deleted": True, "linked_account_deleted": account_deleted}


async def reconcile_archived_student_accounts(db) -> Dict[str, int]:
    """Deactivate linked accounts for legacy archived students; safe to rerun."""
    archived_students = await db.students.find(
        {"status": "archived"}, {"user_id": 1}
    ).to_list(100000)
    user_ids = {
        ObjectId(str(student["user_id"]))
        for student in archived_students
        if student.get("user_id") and ObjectId.is_valid(str(student["user_id"]))
    }
    if not user_ids:
        return {"archived_students": len(archived_students), "accounts_deactivated": 0}

    now = datetime.utcnow()
    result = await db.users.update_many(
        {
            "_id": {"$in": list(user_ids)},
            "role": "student",
            "is_active": {"$ne": False},
        },
        {"$set": {
            "is_active": False,
            "deactivated_at": now,
            "deactivated_reason": "student_archived",
            "updated_at": now,
        }},
    )
    return {
        "archived_students": len(archived_students),
        "accounts_deactivated": result.modified_count,
    }
