"""Explicit, idempotent finance seed for a fresh/reset database.

This script does not run during imports or tests.  Run it only against the
intended database environment after verifying MONGO_URL and DB_NAME.
"""

import asyncio
import os
import sys
from pathlib import Path

from bson import ObjectId


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import client, db  # noqa: E402
from finance_service import (  # noqa: E402
    ensure_finance_indexes,
    seed_default_finance_configuration,
    seed_reception_user,
)


async def main():
    actor_id = os.environ.get("FINANCE_SEED_ACTOR_ID", "system-finance-seed")
    requested_branch_id = os.environ.get("FINANCE_RECEPTION_BRANCH_ID")
    if requested_branch_id:
        if not ObjectId.is_valid(requested_branch_id):
            raise RuntimeError("FINANCE_RECEPTION_BRANCH_ID is not a valid MongoDB ObjectId")
        branch = await db.branches.find_one({"_id": ObjectId(requested_branch_id)})
        if not branch:
            raise RuntimeError("FINANCE_RECEPTION_BRANCH_ID does not identify an existing branch")
    else:
        branches = await db.branches.find({}).sort("created_at", 1).limit(2).to_list(length=2)
        if not branches:
            raise RuntimeError(
                "Create the centre branch before seeding the reception account"
            )
        if len(branches) > 1:
            raise RuntimeError(
                "Multiple branches exist; set FINANCE_RECEPTION_BRANCH_ID explicitly"
            )
        branch = branches[0]
    branch_id = str(branch["_id"])
    await ensure_finance_indexes(db)
    policies = await seed_default_finance_configuration(db, actor_id)
    reception = await seed_reception_user(db, branch_id, actor_id)
    print({
        "database": db.name,
        "policies": policies,
        "reception_created": reception["created"],
        "reception_branch_id": branch_id,
    })


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        client.close()
