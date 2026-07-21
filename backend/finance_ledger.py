"""Invoice, teacher-earning, receipt, allocation, and cashbox ledgers.

Finalized records are never edited or deleted. Mutable fields on invoices and
credit lots are explicitly projections of append-only allocation/reversal
events; the underlying events remain auditable.
"""

from datetime import date, datetime, timedelta, timezone
from fractions import Fraction
import hashlib
import json
from typing import Dict, List, Optional, Sequence
from zoneinfo import ZoneInfo

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure

from finance_domain import (
    ChargeInput,
    allocate_oldest_debts,
    calculate_student_charge,
    capped_discount_basis_points,
    month_bounds,
    payment_status,
    round_fraction_half_up,
)
from finance_service import active_policy
from finance_models import ACADEMY_TIMEZONE


async def ensure_finance_ledger_indexes(db) -> None:
    await db.finance_invoices.create_index(
        [
            ("student_id", ASCENDING),
            ("service_month", ASCENDING),
            ("document_sequence", ASCENDING),
        ],
        unique=True,
    )
    await db.finance_invoices.create_index("invoice_number", unique=True, sparse=True)
    await db.finance_invoices.create_index(
        [("branch_id", ASCENDING), ("status", ASCENDING), ("due_date", ASCENDING)]
    )
    await db.finance_invoice_lines.create_index(
        [("invoice_id", ASCENDING), ("generation_run_id", ASCENDING), ("line_key", ASCENDING)],
        unique=True,
    )
    await db.finance_invoice_lines.create_index(
        [("group_id", ASCENDING), ("lesson_date", ASCENDING), ("invoice_status", ASCENDING)]
    )
    await db.finance_finalization_runs.create_index("idempotency_key", unique=True)
    await db.teacher_earnings.create_index(
        [
            ("teacher_id", ASCENDING),
            ("service_month", ASCENDING),
            ("branch_id", ASCENDING),
        ],
        unique=True,
    )
    await db.finance_receipts.create_index("idempotency_key", unique=True)
    await db.finance_receipts.create_index("receipt_number", unique=True)
    await db.finance_receipts.create_index(
        [("student_id", ASCENDING), ("received_at", DESCENDING)]
    )
    await db.finance_allocations.create_index(
        [("invoice_id", ASCENDING), ("active", ASCENDING)]
    )
    await db.finance_allocations.create_index(
        [("source_receipt_id", ASCENDING), ("active", ASCENDING)]
    )
    await db.finance_credit_lots.create_index("source_receipt_id", unique=True)
    await db.finance_credit_lots.create_index(
        [("student_id", ASCENDING), ("remaining_amount_uzs", DESCENDING), ("created_at", ASCENDING)]
    )
    await db.finance_allocation_reversals.create_index("idempotency_key", unique=True, sparse=True)
    await db.finance_invoice_adjustments.create_index("idempotency_key", unique=True)
    await db.finance_invoice_reversals.create_index("idempotency_key", unique=True)
    await db.finance_receipt_reversals.create_index("idempotency_key", unique=True)
    await db.finance_discount_entitlements.create_index("idempotency_key", unique=True, sparse=True)
    await db.finance_discount_entitlements.create_index(
        [("type", ASCENDING), ("referred_student_id", ASCENDING)],
        unique=True,
        name="finance_referral_active_unique",
        partialFilterExpression={"type": "referral", "status": "approved"},
    )
    await db.cash_shifts.create_index("idempotency_key", unique=True)
    await db.cash_shifts.create_index(
        [("cashbox_id", ASCENDING), ("status", ASCENDING)],
        unique=True,
        partialFilterExpression={"status": "open"},
    )
    await db.cash_events.create_index("idempotency_key", unique=True)
    await db.cash_discrepancy_reviews.create_index("idempotency_key", unique=True)


def _session(session) -> dict:
    return {"session": session} if session is not None else {}


def _next_month_due_date(service_month: str, due_day: int = 10) -> str:
    month_start, month_end = month_bounds(service_month)
    next_month = month_end + timedelta(days=1)
    return date(next_month.year, next_month.month, due_day).isoformat()


def _membership_active(
    memberships: Sequence[dict],
    group_id: str,
    lesson_date: str,
    lesson_starts_at: Optional[datetime] = None,
) -> bool:
    def active(row: dict) -> bool:
        if row["group_id"] != group_id:
            return False
        if lesson_starts_at is not None and row.get("effective_from_at") is not None:
            starts_at = lesson_starts_at
            if starts_at.tzinfo is not None:
                starts_at = starts_at.astimezone(timezone.utc).replace(tzinfo=None)
            effective_from_at = row["effective_from_at"]
            if effective_from_at.tzinfo is not None:
                effective_from_at = effective_from_at.astimezone(timezone.utc).replace(tzinfo=None)
            if starts_at < effective_from_at:
                return False
            effective_to_at = row.get("effective_to_at")
            if effective_to_at is not None and effective_to_at.tzinfo is not None:
                effective_to_at = effective_to_at.astimezone(timezone.utc).replace(tzinfo=None)
            return effective_to_at is None or starts_at < effective_to_at
        return (
            row["effective_from"] <= lesson_date
            and (row.get("effective_to") is None or lesson_date < row["effective_to"])
        )
    return any(
        active(row) for row in memberships
    )


def _not_frozen(freeze_periods: Sequence[dict], lesson_date: str) -> bool:
    return not any(
        row["effective_from"] <= lesson_date
        and (row.get("effective_to") is None or lesson_date < row["effective_to"])
        for row in freeze_periods
    )


def _resolve_versioned_policy(rows: Sequence[dict], key: str, on_date: str) -> Optional[dict]:
    eligible = [
        row for row in rows
        if row["policy_key"] == key and row["effective_from"] <= on_date
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda row: (row["effective_from"], row["version"]))


async def _discount_for_student(db, student: dict, service_month: str, session=None) -> tuple:
    breakdown = []
    parent_id = student.get("parent_id")
    if parent_id:
        sibling_rows = await db.students.find({
            "parent_id": parent_id,
            "status": {"$in": ["active", "frozen"]},
        }, {"_id": 1}, **_session(session)).to_list(1_000)
        sibling_ids = [str(row["_id"]) for row in sibling_rows]
        month_start, month_end = month_bounds(service_month)
        active_memberships = []
        if sibling_ids:
            active_memberships = await db.group_memberships.find({
                "student_id": {"$in": sibling_ids},
                "effective_from": {"$lte": month_end.isoformat()},
                "$or": [
                    {"effective_to": None},
                    {"effective_to": {"$gte": month_start.isoformat()}},
                ],
            }, {"student_id": 1}, **_session(session)).to_list(10_000)
        sibling_count = len({row["student_id"] for row in active_memberships})
        if sibling_count >= 2:
            breakdown.append({
                "type": "family",
                "basis_points": 1_000,
                "active_sibling_count": sibling_count,
            })

    entitlements = await db.finance_discount_entitlements.find({
        "student_id": str(student["_id"]),
        "service_month": service_month,
        "status": "approved",
    }, **_session(session)).to_list(1_000)
    referral_entitlement_ids = sorted(
        str(row["_id"]) for row in entitlements if row.get("type") == "referral"
    )
    referral_count = sum(
        int(row.get("qualified_referral_count", 0))
        for row in entitlements if row.get("type") == "referral"
    )
    if referral_count >= 4:
        breakdown.append({
            "type": "referral",
            "basis_points": 10_000,
            "qualified_count": referral_count,
            "entitlement_ids": referral_entitlement_ids,
        })
    elif referral_count:
        breakdown.append({
            "type": "referral",
            "basis_points": referral_count * 1_000,
            "qualified_count": referral_count,
            "entitlement_ids": referral_entitlement_ids,
        })
    for row in entitlements:
        if row.get("type") != "referral":
            breakdown.append({
                "type": row.get("type", "authorized"),
                "basis_points": int(row.get("basis_points", 0)),
                "entitlement_id": str(row["_id"]),
            })
    return capped_discount_basis_points(*(row["basis_points"] for row in breakdown)), breakdown


async def _invoice_inputs(db, service_month: str, branch_id: Optional[str], session=None) -> dict:
    month_start, month_end = month_bounds(service_month)
    occurrence_query = {
        "generation_month": service_month,
        "superseded": {"$ne": True},
    }
    if branch_id is not None:
        occurrence_query["branch_id"] = branch_id
    originals = await db.lesson_occurrences.find(
        occurrence_query, **_session(session)
    ).sort("starts_at", 1).to_list(100_000)
    original_ids = [str(row["_id"]) for row in originals if row.get("counts_as_scheduled")]
    replacements = []
    if original_ids:
        replacements = await db.lesson_occurrences.find({
            "replacement_for_id": {"$in": original_ids},
            "superseded": {"$ne": True},
        }, **_session(session)).sort("starts_at", 1).to_list(100_000)
    occurrences_by_group: Dict[str, List[dict]] = {}
    for row in originals + replacements:
        occurrences_by_group.setdefault(row["group_id"], []).append(row)

    group_ids = list(occurrences_by_group)
    group_versions = []
    if group_ids:
        group_versions = await db.group_finance_versions.find({
            "group_id": {"$in": group_ids},
            "effective_from": {"$lte": month_end.isoformat()},
        }, **_session(session)).to_list(100_000)
    memberships = []
    if group_ids:
        memberships = await db.group_memberships.find({
            "group_id": {"$in": group_ids},
            "effective_from": {"$lte": month_end.isoformat()},
            "$or": [
                {"effective_to": None},
                {"effective_to": {"$gte": month_start.isoformat()}},
            ],
        }, **_session(session)).to_list(100_000)
    student_ids = sorted({row["student_id"] for row in memberships})
    students = []
    if student_ids:
        students = await db.students.find({
            "_id": {"$in": [ObjectId(value) for value in student_ids if ObjectId.is_valid(value)]},
            "status": {"$ne": "archived"},
        }, **_session(session)).to_list(len(student_ids))
    freeze_periods = []
    if student_ids:
        freeze_periods = await db.student_finance_freeze_periods.find({
            "student_id": {"$in": student_ids},
            "effective_from": {"$lte": month_end.isoformat()},
            "$or": [
                {"effective_to": None},
                {"effective_to": {"$gt": month_start.isoformat()}},
            ],
        }, **_session(session)).to_list(100_000)
    policies = await db.finance_policy_versions.find({
        "policy_kind": {"$in": ["tariff", "teacher_share", "billing_rules"]},
        "effective_from": {"$lte": month_end.isoformat()},
    }, **_session(session)).to_list(10_000)
    return {
        "occurrences_by_group": occurrences_by_group,
        "memberships": memberships,
        "students": students,
        "freeze_periods": freeze_periods,
        "policies": policies,
        "group_versions": group_versions,
        "month_start": month_start,
        "month_end": month_end,
    }


def _invoice_source_fingerprint(
    inputs: dict,
    student: dict,
    discount_basis_points: int,
    discount_breakdown: Sequence[dict],
) -> str:
    """Hash every mutable source that can change this student's draft amount."""
    student_id = str(student["_id"])
    memberships = [
        {
            "id": str(row["_id"]),
            "group_id": row["group_id"],
            "effective_from": row["effective_from"],
            "effective_from_at": str(row.get("effective_from_at")),
            "effective_to": row.get("effective_to"),
            "effective_to_at": str(row.get("effective_to_at")),
        }
        for row in inputs["memberships"]
        if row["student_id"] == student_id
    ]
    group_ids = {row["group_id"] for row in memberships}
    occurrences = []
    for group_id in sorted(group_ids):
        for row in inputs["occurrences_by_group"].get(group_id, []):
            occurrences.append({
                "id": str(row["_id"]),
                "revision": int(row.get("revision", 1)),
                "group_id": row["group_id"],
                "local_date": row["local_date"],
                "starts_at": str(row["starts_at"]),
                "ends_at": str(row["ends_at"]),
                "program_code": row["program_code"],
                "group_format": row["group_format"],
                "teacher_id": row.get("teacher_id"),
                "payable_teacher_id": row.get("payable_teacher_id"),
                "resolution_status": row.get("resolution_status"),
                "lesson_status": row.get("lesson_status"),
                "student_billable": row.get("student_billable"),
                "teacher_payable": row.get("teacher_payable"),
                "counts_as_scheduled": row.get("counts_as_scheduled"),
                "replacement_for_id": row.get("replacement_for_id"),
                "replacement_occurrence_id": row.get("replacement_occurrence_id"),
                "superseded": row.get("superseded", False),
            })
    freezes = [
        {
            "id": str(row["_id"]),
            "effective_from": row["effective_from"],
            "effective_to": row.get("effective_to"),
            "source": row.get("source"),
        }
        for row in inputs["freeze_periods"]
        if row["student_id"] == student_id
    ]
    policies = [
        {
            "id": str(row["_id"]),
            "policy_key": row["policy_key"],
            "version": row["version"],
            "effective_from": row["effective_from"],
            "value": row["value"],
        }
        for row in inputs["policies"]
    ]
    group_versions = [
        {
            "id": str(row["_id"]),
            "group_id": row["group_id"],
            "version": row["version"],
            "effective_from": row["effective_from"],
            "program_code": row["program_code"],
            "group_format": row["group_format"],
            "teacher_id": row.get("teacher_id"),
            "schedule": row["schedule"],
        }
        for row in inputs["group_versions"]
        if row["group_id"] in group_ids
    ]
    snapshot = {
        "student_id": student_id,
        "student_status": student.get("status"),
        "parent_id": student.get("parent_id"),
        "memberships": sorted(memberships, key=lambda row: (row["group_id"], row["effective_from"], row["id"])),
        "occurrences": sorted(occurrences, key=lambda row: (row["group_id"], row["starts_at"], row["id"])),
        "freezes": sorted(freezes, key=lambda row: (row["effective_from"], row["id"])),
        "policies": sorted(policies, key=lambda row: (row["policy_key"], row["effective_from"], row["version"])),
        "group_versions": sorted(group_versions, key=lambda row: (row["group_id"], row["effective_from"], row["version"])),
        "discount_basis_points": discount_basis_points,
        "discount_breakdown": list(discount_breakdown),
    }
    canonical = json.dumps(snapshot, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _actual_for_original(original: dict, group_rows: Sequence[dict]) -> Optional[dict]:
    if original.get("lesson_status") == "held" and original.get("resolution_status") == "resolved":
        return original
    replacement_id = original.get("replacement_occurrence_id")
    if replacement_id:
        replacement = next(
            (row for row in group_rows if str(row.get("_id")) == replacement_id), None
        )
        if replacement and replacement.get("lesson_status") == "held" and replacement.get("resolution_status") == "resolved":
            return replacement
    return None


def _expected_group_version(inputs: dict, group_id: str, lesson_date: str) -> Optional[dict]:
    eligible = [
        row for row in inputs["group_versions"]
        if row["group_id"] == group_id and row["effective_from"] <= lesson_date
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda row: (row["effective_from"], row["version"]))


async def generate_draft_invoices(
    db,
    service_month: str,
    branch_id: Optional[str],
    actor_id: str,
) -> dict:
    inputs = await _invoice_inputs(db, service_month, branch_id)
    billing_policy = _resolve_versioned_policy(
        inputs["policies"], "billing:calendar", inputs["month_end"].isoformat()
    )
    if not billing_policy:
        raise ValueError("No billing calendar is configured for the requested month")
    billing_rules = billing_policy["value"]
    memberships_by_student: Dict[str, List[dict]] = {}
    for row in inputs["memberships"]:
        memberships_by_student.setdefault(row["student_id"], []).append(row)
    freezes_by_student: Dict[str, List[dict]] = {}
    for row in inputs["freeze_periods"]:
        freezes_by_student.setdefault(row["student_id"], []).append(row)

    created = 0
    recalculated = 0
    skipped_finalized = 0
    invoices = []
    for student in inputs["students"]:
        student_id = str(student["_id"])
        existing = await db.finance_invoices.find_one(
            {
                "student_id": student_id,
                "service_month": service_month,
                "status": {"$in": ["draft", "finalized"]},
            },
            sort=[("document_sequence", DESCENDING)],
        )
        if existing and existing.get("status") in {"finalized", "reversed"}:
            skipped_finalized += 1
            continue

        generation_run_id = str(ObjectId())
        line_documents = []
        unresolved_keys = []
        gross_tuition = 0
        student_memberships = memberships_by_student.get(student_id, [])
        freeze_periods = freezes_by_student.get(student_id, [])
        student_group_ids = {row["group_id"] for row in student_memberships}
        for group_id in sorted(student_group_ids):
            group_rows = inputs["occurrences_by_group"].get(group_id, [])
            originals = sorted(
                [row for row in group_rows if row.get("counts_as_scheduled")],
                key=lambda row: row["starts_at"],
            )
            if not originals:
                continue
            charge_inputs = []
            metadata = {}
            for original in originals:
                expected_version = _expected_group_version(
                    inputs, group_id, original["local_date"]
                )
                if not expected_version or str(expected_version["_id"]) != original.get("config_version_id"):
                    raise ValueError(
                        f"Lesson calendar for group {group_id} is stale; regenerate {service_month} occurrences"
                    )
                actual = _actual_for_original(original, group_rows)
                if original.get("resolution_status") != "resolved":
                    unresolved_keys.append(original["occurrence_key"])
                if original.get("replacement_occurrence_id") and not actual:
                    unresolved_keys.append(original["occurrence_key"] + ":replacement")
                service_lesson_date = original["local_date"]
                tariff_key = f"tariff:{original['program_code']}:{original['group_format']}"
                tariff = _resolve_versioned_policy(
                    inputs["policies"], tariff_key, service_lesson_date
                )
                if not tariff:
                    raise ValueError(
                        f"No tariff is effective for {tariff_key} on {service_lesson_date}"
                    )
                active_for_student = (
                    actual is not None
                    and _membership_active(
                        student_memberships,
                        group_id,
                        service_lesson_date,
                        original.get("starts_at"),
                    )
                    and _not_frozen(freeze_periods, service_lesson_date)
                    and actual.get("student_billable") is True
                )
                line_key = actual["occurrence_key"] if actual else original["occurrence_key"]
                charge_inputs.append(ChargeInput(
                    key=line_key,
                    monthly_price_uzs=int(tariff["value"]["monthly_price_uzs"]),
                    student_billable=active_for_student,
                ))
                if actual:
                    share_key = f"teacher_share:{actual['group_format']}"
                    share = _resolve_versioned_policy(
                        inputs["policies"], share_key, service_lesson_date
                    )
                    if not share:
                        raise ValueError(
                            f"No teacher share is effective for {share_key} on {service_lesson_date}"
                        )
                    metadata[line_key] = {
                        "actual": actual,
                        "original": original,
                        "tariff": tariff,
                        "teacher_share": share,
                    }
            group_charge = calculate_student_charge(charge_inputs)
            gross_tuition += group_charge.undiscounted_amount_uzs
            for line in group_charge.lines:
                detail = metadata[line.key]
                actual = detail["actual"]
                original = detail["original"]
                line_documents.append({
                    "line_key": f"{group_id}:{line.key}",
                    "group_id": group_id,
                    "student_id": student_id,
                    "occurrence_id": str(actual["_id"]),
                    "billing_slot_occurrence_id": str(original["_id"]),
                    "lesson_date": original["local_date"],
                    "actual_lesson_date": actual["local_date"],
                    "program_code": original["program_code"],
                    "group_format": original["group_format"],
                    "monthly_price_uzs": line.monthly_price_uzs,
                    "scheduled_lesson_denominator": line.denominator,
                    "amount_uzs": line.amount_uzs,
                    "payable_teacher_id": actual.get("payable_teacher_id") or actual.get("teacher_id"),
                    "teacher_share_basis_points": int(detail["teacher_share"]["value"]["basis_points"]),
                    "tariff_policy_version_id": str(detail["tariff"]["_id"]),
                    "teacher_share_policy_version_id": str(detail["teacher_share"]["_id"]),
                })

        discount_bp, discount_breakdown = await _discount_for_student(db, student, service_month)
        source_fingerprint = _invoice_source_fingerprint(
            inputs, student, discount_bp, discount_breakdown
        )
        discount_amount = round_fraction_half_up(Fraction(gross_tuition * discount_bp, 10_000))
        amount_due = gross_tuition - discount_amount
        now = datetime.utcnow()
        invoice_id = existing["_id"] if existing else ObjectId()
        invoice = {
            "_id": invoice_id,
            "student_id": student_id,
            "student_number": student.get("student_id"),
            "parent_id": student.get("parent_id"),
            "branch_id": student.get("branch_id"),
            "service_month": service_month,
            "document_sequence": int(existing.get("document_sequence", 1)) if existing else 1,
            "status": "draft",
            "invoice_number": None,
            "due_date": _next_month_due_date(
                service_month, due_day=int(billing_rules["student_due_day"])
            ),
            "teacher_salary_due_day": int(billing_rules["teacher_salary_due_day"]),
            "billing_policy_version_id": str(billing_policy["_id"]),
            "gross_tuition_uzs": gross_tuition,
            "discount_basis_points": discount_bp,
            "discount_amount_uzs": discount_amount,
            "discount_breakdown": discount_breakdown,
            "calculation_source_fingerprint": source_fingerprint,
            "amount_due_uzs": amount_due,
            "amount_paid_uzs": 0,
            "balance_uzs": amount_due,
            "payment_status": payment_status(amount_due, 0),
            "calculation_ready": not unresolved_keys,
            "unresolved_lesson_keys": sorted(set(unresolved_keys)),
            "current_generation_run_id": generation_run_id,
            "generated_by": actor_id,
            "generated_at": now,
            "updated_at": now,
            "revision": int(existing.get("revision", 0)) + 1 if existing else 1,
        }
        if existing:
            for field in (
                "replaces_invoice_id",
                "teacher_earnings_carried_over",
            ):
                if field in existing:
                    invoice[field] = existing[field]
        for line in line_documents:
            line.update({
                "invoice_id": str(invoice_id),
                "generation_run_id": generation_run_id,
                "invoice_status": "draft",
                "created_at": now,
                "immutable_after_finalization": True,
            })
        if line_documents:
            try:
                await db.finance_invoice_lines.insert_many(line_documents, ordered=True)
            except Exception:
                await db.finance_invoice_lines.delete_many({
                    "invoice_id": str(invoice_id),
                    "generation_run_id": generation_run_id,
                    "invoice_status": "draft",
                })
                raise
        if existing:
            replaced = await db.finance_invoices.replace_one(
                {
                    "_id": invoice_id,
                    "status": "draft",
                    "revision": existing["revision"],
                },
                invoice,
            )
            if replaced.modified_count != 1:
                await db.finance_invoice_lines.delete_many({
                    "invoice_id": str(invoice_id),
                    "generation_run_id": generation_run_id,
                    "invoice_status": "draft",
                })
                raise ValueError(
                    "The draft invoice changed concurrently; reload and recalculate"
                )
            await db.finance_invoice_lines.delete_many({
                "invoice_id": str(invoice_id),
                "generation_run_id": {"$ne": generation_run_id},
                "invoice_status": "draft",
            })
            recalculated += 1
        else:
            try:
                await db.finance_invoices.insert_one(invoice)
            except DuplicateKeyError as exc:
                await db.finance_invoice_lines.delete_many({
                    "invoice_id": str(invoice_id),
                    "generation_run_id": generation_run_id,
                    "invoice_status": "draft",
                })
                raise ValueError("A draft invoice was generated concurrently; reload and recalculate") from exc
            created += 1
        invoices.append(invoice)

    return {
        "service_month": service_month,
        "branch_id": branch_id,
        "created": created,
        "recalculated": recalculated,
        "skipped_finalized": skipped_finalized,
        "invoice_count": len(invoices),
        "not_ready_count": sum(not row["calculation_ready"] for row in invoices),
        "gross_tuition_uzs": sum(row["gross_tuition_uzs"] for row in invoices),
        "discount_amount_uzs": sum(row["discount_amount_uzs"] for row in invoices),
        "amount_due_uzs": sum(row["amount_due_uzs"] for row in invoices),
    }


async def _apply_credit_lots_to_invoice(db, invoice: dict, session) -> tuple:
    remaining_balance = int(invoice["balance_uzs"])
    allocated_total = 0
    if remaining_balance <= 0:
        return 0, []
    lots = await db.finance_credit_lots.find({
        "student_id": invoice["student_id"],
        "status": "active",
        "remaining_amount_uzs": {"$gt": 0},
    }, **_session(session)).sort("created_at", 1).to_list(10_000)
    allocation_ids = []
    for lot in lots:
        if remaining_balance <= 0:
            break
        amount = min(remaining_balance, int(lot["remaining_amount_uzs"]))
        allocation = {
            "invoice_id": str(invoice["_id"]),
            "student_id": invoice["student_id"],
            "source_receipt_id": lot["source_receipt_id"],
            "credit_lot_id": str(lot["_id"]),
            "amount_uzs": amount,
            "active_amount_uzs": amount,
            "allocation_kind": "advance",
            "active": True,
            "created_at": datetime.utcnow(),
        }
        inserted = await db.finance_allocations.insert_one(allocation, **_session(session))
        allocation_ids.append(str(inserted.inserted_id))
        await db.finance_credit_lots.update_one(
            {"_id": lot["_id"], "remaining_amount_uzs": {"$gte": amount}, "status": "active"},
            {"$inc": {"remaining_amount_uzs": -amount}},
            **_session(session),
        )
        remaining_balance -= amount
        allocated_total += amount
    return allocated_total, allocation_ids


async def _finalize_month_transaction(
    db,
    service_month: str,
    branch_id: Optional[str],
    actor_id: str,
    idempotency_key: str,
    session,
) -> dict:
    replay = await db.finance_finalization_runs.find_one(
        {"idempotency_key": idempotency_key}, **_session(session)
    )
    if replay:
        return {**replay["result"], "idempotent_replay": True}
    invoice_query = {"service_month": service_month, "status": "draft"}
    if branch_id is not None:
        invoice_query["branch_id"] = branch_id
    invoices = await db.finance_invoices.find(invoice_query, **_session(session)).to_list(100_000)
    if not invoices:
        raise ValueError("No draft invoices exist for the selected month and branch")
    not_ready = [row for row in invoices if not row.get("calculation_ready")]
    if not_ready:
        raise ValueError("Every scheduled lesson must be resolved before invoice finalization")
    current_inputs = await _invoice_inputs(db, service_month, branch_id, session)
    students_by_id = {str(row["_id"]): row for row in current_inputs["students"]}
    represented_query = {
        "service_month": service_month,
        "status": {"$in": ["draft", "finalized"]},
    }
    if branch_id is not None:
        represented_query["branch_id"] = branch_id
    represented_rows = await db.finance_invoices.find(
        represented_query, **_session(session)
    ).to_list(100_000)
    represented_student_ids = {row["student_id"] for row in represented_rows}
    expected_student_ids = set(students_by_id)
    if represented_student_ids != expected_student_ids:
        raise ValueError(
            "The draft set is stale because enrollment changed; regenerate all drafts before finalization"
        )
    for invoice in invoices:
        student = students_by_id[invoice["student_id"]]
        discount_bp, discount_breakdown = await _discount_for_student(
            db, student, service_month, session
        )
        current_fingerprint = _invoice_source_fingerprint(
            current_inputs, student, discount_bp, discount_breakdown
        )
        if invoice.get("calculation_source_fingerprint") != current_fingerprint:
            raise ValueError(
                "A financial source changed after draft generation; regenerate all drafts before finalization"
            )

    finalized_count = 0
    total_due = 0
    total_advance_applied = 0
    earning_inputs: Dict[tuple, List[tuple]] = {}
    occurrence_ids = set()
    for invoice in invoices:
        generation_run_id = invoice["current_generation_run_id"]
        lines = await db.finance_invoice_lines.find({
            "invoice_id": str(invoice["_id"]),
            "generation_run_id": generation_run_id,
        }, **_session(session)).to_list(100_000)
        sequence = int(invoice.get("document_sequence", 1))
        sequence_suffix = f"-R{sequence}" if sequence > 1 else ""
        invoice_number = (
            f"INV-{service_month.replace('-', '')}-"
            f"{invoice.get('student_number') or str(invoice['_id'])[-6:]}{sequence_suffix}"
        )
        advance_applied, allocation_ids = await _apply_credit_lots_to_invoice(db, invoice, session)
        paid = advance_applied
        balance = max(0, int(invoice["amount_due_uzs"]) - paid)
        now = datetime.utcnow()
        result = await db.finance_invoices.update_one(
            {"_id": invoice["_id"], "status": "draft", "revision": invoice["revision"]},
            {"$set": {
                "status": "finalized",
                "invoice_number": invoice_number,
                "amount_paid_uzs": paid,
                "balance_uzs": balance,
                "payment_status": payment_status(int(invoice["amount_due_uzs"]), paid),
                "finalized_by": actor_id,
                "finalized_at": now,
                "advance_allocation_ids": allocation_ids,
            }, "$inc": {"revision": 1}},
            **_session(session),
        )
        if result.modified_count != 1:
            raise ValueError("An invoice changed concurrently; no invoices were finalized")
        await db.finance_invoice_lines.update_many(
            {"invoice_id": str(invoice["_id"]), "generation_run_id": generation_run_id},
            {"$set": {"invoice_status": "finalized", "finalized_at": now}},
            **_session(session),
        )
        for line in lines:
            occurrence_ids.add(ObjectId(line["occurrence_id"]))
            occurrence_ids.add(ObjectId(line["billing_slot_occurrence_id"]))
            if invoice.get("teacher_earnings_carried_over"):
                continue
            teacher_id = line.get("payable_teacher_id")
            if teacher_id:
                earning_key = (teacher_id, invoice.get("branch_id"))
                earning_inputs.setdefault(earning_key, []).append((
                    int(line["amount_uzs"]), int(line["teacher_share_basis_points"]), str(line["_id"])
                ))
        finalized_count += 1
        total_due += int(invoice["amount_due_uzs"])
        total_advance_applied += advance_applied

    now = datetime.utcnow()
    if occurrence_ids:
        await db.lesson_occurrences.update_many(
            {"_id": {"$in": list(occurrence_ids)}, "locked_at": None},
            {"$set": {"locked_at": now, "locked_by_finalization": idempotency_key}},
            **_session(session),
        )

    for (teacher_id, earning_branch_id), items in earning_inputs.items():
        exact = sum((Fraction(amount * basis_points, 10_000) for amount, basis_points, _ in items), Fraction(0))
        earning = {
            "teacher_id": teacher_id,
            "service_month": service_month,
            "branch_id": earning_branch_id,
            "gross_tuition_basis_uzs": sum(item[0] for item in items),
            "earned_amount_uzs": round_fraction_half_up(exact),
            "paid_amount_uzs": 0,
            "outstanding_amount_uzs": round_fraction_half_up(exact),
            "status": "unpaid",
            "due_date": _next_month_due_date(
                service_month,
                due_day=int(invoices[0].get("teacher_salary_due_day", 5)),
            ),
            "invoice_line_ids": [item[2] for item in items],
            "created_at": now,
            "finalization_idempotency_key": idempotency_key,
            "immutable_earning_basis": True,
        }
        try:
            await db.teacher_earnings.insert_one(earning, **_session(session))
        except DuplicateKeyError as exc:
            raise ValueError("Teacher earnings already exist for this finalized month") from exc

    result = {
        "service_month": service_month,
        "branch_id": branch_id,
        "finalized_invoice_count": finalized_count,
        "amount_due_uzs": total_due,
        "advance_applied_uzs": total_advance_applied,
        "teacher_count": len(earning_inputs),
        "idempotent_replay": False,
    }
    await db.finance_finalization_runs.insert_one({
        "idempotency_key": idempotency_key,
        "service_month": service_month,
        "branch_id": branch_id,
        "created_by": actor_id,
        "created_at": now,
        "result": result,
        "immutable": True,
    }, **_session(session))
    return result


async def finalize_invoice_month(
    db,
    service_month: str,
    branch_id: Optional[str],
    actor_id: str,
    idempotency_key: str,
) -> dict:
    """Finalize the whole month atomically; fail closed without transactions."""
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                return await _finalize_month_transaction(
                    db, service_month, branch_id, actor_id, idempotency_key, session
                )
    except OperationFailure as exc:
        raise RuntimeError(
            "Financial finalization requires MongoDB transaction support; nothing was finalized"
        ) from exc


async def _release_invoice_allocations(
    db,
    invoice_id: str,
    amount_to_release_uzs: Optional[int],
    operation_key: str,
    actor_id: str,
    session,
    source_receipt_id: Optional[str] = None,
) -> int:
    """Release newest allocations back to their source credit lots."""
    query = {"invoice_id": invoice_id, "active": True}
    if source_receipt_id is not None:
        query["source_receipt_id"] = source_receipt_id
    allocations = await db.finance_allocations.find(
        query, **_session(session)
    ).sort("created_at", -1).to_list(100_000)
    target = amount_to_release_uzs
    released_total = 0
    for allocation in allocations:
        if target is not None and released_total >= target:
            break
        active_amount = int(allocation.get("active_amount_uzs", allocation["amount_uzs"]))
        if active_amount <= 0:
            continue
        release_amount = active_amount
        if target is not None:
            release_amount = min(release_amount, target - released_total)
        remaining_active = active_amount - release_amount
        reversal_key = f"{operation_key}:{allocation['_id']}:{release_amount}"
        await db.finance_allocation_reversals.insert_one({
            "allocation_id": str(allocation["_id"]),
            "invoice_id": invoice_id,
            "source_receipt_id": allocation["source_receipt_id"],
            "amount_uzs": release_amount,
            "idempotency_key": reversal_key,
            "operation_key": operation_key,
            "created_by": actor_id,
            "created_at": datetime.utcnow(),
            "immutable": True,
        }, **_session(session))
        await db.finance_allocations.update_one(
            {"_id": allocation["_id"], "active": True},
            {"$set": {
                "active": remaining_active > 0,
                "active_amount_uzs": remaining_active,
                "last_reversal_key": reversal_key,
            }},
            **_session(session),
        )
        await db.finance_credit_lots.update_one(
            {"_id": ObjectId(allocation["credit_lot_id"]), "status": "active"},
            {"$inc": {"remaining_amount_uzs": release_amount}},
            **_session(session),
        )
        released_total += release_amount
    if target is not None and released_total != target:
        raise ValueError("Allocated payment could not be released exactly")
    return released_total


async def adjust_finalized_invoice(
    db,
    invoice: dict,
    kind: str,
    amount_uzs: int,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_invoice_adjustments.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    stored = await db.finance_invoices.find_one(
                        {"_id": ObjectId(replay["invoice_id"])}, **_session(session)
                    )
                    return {"adjustment": replay, "invoice": stored, "idempotent_replay": True}
                stored = await db.finance_invoices.find_one(
                    {"_id": invoice["_id"], "status": "finalized"}, **_session(session)
                )
                if not stored:
                    raise ValueError("Only a current finalized invoice can be adjusted")
                adjustment_id = ObjectId()
                old_due = int(stored["amount_due_uzs"])
                old_paid = int(stored["amount_paid_uzs"])
                debit_total = int(stored.get("debit_adjustments_uzs", 0))
                credit_total = int(stored.get("credit_adjustments_uzs", 0))
                if kind == "debit":
                    new_due = old_due + amount_uzs
                    debit_total += amount_uzs
                    paid = old_paid
                    balance = new_due - paid
                else:
                    if amount_uzs > old_due:
                        raise ValueError("A credit adjustment cannot exceed the invoice amount due")
                    new_due = max(0, old_due - amount_uzs)
                    credit_total += amount_uzs
                    excess_allocation = max(0, old_paid - new_due)
                    released = 0
                    if excess_allocation:
                        released = await _release_invoice_allocations(
                            db,
                            str(stored["_id"]),
                            excess_allocation,
                            f"invoice-adjustment:{adjustment_id}",
                            str(actor["_id"]),
                            session,
                        )
                    paid = old_paid - released
                    balance = max(0, new_due - paid)

                adjustment = {
                    "_id": adjustment_id,
                    "invoice_id": str(stored["_id"]),
                    "student_id": stored["student_id"],
                    "kind": kind,
                    "amount_uzs": amount_uzs,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": datetime.utcnow(),
                    "immutable": True,
                    "teacher_earnings_affected": False,
                }
                await db.finance_invoice_adjustments.insert_one(adjustment, **_session(session))
                update = {
                    "amount_due_uzs": new_due,
                    "debit_adjustments_uzs": debit_total,
                    "credit_adjustments_uzs": credit_total,
                    "amount_paid_uzs": paid,
                    "balance_uzs": balance,
                    "payment_status": payment_status(new_due, paid),
                    "last_adjustment_id": str(adjustment_id),
                }
                await db.finance_invoices.update_one(
                    {"_id": stored["_id"], "status": "finalized"},
                    {"$set": update, "$inc": {"revision": 1}},
                    **_session(session),
                )
                updated = {**stored, **update}
                if kind == "debit" and balance:
                    advance_applied, _ = await _apply_credit_lots_to_invoice(db, updated, session)
                    if advance_applied:
                        paid += advance_applied
                        balance -= advance_applied
                        await db.finance_invoices.update_one(
                            {"_id": stored["_id"], "status": "finalized"},
                            {"$set": {
                                "amount_paid_uzs": paid,
                                "balance_uzs": balance,
                                "payment_status": payment_status(new_due, paid),
                            }, "$inc": {"revision": 1}},
                            **_session(session),
                        )
                        updated.update({
                            "amount_paid_uzs": paid,
                            "balance_uzs": balance,
                            "payment_status": payment_status(new_due, paid),
                        })
                return {"adjustment": adjustment, "invoice": updated, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError("Invoice adjustment requires MongoDB transaction support; nothing was changed") from exc


async def reverse_invoice_and_create_replacement(
    db,
    invoice: dict,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_invoice_reversals.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    replacement = await db.finance_invoices.find_one(
                        {"_id": ObjectId(replay["replacement_invoice_id"])}, **_session(session)
                    )
                    return {"reversal": replay, "replacement": replacement, "idempotent_replay": True}
                original = await db.finance_invoices.find_one(
                    {"_id": invoice["_id"], "status": "finalized"}, **_session(session)
                )
                if not original:
                    raise ValueError("Only a current finalized invoice can be reversed")
                replacement_id = ObjectId()
                replacement_run_id = str(ObjectId())
                await _release_invoice_allocations(
                    db,
                    str(original["_id"]),
                    None,
                    f"invoice-reversal:{idempotency_key}",
                    str(actor["_id"]),
                    session,
                )
                now = datetime.utcnow()
                await db.finance_invoices.update_one(
                    {"_id": original["_id"], "status": "finalized"},
                    {"$set": {
                        "status": "reversed",
                        "balance_uzs": 0,
                        "payment_status": "reversed",
                        "reversed_at": now,
                        "reversed_by": str(actor["_id"]),
                    }, "$inc": {"revision": 1}},
                    **_session(session),
                )
                await db.finance_invoice_lines.update_many(
                    {
                        "invoice_id": str(original["_id"]),
                        "generation_run_id": original["current_generation_run_id"],
                    },
                    {"$set": {"invoice_status": "reversed", "reversed_at": now}},
                    **_session(session),
                )
                replacement = {
                    **{key: value for key, value in original.items() if key != "_id"},
                    "_id": replacement_id,
                    "document_sequence": int(original.get("document_sequence", 1)) + 1,
                    "status": "draft",
                    "invoice_number": None,
                    "amount_paid_uzs": 0,
                    "balance_uzs": int(original["amount_due_uzs"]),
                    "payment_status": payment_status(int(original["amount_due_uzs"]), 0),
                    "current_generation_run_id": replacement_run_id,
                    "replaces_invoice_id": str(original["_id"]),
                    "teacher_earnings_carried_over": True,
                    "generated_by": str(actor["_id"]),
                    "generated_at": now,
                    "updated_at": now,
                    "revision": 1,
                }
                for field in (
                    "finalized_by", "finalized_at", "reversed_at", "reversed_by",
                    "advance_allocation_ids",
                ):
                    replacement.pop(field, None)
                await db.finance_invoices.insert_one(replacement, **_session(session))
                lines = await db.finance_invoice_lines.find({
                    "invoice_id": str(original["_id"]),
                    "generation_run_id": original["current_generation_run_id"],
                }, **_session(session)).to_list(100_000)
                replacement_lines = []
                for line in lines:
                    clone = {key: value for key, value in line.items() if key != "_id"}
                    clone.update({
                        "invoice_id": str(replacement_id),
                        "generation_run_id": replacement_run_id,
                        "invoice_status": "draft",
                        "created_at": now,
                        "copied_from_invoice_line_id": str(line["_id"]),
                    })
                    clone.pop("finalized_at", None)
                    clone.pop("reversed_at", None)
                    replacement_lines.append(clone)
                if replacement_lines:
                    await db.finance_invoice_lines.insert_many(replacement_lines, **_session(session))
                reversal = {
                    "invoice_id": str(original["_id"]),
                    "replacement_invoice_id": str(replacement_id),
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                    "teacher_earnings_carried_to_replacement": True,
                }
                result = await db.finance_invoice_reversals.insert_one(reversal, **_session(session))
                reversal["_id"] = result.inserted_id
                return {"reversal": reversal, "replacement": replacement, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError("Invoice reversal requires MongoDB transaction support; nothing was changed") from exc


async def reverse_cash_receipt(
    db,
    receipt: dict,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_receipt_reversals.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return {"reversal": replay, "idempotent_replay": True}
                stored = await db.finance_receipts.find_one(
                    {"_id": receipt["_id"], "status": "posted"}, **_session(session)
                )
                if not stored:
                    raise ValueError("Only a posted receipt can be reversed")
                shift = await db.cash_shifts.find_one(
                    {"_id": ObjectId(stored["cash_shift_id"])}, **_session(session)
                )
                if not shift:
                    raise ValueError("The receipt cash shift no longer exists")
                receipt_amount = int(stored["amount_uzs"])
                if int(shift.get("receipt_total_uzs", 0)) < receipt_amount:
                    raise ValueError("Receipt reversal totals are inconsistent")
                allocations = await db.finance_allocations.find({
                    "source_receipt_id": str(stored["_id"]), "active": True,
                }, **_session(session)).to_list(100_000)
                released_by_invoice = {}
                for allocation in allocations:
                    amount = int(allocation.get("active_amount_uzs", allocation["amount_uzs"]))
                    if amount:
                        released_by_invoice[allocation["invoice_id"]] = (
                            released_by_invoice.get(allocation["invoice_id"], 0) + amount
                        )
                for invoice_id, amount in released_by_invoice.items():
                    await _release_invoice_allocations(
                        db,
                        invoice_id,
                        amount,
                        f"receipt-reversal:{idempotency_key}:{invoice_id}",
                        str(actor["_id"]),
                        session,
                        source_receipt_id=str(stored["_id"]),
                    )
                    invoice = await db.finance_invoices.find_one(
                        {"_id": ObjectId(invoice_id)}, **_session(session)
                    )
                    new_paid = max(0, int(invoice["amount_paid_uzs"]) - amount)
                    new_balance = max(0, int(invoice["amount_due_uzs"]) - new_paid)
                    await db.finance_invoices.update_one(
                        {"_id": invoice["_id"]},
                        {"$set": {
                            "amount_paid_uzs": new_paid,
                            "balance_uzs": new_balance,
                            "payment_status": payment_status(int(invoice["amount_due_uzs"]), new_paid),
                        }, "$inc": {"revision": 1}},
                        **_session(session),
                    )
                await db.finance_credit_lots.update_one(
                    {"source_receipt_id": str(stored["_id"])},
                    {"$set": {"status": "reversed", "remaining_amount_uzs": 0}},
                    **_session(session),
                )
                now = datetime.utcnow()
                referral_entitlement = await db.finance_discount_entitlements.find_one(
                    {
                        "type": "referral",
                        "source_receipt_id": str(stored["_id"]),
                        "status": "approved",
                    },
                    **_session(session),
                )
                if referral_entitlement:
                    another_payment = await db.finance_receipts.find_one(
                        {
                            "student_id": stored["student_id"],
                            "status": "posted",
                            "_id": {"$ne": stored["_id"]},
                        },
                        sort=[("received_at", ASCENDING), ("_id", ASCENDING)],
                        **_session(session),
                    )
                    if another_payment:
                        rebound_local = another_payment["received_at"].replace(
                            tzinfo=ZoneInfo("UTC")
                        ).astimezone(ZoneInfo(ACADEMY_TIMEZONE))
                        await db.finance_discount_entitlements.update_one(
                            {"_id": referral_entitlement["_id"], "status": "approved"},
                            {"$set": {
                                "source_receipt_id": str(another_payment["_id"]),
                                "service_month": rebound_local.strftime("%Y-%m"),
                                "qualification_rebound_at": now,
                                "qualification_rebound_by": str(actor["_id"]),
                            }},
                            **_session(session),
                        )
                    else:
                        await db.finance_discount_entitlements.update_one(
                            {"_id": referral_entitlement["_id"], "status": "approved"},
                            {"$set": {
                                "status": "reversed",
                                "reversed_at": now,
                                "reversed_by": str(actor["_id"]),
                                "reversal_reason": "Qualifying first payment was reversed",
                            }},
                            **_session(session),
                        )
                await db.finance_receipts.update_one(
                    {"_id": stored["_id"], "status": "posted"},
                    {"$set": {
                        "status": "reversed",
                        "reversed_at": now,
                        "reversed_by": str(actor["_id"]),
                    }},
                    **_session(session),
                )
                shift_set = {"post_close_corrected_at": now} if shift.get("status") == "closed" else {}
                if shift.get("status") == "closed":
                    corrected_expected = int(shift["expected_closing_balance_uzs"]) - receipt_amount
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
                        "$inc": {"receipt_total_uzs": -receipt_amount},
                        **({"$set": shift_set} if shift_set else {}),
                    },
                    **_session(session),
                )
                if shift_update.modified_count != 1:
                    raise ValueError("The cash shift changed concurrently")
                await db.cash_events.insert_one({
                    "cash_shift_id": stored["cash_shift_id"],
                    "event_type": "receipt_reversal",
                    "amount_uzs": -int(stored["amount_uzs"]),
                    "source_id": str(stored["_id"]),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }, **_session(session))
                reversal = {
                    "receipt_id": str(stored["_id"]),
                    "reason": reason,
                    "amount_uzs": int(stored["amount_uzs"]),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_receipt_reversals.insert_one(
                    reversal, **_session(session)
                )
                reversal["_id"] = inserted.inserted_id
                return {"reversal": reversal, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError("Receipt reversal requires MongoDB transaction support; nothing was changed") from exc


async def open_cash_shift(db, opening_balance_uzs: int, notes: Optional[str], idempotency_key: str, actor: dict) -> dict:
    replay = await db.cash_shifts.find_one({"idempotency_key": idempotency_key})
    if replay:
        return replay
    document = {
        "cashbox_id": "main",
        "status": "open",
        "operator_id": str(actor["_id"]),
        "operator_role": actor["role"],
        "branch_id": actor.get("branch_id"),
        "opening_balance_uzs": opening_balance_uzs,
        "notes": notes,
        "idempotency_key": idempotency_key,
        "opened_at": datetime.utcnow(),
        "receipt_total_uzs": 0,
        "removal_total_uzs": 0,
    }
    try:
        result = await db.cash_shifts.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("The cashbox already has an open shift") from exc
    document["_id"] = result.inserted_id
    return document


async def record_cash_receipt(
    db,
    student: dict,
    shift: dict,
    amount_uzs: int,
    notes: Optional[str],
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_receipts.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return {"receipt": replay, "idempotent_replay": True}
                stored_shift = await db.cash_shifts.find_one(
                    {"_id": shift["_id"], "status": "open"}, **_session(session)
                )
                if not stored_shift:
                    raise ValueError("The selected cash shift is not open")
                if actor["role"] == "reception" and stored_shift["operator_id"] != str(actor["_id"]):
                    raise ValueError("Reception can only record cash in its own open shift")

                counter = await db.counters.find_one_and_update(
                    {"_id": "finance_receipt_number"},
                    {"$inc": {"seq": 1}},
                    upsert=True,
                    return_document=ReturnDocument.AFTER,
                    **_session(session),
                )
                receipt_id = ObjectId()
                receipt_number = f"RCP-{datetime.utcnow().strftime('%Y%m%d')}-{counter['seq']:06d}"
                invoice_rows = await db.finance_invoices.find({
                    "student_id": str(student["_id"]),
                    "status": "finalized",
                    "balance_uzs": {"$gt": 0},
                }, **_session(session)).sort([("due_date", 1), ("invoice_number", 1)]).to_list(10_000)
                debts = [{
                    "id": str(row["_id"]),
                    "invoice_number": row["invoice_number"],
                    "due_date": row["due_date"],
                    "balance_uzs": row["balance_uzs"],
                } for row in invoice_rows]
                allocations, advance = allocate_oldest_debts(amount_uzs, debts)
                receipt = {
                    "_id": receipt_id,
                    "receipt_number": receipt_number,
                    "student_id": str(student["_id"]),
                    "amount_uzs": amount_uzs,
                    "payment_method": "cash",
                    "status": "posted",
                    "cash_shift_id": str(shift["_id"]),
                    "branch_id": student.get("branch_id"),
                    "received_by": str(actor["_id"]),
                    "received_role": actor["role"],
                    "received_at": datetime.utcnow(),
                    "notes": notes,
                    "idempotency_key": idempotency_key,
                    "allocated_amount_uzs": amount_uzs - advance,
                    "advance_amount_uzs": advance,
                    "immutable": True,
                }
                await db.finance_receipts.insert_one(receipt, **_session(session))
                referrer_id = student.get("referred_by_student_id")
                if referrer_id and referrer_id != str(student["_id"]):
                    referrer = None
                    if ObjectId.is_valid(referrer_id):
                        referrer = await db.students.find_one(
                            {
                                "_id": ObjectId(referrer_id),
                                "status": {"$ne": "archived"},
                            },
                            **_session(session),
                        )
                    existing_referral = await db.finance_discount_entitlements.find_one(
                        {
                            "type": "referral",
                            "referred_student_id": str(student["_id"]),
                            "status": "approved",
                        },
                        **_session(session),
                    )
                    if referrer and not existing_referral:
                        qualified_local = receipt["received_at"].replace(
                            tzinfo=ZoneInfo("UTC")
                        ).astimezone(ZoneInfo(ACADEMY_TIMEZONE))
                        await db.finance_discount_entitlements.insert_one({
                            "type": "referral",
                            "student_id": str(referrer["_id"]),
                            "referred_student_id": str(student["_id"]),
                            "service_month": qualified_local.strftime("%Y-%m"),
                            "basis_points": 1_000,
                            "qualified_referral_count": 1,
                            "qualification": "referred_student_first_payment",
                            "source_receipt_id": str(receipt_id),
                            "status": "approved",
                            "idempotency_key": f"referral-first-payment:{student['_id']}",
                            "created_at": receipt["received_at"],
                            "created_by": str(actor["_id"]),
                            "immutable_qualification": True,
                        }, **_session(session))
                credit_lot = {
                    "student_id": str(student["_id"]),
                    "branch_id": student.get("branch_id"),
                    "source_receipt_id": str(receipt_id),
                    "original_amount_uzs": amount_uzs,
                    "remaining_amount_uzs": advance,
                    "status": "active",
                    "created_at": receipt["received_at"],
                }
                lot_result = await db.finance_credit_lots.insert_one(credit_lot, **_session(session))
                await db.cash_events.insert_one({
                    "cash_shift_id": str(shift["_id"]),
                    "event_type": "student_receipt",
                    "amount_uzs": amount_uzs,
                    "source_id": str(receipt_id),
                    "idempotency_key": idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": receipt["received_at"],
                    "immutable": True,
                }, **_session(session))
                for allocation_row in allocations:
                    invoice = next(row for row in invoice_rows if str(row["_id"]) == allocation_row["invoice_id"])
                    amount = allocation_row["amount_uzs"]
                    await db.finance_allocations.insert_one({
                        "invoice_id": str(invoice["_id"]),
                        "student_id": str(student["_id"]),
                        "source_receipt_id": str(receipt_id),
                        "credit_lot_id": str(lot_result.inserted_id),
                        "amount_uzs": amount,
                        "active_amount_uzs": amount,
                        "allocation_kind": "receipt",
                        "active": True,
                        "created_at": receipt["received_at"],
                    }, **_session(session))
                    new_paid = int(invoice["amount_paid_uzs"]) + amount
                    new_balance = max(0, int(invoice["amount_due_uzs"]) - new_paid)
                    await db.finance_invoices.update_one(
                        {"_id": invoice["_id"], "status": "finalized"},
                        {"$set": {
                            "amount_paid_uzs": new_paid,
                            "balance_uzs": new_balance,
                            "payment_status": payment_status(int(invoice["amount_due_uzs"]), new_paid),
                        }, "$inc": {"revision": 1}},
                        **_session(session),
                    )
                shift_update = await db.cash_shifts.update_one(
                    {"_id": shift["_id"], "status": "open"},
                    {"$inc": {"receipt_total_uzs": amount_uzs}},
                    **_session(session),
                )
                if shift_update.modified_count != 1:
                    raise ValueError("The cash shift changed concurrently")
                return {
                    "receipt": receipt,
                    "allocations": list(allocations),
                    "advance_amount_uzs": advance,
                    "idempotent_replay": False,
                }
    except OperationFailure as exc:
        raise RuntimeError("Cash receipt posting requires MongoDB transaction support; nothing was recorded") from exc


async def add_cash_removal(db, shift: dict, amount_uzs: int, purpose: str, idempotency_key: str, actor: dict) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.cash_events.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return replay
                stored_shift = await db.cash_shifts.find_one(
                    {"_id": shift["_id"], "status": "open"}, **_session(session)
                )
                if not stored_shift:
                    raise ValueError("Cash can only be removed from an open shift")
                available_cash = (
                    int(stored_shift["opening_balance_uzs"])
                    + int(stored_shift.get("receipt_total_uzs", 0))
                    + int(stored_shift.get("other_income_total_uzs", 0))
                    - int(stored_shift.get("removal_total_uzs", 0))
                )
                if amount_uzs > available_cash:
                    raise ValueError("Cash removal exceeds the amount physically available in the cashbox")
                event = {
                    "cash_shift_id": str(stored_shift["_id"]),
                    "event_type": "authorized_removal",
                    "amount_uzs": amount_uzs,
                    "purpose": purpose,
                    "authorized_by": str(actor["_id"]),
                    "created_at": datetime.utcnow(),
                    "idempotency_key": idempotency_key,
                    "immutable": True,
                }
                result = await db.cash_events.insert_one(event, **_session(session))
                event["_id"] = result.inserted_id
                update = await db.cash_shifts.update_one(
                    {"_id": stored_shift["_id"], "status": "open"},
                    {"$inc": {"removal_total_uzs": amount_uzs}},
                    **_session(session),
                )
                if update.modified_count != 1:
                    raise ValueError("The cash shift changed concurrently")
                return event
    except OperationFailure as exc:
        raise RuntimeError(
            "Cash removal requires MongoDB transaction support; nothing was recorded"
        ) from exc


async def close_cash_shift(
    db,
    shift: dict,
    actual_closing_balance_uzs: int,
    notes: Optional[str],
    idempotency_key: str,
    actor: dict,
) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.cash_events.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    return await db.cash_shifts.find_one(
                        {"_id": ObjectId(replay["cash_shift_id"])}, **_session(session)
                    )
                stored_shift = await db.cash_shifts.find_one(
                    {"_id": shift["_id"], "status": "open"}, **_session(session)
                )
                if not stored_shift:
                    raise ValueError("Cash shift is already closed")
                if (
                    actor["role"] == "reception"
                    and stored_shift["operator_id"] != str(actor["_id"])
                ):
                    raise ValueError("Reception can only close its own cash shift")
                expected = (
                    int(stored_shift["opening_balance_uzs"])
                    + int(stored_shift.get("receipt_total_uzs", 0))
                    + int(stored_shift.get("other_income_total_uzs", 0))
                    - int(stored_shift.get("removal_total_uzs", 0))
                )
                discrepancy = actual_closing_balance_uzs - expected
                close_event = {
                    "cash_shift_id": str(stored_shift["_id"]),
                    "event_type": "close",
                    "amount_uzs": actual_closing_balance_uzs,
                    "expected_balance_uzs": expected,
                    "discrepancy_uzs": discrepancy,
                    "notes": notes,
                    "created_by": str(actor["_id"]),
                    "created_at": datetime.utcnow(),
                    "idempotency_key": idempotency_key,
                    "immutable": True,
                }
                inserted = await db.cash_events.insert_one(
                    close_event, **_session(session)
                )
                result = await db.cash_shifts.update_one(
                    {"_id": stored_shift["_id"], "status": "open"},
                    {"$set": {
                        "status": "closed",
                        "expected_closing_balance_uzs": expected,
                        "actual_closing_balance_uzs": actual_closing_balance_uzs,
                        "discrepancy_uzs": discrepancy,
                        "discrepancy_status": "pending_review" if discrepancy else "balanced",
                        "closed_by": str(actor["_id"]),
                        "closed_at": close_event["created_at"],
                        "close_event_id": str(inserted.inserted_id),
                    }},
                    **_session(session),
                )
                if result.modified_count != 1:
                    raise ValueError("Cash shift changed concurrently; reload before closing")
                return await db.cash_shifts.find_one(
                    {"_id": stored_shift["_id"]}, **_session(session)
                )
    except OperationFailure as exc:
        raise RuntimeError(
            "Closing a cash shift requires MongoDB transaction support; nothing was recorded"
        ) from exc


async def review_cash_discrepancy(
    db,
    shift: dict,
    accepted: bool,
    reason: str,
    idempotency_key: str,
    actor: dict,
) -> dict:
    """Record a super-admin decision without rewriting the physical cash count."""
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.cash_discrepancy_reviews.find_one(
                    {"idempotency_key": idempotency_key}, **_session(session)
                )
                if replay:
                    stored = await db.cash_shifts.find_one(
                        {"_id": ObjectId(replay["cash_shift_id"])}, **_session(session)
                    )
                    return {"review": replay, "shift": stored, "idempotent_replay": True}
                stored = await db.cash_shifts.find_one(
                    {"_id": shift["_id"], "status": "closed"}, **_session(session)
                )
                if not stored:
                    raise ValueError("Only a closed cash shift can be reviewed")
                if not int(stored.get("discrepancy_uzs", 0)):
                    raise ValueError("This cash shift has no discrepancy")
                if stored.get("discrepancy_status") != "pending_review":
                    raise ValueError("This cash discrepancy was already reviewed")
                now = datetime.utcnow()
                review = {
                    "cash_shift_id": str(stored["_id"]),
                    "discrepancy_uzs": int(stored["discrepancy_uzs"]),
                    "accepted": accepted,
                    "reason": reason,
                    "idempotency_key": idempotency_key,
                    "reviewed_by": str(actor["_id"]),
                    "reviewed_at": now,
                    "immutable": True,
                }
                inserted = await db.cash_discrepancy_reviews.insert_one(
                    review, **_session(session)
                )
                review["_id"] = inserted.inserted_id
                result = await db.cash_shifts.update_one(
                    {
                        "_id": stored["_id"],
                        "discrepancy_status": "pending_review",
                    },
                    {"$set": {
                        "discrepancy_status": (
                            "accepted" if accepted else "investigation_required"
                        ),
                        "discrepancy_review_id": str(inserted.inserted_id),
                        "discrepancy_reviewed_at": now,
                        "discrepancy_reviewed_by": str(actor["_id"]),
                    }},
                    **_session(session),
                )
                if result.modified_count != 1:
                    raise ValueError("The cash discrepancy changed concurrently")
                stored.update({
                    "discrepancy_status": (
                        "accepted" if accepted else "investigation_required"
                    ),
                    "discrepancy_review_id": str(inserted.inserted_id),
                })
                return {"review": review, "shift": stored, "idempotent_replay": False}
    except OperationFailure as exc:
        raise RuntimeError(
            "Cash discrepancy review requires MongoDB transaction support; nothing was changed"
        ) from exc
