"""Shadow/live debt controls and mandatory financial notification queue."""

from datetime import date, datetime, timedelta
from typing import Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from finance_service import active_policy


async def ensure_finance_control_indexes(db) -> None:
    await db.finance_freeze_recommendations.create_index(
        [("student_id", ASCENDING), ("as_of_date", ASCENDING)], unique=True
    )
    await db.student_finance_freeze_periods.create_index(
        [("student_id", ASCENDING), ("effective_from", ASCENDING)], unique=True
    )
    await db.finance_freeze_override_events.create_index("idempotency_key", unique=True)
    await db.finance_notification_jobs.create_index("idempotency_key", unique=True)
    await db.finance_notification_jobs.create_index(
        [("status", ASCENDING), ("scheduled_for", ASCENDING)]
    )
    await db.finance_daily_runs.create_index("idempotency_key", unique=True)


async def billing_rules_on(db, on_date: date) -> dict:
    policy = await active_policy(db, "billing:calendar", on_date)
    if not policy:
        raise ValueError("No billing calendar is configured for this date")
    return {**policy["value"], "policy_version_id": str(policy["_id"])}


async def _open_freeze(db, student_id: str, effective_on: date, source: str, actor_id: str, reason: str) -> Optional[dict]:
    existing = await db.student_finance_freeze_periods.find_one({
        "student_id": student_id, "effective_to": None,
    })
    if existing:
        return existing
    document = {
        "student_id": student_id,
        "effective_from": effective_on.isoformat(),
        "effective_to": None,
        "source": source,
        "reason": reason,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
    }
    result = await db.student_finance_freeze_periods.insert_one(document)
    document["_id"] = result.inserted_id
    if ObjectId.is_valid(student_id):
        await db.students.update_one(
            {"_id": ObjectId(student_id), "status": {"$ne": "archived"}},
            {"$set": {"status": "frozen", "finance_frozen": True, "updated_at": datetime.utcnow()}},
        )
    return document


async def _close_freeze(db, student_id: str, effective_on: date, actor_id: str, reason: str) -> Optional[dict]:
    existing = await db.student_finance_freeze_periods.find_one({
        "student_id": student_id, "effective_to": None,
    }, sort=[("effective_from", DESCENDING)])
    if not existing:
        return None
    if effective_on.isoformat() < existing["effective_from"]:
        raise ValueError("Unfreeze date cannot precede the freeze date")
    await db.student_finance_freeze_periods.update_one(
        {"_id": existing["_id"], "effective_to": None},
        {"$set": {
            "effective_to": effective_on.isoformat(),
            "closed_by": actor_id,
            "closed_reason": reason,
            "closed_at": datetime.utcnow(),
        }},
    )
    if ObjectId.is_valid(student_id):
        await db.students.update_one(
            {"_id": ObjectId(student_id), "status": "frozen", "finance_frozen": True},
            {"$set": {"status": "active", "finance_frozen": False, "updated_at": datetime.utcnow()}},
        )
    return existing


def _invoice_is_freeze_eligible(invoice: dict, as_of_date: date, rules: dict) -> bool:
    """Honor the configured freeze day while keeping older debt eligible."""
    due = date.fromisoformat(invoice["due_date"])
    if due >= as_of_date:
        return False
    if (due.year, due.month) < (as_of_date.year, as_of_date.month):
        return True
    return as_of_date.day >= int(rules["freeze_day"])


async def reconcile_student_finance_freeze(
    db,
    student_id: str,
    as_of_date: date,
    actor_id: str,
) -> dict:
    """Reconcile one student immediately after a balance-changing event."""
    rules = await billing_rules_on(db, as_of_date)
    candidates = await db.finance_invoices.find({
        "student_id": student_id,
        "status": "finalized",
        "balance_uzs": {"$gt": 0},
        "due_date": {"$lt": as_of_date.isoformat()},
    }).to_list(10_000)
    overdue_rows = [
        row for row in candidates
        if _invoice_is_freeze_eligible(row, as_of_date, rules)
    ]
    debt = sum(int(row["balance_uzs"]) for row in overdue_rows)
    open_period = await db.student_finance_freeze_periods.find_one(
        {"student_id": student_id, "effective_to": None},
        sort=[("effective_from", DESCENDING)],
    )
    shadow = (
        rules.get("operation_mode", "shadow") == "shadow"
        or not rules.get("automatic_freeze_enabled", False)
    )
    action = "none"
    if shadow:
        if debt:
            await db.finance_freeze_recommendations.update_one(
                {"student_id": student_id, "as_of_date": as_of_date.isoformat()},
                {"$set": {
                    "recommended_action": "freeze",
                    "overdue_amount_uzs": debt,
                    "invoice_ids": [str(row["_id"]) for row in overdue_rows],
                    "status": "pending",
                    "updated_at": datetime.utcnow(),
                    "mode": "shadow",
                }, "$setOnInsert": {
                    "student_id": student_id,
                    "as_of_date": as_of_date.isoformat(),
                    "created_at": datetime.utcnow(),
                }},
                upsert=True,
            )
            action = "recommend_freeze"
        else:
            await db.finance_freeze_recommendations.update_many(
                {"student_id": student_id, "status": "pending"},
                {"$set": {"status": "cleared", "cleared_at": datetime.utcnow()}},
            )
            action = "clear_recommendation"
    elif debt and not open_period:
        await _open_freeze(
            db,
            student_id,
            as_of_date,
            "automatic_overdue",
            actor_id,
            f"Unpaid balance after configured freeze date: {debt} UZS",
        )
        action = "freeze"
    elif not debt and open_period and open_period.get("source") == "automatic_overdue":
        await _close_freeze(
            db,
            student_id,
            as_of_date,
            actor_id,
            "All overdue finalized invoices were paid",
        )
        action = "unfreeze"
    return {
        "student_id": student_id,
        "as_of_date": as_of_date.isoformat(),
        "overdue_amount_uzs": debt,
        "overdue_invoice_ids": [str(row["_id"]) for row in overdue_rows],
        "operation_mode": rules.get("operation_mode", "shadow"),
        "automatic_freeze_enabled": rules.get("automatic_freeze_enabled", False),
        "action": action,
    }


async def evaluate_finance_freezes(db, as_of_date: date, actor_id: str, idempotency_key: str) -> dict:
    replay = await db.finance_daily_runs.find_one({"idempotency_key": idempotency_key})
    if replay:
        return {**replay["result"], "idempotent_replay": True}
    rules = await billing_rules_on(db, as_of_date)
    overdue_rows = await db.finance_invoices.find({
        "status": "finalized",
        "balance_uzs": {"$gt": 0},
        "due_date": {"$lt": as_of_date.isoformat()},
    }).to_list(100_000)
    overdue_rows = [
        row for row in overdue_rows
        if _invoice_is_freeze_eligible(row, as_of_date, rules)
    ]
    overdue_by_student = {}
    for row in overdue_rows:
        overdue_by_student.setdefault(row["student_id"], []).append(row)
    open_periods = await db.student_finance_freeze_periods.find({"effective_to": None}).to_list(100_000)
    currently_frozen = {row["student_id"] for row in open_periods}
    shadow = rules.get("operation_mode", "shadow") == "shadow" or not rules.get("automatic_freeze_enabled", False)
    recommended = 0
    frozen = 0
    unfrozen = 0
    for student_id, invoices in overdue_by_student.items():
        debt = sum(int(row["balance_uzs"]) for row in invoices)
        if shadow:
            await db.finance_freeze_recommendations.update_one(
                {"student_id": student_id, "as_of_date": as_of_date.isoformat()},
                {"$set": {
                    "student_id": student_id,
                    "as_of_date": as_of_date.isoformat(),
                    "recommended_action": "freeze",
                    "overdue_amount_uzs": debt,
                    "invoice_ids": [str(row["_id"]) for row in invoices],
                    "status": "pending",
                    "updated_at": datetime.utcnow(),
                    "mode": "shadow",
                }, "$setOnInsert": {"created_at": datetime.utcnow()}},
                upsert=True,
            )
            recommended += 1
        elif student_id not in currently_frozen:
            await _open_freeze(
                db, student_id, as_of_date, "automatic_overdue", actor_id,
                f"Unpaid balance after due date: {debt} UZS",
            )
            frozen += 1
    for student_id in currently_frozen - set(overdue_by_student):
        period = next(row for row in open_periods if row["student_id"] == student_id)
        if period.get("source") == "automatic_overdue" and not shadow:
            await _close_freeze(
                db, student_id, as_of_date, actor_id,
                "All overdue finalized invoices were paid",
            )
            unfrozen += 1
    if shadow:
        await db.finance_freeze_recommendations.update_many(
            {
                "student_id": {"$nin": list(overdue_by_student)},
                "status": "pending",
            },
            {"$set": {"status": "cleared", "cleared_at": datetime.utcnow()}},
        )
    result = {
        "as_of_date": as_of_date.isoformat(),
        "operation_mode": rules.get("operation_mode", "shadow"),
        "automatic_freeze_enabled": rules.get("automatic_freeze_enabled", False),
        "overdue_student_count": len(overdue_by_student),
        "freeze_recommendation_count": recommended,
        "frozen_count": frozen,
        "unfrozen_count": unfrozen,
        "idempotent_replay": False,
    }
    await db.finance_daily_runs.insert_one({
        "idempotency_key": idempotency_key,
        "run_type": "freeze_evaluation",
        "as_of_date": as_of_date.isoformat(),
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "result": result,
        "immutable": True,
    })
    return result


async def manual_freeze_override(
    db,
    student_id: str,
    action: str,
    effective_on: date,
    reason: str,
    idempotency_key: str,
    actor_id: str,
) -> dict:
    replay = await db.finance_freeze_override_events.find_one({"idempotency_key": idempotency_key})
    if replay:
        return {"event": replay, "idempotent_replay": True}
    if action == "freeze":
        period = await _open_freeze(db, student_id, effective_on, "manual_override", actor_id, reason)
    else:
        period = await _close_freeze(db, student_id, effective_on, actor_id, reason)
    event = {
        "student_id": student_id,
        "action": action,
        "effective_on": effective_on.isoformat(),
        "reason": reason,
        "idempotency_key": idempotency_key,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "freeze_period_id": str(period["_id"]) if period else None,
        "immutable": True,
    }
    result = await db.finance_freeze_override_events.insert_one(event)
    event["_id"] = result.inserted_id
    return {"event": event, "idempotent_replay": False}


async def enqueue_mandatory_financial_notification(
    db,
    *,
    event_type: str,
    student_id: str,
    invoice_id: Optional[str],
    receipt_id: Optional[str],
    scheduled_for: datetime,
    payload: dict,
    idempotency_key: str,
) -> dict:
    document = {
        "event_type": event_type,
        "student_id": student_id,
        "invoice_id": invoice_id,
        "receipt_id": receipt_id,
        "scheduled_for": scheduled_for,
        "payload": payload,
        "mandatory": True,
        "allow_opt_out": False,
        "recipient_policy": "student_and_parent",
        "channels": {"telegram": "pending", "push": "pending", "in_app": "pending"},
        "status": "pending",
        "idempotency_key": idempotency_key,
        "attempt_count": 0,
        "created_at": datetime.utcnow(),
    }
    try:
        result = await db.finance_notification_jobs.insert_one(document)
        document["_id"] = result.inserted_id
        return document
    except DuplicateKeyError:
        return await db.finance_notification_jobs.find_one({"idempotency_key": idempotency_key})


async def queue_finalized_invoice_notifications(db, service_month: str, branch_id: Optional[str]) -> int:
    query = {"service_month": service_month, "status": "finalized"}
    if branch_id is not None:
        query["branch_id"] = branch_id
    invoices = await db.finance_invoices.find(query).to_list(100_000)
    queued = 0
    for invoice in invoices:
        await enqueue_mandatory_financial_notification(
            db,
            event_type="invoice_finalized",
            student_id=invoice["student_id"],
            invoice_id=str(invoice["_id"]),
            receipt_id=None,
            scheduled_for=datetime.utcnow(),
            payload={
                "invoice_number": invoice["invoice_number"],
                "amount_due_uzs": invoice["amount_due_uzs"],
                "balance_uzs": invoice["balance_uzs"],
                "due_date": invoice["due_date"],
            },
            idempotency_key=f"invoice-finalized:{invoice['_id']}:{invoice['revision']}",
        )
        queued += 1
    return queued


async def queue_receipt_notification(db, receipt: dict) -> dict:
    return await enqueue_mandatory_financial_notification(
        db,
        event_type="payment_receipt",
        student_id=receipt["student_id"],
        invoice_id=None,
        receipt_id=str(receipt["_id"]),
        scheduled_for=datetime.utcnow(),
        payload={
            "receipt_number": receipt["receipt_number"],
            "amount_uzs": receipt["amount_uzs"],
            "allocated_amount_uzs": receipt["allocated_amount_uzs"],
            "advance_amount_uzs": receipt["advance_amount_uzs"],
        },
        idempotency_key=f"receipt-posted:{receipt['_id']}",
    )


def financial_reminder_event(as_of_date: date, due: date) -> Optional[str]:
    """Resolve reminder timing relative to the configured invoice due date."""
    if as_of_date == due - timedelta(days=5):
        return "balance_reminder"
    if as_of_date == due - timedelta(days=1):
        return "final_payment_warning"
    if as_of_date == due + timedelta(days=1):
        return "overdue_freeze_notice"
    return None


async def queue_due_reminders(db, as_of_date: date) -> int:
    invoices = await db.finance_invoices.find({
        "status": "finalized", "balance_uzs": {"$gt": 0},
    }).to_list(100_000)
    queued = 0
    for invoice in invoices:
        due = date.fromisoformat(invoice["due_date"])
        event_type = financial_reminder_event(as_of_date, due)
        if not event_type:
            continue
        await enqueue_mandatory_financial_notification(
            db,
            event_type=event_type,
            student_id=invoice["student_id"],
            invoice_id=str(invoice["_id"]),
            receipt_id=None,
            scheduled_for=datetime.utcnow(),
            payload={
                "invoice_number": invoice["invoice_number"],
                "balance_uzs": invoice["balance_uzs"],
                "due_date": invoice["due_date"],
            },
            idempotency_key=f"{event_type}:{invoice['_id']}:{as_of_date.isoformat()}",
        )
        queued += 1
    return queued
