"""Persistence services for versioned finance configuration and lessons."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Sequence
from zoneinfo import ZoneInfo

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from finance_domain import (
    build_occurrence_blueprints,
    closure_applies,
    enrollment_format_transition,
    month_bounds,
    validate_manual_format_change,
    validate_schedule_no_overlaps,
)
from finance_models import (
    ACADEMY_TIMEZONE,
    ClosureCreate,
    GroupFinanceVersionCreate,
    GroupFormat,
    LessonResolution,
    LessonResolutionCreate,
    LessonExceptionApproval,
    ProgramCode,
    ReplacementLessonCreate,
    RecurringExpenseVersionCreate,
    BillingRulesVersionCreate,
    TariffVersionCreate,
    TeacherShareVersionCreate,
)


DEFAULT_EFFECTIVE_FROM = "2025-01-01"


def _default_policy_documents() -> List[dict]:
    tariff_values = {
        (ProgramCode.GENERAL, GroupFormat.NORMAL): 450_000,
        (ProgramCode.IELTS, GroupFormat.NORMAL): 550_000,
        (ProgramCode.PRE_IELTS, GroupFormat.NORMAL): 550_000,
        (ProgramCode.GENERAL, GroupFormat.MINI): 650_000,
        (ProgramCode.IELTS, GroupFormat.MINI): 750_000,
        (ProgramCode.PRE_IELTS, GroupFormat.MINI): 750_000,
        (ProgramCode.GENERAL, GroupFormat.INDIVIDUAL): 1_200_000,
        (ProgramCode.IELTS, GroupFormat.INDIVIDUAL): 1_400_000,
        (ProgramCode.PRE_IELTS, GroupFormat.INDIVIDUAL): 1_400_000,
    }
    documents = []
    for (program, group_format), amount in tariff_values.items():
        key = f"tariff:{program.value}:{group_format.value}"
        documents.append({
            "seed_key": f"default:{key}:v1",
            "policy_kind": "tariff",
            "policy_key": key,
            "version": 1,
            "effective_from": DEFAULT_EFFECTIVE_FROM,
            "value": {
                "program_code": program.value,
                "group_format": group_format.value,
                "monthly_price_uzs": amount,
                "currency": "UZS",
            },
            "reason": "Approved initial tuition tariff",
        })

    for group_format, basis_points in {
        GroupFormat.NORMAL: 4_000,
        GroupFormat.MINI: 4_000,
        GroupFormat.INDIVIDUAL: 5_000,
    }.items():
        key = f"teacher_share:{group_format.value}"
        documents.append({
            "seed_key": f"default:{key}:v1",
            "policy_kind": "teacher_share",
            "policy_key": key,
            "version": 1,
            "effective_from": DEFAULT_EFFECTIVE_FROM,
            "value": {
                "group_format": group_format.value,
                "basis_points": basis_points,
            },
            "reason": "Approved initial teacher revenue share",
        })

    fixed = [
        ("billing_rules", "billing:calendar", {
            "invoice_draft_day": 1,
            "invoice_finalization_day": 1,
            "student_due_day": 10,
            "freeze_day": 11,
            "teacher_salary_due_day": 5,
            "timezone": ACADEMY_TIMEZONE,
            "currency": "UZS",
            "operation_mode": "shadow",
            "automatic_freeze_enabled": False,
            "mandatory_financial_notifications": True,
        }),
        ("discount", "discount:family", {
            "basis_points": 1_000,
            "minimum_active_siblings": 2,
            "teacher_share_uses_undiscounted_tuition": True,
        }),
        ("discount", "discount:referral", {
            "basis_points_per_qualified_referral": 1_000,
            "free_month_qualified_referrals": 4,
            "maximum_basis_points": 10_000,
            "qualification": "referred_student_first_payment",
            "teacher_share_uses_undiscounted_tuition": True,
        }),
        ("recurring_expense", "expense:rent", {
            "name": "Rent", "amount_uzs": 10_500_000, "currency": "UZS",
        }),
        ("recurring_expense", "expense:accountant", {
            "name": "Accountant", "amount_uzs": 500_000, "currency": "UZS",
            "classification": "external_service",
        }),
        ("recurring_expense", "expense:wifi", {
            "name": "Wi-Fi", "amount_uzs": 400_000, "currency": "UZS",
        }),
        ("recurring_expense", "expense:tax", {
            "name": "Tax", "amount_uzs": None, "amount_mode": "manual",
            "currency": "UZS",
        }),
        ("recurring_expense", "expense:electricity", {
            "name": "Electricity", "amount_uzs": None, "amount_mode": "manual",
            "currency": "UZS",
        }),
        ("recurring_expense", "expense:gas", {
            "name": "Gas", "amount_uzs": None, "amount_mode": "manual",
            "currency": "UZS",
        }),
    ]
    for kind, key, value in fixed:
        documents.append({
            "seed_key": f"default:{key}:v1",
            "policy_kind": kind,
            "policy_key": key,
            "version": 1,
            "effective_from": DEFAULT_EFFECTIVE_FROM,
            "value": value,
            "reason": "Approved initial financial policy",
        })
    return documents


DEFAULT_FINANCE_POLICIES = tuple(_default_policy_documents())


async def ensure_finance_indexes(db) -> None:
    """Create integrity indexes. This function is safe to run repeatedly."""
    await db.finance_policy_versions.create_index("seed_key", unique=True, sparse=True)
    await db.finance_policy_versions.create_index(
        [("policy_key", ASCENDING), ("version", ASCENDING)], unique=True
    )
    await db.finance_policy_versions.create_index(
        [("policy_key", ASCENDING), ("effective_from", DESCENDING), ("version", DESCENDING)]
    )
    await db.group_finance_versions.create_index(
        [("group_id", ASCENDING), ("version", ASCENDING)], unique=True
    )
    await db.group_finance_versions.create_index(
        [("group_id", ASCENDING), ("effective_from", DESCENDING), ("version", DESCENDING)]
    )
    await db.finance_closures.create_index([("starts_at", ASCENDING), ("ends_at", ASCENDING)])
    await db.lesson_occurrences.create_index("occurrence_key", unique=True)
    await db.lesson_occurrences.create_index(
        [("group_id", ASCENDING), ("generation_month", ASCENDING), ("starts_at", ASCENDING)]
    )
    await db.lesson_resolution_events.create_index("idempotency_key", unique=True)
    await db.lesson_exception_approvals.create_index("idempotency_key", unique=True)
    await db.lesson_replacement_events.create_index("idempotency_key", unique=True)
    await db.group_memberships.create_index(
        [("group_id", ASCENDING), ("student_id", ASCENDING), ("effective_from", ASCENDING)],
        unique=True,
    )
    await db.group_memberships.create_index(
        [("group_id", ASCENDING), ("student_id", ASCENDING), ("effective_to", ASCENDING)]
    )


async def seed_default_finance_configuration(db, actor_id: str) -> dict:
    """Idempotently insert defaults without ever changing an existing version."""
    now = datetime.utcnow()
    inserted = 0
    existing = 0
    for template in DEFAULT_FINANCE_POLICIES:
        document = {
            **template,
            "created_by": actor_id,
            "created_at": now,
            "immutable": True,
        }
        result = await db.finance_policy_versions.update_one(
            {"seed_key": template["seed_key"]},
            {"$setOnInsert": document},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted += 1
        else:
            existing += 1
    return {"inserted": inserted, "already_present": existing, "total": len(DEFAULT_FINANCE_POLICIES)}


async def _next_version(collection, query: dict) -> int:
    latest = await collection.find_one(query, sort=[("version", DESCENDING)])
    return int(latest.get("version", 0)) + 1 if latest else 1


async def _assert_no_finalized_lines_from(db, query: dict, effective_from: str) -> None:
    locked_query = {
        **query,
        "lesson_date": {"$gte": effective_from},
        "invoice_status": "finalized",
    }
    if await db.finance_invoice_lines.find_one(locked_query):
        raise ValueError("The effective date overlaps finalized invoice lines")


async def create_tariff_version(db, payload: TariffVersionCreate, actor_id: str) -> dict:
    key = f"tariff:{payload.program_code.value}:{payload.group_format.value}"
    effective_from = payload.effective_from.isoformat()
    await _assert_no_finalized_lines_from(
        db,
        {"program_code": payload.program_code.value, "group_format": payload.group_format.value},
        effective_from,
    )
    version = await _next_version(db.finance_policy_versions, {"policy_key": key})
    document = {
        "policy_kind": "tariff",
        "policy_key": key,
        "version": version,
        "effective_from": effective_from,
        "value": {
            "program_code": payload.program_code.value,
            "group_format": payload.group_format.value,
            "monthly_price_uzs": payload.monthly_price_uzs,
            "currency": "UZS",
        },
        "reason": payload.reason,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        result = await db.finance_policy_versions.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("A concurrent tariff version was created; reload and try again") from exc
    document["_id"] = result.inserted_id
    return document


async def create_teacher_share_version(db, payload: TeacherShareVersionCreate, actor_id: str) -> dict:
    key = f"teacher_share:{payload.group_format.value}"
    effective_from = payload.effective_from.isoformat()
    await _assert_no_finalized_lines_from(
        db, {"group_format": payload.group_format.value}, effective_from
    )
    version = await _next_version(db.finance_policy_versions, {"policy_key": key})
    document = {
        "policy_kind": "teacher_share",
        "policy_key": key,
        "version": version,
        "effective_from": effective_from,
        "value": {
            "group_format": payload.group_format.value,
            "basis_points": payload.basis_points,
        },
        "reason": payload.reason,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        result = await db.finance_policy_versions.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("A concurrent teacher-share version was created; reload and try again") from exc
    document["_id"] = result.inserted_id
    return document


async def create_recurring_expense_version(
    db, payload: RecurringExpenseVersionCreate, actor_id: str
) -> dict:
    key = f"expense:{payload.expense_key}"
    effective_from = payload.effective_from.isoformat()
    if await db.finance_expense_obligations.find_one({
        "template_key": key,
        "service_month": {"$gte": effective_from[:7]},
        "status": {"$in": ["partial", "paid"]},
    }):
        raise ValueError("The effective date overlaps expense obligations that already have payments")
    version = await _next_version(db.finance_policy_versions, {"policy_key": key})
    document = {
        "policy_kind": "recurring_expense",
        "policy_key": key,
        "version": version,
        "effective_from": effective_from,
        "value": {
            "name": payload.name,
            "amount_uzs": payload.amount_uzs,
            "currency": "UZS",
            "classification": payload.classification,
        },
        "reason": payload.reason,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        result = await db.finance_policy_versions.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("A concurrent recurring-expense version was created; reload") from exc
    document["_id"] = result.inserted_id
    return document


async def create_billing_rules_version(
    db, payload: BillingRulesVersionCreate, actor_id: str
) -> dict:
    key = "billing:calendar"
    effective_from = payload.effective_from.isoformat()
    if await db.finance_invoices.find_one({
        "service_month": {"$gte": effective_from[:7]},
        "status": "finalized",
    }):
        raise ValueError("The effective date overlaps finalized invoices")
    version = await _next_version(db.finance_policy_versions, {"policy_key": key})
    document = {
        "policy_kind": "billing_rules",
        "policy_key": key,
        "version": version,
        "effective_from": effective_from,
        "value": {
            "invoice_draft_day": payload.invoice_draft_day,
            "invoice_finalization_day": payload.invoice_finalization_day,
            "student_due_day": payload.student_due_day,
            "freeze_day": payload.freeze_day,
            "teacher_salary_due_day": payload.teacher_salary_due_day,
            "timezone": ACADEMY_TIMEZONE,
            "currency": "UZS",
            "operation_mode": payload.operation_mode.value,
            "automatic_freeze_enabled": payload.automatic_freeze_enabled,
            "mandatory_financial_notifications": True,
        },
        "reason": payload.reason,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        result = await db.finance_policy_versions.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("A concurrent billing-rules version was created; reload") from exc
    document["_id"] = result.inserted_id
    return document


async def active_policy(db, policy_key: str, on_date: date) -> Optional[dict]:
    return await db.finance_policy_versions.find_one(
        {"policy_key": policy_key, "effective_from": {"$lte": on_date.isoformat()}},
        sort=[("effective_from", DESCENDING), ("version", DESCENDING)],
    )


async def active_group_finance_version(db, group_id: str, on_date: date) -> Optional[dict]:
    collection = getattr(db, "group_finance_versions", None)
    if collection is None:
        return None
    return await collection.find_one(
        {"group_id": group_id, "effective_from": {"$lte": on_date.isoformat()}},
        sort=[("effective_from", DESCENDING), ("version", DESCENDING)],
    )


async def create_group_finance_version(
    db,
    group: dict,
    payload: GroupFinanceVersionCreate,
    actor_id: str,
    source: str = "manual",
) -> dict:
    validate_schedule_no_overlaps(payload.schedule)
    group_id = str(group["_id"])
    effective_from = payload.effective_from.isoformat()
    previous = await active_group_finance_version(db, group_id, payload.effective_from)
    if previous:
        validate_manual_format_change(
            GroupFormat(previous["group_format"]), payload.group_format
        )
    if await db.finance_invoice_lines.find_one({
        "group_id": group_id,
        "lesson_date": {"$gte": effective_from},
        "invoice_status": "finalized",
    }):
        raise ValueError("The group change overlaps finalized invoice lines")
    if await db.lesson_occurrences.find_one({
        "group_id": group_id,
        "local_date": {"$gte": effective_from},
        "resolution_status": "resolved",
        "superseded": {"$ne": True},
    }):
        raise ValueError("The group change overlaps already resolved lessons")

    version = await _next_version(db.group_finance_versions, {"group_id": group_id})
    document = {
        "group_id": group_id,
        "version": version,
        "effective_from": effective_from,
        "program_code": payload.program_code.value,
        "group_format": payload.group_format.value,
        "teacher_id": group.get("teacher_id"),
        "schedule": [slot.model_dump() for slot in payload.schedule],
        "timezone": ACADEMY_TIMEZONE,
        "reason": payload.reason,
        "source": source,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        result = await db.group_finance_versions.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("A concurrent group finance version was created; reload and try again") from exc
    document["_id"] = result.inserted_id
    try:
        group_update = await db.groups.update_one(
            {"_id": group["_id"]},
            {"$set": {
                "finance_setup_status": "configured",
                "finance_latest_version": version,
                "finance_latest_program_code": payload.program_code.value,
                "finance_latest_group_format": payload.group_format.value,
                "finance_occurrence_refresh_status": "refreshing",
                "updated_at": datetime.utcnow(),
            }},
        )
    except Exception:
        await db.group_finance_versions.delete_one({"_id": result.inserted_id})
        raise
    if group_update.matched_count != 1:
        await db.group_finance_versions.delete_one({"_id": result.inserted_id})
        raise ValueError("The group no longer exists; no finance version was retained")
    try:
        refresh = await generate_lesson_occurrences(
            db, group, effective_from[:7], actor_id
        )
    except Exception as exc:
        refresh = {"status": "required", "error": str(exc)}
        await db.groups.update_one(
            {"_id": group["_id"]},
            {"$set": {
                "finance_occurrence_refresh_status": "required",
                "finance_occurrence_refresh_error": str(exc),
                "updated_at": datetime.utcnow(),
            }},
        )
    else:
        refresh = {"status": "up_to_date", **refresh}
        await db.groups.update_one(
            {"_id": group["_id"]},
            {
                "$set": {
                    "finance_occurrence_refresh_status": "up_to_date",
                    "updated_at": datetime.utcnow(),
                },
                "$unset": {"finance_occurrence_refresh_error": ""},
            },
        )
    document["occurrence_refresh"] = refresh
    return document


def _local_effective_datetime(value: datetime) -> datetime:
    academy_tz = ZoneInfo(ACADEMY_TIMEZONE)
    if value.tzinfo is None:
        value = value.replace(tzinfo=academy_tz)
    return value.astimezone(timezone.utc).replace(tzinfo=None)


async def create_closure(db, payload: ClosureCreate, actor_id: str) -> dict:
    document = {
        "title": payload.title,
        "reason": payload.reason,
        "kind": payload.kind.value,
        "starts_at": _local_effective_datetime(payload.starts_at),
        "ends_at": _local_effective_datetime(payload.ends_at),
        "branch_id": payload.branch_id,
        "group_ids": payload.group_ids,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    locked_query = {
        "starts_at": {"$lt": document["ends_at"]},
        "ends_at": {"$gt": document["starts_at"]},
        "locked_at": {"$ne": None},
        "superseded": {"$ne": True},
    }
    if document.get("group_ids"):
        locked_query["group_id"] = {"$in": document["group_ids"]}
    if document.get("branch_id"):
        locked_query["branch_id"] = document["branch_id"]
    if await db.lesson_occurrences.find_one(locked_query):
        raise ValueError(
            "A closure cannot be added over lessons locked by finalized invoices"
        )
    result = await db.finance_closures.insert_one(document)
    document["_id"] = result.inserted_id
    await apply_closure_to_existing_occurrences(db, document)
    return document


async def apply_closure_to_existing_occurrences(db, closure: dict) -> int:
    query = {
        "starts_at": {"$lt": closure["ends_at"]},
        "ends_at": {"$gt": closure["starts_at"]},
        "locked_at": None,
        "resolution_status": "unresolved",
        "superseded": {"$ne": True},
    }
    if closure.get("group_ids"):
        query["group_id"] = {"$in": closure["group_ids"]}
    if closure.get("branch_id"):
        query["branch_id"] = closure["branch_id"]
    result = await db.lesson_occurrences.update_many(query, {
        "$set": {
            "lesson_status": "centre_closed",
            "resolution_status": "resolved",
            "student_billable": False,
            "teacher_payable": False,
            "closure_id": str(closure["_id"]),
            "resolved_at": datetime.utcnow(),
            "resolution_source": "closure",
            "updated_at": datetime.utcnow(),
        },
        "$inc": {"revision": 1},
    })
    return result.modified_count


async def _group_versions_for_month(db, group_id: str, month_end: date) -> List[dict]:
    return await db.group_finance_versions.find({
        "group_id": group_id,
        "effective_from": {"$lte": month_end.isoformat()},
    }).sort([("effective_from", ASCENDING), ("version", ASCENDING)]).to_list(10_000)


def _version_for_date(versions: Sequence[dict], local_date: date) -> Optional[dict]:
    eligible = [version for version in versions if version["effective_from"] <= local_date.isoformat()]
    if not eligible:
        return None
    return max(eligible, key=lambda item: (item["effective_from"], item["version"]))


async def generate_lesson_occurrences(db, group: dict, month: str, actor_id: str) -> dict:
    month_start, month_end = month_bounds(month)
    group_id = str(group["_id"])
    versions = await _group_versions_for_month(db, group_id, month_end)
    if not versions:
        raise ValueError("This group has no finance configuration effective in the requested month")

    start_bound = month_start
    end_bound = month_end
    if group.get("start_date"):
        start_bound = max(start_bound, group["start_date"].date())
    if group.get("end_date"):
        end_bound = min(end_bound, group["end_date"].date())
    if end_bound < start_bound:
        return {"created": 0, "updated": 0, "superseded": 0, "total_active": 0}

    local_tz = ZoneInfo(ACADEMY_TIMEZONE)
    utc_start = datetime.combine(month_start, time.min, local_tz).astimezone(timezone.utc).replace(tzinfo=None)
    utc_end = datetime.combine(month_end + timedelta(days=1), time.min, local_tz).astimezone(timezone.utc).replace(tzinfo=None)
    closures = await db.finance_closures.find({
        "starts_at": {"$lt": utc_end},
        "ends_at": {"$gt": utc_start},
    }).to_list(10_000)

    desired: Dict[str, dict] = {}
    cursor = start_bound
    while cursor <= end_bound:
        version = _version_for_date(versions, cursor)
        if version:
            for blueprint in build_occurrence_blueprints(version["schedule"], cursor, cursor):
                occurrence_key = f"{group_id}:{blueprint.starts_at.strftime('%Y%m%dT%H%M%SZ')}"
                matched_closure = next(
                    (
                        closure for closure in closures
                        if closure_applies(blueprint, closure, group_id, group.get("branch_id"))
                    ),
                    None,
                )
                desired[occurrence_key] = {
                    "occurrence_key": occurrence_key,
                    "group_id": group_id,
                    "branch_id": group.get("branch_id"),
                    "config_version_id": str(version["_id"]),
                    "config_version": version["version"],
                    "program_code": version["program_code"],
                    "group_format": version["group_format"],
                    "teacher_id": version.get("teacher_id") or group.get("teacher_id"),
                    "generation_month": month,
                    "local_date": cursor.isoformat(),
                    "starts_at": blueprint.starts_at.replace(tzinfo=None),
                    "ends_at": blueprint.ends_at.replace(tzinfo=None),
                    "room": blueprint.room,
                    "counts_as_scheduled": True,
                    "lesson_status": "centre_closed" if matched_closure else "scheduled",
                    "resolution_status": "resolved" if matched_closure else "unresolved",
                    "student_billable": False if matched_closure else None,
                    "teacher_payable": False if matched_closure else None,
                    "closure_id": str(matched_closure["_id"]) if matched_closure else None,
                    "resolution_source": "closure" if matched_closure else None,
                    "superseded": False,
                    "generated_by": actor_id,
                    "generated_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "locked_at": None,
                    "revision": 1,
                }
        cursor += timedelta(days=1)

    existing_rows = await db.lesson_occurrences.find({
        "group_id": group_id,
        "generation_month": month,
    }).to_list(10_000)
    existing = {row["occurrence_key"]: row for row in existing_rows}
    created = 0
    updated = 0
    superseded = 0
    for key, document in desired.items():
        current = existing.get(key)
        if not current:
            try:
                await db.lesson_occurrences.insert_one(document)
                created += 1
            except DuplicateKeyError:
                pass
            continue
        if current.get("locked_at") or current.get("resolution_status") == "resolved":
            continue
        mutable_projection = {
            field: document[field]
            for field in (
                "config_version_id", "config_version", "program_code", "group_format",
                "teacher_id", "branch_id", "local_date", "starts_at", "ends_at", "room",
                "lesson_status", "resolution_status", "student_billable", "teacher_payable",
                "closure_id", "resolution_source", "superseded", "updated_at",
            )
        }
        result = await db.lesson_occurrences.update_one(
            {"_id": current["_id"], "revision": current.get("revision", 1), "locked_at": None},
            {"$set": mutable_projection, "$inc": {"revision": 1}},
        )
        updated += result.modified_count

    stale_keys = set(existing) - set(desired)
    for key in stale_keys:
        row = existing[key]
        if row.get("locked_at") or row.get("resolution_status") == "resolved" or row.get("superseded"):
            continue
        result = await db.lesson_occurrences.update_one(
            {"_id": row["_id"], "locked_at": None, "resolution_status": "unresolved"},
            {"$set": {
                "superseded": True,
                "superseded_at": datetime.utcnow(),
                "superseded_by": actor_id,
                "updated_at": datetime.utcnow(),
            }, "$inc": {"revision": 1}},
        )
        superseded += result.modified_count

    return {
        "created": created,
        "updated": updated,
        "superseded": superseded,
        "total_active": len(desired),
    }


async def record_lesson_resolution(
    db,
    occurrence: dict,
    payload: LessonResolutionCreate,
    actor: dict,
) -> dict:
    if occurrence.get("locked_at"):
        raise ValueError("This lesson is locked by a finalized financial record")
    if occurrence.get("superseded"):
        raise ValueError("A superseded lesson cannot be resolved")
    existing_event = await db.lesson_resolution_events.find_one({"idempotency_key": payload.idempotency_key})
    if existing_event:
        return {"event": existing_event, "occurrence": occurrence, "idempotent_replay": True}
    if occurrence.get("resolution_status") == "resolved":
        raise ValueError("This lesson is already resolved")
    if occurrence.get("resolution_status") == "pending_approval":
        raise ValueError("This lesson already has an exception pending approval")

    role = actor.get("role")
    needs_approval = role == "teacher" and payload.resolution != LessonResolution.HELD
    event = {
        "occurrence_id": str(occurrence["_id"]),
        "group_id": occurrence["group_id"],
        "resolution": payload.resolution.value,
        "reason": payload.reason,
        "substitute_teacher_id": payload.substitute_teacher_id,
        "idempotency_key": payload.idempotency_key,
        "submitted_by": str(actor["_id"]),
        "submitted_role": role,
        "submitted_at": datetime.utcnow(),
        "approval_status": "pending" if needs_approval else "approved",
        "immutable": True,
    }
    try:
        inserted = await db.lesson_resolution_events.insert_one(event)
    except DuplicateKeyError:
        existing_event = await db.lesson_resolution_events.find_one({"idempotency_key": payload.idempotency_key})
        return {"event": existing_event, "occurrence": occurrence, "idempotent_replay": True}
    event["_id"] = inserted.inserted_id

    if needs_approval:
        update = {
            "resolution_status": "pending_approval",
            "pending_resolution_event_id": str(inserted.inserted_id),
            "updated_at": datetime.utcnow(),
        }
    elif payload.resolution == LessonResolution.HELD:
        update = {
            "lesson_status": "held",
            "resolution_status": "resolved",
            "student_billable": True,
            "teacher_payable": True,
            "payable_teacher_id": payload.substitute_teacher_id or occurrence.get("teacher_id"),
            "resolved_at": datetime.utcnow(),
            "resolved_by": str(actor["_id"]),
            "resolution_event_id": str(inserted.inserted_id),
            "updated_at": datetime.utcnow(),
        }
    elif payload.resolution == LessonResolution.TEACHER_CANCELLED:
        update = {
            "lesson_status": "teacher_cancelled",
            "resolution_status": "resolved",
            "student_billable": False,
            "teacher_payable": False,
            "resolved_at": datetime.utcnow(),
            "resolved_by": str(actor["_id"]),
            "resolution_event_id": str(inserted.inserted_id),
            "updated_at": datetime.utcnow(),
        }
    else:
        update = {
            "lesson_status": "replacement_required",
            "resolution_status": "replacement_required",
            "student_billable": None,
            "teacher_payable": None,
            "resolved_by": str(actor["_id"]),
            "resolution_event_id": str(inserted.inserted_id),
            "updated_at": datetime.utcnow(),
        }
    result = await db.lesson_occurrences.update_one(
        {
            "_id": occurrence["_id"],
            "revision": occurrence.get("revision", 1),
            "locked_at": None,
        },
        {"$set": update, "$inc": {"revision": 1}},
    )
    if result.modified_count != 1:
        raise ValueError("The lesson changed concurrently; reload before trying again")
    stored = await db.lesson_occurrences.find_one({"_id": occurrence["_id"]})
    return {"event": event, "occurrence": stored, "idempotent_replay": False}


async def approve_lesson_exception(
    db,
    event: dict,
    occurrence: dict,
    payload: LessonExceptionApproval,
    actor: dict,
) -> dict:
    if occurrence.get("locked_at"):
        raise ValueError("This lesson is locked by a finalized financial record")
    replay = await db.lesson_exception_approvals.find_one({"idempotency_key": payload.idempotency_key})
    if replay:
        stored = await db.lesson_occurrences.find_one({"_id": occurrence["_id"]})
        return {"approval": replay, "occurrence": stored, "idempotent_replay": True}
    if await db.lesson_exception_approvals.find_one({"resolution_event_id": str(event["_id"])}):
        raise ValueError("This exception is no longer pending approval")
    if occurrence.get("pending_resolution_event_id") != str(event["_id"]):
        raise ValueError("This exception is no longer pending approval")

    approval = {
        "resolution_event_id": str(event["_id"]),
        "occurrence_id": str(occurrence["_id"]),
        "approved": payload.approved,
        "reason": payload.reason,
        "idempotency_key": payload.idempotency_key,
        "decided_by": str(actor["_id"]),
        "decided_at": datetime.utcnow(),
        "immutable": True,
    }
    try:
        inserted = await db.lesson_exception_approvals.insert_one(approval)
    except DuplicateKeyError:
        replay = await db.lesson_exception_approvals.find_one({"idempotency_key": payload.idempotency_key})
        stored = await db.lesson_occurrences.find_one({"_id": occurrence["_id"]})
        return {"approval": replay, "occurrence": stored, "idempotent_replay": True}
    approval["_id"] = inserted.inserted_id

    if not payload.approved:
        occurrence_update = {
            "lesson_status": "scheduled",
            "resolution_status": "unresolved",
            "student_billable": None,
            "teacher_payable": None,
            "pending_resolution_event_id": None,
            "updated_at": datetime.utcnow(),
        }
    elif event["resolution"] == LessonResolution.TEACHER_CANCELLED.value:
        occurrence_update = {
            "lesson_status": "teacher_cancelled",
            "resolution_status": "resolved",
            "student_billable": False,
            "teacher_payable": False,
            "resolved_at": datetime.utcnow(),
            "resolved_by": str(actor["_id"]),
            "resolution_event_id": str(event["_id"]),
            "pending_resolution_event_id": None,
            "updated_at": datetime.utcnow(),
        }
    else:
        occurrence_update = {
            "lesson_status": "replacement_required",
            "resolution_status": "replacement_required",
            "student_billable": None,
            "teacher_payable": None,
            "resolved_by": str(actor["_id"]),
            "resolution_event_id": str(event["_id"]),
            "pending_resolution_event_id": None,
            "updated_at": datetime.utcnow(),
        }

    result = await db.lesson_occurrences.update_one(
        {"_id": occurrence["_id"], "locked_at": None},
        {"$set": occurrence_update, "$inc": {"revision": 1}},
    )
    if result.modified_count != 1:
        raise ValueError("The lesson changed concurrently; reload before trying again")
    stored = await db.lesson_occurrences.find_one({"_id": occurrence["_id"]})
    return {"approval": approval, "occurrence": stored, "idempotent_replay": False}


async def create_replacement_lesson(
    db,
    original: dict,
    payload: ReplacementLessonCreate,
    actor: dict,
) -> dict:
    if original.get("resolution_status") != "replacement_required":
        raise ValueError("The original lesson is not awaiting a replacement")
    if original.get("locked_at"):
        raise ValueError("The original lesson is locked by a finalized financial record")
    replay = await db.lesson_replacement_events.find_one({"idempotency_key": payload.idempotency_key})
    if replay:
        replacement = await db.lesson_occurrences.find_one({"_id": ObjectId(replay["replacement_occurrence_id"])})
        return {"event": replay, "replacement": replacement, "idempotent_replay": True}

    starts_at = _local_effective_datetime(payload.starts_at)
    ends_at = _local_effective_datetime(payload.ends_at)
    if await db.finance_closures.find_one({
        "starts_at": {"$lt": ends_at},
        "ends_at": {"$gt": starts_at},
        "$and": [
            {"$or": [{"group_ids": []}, {"group_ids": original["group_id"]}]},
            {"$or": [{"branch_id": None}, {"branch_id": original.get("branch_id")}]},
        ],
    }):
        raise ValueError("A replacement lesson cannot be scheduled during an official closure")

    local_start = starts_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(ACADEMY_TIMEZONE))
    occurrence_key = f"{original['group_id']}:replacement:{payload.idempotency_key}"
    replacement = {
        "occurrence_key": occurrence_key,
        "group_id": original["group_id"],
        "branch_id": original.get("branch_id"),
        "config_version_id": original["config_version_id"],
        "config_version": original["config_version"],
        "program_code": original["program_code"],
        "group_format": original["group_format"],
        "teacher_id": payload.teacher_id or original.get("teacher_id"),
        "generation_month": local_start.strftime("%Y-%m"),
        "local_date": local_start.date().isoformat(),
        "starts_at": starts_at,
        "ends_at": ends_at,
        "room": original.get("room"),
        "counts_as_scheduled": False,
        "billing_slot_key": original["occurrence_key"],
        "replacement_for_id": str(original["_id"]),
        "lesson_status": "scheduled",
        "resolution_status": "unresolved",
        "student_billable": None,
        "teacher_payable": None,
        "superseded": False,
        "generated_by": str(actor["_id"]),
        "generated_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "locked_at": None,
        "revision": 1,
    }
    try:
        inserted_occurrence = await db.lesson_occurrences.insert_one(replacement)
    except DuplicateKeyError as exc:
        raise ValueError("This replacement lesson was already scheduled") from exc
    replacement["_id"] = inserted_occurrence.inserted_id
    event = {
        "original_occurrence_id": str(original["_id"]),
        "replacement_occurrence_id": str(inserted_occurrence.inserted_id),
        "idempotency_key": payload.idempotency_key,
        "reason": payload.reason,
        "created_by": str(actor["_id"]),
        "created_at": datetime.utcnow(),
        "immutable": True,
    }
    inserted_event = await db.lesson_replacement_events.insert_one(event)
    event["_id"] = inserted_event.inserted_id
    result = await db.lesson_occurrences.update_one(
        {"_id": original["_id"], "resolution_status": "replacement_required", "locked_at": None},
        {"$set": {
            "lesson_status": "replaced",
            "resolution_status": "resolved",
            "student_billable": False,
            "teacher_payable": False,
            "replacement_occurrence_id": str(inserted_occurrence.inserted_id),
            "updated_at": datetime.utcnow(),
        }, "$inc": {"revision": 1}},
    )
    if result.modified_count != 1:
        await db.lesson_occurrences.delete_one({"_id": inserted_occurrence.inserted_id, "locked_at": None})
        raise ValueError("The original lesson changed concurrently; reload before trying again")
    return {"event": event, "replacement": replacement, "idempotent_replay": False}


async def record_group_membership_start(
    db,
    group: dict,
    student_id: str,
    effective_from: date,
    actor_id: str,
    effective_at: Optional[datetime] = None,
) -> dict:
    group_id = str(group["_id"])
    if await db.group_memberships.find_one({
        "group_id": group_id, "student_id": student_id, "effective_to": None,
    }):
        raise ValueError("Student already has an active membership in this group")
    version = await active_group_finance_version(db, group_id, effective_from)
    if effective_at is None:
        effective_at = datetime.combine(
            effective_from, time.min, ZoneInfo(ACADEMY_TIMEZONE)
        ).astimezone(timezone.utc).replace(tzinfo=None)
    elif effective_at.tzinfo is not None:
        effective_at = effective_at.astimezone(timezone.utc).replace(tzinfo=None)
    document = {
        "group_id": group_id,
        "student_id": student_id,
        "effective_from": effective_from.isoformat(),
        "effective_from_at": effective_at,
        "effective_to": None,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
    }
    try:
        result = await db.group_memberships.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("This effective membership already exists") from exc
    document["_id"] = result.inserted_id
    transition = None
    if version:
        after_count = len(set(group.get("student_ids", [])) | {student_id})
        current_format = GroupFormat(version["group_format"])
        new_format = enrollment_format_transition(current_format, after_count)
        if new_format != current_format:
            transition_payload = GroupFinanceVersionCreate(
                program_code=ProgramCode(version["program_code"]),
                group_format=new_format,
                effective_from=effective_from,
                schedule=version["schedule"],
                reason="Automatic mini-to-normal conversion when fifth active student enrolled",
            )
            try:
                transition = await create_group_finance_version(
                    db, group, transition_payload, actor_id, source="automatic_capacity_conversion"
                )
            except Exception:
                await db.group_memberships.delete_one({"_id": result.inserted_id})
                raise
    return {"membership": document, "format_transition": transition}


async def record_group_membership_end(
    db,
    group_id: str,
    student_id: str,
    effective_to: date,
    actor_id: str,
    effective_at: Optional[datetime] = None,
) -> Optional[dict]:
    collection = getattr(db, "group_memberships", None)
    if collection is None:
        return None
    membership = await collection.find_one({
        "group_id": group_id, "student_id": student_id, "effective_to": None,
    }, sort=[("effective_from", DESCENDING)])
    if not membership:
        return None
    if effective_to.isoformat() < membership["effective_from"]:
        raise ValueError("Membership end cannot precede its start")
    if effective_at is None:
        effective_at = datetime.combine(
            effective_to, time.min, ZoneInfo(ACADEMY_TIMEZONE)
        ).astimezone(timezone.utc).replace(tzinfo=None)
    elif effective_at.tzinfo is not None:
        effective_at = effective_at.astimezone(timezone.utc).replace(tzinfo=None)
    if membership.get("effective_from_at") and effective_at < membership["effective_from_at"]:
        raise ValueError("Membership end time cannot precede its start time")
    invoice_lines = getattr(db, "finance_invoice_lines", None)
    if invoice_lines is not None and await invoice_lines.find_one({
        "group_id": group_id,
        "student_id": student_id,
        "lesson_date": {"$gte": effective_to.isoformat()},
        "invoice_status": "finalized",
    }):
        raise ValueError("Membership end overlaps finalized invoice lines")
    await collection.update_one({"_id": membership["_id"]}, {"$set": {
        "effective_to": effective_to.isoformat(),
        "effective_to_at": effective_at,
        "ended_by": actor_id,
        "ended_at": datetime.utcnow(),
    }})
    membership.update({
        "effective_to": effective_to.isoformat(),
        "effective_to_at": effective_at,
        "ended_by": actor_id,
    })
    return membership


def finance_document_to_json(document):
    """Recursively convert Mongo-specific values without mutating the source."""
    if isinstance(document, dict):
        return {
            ("id" if key == "_id" else key): finance_document_to_json(value)
            for key, value in document.items()
        }
    if isinstance(document, list):
        return [finance_document_to_json(value) for value in document]
    if isinstance(document, ObjectId):
        return str(document)
    if isinstance(document, datetime):
        return document.isoformat()
    if isinstance(document, date):
        return document.isoformat()
    return document


async def seed_reception_user(db, branch_id: Optional[str], actor_id: str) -> dict:
    """Create the temporary reception account once without resetting its password."""
    from auth import get_password_hash

    if not branch_id:
        raise ValueError("Reception account must be assigned to a branch")
    existing = await db.users.find_one({"login": "reception"})
    if existing:
        if existing.get("role") != "reception":
            raise ValueError("The login 'reception' is already used by another role")
        return {"created": False, "user": existing}
    document = {
        "login": "reception",
        "password_hash": get_password_hash("Reception@2025"),
        "email": None,
        "phone": None,
        "full_name": "Reception",
        "role": "reception",
        "is_active": True,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "branch_id": branch_id,
        "created_by": actor_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "temporary_password_auth": True,
    }
    try:
        result = await db.users.insert_one(document)
    except DuplicateKeyError as exc:
        raise ValueError("The reception account was created concurrently; reload") from exc
    document["_id"] = result.inserted_id
    return {"created": True, "user": document}
