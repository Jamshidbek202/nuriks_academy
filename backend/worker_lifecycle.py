"""Safe permanent-removal primitives for staff identities.

An activated worker may already be referenced by immutable finance, academic,
chat, or audit records.  Removing their login identifiers and hiding their
profile keeps those records resolvable while making the phone and Telegram
identity reusable.  Never-activated, unreferenced workers can be hard-deleted.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId

from telegram_auth import disconnect_telegram


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
    """Remove login access and free unique identities in one transaction.

    Activated accounts or referenced profiles become hidden tombstones.
    Disposable accounts are physically removed. Identity removal, profile
    handling, and the immutable audit record commit in one transaction.
    """

    now = datetime.utcnow()
    user_id = str(user["_id"])
    profile = db[profile_collection] if profile_collection else None

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            # Decide from a transactional read, not the route's earlier copy.
            # If activation and deletion race, a newly activated account must
            # become a tombstone instead of being physically erased.
            fresh_user = await db.users.find_one({"_id": user["_id"]}, session=session)
            if not fresh_user or fresh_user.get("is_deleted"):
                return {
                    "deleted": True,
                    "deletion_mode": "history_tombstone" if fresh_user else "hard_delete",
                    "phone_released": True,
                    "telegram_released": True,
                    "already_deleted": True,
                }
            retain_tombstone = account_was_activated(fresh_user) or preserve_profile
            deletion_mode = "history_tombstone" if retain_tombstone else "hard_delete"
            resolved_audit_action = (
                "delete"
                if retain_tombstone and audit_action == "delete_unactivated"
                else audit_action
            )

            await disconnect_telegram(db, fresh_user, session=session)
            await db.telegram_links.update_many(
                {"user_id": user_id, "revoked_at": None},
                {"$set": {"revoked_at": now, "revocation_reason": "worker_deleted"}},
                session=session,
            )
            await db.auth_challenges.update_many(
                {"user_id": user_id, "consumed_at": None, "invalidated_at": None},
                {"$set": {"invalidated_at": now, "invalidation_reason": "worker_deleted"}},
                session=session,
            )
            await db.push_tokens.delete_many({"user_id": user_id}, session=session)
            await db.notification_preferences.delete_many({"user_id": user_id}, session=session)

            if retain_tombstone:
                await db.users.update_one(
                    {"_id": fresh_user["_id"], "is_deleted": {"$ne": True}},
                    {
                        "$set": {
                            "is_active": False,
                            "is_deleted": True,
                            "account_status": "deleted",
                            "deleted_at": now,
                            "deleted_by": actor_id,
                            # `login` has a non-sparse unique index. Replacing it
                            # releases the old phone/login without making every
                            # tombstone compete for the same missing value.
                            "login": f"__deleted__:{user_id}",
                            "updated_at": now,
                        },
                        "$unset": {
                            "phone": "",
                            "phone_normalized": "",
                            "email": "",
                            "password_hash": "",
                            "phone_verified": "",
                            "telegram_verified": "",
                            "two_factor_secret": "",
                        },
                        "$inc": {"token_version": 1},
                    },
                    session=session,
                )
                if profile is not None and profile_id is not None:
                    await profile.update_one(
                        {"_id": profile_id},
                        {
                            "$set": {
                                "is_deleted": True,
                                "deleted_at": now,
                                "deleted_by": actor_id,
                                "updated_at": now,
                            },
                            "$unset": {"phone": "", "email": "", "photo": ""},
                        },
                        session=session,
                    )
            else:
                if profile is not None and profile_id is not None:
                    await profile.delete_one({"_id": profile_id}, session=session)
                await db.users.delete_one({"_id": fresh_user["_id"]}, session=session)

            await db.audit_logs.insert_one(
                {
                    "user_id": actor_id,
                    "action": resolved_audit_action,
                    "resource_type": audit_resource_type,
                    "resource_id": audit_resource_id,
                    "changes": {**audit_changes, "deletion_mode": deletion_mode},
                    "ip_address": audit_ip,
                    "timestamp": now,
                },
                session=session,
            )

    return {
        "deleted": True,
        "deletion_mode": deletion_mode,
        "phone_released": True,
        "telegram_released": True,
    }
