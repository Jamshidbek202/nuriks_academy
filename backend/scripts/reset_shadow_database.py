"""Create a clean shadow database containing only the active super-admin.

This script deliberately never deletes the source database. It will only drop
the explicitly confirmed target after the shared disposable-name guard accepts
it (the name must contain test, qa, sandbox, or shadow).
"""

from __future__ import annotations

import argparse
import asyncio
from copy import deepcopy
from datetime import datetime
import os
from pathlib import Path
import sys

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env")

from database import assert_disposable_database_name, create_mongo_client  # noqa: E402
from phone_auth import ensure_phone_auth_indexes  # noqa: E402
from telegram_auth import ensure_telegram_indexes  # noqa: E402


async def reset_shadow_database(source_name: str, target_name: str, confirmation: str) -> dict:
    if source_name == target_name:
        raise RuntimeError("Source and shadow database names must be different")
    assert_disposable_database_name(target_name)
    if confirmation != target_name:
        raise RuntimeError("--confirm-target must exactly match --target-db")

    client = create_mongo_client(os.environ.get("MONGO_URL"))
    try:
        await client.admin.command("ping")
        source = client[source_name]
        target = client[target_name]
        administrators = await source.users.find({
            "role": "super_admin",
            "is_active": {"$ne": False},
            "is_deleted": {"$ne": True},
            "account_status": {"$nin": ["deleted", "deactivated"]},
        }).to_list(3)
        if len(administrators) != 1:
            raise RuntimeError(
                f"Expected exactly one active super-admin in {source_name}; found {len(administrators)}"
            )

        administrator = deepcopy(administrators[0])
        required = ("_id", "login", "role", "password_hash")
        missing = [field for field in required if not administrator.get(field)]
        if missing:
            raise RuntimeError(f"Super-admin cannot be copied; missing fields: {', '.join(missing)}")

        await client.drop_database(target_name)
        for field in (
            "failed_login_attempts",
            "last_failed_login",
            "locked_until",
            "last_login",
            "password_reset_token",
            "password_reset_expires_at",
        ):
            administrator.pop(field, None)
        administrator.update({
            "role": "super_admin",
            "is_active": True,
            "is_deleted": False,
            "account_status": "active",
            "updated_at": datetime.utcnow(),
        })
        await target.users.insert_one(administrator)
        await target.users.create_index("login", unique=True)
        await ensure_phone_auth_indexes(target)
        await ensure_telegram_indexes(target)

        user_count = await target.users.count_documents({})
        non_admin_count = await target.users.count_documents({"role": {"$ne": "super_admin"}})
        populated_collections = []
        for collection_name in await target.list_collection_names():
            if collection_name == "users":
                continue
            count = await target[collection_name].count_documents({})
            if count:
                populated_collections.append((collection_name, count))
        if user_count != 1 or non_admin_count != 0 or populated_collections:
            raise RuntimeError(
                "Shadow reset verification failed: expected one admin and no other documents"
            )
        return {
            "source_database_preserved": source_name,
            "shadow_database": target_name,
            "users": user_count,
            "super_admins": 1,
            "non_admin_users": non_admin_count,
            "other_documents": 0,
        }
    finally:
        client.close()


async def main_async() -> None:
    parser = argparse.ArgumentParser(description="Create an admin-only Nurik's Academy shadow database")
    parser.add_argument("--source-db", default=os.environ.get("DB_NAME"), required=not bool(os.environ.get("DB_NAME")))
    parser.add_argument("--target-db", required=True)
    parser.add_argument("--confirm-target", required=True)
    args = parser.parse_args()
    report = await reset_shadow_database(args.source_db, args.target_db, args.confirm_target)
    print(report)


if __name__ == "__main__":
    asyncio.run(main_async())
