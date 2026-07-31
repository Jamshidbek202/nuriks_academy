"""Secure finance-ledger invalidation stream.

The stream deliberately sends no financial values. Clients receive only a
signal telling them to refetch their own role/branch-scoped API projections.
MongoDB change streams deliver transaction changes only after commit.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError


FINANCE_LIVE_COLLECTIONS = (
    "finance_policy_versions",
    "group_finance_versions",
    "finance_closures",
    "lesson_occurrences",
    "lesson_resolution_events",
    "lesson_exception_approvals",
    "lesson_replacement_events",
    "group_memberships",
    "finance_invoices",
    "finance_invoice_lines",
    "finance_finalization_runs",
    "finance_allocations",
    "finance_allocation_reversals",
    "finance_credit_lots",
    "finance_invoice_adjustments",
    "finance_invoice_reversals",
    "finance_receipts",
    "finance_receipt_reversals",
    "finance_payment_destinations",
    "finance_payment_destination_events",
    "finance_card_payment_reports",
    "finance_card_payment_resolutions",
    "finance_card_payment_notifications",
    "finance_discount_entitlements",
    "finance_expense_obligations",
    "finance_expense_payments",
    "finance_expense_amount_events",
    "finance_other_income",
    "finance_other_income_reversals",
    "finance_cash_outflow_reversals",
    "teacher_earnings",
    "teacher_payouts",
    "cash_shifts",
    "cash_events",
    "cash_discrepancy_reviews",
    "finance_freeze_recommendations",
    "student_finance_freeze_periods",
    "finance_freeze_override_events",
    "finance_notification_jobs",
    "finance_daily_runs",
)


async def ensure_finance_live_indexes(db) -> None:
    await db.finance_live_tickets.create_index("ticket_hash", unique=True)
    await db.finance_live_tickets.create_index("expires_at", expireAfterSeconds=0)


async def issue_finance_live_ticket(db, current_user: dict) -> dict:
    ticket = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(seconds=60)
    await db.finance_live_tickets.insert_one({
        "ticket_hash": hashlib.sha256(ticket.encode("utf-8")).hexdigest(),
        "user_id": str(current_user["_id"]),
        "role": current_user["role"],
        "branch_id": current_user.get("branch_id"),
        "expires_at": expires_at,
        "used_at": None,
        "created_at": datetime.utcnow(),
    })
    return {"ticket": ticket, "expires_at": expires_at.isoformat()}


async def consume_finance_live_ticket(db, ticket: str):
    if not ticket:
        return None
    row = await db.finance_live_tickets.find_one_and_update(
        {
            "ticket_hash": hashlib.sha256(ticket.encode("utf-8")).hexdigest(),
            "used_at": None,
            "expires_at": {"$gt": datetime.utcnow()},
        },
        {"$set": {"used_at": datetime.utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if not row or not ObjectId.is_valid(row.get("user_id", "")):
        return None
    return await db.users.find_one({
        "_id": ObjectId(row["user_id"]),
        "is_active": {"$ne": False},
    })


def finance_change_is_visible(change: dict, current_user: dict) -> bool:
    """Scope invalidations when the changed document carries branch metadata."""
    if current_user.get("role") == "super_admin":
        return True
    document = change.get("fullDocument") or {}
    branch_id = document.get("branch_id")
    return branch_id is None or branch_id == current_user.get("branch_id")


async def stream_finance_changes(websocket, db, current_user: dict) -> None:
    pipeline = [{
        "$match": {
            "operationType": {"$in": ["insert", "update", "replace", "delete"]},
            "ns.coll": {"$in": list(FINANCE_LIVE_COLLECTIONS)},
        }
    }]
    try:
        async with db.watch(
            pipeline,
            full_document="updateLookup",
            max_await_time_ms=15_000,
        ) as changes:
            while True:
                change = await changes.try_next()
                if change is not None and finance_change_is_visible(change, current_user):
                    await websocket.send_json({
                        "type": "finance_changed",
                        "committed_at": datetime.now(timezone.utc).isoformat(),
                    })
                elif change is None:
                    await websocket.send_json({"type": "heartbeat"})
                await asyncio.sleep(0)
    except PyMongoError:
        # The frontend retains a timed reconciliation fallback when change
        # streams are unavailable. Do not manufacture a false live signal.
        await websocket.send_json({"type": "live_unavailable"})
