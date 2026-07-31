"""Expense, payroll payout, other-income, and financial-position services."""

from datetime import datetime, time, timedelta, timezone
from fractions import Fraction
from typing import Optional
from zoneinfo import ZoneInfo

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, OperationFailure

from finance_domain import month_bounds, round_fraction_half_up
from finance_models import ACADEMY_TIMEZONE
from finance_service import active_policy


def _session(session) -> dict:
    return {"session": session} if session is not None else {}


async def ensure_accounting_indexes(db) -> None:
    await db.finance_expense_obligations.create_index(
        [("template_key", ASCENDING), ("service_month", ASCENDING), ("branch_scope", ASCENDING)],
        unique=True,
        partialFilterExpression={"template_key": {"$type": "string"}},
    )
    await db.finance_expense_obligations.create_index("idempotency_key", unique=True, sparse=True)
    await db.finance_expense_obligations.create_index(
        [("service_month", ASCENDING), ("status", ASCENDING)]
    )
    await db.finance_expense_payments.create_index("idempotency_key", unique=True)
    await db.finance_expense_payments.create_index(
        [("obligation_id", ASCENDING), ("paid_at", DESCENDING)]
    )
    await db.teacher_payouts.create_index("idempotency_key", unique=True)
    await db.teacher_payouts.create_index(
        [("teacher_id", ASCENDING), ("paid_at", DESCENDING)]
    )
    await db.finance_other_income.create_index("idempotency_key", unique=True)
    await db.finance_other_income.create_index(
        [("income_date", ASCENDING), ("branch_id", ASCENDING)]
    )
    await db.finance_expense_amount_events.create_index("idempotency_key", unique=True)
    await db.finance_cash_outflow_reversals.create_index("idempotency_key", unique=True)
    await db.finance_other_income_reversals.create_index("idempotency_key", unique=True)


def _latest_versions(rows: list) -> list:
    latest = {}
    for row in rows:
        key = row["policy_key"]
        current = latest.get(key)
        if current is None or (row["effective_from"], row["version"]) > (
            current["effective_from"], current["version"]
        ):
            latest[key] = row
    return list(latest.values())


async def generate_recurring_expense_obligations(
    db,
    service_month: str,
    branch_id: Optional[str],
    actor_id: str,
) -> dict:
    _, month_end = month_bounds(service_month)
    policies = await db.finance_policy_versions.find({
        "policy_kind": "recurring_expense",
        "effective_from": {"$lte": month_end.isoformat()},
    }).to_list(10_000)
    created = 0
    existing = 0
    total = 0
    for policy in _latest_versions(policies):
        value = policy["value"]
        manual_amount = value.get("amount_mode") == "manual" or value.get("amount_uzs") is None
        amount = 0 if manual_amount else int(value["amount_uzs"])
        document = {
            "template_key": policy["policy_key"],
            "template_policy_version_id": str(policy["_id"]),
            "service_month": service_month,
            "branch_id": branch_id,
            "branch_scope": branch_id or "global",
            "category": value["name"],
            "recipient": value["name"],
            "classification": value.get("classification", "operating_expense"),
            "description": f"Recurring {value['name']} obligation for {service_month}",
            "accrued_amount_uzs": amount,
            "paid_amount_uzs": 0,
            "outstanding_amount_uzs": amount,
            "status": "amount_required" if manual_amount else "unpaid",
            "amount_status": "required" if manual_amount else "fixed",
            "obligation_date": month_end.isoformat(),
            "currency": "UZS",
            "created_by": actor_id,
            "created_at": datetime.utcnow(),
            "immutable_basis": True,
        }
        result = await db.finance_expense_obligations.update_one(
            {
                "template_key": policy["policy_key"],
                "service_month": service_month,
                "branch_scope": branch_id or "global",
            },
            {"$setOnInsert": document},
            upsert=True,
        )
        if result.upserted_id is not None:
            created += 1
        else:
            existing += 1
        total += amount
    return {
        "service_month": service_month,
        "branch_id": branch_id,
        "created": created,
        "already_present": existing,
        "accrued_amount_uzs": total,
    }


async def set_manual_expense_obligation_amount(
    db,
    obligation: dict,
    amount_uzs: int,
    reason: str,
    idempotency_key: str,
    actor_id: str,
) -> dict:
    """Set a generated manual recurring amount once, atomically and audibly."""
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_expense_amount_events.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    stored = await db.finance_expense_obligations.find_one(
                        {"_id": ObjectId(replay["obligation_id"])}, **_session(session)
                    )
                    return {"event": replay, "obligation": stored, "idempotent_replay": True}
                stored = await db.finance_expense_obligations.find_one(
                    {"_id": obligation["_id"]}, **_session(session)
                )
                if not stored or stored.get("amount_status") != "required":
                    raise ValueError("This recurring expense amount is already fixed")
                now = datetime.utcnow()
                event = {
                    "obligation_id": str(stored["_id"]),
                    "previous_amount_uzs": int(stored.get("accrued_amount_uzs", 0)),
                    "amount_uzs": amount_uzs,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": actor_id,
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_expense_amount_events.insert_one(
                    event, **_session(session)
                )
                event["_id"] = inserted.inserted_id
                result = await db.finance_expense_obligations.update_one(
                    {"_id": stored["_id"], "amount_status": "required"},
                    {"$set": {
                        "accrued_amount_uzs": amount_uzs,
                        "outstanding_amount_uzs": amount_uzs,
                        "status": "unpaid",
                        "amount_status": "entered",
                        "amount_event_id": str(inserted.inserted_id),
                        "amount_entered_at": now,
                    }},
                    **_session(session),
                )
                if result.modified_count != 1:
                    raise ValueError("The recurring expense amount changed concurrently")
                stored.update({
                    "accrued_amount_uzs": amount_uzs,
                    "outstanding_amount_uzs": amount_uzs,
                    "status": "unpaid",
                    "amount_status": "entered",
                    "amount_event_id": str(inserted.inserted_id),
                })
                return {"event": event, "obligation": stored, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError(
            "Setting a recurring expense amount requires MongoDB transaction support; nothing was changed"
        ) from exc


async def adjust_expense_obligation_amount(
    db,
    obligation: dict,
    amount_uzs: int,
    reason: str,
    idempotency_key: str,
    actor_id: str,
) -> dict:
    """Correct an obligation by append-only event; never rewrite a payment."""
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_expense_amount_events.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    stored = await db.finance_expense_obligations.find_one(
                        {"_id": ObjectId(replay["obligation_id"])}, **_session(session)
                    )
                    return {"event": replay, "obligation": stored, "idempotent_replay": True}
                stored = await db.finance_expense_obligations.find_one(
                    {"_id": obligation["_id"]}, **_session(session)
                )
                if not stored or stored.get("amount_status") == "required":
                    raise ValueError("Enter the required monthly amount before correcting it")
                paid = int(stored.get("paid_amount_uzs", 0))
                if amount_uzs < paid:
                    raise ValueError("Corrected expense amount cannot be below cash already paid")
                previous = int(stored.get("accrued_amount_uzs", 0))
                if amount_uzs == previous:
                    raise ValueError("Corrected expense amount is unchanged")
                now = datetime.utcnow()
                event = {
                    "event_type": "amount_correction",
                    "obligation_id": str(stored["_id"]),
                    "previous_amount_uzs": previous,
                    "amount_uzs": amount_uzs,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": actor_id,
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_expense_amount_events.insert_one(
                    event, **_session(session)
                )
                event["_id"] = inserted.inserted_id
                outstanding = amount_uzs - paid
                if amount_uzs == 0:
                    status = "cancelled"
                elif outstanding == 0:
                    status = "paid"
                elif paid:
                    status = "partial"
                else:
                    status = "unpaid"
                update = {
                    "accrued_amount_uzs": amount_uzs,
                    "outstanding_amount_uzs": outstanding,
                    "status": status,
                    "amount_status": "corrected",
                    "last_amount_event_id": str(inserted.inserted_id),
                    "amount_corrected_at": now,
                }
                result = await db.finance_expense_obligations.update_one(
                    {
                        "_id": stored["_id"],
                        "accrued_amount_uzs": previous,
                        "paid_amount_uzs": paid,
                    },
                    {"$set": update},
                    **_session(session),
                )
                if result.modified_count != 1:
                    raise ValueError("The expense obligation changed concurrently")
                stored.update(update)
                return {"event": event, "obligation": stored, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError(
            "Expense correction requires MongoDB transaction support; nothing was changed"
        ) from exc


async def create_other_expense_obligation(
    db,
    *,
    category: str,
    recipient: str,
    expense_date,
    amount_uzs: int,
    explanation: str,
    proof_reference: Optional[str],
    branch_id: Optional[str],
    idempotency_key: str,
    actor_id: str,
) -> dict:
    replay = await db.finance_expense_obligations.find_one({"idempotency_key": idempotency_key})
    if replay:
        return replay
    document = {
        "template_key": None,
        "service_month": expense_date.strftime("%Y-%m"),
        "branch_id": branch_id,
        "branch_scope": branch_id or "global",
        "category": category,
        "recipient": recipient,
        "classification": "other",
        "description": explanation,
        "proof_reference": proof_reference,
        "accrued_amount_uzs": amount_uzs,
        "paid_amount_uzs": 0,
        "outstanding_amount_uzs": amount_uzs,
        "status": "unpaid",
        "obligation_date": expense_date.isoformat(),
        "currency": "UZS",
        "idempotency_key": idempotency_key,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable_basis": True,
    }
    try:
        result = await db.finance_expense_obligations.insert_one(document)
    except DuplicateKeyError:
        return await db.finance_expense_obligations.find_one({"idempotency_key": idempotency_key})
    document["_id"] = result.inserted_id
    return document


async def _post_cash_outflow(
    db,
    *,
    source_collection,
    source: dict,
    source_type: str,
    amount_uzs: int,
    shift_id: ObjectId,
    notes: Optional[str],
    idempotency_key: str,
    actor: dict,
    session,
) -> dict:
    stored_shift = await db.cash_shifts.find_one(
        {"_id": shift_id, "status": "open"}, **_session(session)
    )
    if not stored_shift:
        raise ValueError("Expense and payroll cash payments require an open cash shift")
    if not source:
        raise ValueError("The payable obligation no longer exists")
    if amount_uzs > int(source["outstanding_amount_uzs"]):
        raise ValueError("Payment exceeds the outstanding amount")
    available_cash = (
        int(stored_shift["opening_balance_uzs"])
        + int(stored_shift.get("receipt_total_uzs", 0))
        + int(stored_shift.get("other_income_total_uzs", 0))
        - int(stored_shift.get("removal_total_uzs", 0))
    )
    if amount_uzs > available_cash:
        raise ValueError("Cash payment exceeds the amount physically available in the cashbox")
    payment = {
        "source_type": source_type,
        "source_id": str(source["_id"]),
        "amount_uzs": amount_uzs,
        "payment_method": "cash",
        "cash_shift_id": str(shift_id),
        "notes": notes,
        "idempotency_key": idempotency_key,
        "paid_by": str(actor["_id"]),
        "paid_at": datetime.utcnow(),
        "branch_id": source.get("branch_id"),
        "status": "posted",
        "immutable": True,
    }
    payment_collection = (
        db.finance_expense_payments if source_type == "expense" else db.teacher_payouts
    )
    inserted = await payment_collection.insert_one(payment, **_session(session))
    new_paid = int(source["paid_amount_uzs"]) + amount_uzs
    new_outstanding = int(source["accrued_amount_uzs"] if source_type == "expense" else source["earned_amount_uzs"]) - new_paid
    update = {
        "paid_amount_uzs": new_paid,
        "outstanding_amount_uzs": new_outstanding,
        "status": "paid" if new_outstanding == 0 else "partial",
    }
    result = await source_collection.update_one(
        {"_id": source["_id"], "outstanding_amount_uzs": {"$gte": amount_uzs}},
        {"$set": update},
        **_session(session),
    )
    if result.modified_count != 1:
        raise ValueError("The outstanding amount changed concurrently")
    await db.cash_events.insert_one({
        "cash_shift_id": str(shift_id),
        "event_type": f"{source_type}_payment",
        "amount_uzs": amount_uzs,
        "source_id": str(source["_id"]),
        "payment_id": str(inserted.inserted_id),
        "idempotency_key": idempotency_key,
        "created_by": str(actor["_id"]),
        "created_at": payment["paid_at"],
        "immutable": True,
    }, **_session(session))
    shift_update = await db.cash_shifts.update_one(
        {"_id": shift_id, "status": "open"},
        {"$inc": {"removal_total_uzs": amount_uzs}},
        **_session(session),
    )
    if shift_update.modified_count != 1:
        raise ValueError("The cash shift changed concurrently")
    payment["_id"] = inserted.inserted_id
    return payment


async def pay_expense_obligation(
    db, obligation: dict, amount_uzs: int, shift_id: ObjectId, notes: Optional[str],
    idempotency_key: str, actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_expense_payments.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return replay
                stored = await db.finance_expense_obligations.find_one(
                    {"_id": obligation["_id"]}, **_session(session)
                )
                return await _post_cash_outflow(
                    db, source_collection=db.finance_expense_obligations, source=stored,
                    source_type="expense", amount_uzs=amount_uzs, shift_id=shift_id,
                    notes=notes, idempotency_key=idempotency_key, actor=actor, session=session,
                )
    except OperationFailure as exc:
        raise RuntimeError("Expense payment requires MongoDB transaction support; nothing was recorded") from exc


async def pay_teacher_earning(
    db, earning: dict, amount_uzs: int, shift_id: ObjectId, notes: Optional[str],
    idempotency_key: str, actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.teacher_payouts.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return replay
                stored = await db.teacher_earnings.find_one(
                    {"_id": earning["_id"]}, **_session(session)
                )
                payment = await _post_cash_outflow(
                    db, source_collection=db.teacher_earnings, source=stored,
                    source_type="teacher", amount_uzs=amount_uzs, shift_id=shift_id,
                    notes=notes, idempotency_key=idempotency_key, actor=actor, session=session,
                )
                payment["teacher_id"] = earning["teacher_id"]
                await db.teacher_payouts.update_one(
                    {"_id": payment["_id"]},
                    {"$set": {"teacher_id": earning["teacher_id"], "earning_id": str(earning["_id"])}},
                    **_session(session),
                )
                return payment
    except OperationFailure as exc:
        raise RuntimeError("Teacher payout requires MongoDB transaction support; nothing was recorded") from exc


async def record_other_income(
    db,
    *,
    source: str,
    income_date,
    amount_uzs: int,
    shift_id: ObjectId,
    notes: Optional[str],
    branch_id: Optional[str],
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_other_income.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return replay
                shift = await db.cash_shifts.find_one(
                    {"_id": shift_id, "status": "open"}, **_session(session)
                )
                if not shift:
                    raise ValueError("Cash income requires an open cash shift")
                document = {
                    "source": source,
                    "income_date": income_date.isoformat(),
                    "service_month": income_date.strftime("%Y-%m"),
                    "amount_uzs": amount_uzs,
                    "payment_method": "cash",
                    "cash_shift_id": str(shift_id),
                    "notes": notes,
                    "branch_id": branch_id,
                    "idempotency_key": idempotency_key,
                    "recorded_by": str(actor["_id"]),
                    "recorded_at": datetime.utcnow(),
                    "status": "posted",
                    "immutable": True,
                }
                result = await db.finance_other_income.insert_one(document, **_session(session))
                document["_id"] = result.inserted_id
                await db.cash_events.insert_one({
                    "cash_shift_id": str(shift_id),
                    "event_type": "other_income",
                    "amount_uzs": amount_uzs,
                    "source_id": str(result.inserted_id),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": document["recorded_at"],
                    "immutable": True,
                }, **_session(session))
                shift_update = await db.cash_shifts.update_one(
                    {"_id": shift_id, "status": "open"},
                    {"$inc": {"other_income_total_uzs": amount_uzs}},
                    **_session(session),
                )
                if shift_update.modified_count != 1:
                    raise ValueError("The cash shift changed concurrently")
                return document
    except OperationFailure as exc:
        raise RuntimeError("Other income posting requires MongoDB transaction support; nothing was recorded") from exc


async def reverse_cash_outflow(
    db,
    payment: dict,
    source_type: str,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    """Reverse an expense/payroll cash payout while its cash shift is open."""
    if source_type not in {"expense", "teacher"}:
        raise ValueError("Unsupported cash outflow type")
    payment_collection = (
        db.finance_expense_payments if source_type == "expense" else db.teacher_payouts
    )
    source_collection = (
        db.finance_expense_obligations if source_type == "expense" else db.teacher_earnings
    )
    total_field = "accrued_amount_uzs" if source_type == "expense" else "earned_amount_uzs"
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_cash_outflow_reversals.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return {"reversal": replay, "idempotent_replay": True}
                stored_payment = await payment_collection.find_one(
                    {"_id": payment["_id"], "status": {"$ne": "reversed"}},
                    **_session(session),
                )
                if not stored_payment:
                    raise ValueError("This cash payout was already reversed")
                shift = await db.cash_shifts.find_one(
                    {"_id": ObjectId(stored_payment["cash_shift_id"])},
                    **_session(session),
                )
                if not shift:
                    raise ValueError("The payout cash shift no longer exists")
                source = await source_collection.find_one(
                    {"_id": ObjectId(stored_payment["source_id"])}, **_session(session)
                )
                if not source:
                    raise ValueError("The payout source no longer exists")
                amount = int(stored_payment["amount_uzs"])
                paid = int(source.get("paid_amount_uzs", 0))
                if paid < amount or int(shift.get("removal_total_uzs", 0)) < amount:
                    raise ValueError("Payout reversal totals are inconsistent; no change was made")
                new_paid = paid - amount
                new_outstanding = int(source[total_field]) - new_paid
                new_status = "unpaid" if new_paid == 0 else "partial"
                now = datetime.utcnow()
                reversal = {
                    "payment_id": str(stored_payment["_id"]),
                    "source_type": source_type,
                    "source_id": stored_payment["source_id"],
                    "amount_uzs": amount,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_cash_outflow_reversals.insert_one(
                    reversal, **_session(session)
                )
                reversal["_id"] = inserted.inserted_id
                source_update = await source_collection.update_one(
                    {"_id": source["_id"], "paid_amount_uzs": paid},
                    {"$set": {
                        "paid_amount_uzs": new_paid,
                        "outstanding_amount_uzs": new_outstanding,
                        "status": new_status,
                    }},
                    **_session(session),
                )
                payment_update = await payment_collection.update_one(
                    {"_id": stored_payment["_id"], "status": {"$ne": "reversed"}},
                    {"$set": {
                        "status": "reversed",
                        "reversal_id": str(inserted.inserted_id),
                        "reversed_at": now,
                        "reversed_by": str(actor["_id"]),
                    }},
                    **_session(session),
                )
                shift_set = {"post_close_corrected_at": now} if shift.get("status") == "closed" else {}
                if shift.get("status") == "closed":
                    corrected_expected = int(shift["expected_closing_balance_uzs"]) + amount
                    corrected_discrepancy = int(shift["actual_closing_balance_uzs"]) - corrected_expected
                    shift_set.update({
                        "expected_closing_balance_uzs": corrected_expected,
                        "discrepancy_uzs": corrected_discrepancy,
                        "discrepancy_status": (
                            "balanced" if corrected_discrepancy == 0 else "pending_review"
                        ),
                    })
                shift_update = await db.cash_shifts.update_one(
                    {"_id": shift["_id"], "status": shift["status"]},
                    {
                        "$inc": {"removal_total_uzs": -amount},
                        **({"$set": shift_set} if shift_set else {}),
                    },
                    **_session(session),
                )
                if (
                    source_update.modified_count != 1
                    or payment_update.modified_count != 1
                    or shift_update.modified_count != 1
                ):
                    raise ValueError("Cash payout changed concurrently; no reversal was posted")
                await db.cash_events.insert_one({
                    "cash_shift_id": stored_payment["cash_shift_id"],
                    "event_type": f"{source_type}_payment_reversal",
                    "amount_uzs": -amount,
                    "source_id": stored_payment["source_id"],
                    "payment_id": str(stored_payment["_id"]),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }, **_session(session))
                return {"reversal": reversal, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError(
            "Cash payout reversal requires MongoDB transaction support; nothing was changed"
        ) from exc


async def reverse_other_income(
    db,
    income: dict,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    """Reverse other cash income while preserving the original record."""
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_other_income_reversals.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return {"reversal": replay, "idempotent_replay": True}
                stored = await db.finance_other_income.find_one(
                    {"_id": income["_id"], "status": "posted"}, **_session(session)
                )
                if not stored:
                    raise ValueError("Only posted other income can be reversed")
                shift = await db.cash_shifts.find_one(
                    {"_id": ObjectId(stored["cash_shift_id"])},
                    **_session(session),
                )
                if not shift:
                    raise ValueError("The income cash shift no longer exists")
                amount = int(stored["amount_uzs"])
                if int(shift.get("other_income_total_uzs", 0)) < amount:
                    raise ValueError("Other-income reversal totals are inconsistent")
                now = datetime.utcnow()
                reversal = {
                    "income_id": str(stored["_id"]),
                    "amount_uzs": amount,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_other_income_reversals.insert_one(
                    reversal, **_session(session)
                )
                reversal["_id"] = inserted.inserted_id
                income_update = await db.finance_other_income.update_one(
                    {"_id": stored["_id"], "status": "posted"},
                    {"$set": {
                        "status": "reversed",
                        "reversal_id": str(inserted.inserted_id),
                        "reversed_at": now,
                        "reversed_by": str(actor["_id"]),
                    }},
                    **_session(session),
                )
                shift_set = {"post_close_corrected_at": now} if shift.get("status") == "closed" else {}
                if shift.get("status") == "closed":
                    corrected_expected = int(shift["expected_closing_balance_uzs"]) - amount
                    corrected_discrepancy = int(shift["actual_closing_balance_uzs"]) - corrected_expected
                    shift_set.update({
                        "expected_closing_balance_uzs": corrected_expected,
                        "discrepancy_uzs": corrected_discrepancy,
                        "discrepancy_status": (
                            "balanced" if corrected_discrepancy == 0 else "pending_review"
                        ),
                    })
                shift_update = await db.cash_shifts.update_one(
                    {"_id": shift["_id"], "status": shift["status"]},
                    {
                        "$inc": {"other_income_total_uzs": -amount},
                        **({"$set": shift_set} if shift_set else {}),
                    },
                    **_session(session),
                )
                if income_update.modified_count != 1 or shift_update.modified_count != 1:
                    raise ValueError("Other income changed concurrently; no reversal was posted")
                await db.cash_events.insert_one({
                    "cash_shift_id": stored["cash_shift_id"],
                    "event_type": "other_income_reversal",
                    "amount_uzs": -amount,
                    "source_id": str(stored["_id"]),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }, **_session(session))
                return {"reversal": reversal, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError(
            "Other-income reversal requires MongoDB transaction support; nothing was changed"
        ) from exc


def _sum(rows: list, field: str) -> int:
    return sum(int(row.get(field, 0)) for row in rows)


def calculate_projected_teacher_salary(lines: list) -> int:
    """Match finalization rounding while drafts are still provisional."""
    exact_by_teacher = {}
    for line in lines:
        teacher_id = line.get("payable_teacher_id")
        if not teacher_id:
            continue
        exact_by_teacher.setdefault(teacher_id, Fraction(0))
        exact_by_teacher[teacher_id] += Fraction(
            int(line["amount_uzs"]) * int(line["teacher_share_basis_points"]),
            10_000,
        )
    return sum(round_fraction_half_up(amount) for amount in exact_by_teacher.values())


async def financial_position(db, service_month: str, branch_id: Optional[str]) -> dict:
    _, selected_month_end = month_bounds(service_month)
    billing_policy = await active_policy(db, "billing:calendar", selected_month_end)
    operation_mode = (
        billing_policy.get("value", {}).get("operation_mode", "shadow")
        if billing_policy else "shadow"
    )
    branch_query = {"branch_id": branch_id} if branch_id is not None else {}
    invoices = await db.finance_invoices.find({
        **branch_query,
        "service_month": service_month,
        "status": {"$in": ["draft", "finalized"]},
    }).to_list(100_000)
    all_receivables = await db.finance_invoices.find({
        **branch_query,
        "status": "finalized",
        "balance_uzs": {"$gt": 0},
    }).to_list(100_000)
    today_local = datetime.now(ZoneInfo(ACADEMY_TIMEZONE)).date().isoformat()
    overdue = [row for row in all_receivables if row["due_date"] < today_local]
    credits = await db.finance_credit_lots.find({
        "status": "active", "remaining_amount_uzs": {"$gt": 0},
        **({"branch_id": branch_id} if branch_id is not None else {}),
    }).to_list(100_000)
    earnings = await db.teacher_earnings.find({
        "service_month": service_month,
        **branch_query,
    }).to_list(100_000)
    draft_invoices = [row for row in invoices if row.get("status") == "draft"]
    projected_teacher_salary = 0
    if draft_invoices:
        current_runs = {
            str(row["_id"]): row["current_generation_run_id"]
            for row in draft_invoices
        }
        draft_lines = await db.finance_invoice_lines.find({
            "invoice_id": {"$in": list(current_runs)},
            "invoice_status": "draft",
        }).to_list(100_000)
        projected_teacher_salary = calculate_projected_teacher_salary(
            [
                line for line in draft_lines
                if line.get("generation_run_id") == current_runs.get(line["invoice_id"])
            ]
        )
    obligation_query = {"service_month": service_month}
    if branch_id is not None:
        obligation_query["$or"] = [{"branch_id": branch_id}, {"branch_id": None}]
    obligations = await db.finance_expense_obligations.find(obligation_query).to_list(100_000)
    other_income = await db.finance_other_income.find({
        "service_month": service_month,
        "status": "posted",
        **branch_query,
    }).to_list(100_000)

    month_start, month_end = month_bounds(service_month)
    local_tz = ZoneInfo(ACADEMY_TIMEZONE)
    utc_start = datetime.combine(month_start, time.min, local_tz).astimezone(timezone.utc).replace(tzinfo=None)
    utc_end = datetime.combine(month_end + timedelta(days=1), time.min, local_tz).astimezone(timezone.utc).replace(tzinfo=None)
    receipts = await db.finance_receipts.find({
        "status": "posted",
        "received_at": {"$gte": utc_start, "$lt": utc_end},
        **branch_query,
    }).to_list(100_000)
    cash_receipts = [
        row for row in receipts if row.get("payment_method", "cash") == "cash"
    ]
    card_transfer_receipts = [
        row for row in receipts
        if row.get("payment_method") == "personal_card_transfer"
    ]
    expense_payments = await db.finance_expense_payments.find({
        "paid_at": {"$gte": utc_start, "$lt": utc_end},
        "status": {"$ne": "reversed"},
        **branch_query,
    }).to_list(100_000)
    teacher_payouts = await db.teacher_payouts.find({
        "paid_at": {"$gte": utc_start, "$lt": utc_end},
        "status": {"$ne": "reversed"},
        **branch_query,
    }).to_list(100_000)

    gross = _sum(invoices, "gross_tuition_uzs")
    discounts = _sum(invoices, "discount_amount_uzs")
    net_tuition = _sum(invoices, "amount_due_uzs")
    income_accrued = _sum(other_income, "amount_uzs")
    finalized_teacher_earned = _sum(earnings, "earned_amount_uzs")
    teacher_earned = finalized_teacher_earned + projected_teacher_salary
    expense_accrued = _sum(obligations, "accrued_amount_uzs")
    accrued_profit = net_tuition + income_accrued - teacher_earned - expense_accrued
    open_shift = await db.cash_shifts.find_one({"cashbox_id": "main", "status": "open"})
    if open_shift:
        cash_position = (
            int(open_shift["opening_balance_uzs"])
            + int(open_shift.get("receipt_total_uzs", 0))
            + int(open_shift.get("other_income_total_uzs", 0))
            - int(open_shift.get("removal_total_uzs", 0))
        )
        cash_position_source = "open_shift_expected"
    else:
        latest_shift = await db.cash_shifts.find_one(
            {"cashbox_id": "main", "status": "closed"}, sort=[("closed_at", DESCENDING)]
        )
        cash_position = int(latest_shift.get("actual_closing_balance_uzs", 0)) if latest_shift else 0
        cash_position_source = "latest_closed_shift_actual" if latest_shift else "no_shift"

    current_month = datetime.now(ZoneInfo(ACADEMY_TIMEZONE)).strftime("%Y-%m")
    provisional = (
        service_month >= current_month
        or bool(draft_invoices)
        or any(row.get("amount_status") == "required" for row in obligations)
    )
    return {
        "service_month": service_month,
        "branch_id": branch_id,
        "currency": "UZS",
        "operation_mode": operation_mode,
        "is_provisional": provisional,
        "gross_tuition_uzs": gross,
        "centre_funded_discounts_uzs": discounts,
        "net_tuition_uzs": net_tuition,
        "other_income_uzs": income_accrued,
        "cash_received_uzs": _sum(cash_receipts, "amount_uzs"),
        "card_transfer_received_uzs": _sum(card_transfer_receipts, "amount_uzs"),
        "total_collections_uzs": _sum(receipts, "amount_uzs"),
        "receivables_uzs": _sum(all_receivables, "balance_uzs"),
        "overdue_uzs": _sum(overdue, "balance_uzs"),
        "advance_balances_uzs": _sum(credits, "remaining_amount_uzs"),
        "teacher_salary_earned_uzs": teacher_earned,
        "teacher_salary_finalized_uzs": finalized_teacher_earned,
        "teacher_salary_projected_uzs": projected_teacher_salary,
        "teacher_salary_paid_uzs": _sum(earnings, "paid_amount_uzs"),
        "teacher_salary_outstanding_uzs": (
            _sum(earnings, "outstanding_amount_uzs") + projected_teacher_salary
        ),
        "expenses_accrued_uzs": expense_accrued,
        "expenses_paid_uzs": _sum(obligations, "paid_amount_uzs"),
        "expenses_outstanding_uzs": _sum(obligations, "outstanding_amount_uzs"),
        "accrued_operating_profit_uzs": accrued_profit,
        "period_cash_outflow_uzs": _sum(expense_payments, "amount_uzs") + _sum(teacher_payouts, "amount_uzs"),
        "cashbox_position_uzs": cash_position,
        "cashbox_position_source": cash_position_source,
        "collections_are_profit": False,
    }
