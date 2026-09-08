"""Transactional hard deletion for academy worker accounts."""

from __future__ import annotations

from typing import Optional

from bson import ObjectId

from account_integrity import delete_user_personal_data


def account_was_activated(user: dict) -> bool:
    return bool(
        user.get("password_hash")
        or user.get("invitation_accepted_at")
        or user.get("last_login")
    )


async def permanently_remove_worker(
    db,
    user: dict,
    *,
    actor_id: str,
    audit_action: str,
    audit_resource_type: str,
    audit_resource_id: str,
    audit_changes: dict,
    audit_ip: Optional[str] = None,
    profile_collection: Optional[str] = None,
    profile_id: Optional[ObjectId] = None,
    preserve_profile: bool = False,
) -> dict:
    """Physically remove the identity, profile, private data, and assignments.

    Shared academy records remain valid, but all live references that could
    make the deleted account appear in the product are removed in the same
    transaction. The legacy tombstone flags are intentionally not used.
    """
    del actor_id, audit_action, audit_changes, audit_ip, preserve_profile
    user_id = str(user["_id"])
    deleted_documents = 0

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            fresh_user = await db.users.find_one({"_id": user["_id"]}, session=session)
            if not fresh_user:
                return {
                    "deleted": True,
                    "deletion_mode": "hard_delete",
                    "phone_released": True,
                    "telegram_released": True,
                    "already_deleted": True,
                    "deleted_documents": 0,
                }

            personal = await delete_user_personal_data(db, user_id, session=session)
            deleted_documents += personal["personal_documents_deleted"]

            if profile_collection == "teachers" and profile_id is not None:
                teacher_id = str(profile_id)
                await db.groups.update_many(
                    {"teacher_id": teacher_id},
                    {"$set": {"teacher_id": ""}},
                    session=session,
                )
                await db.lesson_occurrences.update_many(
                    {"teacher_id": teacher_id},
                    {"$unset": {"teacher_id": ""}},
                    session=session,
                )
                for collection_name in ("teacher_earnings", "teacher_payouts"):
                    result = await db[collection_name].delete_many(
                        {"teacher_id": teacher_id}, session=session
                    )
                    deleted_documents += result.deleted_count
                for collection_name in ("tests", "homework", "teacher_journal"):
                    await db[collection_name].update_many(
                        {"teacher_id": teacher_id},
                        {"$unset": {"teacher_id": ""}},
                        session=session,
                    )

            if profile_collection == "support_staff" and profile_id is not None:
                result = await db.support_bookings.delete_many(
                    {"support_staff_id": str(profile_id)}, session=session
                )
                deleted_documents += result.deleted_count

            if profile_collection and profile_id is not None:
                profile_result = await db[profile_collection].delete_one(
                    {"_id": profile_id}, session=session
                )
                deleted_documents += profile_result.deleted_count

            await db.audit_logs.delete_many({
                "$or": [
                    {"resource_id": audit_resource_id},
                    {"changes.user_id": user_id},
                ],
            }, session=session)
            user_result = await db.users.delete_one({"_id": fresh_user["_id"]}, session=session)
            if user_result.deleted_count != 1:
                raise RuntimeError("Worker account changed; permanent deletion was cancelled")
            deleted_documents += 1

    return {
        "deleted": True,
        "deletion_mode": "hard_delete",
        "phone_released": True,
        "telegram_released": True,
        "deleted_documents": deleted_documents,
    }
