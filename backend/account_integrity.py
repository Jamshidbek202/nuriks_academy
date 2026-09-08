"""Canonical account/profile integrity helpers.

``users`` is the single source of truth for login identities. Role profile
collections contain domain data only and may never make an account visible on
their own. The unique indexes below make one user map to at most one profile
and one converted lead map to at most one student.
"""

from __future__ import annotations

from collections import Counter
from typing import Iterable

from bson import ObjectId
from pymongo import ASCENDING


PROFILE_COLLECTION_BY_ROLE = {
    "student": "students",
    "parent": "parents",
    "teacher": "teachers",
    "support": "support_staff",
}


async def ensure_account_integrity_indexes(db) -> None:
    """Install retry-safe ownership constraints for canonical accounts."""
    partial_string = {"user_id": {"$type": "string"}}
    for role, collection_name in PROFILE_COLLECTION_BY_ROLE.items():
        await db[collection_name].create_index(
            [("user_id", ASCENDING)],
            name=f"{role}_profile_user_unique",
            unique=True,
            partialFilterExpression=partial_string,
        )
    await db.students.create_index(
        [("student_id", ASCENDING)],
        name="student_number_unique",
        unique=True,
        partialFilterExpression={"student_id": {"$type": "string"}},
    )
    await db.students.create_index(
        [("source_lead_id", ASCENDING)],
        name="student_source_lead_unique",
        unique=True,
        partialFilterExpression={"source_lead_id": {"$type": "string"}},
    )
    await db.leads.create_index(
        [("converted_to_student_id", ASCENDING)],
        name="lead_converted_student_unique",
        unique=True,
        partialFilterExpression={"converted_to_student_id": {"$type": "string"}},
    )


async def backfill_converted_lead_links(db) -> dict:
    """Attach legacy converted students to their source lead, safely and idempotently."""
    linked = 0
    conflicts = 0
    leads = await db.leads.find(
        {"converted_to_student_id": {"$type": "string"}},
        {"converted_to_student_id": 1},
    ).to_list(100_000)
    for lead in leads:
        student_id = str(lead.get("converted_to_student_id") or "")
        if not ObjectId.is_valid(student_id):
            conflicts += 1
            continue
        student = await db.students.find_one(
            {"_id": ObjectId(student_id)}, {"source_lead_id": 1}
        )
        if not student:
            conflicts += 1
            continue
        source = student.get("source_lead_id")
        if source and source != str(lead["_id"]):
            conflicts += 1
            continue
        if not source:
            result = await db.students.update_one(
                {"_id": student["_id"], "source_lead_id": {"$exists": False}},
                {"$set": {"source_lead_id": str(lead["_id"])}},
            )
            linked += result.modified_count
    return {"legacy_lead_links_added": linked, "conflicts": conflicts}


async def canonical_profile_user_map(db, profiles: Iterable[dict], role: str) -> dict[str, dict]:
    """Return valid linked users for profiles, keyed by string user id."""
    user_ids = {
        str(profile.get("user_id"))
        for profile in profiles
        if profile.get("user_id") and ObjectId.is_valid(str(profile.get("user_id")))
    }
    if not user_ids:
        return {}
    users = await db.users.find({
        "_id": {"$in": [ObjectId(user_id) for user_id in user_ids]},
        "role": role,
        "is_deleted": {"$ne": True},
        "account_status": {"$ne": "deleted"},
    }).to_list(len(user_ids))
    return {str(user["_id"]): user for user in users}


async def filter_canonical_profiles(db, profiles: list[dict], role: str) -> tuple[list[dict], dict[str, dict]]:
    """Hide orphaned/mismatched profiles from every product surface."""
    users = await canonical_profile_user_map(db, profiles, role)
    canonical = [profile for profile in profiles if str(profile.get("user_id")) in users]
    return canonical, users


async def is_canonical_profile(db, profile: dict, role: str) -> bool:
    profiles, _ = await filter_canonical_profiles(db, [profile], role)
    return bool(profiles)


async def account_integrity_report(db) -> dict:
    """Read-only report used at startup and by maintenance checks."""
    report: dict = {"orphan_profiles": {}, "orphan_users": {}, "duplicate_profile_links": {}}
    for role, collection_name in PROFILE_COLLECTION_BY_ROLE.items():
        profiles = await db[collection_name].find({}, {"user_id": 1}).to_list(100_000)
        canonical, _ = await filter_canonical_profiles(db, profiles, role)
        report["orphan_profiles"][role] = len(profiles) - len(canonical)

        counts = Counter(str(row.get("user_id")) for row in profiles if row.get("user_id"))
        report["duplicate_profile_links"][role] = sum(count - 1 for count in counts.values() if count > 1)

        profile_user_ids = {str(row.get("user_id")) for row in canonical}
        users = await db.users.find({
            "role": role,
            "is_deleted": {"$ne": True},
            "account_status": {"$ne": "deleted"},
        }, {"_id": 1}).to_list(100_000)
        report["orphan_users"][role] = sum(
            1 for user in users if str(user["_id"]) not in profile_user_ids
        )
    report["healthy"] = not any(
        count
        for section in ("orphan_profiles", "orphan_users", "duplicate_profile_links")
        for count in report[section].values()
    )
    return report


async def reconcile_orphan_accounts(db) -> dict:
    """Physically remove provably stale legacy account/profile fragments.

    New account creation is transactional, so these states cannot be produced
    by current code. This reconciliation exists for records left by older
    deployments: role profiles with no matching canonical ``users`` identity,
    role users with no profile, and legacy deletion tombstones.
    """
    from student_lifecycle import permanently_delete_student_account

    removed_profiles = Counter()
    removed_users = Counter()

    for role, collection_name in PROFILE_COLLECTION_BY_ROLE.items():
        profiles = await db[collection_name].find({}).to_list(100_000)
        linked_ids = {
            str(profile.get("user_id"))
            for profile in profiles
            if profile.get("user_id") and ObjectId.is_valid(str(profile.get("user_id")))
        }
        users = await db.users.find({
            "_id": {"$in": [ObjectId(value) for value in linked_ids]},
        }).to_list(len(linked_ids)) if linked_ids else []
        users_by_id = {str(user["_id"]): user for user in users}

        for profile in profiles:
            profile_user = users_by_id.get(str(profile.get("user_id")))
            if (
                profile_user
                and profile_user.get("role") == role
                and profile_user.get("is_deleted") is not True
                and profile_user.get("account_status") != "deleted"
            ):
                continue

            profile_id = str(profile["_id"])
            if role == "student":
                stale_student = dict(profile)
                # Never delete a valid user of another role through a stale
                # student profile that points at it.
                stale_student["user_id"] = None
                await permanently_delete_student_account(db, stale_student)
            else:
                async with await db.client.start_session() as session:
                    async with session.start_transaction():
                        if role == "parent":
                            await db.students.update_many(
                                {"parent_id": profile_id},
                                {"$set": {"parent_id": None}},
                                session=session,
                            )
                        elif role == "teacher":
                            await db.groups.update_many(
                                {"teacher_id": profile_id},
                                {"$set": {"teacher_id": ""}},
                                session=session,
                            )
                            await db.lesson_occurrences.update_many(
                                {"teacher_id": profile_id},
                                {"$unset": {"teacher_id": ""}},
                                session=session,
                            )
                            for name in ("tests", "homework", "teacher_journal"):
                                await db[name].update_many(
                                    {"teacher_id": profile_id},
                                    {"$unset": {"teacher_id": ""}},
                                    session=session,
                                )
                            for name in ("teacher_earnings", "teacher_payouts"):
                                await db[name].delete_many(
                                    {"teacher_id": profile_id}, session=session
                                )
                        elif role == "support":
                            await db.support_bookings.delete_many(
                                {"support_staff_id": profile_id}, session=session
                            )
                        await db.audit_logs.delete_many(
                            {"resource_id": profile_id}, session=session
                        )
                        await db[collection_name].delete_one(
                            {"_id": profile["_id"]}, session=session
                        )
            removed_profiles[role] += 1

    # Remove role users whose required domain profile does not exist. Manager,
    # reception, and super-admin accounts intentionally live only in users.
    for role, collection_name in PROFILE_COLLECTION_BY_ROLE.items():
        profile_user_ids = {
            str(row.get("user_id"))
            for row in await db[collection_name].find({}, {"user_id": 1}).to_list(100_000)
            if row.get("user_id")
        }
        users = await db.users.find({"role": role}).to_list(100_000)
        for user in users:
            if str(user["_id"]) in profile_user_ids:
                continue
            async with await db.client.start_session() as session:
                async with session.start_transaction():
                    await delete_user_personal_data(db, str(user["_id"]), session=session)
                    await db.users.delete_one({"_id": user["_id"]}, session=session)
            removed_users[role] += 1

    # Old versions kept activated workers as hidden tombstones. They no longer
    # satisfy the product's no-trace deletion contract.
    tombstones = await db.users.find({
        "$or": [
            {"is_deleted": True},
            {"account_status": "deleted"},
            {"login": {"$regex": r"^__deleted__:"}},
        ],
    }).to_list(100_000)
    for user in tombstones:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                await delete_user_personal_data(db, str(user["_id"]), session=session)
                await db.users.delete_one({"_id": user["_id"]}, session=session)
        removed_users[str(user.get("role") or "unknown")] += 1

    return {
        "orphan_profiles_removed": dict(removed_profiles),
        "orphan_users_removed": dict(removed_users),
    }


async def delete_user_personal_data(db, user_id: str, *, session) -> dict:
    """Remove private account artifacts and conversations in one transaction."""
    conversation_rows = await db.conversations.find(
        {"participants": user_id}, {"_id": 1}, session=session
    ).to_list(100_000)
    conversation_ids = [str(row["_id"]) for row in conversation_rows]

    deleted = 0
    if conversation_ids:
        result = await db.messages.delete_many(
            {"conversation_id": {"$in": conversation_ids}}, session=session
        )
        deleted += result.deleted_count
        result = await db.conversations.delete_many(
            {"_id": {"$in": [ObjectId(value) for value in conversation_ids]}}, session=session
        )
        deleted += result.deleted_count
    result = await db.messages.delete_many({"sender_id": user_id}, session=session)
    deleted += result.deleted_count

    for collection_name in (
        "auth_challenges",
        "telegram_links",
        "push_tokens",
        "notification_preferences",
        "notification_history",
        "finance_card_payment_notifications",
    ):
        result = await db[collection_name].delete_many({"user_id": user_id}, session=session)
        deleted += result.deleted_count

    result = await db.notifications.delete_many({
        "$or": [{"user_id": user_id}, {"data.user_id": user_id}],
    }, session=session)
    deleted += result.deleted_count
    result = await db.audit_logs.delete_many({
        "$or": [{"user_id": user_id}, {"resource_id": user_id}],
    }, session=session)
    deleted += result.deleted_count
    return {"personal_documents_deleted": deleted}
