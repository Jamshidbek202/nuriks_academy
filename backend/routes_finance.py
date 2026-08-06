"""Protected endpoints for finance policy, schedules, closures, and lessons."""

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth import get_current_user
from finance_domain import FORMAT_CAPACITY
from finance_models import (
    ClosureCreate,
    GroupFinanceVersionCreate,
    GroupFormat,
    LessonExceptionApproval,
    LessonGenerationRequest,
    LessonResolutionCreate,
    ReplacementLessonCreate,
    ReceptionSeedCreate,
    TariffVersionCreate,
    TeacherShareVersionCreate,
    InvoiceDraftGenerationRequest,
    InvoiceMonthFinalizeRequest,
    CashReceiptCreate,
    CashShiftOpen,
    CashShiftClose,
    CashRemovalCreate,
    CashDiscrepancyReview,
    RecurringExpenseVersionCreate,
    ExpenseObligationGenerationRequest,
    OtherExpenseCreate,
    ExpensePaymentCreate,
    ManualExpenseAmountCreate,
    ExpenseAmountAdjustmentCreate,
    TeacherPayoutCreate,
    OtherIncomeCreate,
    InvoiceAdjustmentCreate,
    FinancialReversalCreate,
    BillingRulesVersionCreate,
    StudentFreezeOverrideCreate,
    DailyFinanceRunRequest,
    DiscountEntitlementCreate,
    PaymentDestinationCreate,
    PaymentDestinationUpdate,
    CardPaymentReportCreate,
    CardPaymentReportResolution,
    ACADEMY_TIMEZONE,
)
from finance_service import (
    DEFAULT_FINANCE_POLICIES,
    active_group_finance_version,
    approve_lesson_exception,
    create_closure,
    create_group_finance_version,
    create_replacement_lesson,
    create_tariff_version,
    create_teacher_share_version,
    finance_document_to_json,
    generate_lesson_occurrences,
    record_lesson_resolution,
    seed_default_finance_configuration,
    create_recurring_expense_version,
    create_billing_rules_version,
)
from finance_ledger import (
    _membership_active,
    add_cash_removal,
    confirm_cash_shift,
    ensure_daily_cash_shift,
    finalize_invoice_month,
    generate_draft_invoices,
    record_cash_receipt,
    adjust_finalized_invoice,
    reverse_invoice_and_create_replacement,
    reverse_cash_receipt,
    review_cash_discrepancy,
    teacher_earnings_snapshot,
)
from finance_accounting import (
    create_other_expense_obligation,
    financial_position,
    generate_recurring_expense_obligations,
    pay_expense_obligation,
    pay_teacher_earning,
    record_other_income,
    set_manual_expense_obligation_amount,
    adjust_expense_obligation_amount,
    reverse_cash_outflow,
    reverse_other_income,
)
from finance_controls import (
    enqueue_mandatory_financial_notification,
    evaluate_finance_freezes,
    manual_freeze_override,
    queue_due_reminders,
    queue_finalized_invoice_notifications,
    queue_receipt_notification,
    reconcile_student_finance_freeze,
)
from finance_live import (
    consume_finance_live_ticket,
    issue_finance_live_ticket,
    stream_finance_changes,
)
from finance_card_payments import (
    create_card_payment_report,
    create_payment_destination,
    notify_reporter_resolution,
    notify_staff_payment_report,
    resolve_card_payment_report,
    serialize_payment_destination,
    update_payment_destination,
)


router = APIRouter(prefix="/finance", tags=["Finance"])
security = HTTPBearer()
FINANCE_ROLES = {"super_admin", "manager"}
FINANCE_LIVE_ROLES = FINANCE_ROLES | {"reception", "parent", "student", "teacher"}


def _academy_today() -> date:
    return datetime.now(ZoneInfo(ACADEMY_TIMEZONE)).date()


async def _require_teacher_attendance_completion(db, occurrence: dict) -> None:
    """Require the scheduled end and a mark for every active class member."""
    ends_at = occurrence.get("ends_at")
    if not isinstance(ends_at, datetime):
        raise HTTPException(status_code=409, detail="This lesson has no valid scheduled end time")
    comparable_end = ends_at.replace(tzinfo=None) if ends_at.tzinfo else ends_at
    if datetime.utcnow() < comparable_end:
        raise HTTPException(
            status_code=409,
            detail="The lesson can only be completed after its scheduled end time",
        )

    memberships = await db.group_memberships.find({
        "group_id": occurrence["group_id"],
    }).to_list(10_000)
    active_student_ids = sorted({
        row["student_id"]
        for row in memberships
        if _membership_active(
            [row],
            occurrence["group_id"],
            occurrence["local_date"],
            occurrence.get("starts_at"),
        )
    })
    if not active_student_ids:
        raise HTTPException(
            status_code=409,
            detail="This lesson has no financially active students to complete",
        )

    attendance_rows = await db.attendance.find({
        "occurrence_id": str(occurrence["_id"]),
        "student_id": {"$in": active_student_ids},
    }, {"student_id": 1}).to_list(len(active_student_ids))
    marked = {row["student_id"] for row in attendance_rows}

    # Backward-compatible bridge for pre-occurrence attendance records when a
    # group had exactly one scheduled lesson that day.
    missing = [student_id for student_id in active_student_ids if student_id not in marked]
    if missing:
        same_day_count = await db.lesson_occurrences.count_documents({
            "group_id": occurrence["group_id"],
            "local_date": occurrence["local_date"],
            "counts_as_scheduled": True,
            "superseded": {"$ne": True},
        })
        if same_day_count == 1:
            day = datetime.fromisoformat(occurrence["local_date"])
            legacy = await db.attendance.find({
                "group_id": occurrence["group_id"],
                "student_id": {"$in": missing},
                "occurrence_id": {"$exists": False},
                "date": {"$gte": day, "$lt": day + timedelta(days=1)},
            }, {"student_id": 1}).to_list(len(missing))
            marked.update(row["student_id"] for row in legacy)

    missing = [student_id for student_id in active_student_ids if student_id not in marked]
    if missing:
        raise HTTPException(
            status_code=409,
            detail=f"Attendance is still missing for {len(missing)} active student(s)",
        )


async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)


@router.post("/live-ticket")
async def create_finance_live_ticket(
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_LIVE_ROLES)
    return await issue_finance_live_ticket(db, current_user)


@router.websocket("/live")
async def finance_live_updates(websocket: WebSocket, ticket: str = Query(min_length=1)):
    """Notify authorized finance screens after committed ledger changes."""
    from server import db

    current_user = await consume_finance_live_ticket(db, ticket)
    if not current_user:
        await websocket.close(code=4401)
        return
    if current_user.get("role") not in FINANCE_LIVE_ROLES:
        await websocket.close(code=4403)
        return

    await websocket.accept()
    await websocket.send_json({"type": "finance_ready"})
    try:
        await stream_finance_changes(websocket, db, current_user)
    except WebSocketDisconnect:
        return


def _require_role(current_user: dict, roles) -> None:
    if current_user.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _valid_object_id(value: str, label: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(value)


def _enforce_branch(current_user: dict, resource: dict) -> None:
    if current_user.get("role") != "manager":
        return
    if resource.get("branch_id") not in {None, current_user.get("branch_id")}:
        raise HTTPException(status_code=403, detail="Managers can only manage their own branch")


def _service_error(error: ValueError):
    message = str(error)
    conflict_markers = (
        "finalized", "resolved lessons", "concurrently", "already", "locked",
        "superseded", "pending approval", "awaiting a replacement",
    )
    status_code = 409 if any(marker in message.lower() for marker in conflict_markers) else 400
    raise HTTPException(status_code=status_code, detail=message)


@router.get("/configuration/defaults/preview")
async def preview_default_configuration(current_user: dict = Depends(get_current_user_dep)):
    _require_role(current_user, FINANCE_ROLES)
    return finance_document_to_json(list(DEFAULT_FINANCE_POLICIES))


@router.post("/configuration/seed-defaults")
async def seed_default_configuration(
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    result = await seed_default_finance_configuration(db, str(current_user["_id"]))
    await create_audit_log(
        str(current_user["_id"]),
        "seed_finance_defaults",
        "finance_configuration",
        changes=result,
        ip=request.client.host if request.client else None,
    )
    return result


@router.post("/configuration/seed-reception")
async def seed_reception_account(
    payload: ReceptionSeedCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    _require_role(current_user, {"super_admin"})
    raise HTTPException(
        status_code=410,
        detail="Temporary reception credentials were retired. Create a reception account in Staff Management so the user receives a phone invitation.",
    )


@router.get("/policies")
async def list_policy_versions(
    policy_kind: Optional[str] = None,
    policy_key: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if policy_kind:
        query["policy_kind"] = policy_kind
    if policy_key:
        query["policy_key"] = policy_key
    rows = await db.finance_policy_versions.find(query).sort([
        ("policy_key", 1), ("effective_from", -1), ("version", -1)
    ]).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.get("/pricing/current")
async def current_finance_pricing(
    on_date: date = Query(default_factory=_academy_today),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    rows = await db.finance_policy_versions.find({
        "policy_kind": {"$in": [
            "tariff", "teacher_share", "billing_rules", "recurring_expense",
        ]},
        "effective_from": {"$lte": on_date.isoformat()},
    }).sort([("policy_key", 1), ("effective_from", -1), ("version", -1)]).to_list(10_000)
    latest = {}
    for row in rows:
        latest.setdefault(row["policy_key"], row)
    return finance_document_to_json({
        "on_date": on_date,
        "currency": "UZS",
        "tariffs": [
            row for key, row in latest.items() if key.startswith("tariff:")
        ],
        "teacher_shares": [
            row for key, row in latest.items() if key.startswith("teacher_share:")
        ],
        "recurring_expenses": [
            row for key, row in latest.items() if key.startswith("expense:")
        ],
        "billing_rules": latest.get("billing:calendar"),
    })


@router.post("/policies/tariffs")
async def add_tariff_version(
    payload: TariffVersionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    try:
        document = await create_tariff_version(db, payload, str(current_user["_id"]))
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create_version", "tuition_tariff",
        str(document["_id"]), payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.post("/policies/teacher-shares")
async def add_teacher_share_version(
    payload: TeacherShareVersionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    try:
        document = await create_teacher_share_version(db, payload, str(current_user["_id"]))
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create_version", "teacher_share",
        str(document["_id"]), payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.post("/policies/recurring-expenses")
async def add_recurring_expense_version(
    payload: RecurringExpenseVersionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    try:
        document = await create_recurring_expense_version(
            db, payload, str(current_user["_id"])
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create_version", "recurring_expense",
        str(document["_id"]), payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.post("/policies/billing-rules")
async def add_billing_rules_version(
    payload: BillingRulesVersionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    try:
        document = await create_billing_rules_version(
            db, payload, str(current_user["_id"])
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create_version", "billing_rules",
        str(document["_id"]), payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.get("/discount-entitlements")
async def list_discount_entitlements(
    student_id: Optional[str] = None,
    service_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if student_id:
        query["student_id"] = student_id
    if service_month:
        query["service_month"] = service_month
    if current_user.get("role") == "manager":
        student_rows = await db.students.find(
            {"branch_id": current_user.get("branch_id")}, {"_id": 1}
        ).to_list(100_000)
        visible_ids = [str(row["_id"]) for row in student_rows]
        if student_id and student_id not in visible_ids:
            raise HTTPException(status_code=403, detail="Student belongs to another branch")
        query["student_id"] = {"$in": visible_ids}
    rows = await db.finance_discount_entitlements.find(query).sort(
        [("service_month", -1), ("created_at", -1)]
    ).to_list(10_000)
    return finance_document_to_json(rows)


@router.post("/discount-entitlements")
async def create_exceptional_discount_entitlement(
    payload: DiscountEntitlementCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    replay = await db.finance_discount_entitlements.find_one(
        {"idempotency_key": payload.idempotency_key}
    )
    if replay:
        return finance_document_to_json({
            "entitlement": replay,
            "idempotent_replay": True,
            "draft_recalculation_required": False,
        })
    student = await db.students.find_one({
        "_id": _valid_object_id(payload.student_id, "student ID"),
        "status": {"$ne": "archived"},
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if await db.finance_invoices.find_one({
        "student_id": payload.student_id,
        "service_month": payload.service_month,
        "status": "finalized",
    }):
        raise HTTPException(
            status_code=409,
            detail="This month is finalized; use an invoice credit adjustment instead",
        )
    now = datetime.utcnow()
    document = {
        "type": "exceptional",
        "student_id": payload.student_id,
        "service_month": payload.service_month,
        "basis_points": payload.basis_points,
        "reason": payload.reason,
        "status": "approved",
        "idempotency_key": payload.idempotency_key,
        "created_by": str(current_user["_id"]),
        "created_at": now,
        "immutable": True,
    }
    result = await db.finance_discount_entitlements.insert_one(document)
    document["_id"] = result.inserted_id
    stale = await db.finance_invoices.update_one(
        {
            "student_id": payload.student_id,
            "service_month": payload.service_month,
            "status": "draft",
        },
        {"$set": {
            "calculation_ready": False,
            "stale_reason": "discount_entitlement_changed",
            "stale_at": now,
            "updated_at": now,
        }, "$inc": {"revision": 1}},
    )
    await create_audit_log(
        str(current_user["_id"]),
        "create",
        "finance_discount_entitlement",
        str(document["_id"]),
        payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json({
        "entitlement": document,
        "idempotent_replay": False,
        "draft_recalculation_required": stale.modified_count == 1,
    })


@router.post("/groups/{group_id}/versions")
async def add_group_finance_version(
    group_id: str,
    payload: GroupFinanceVersionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    group = await db.groups.find_one({"_id": _valid_object_id(group_id, "group ID")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _enforce_branch(current_user, group)
    active_student_count = len(set(group.get("student_ids", [])))
    format_capacity = FORMAT_CAPACITY.get(payload.group_format)
    if format_capacity is not None and active_student_count > format_capacity:
        raise HTTPException(
            status_code=409,
            detail=f"{payload.group_format.value} format cannot contain {active_student_count} active students",
        )
    try:
        document = await create_group_finance_version(
            db, group, payload, str(current_user["_id"])
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create_finance_version", "group", group_id,
        payload.model_dump(mode="json"),
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.get("/groups/{group_id}/versions")
async def list_group_finance_versions(
    group_id: str,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"teacher"})
    group = await db.groups.find_one({"_id": _valid_object_id(group_id, "group ID")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.get("role") == "manager":
        _enforce_branch(current_user, group)
    if current_user.get("role") == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher or group.get("teacher_id") != str(teacher["_id"]):
            raise HTTPException(status_code=403, detail="Teachers can only see their own group schedule")
    rows = await db.group_finance_versions.find({"group_id": group_id}).sort([
        ("effective_from", -1), ("version", -1)
    ]).to_list(10_000)
    return finance_document_to_json(rows)


@router.post("/closures")
async def add_closure(
    payload: ClosureCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    if current_user.get("role") == "manager":
        payload = payload.model_copy(update={"branch_id": current_user.get("branch_id")})
    if payload.group_ids:
        object_ids = [_valid_object_id(value, "group ID") for value in payload.group_ids]
        groups = await db.groups.find({"_id": {"$in": object_ids}}).to_list(len(object_ids))
        if len(groups) != len(set(payload.group_ids)):
            raise HTTPException(status_code=404, detail="One or more closure groups were not found")
        for group in groups:
            if payload.branch_id and group.get("branch_id") != payload.branch_id:
                raise HTTPException(status_code=409, detail="Closure branch does not match every selected group")
    try:
        document = await create_closure(db, payload, str(current_user["_id"]))
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "create", "finance_closure", str(document["_id"]),
        payload.model_dump(mode="json"), request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.get("/closures")
async def list_closures(
    starts_after: Optional[datetime] = None,
    ends_before: Optional[datetime] = None,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if current_user.get("role") == "manager":
        query["$or"] = [
            {"branch_id": current_user.get("branch_id")},
            {"branch_id": None},
        ]
    if starts_after:
        query.setdefault("ends_at", {})["$gte"] = starts_after
    if ends_before:
        query.setdefault("starts_at", {})["$lte"] = ends_before
    rows = await db.finance_closures.find(query).sort("starts_at", -1).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/lesson-occurrences/generate")
async def generate_group_lessons(
    payload: LessonGenerationRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    group = await db.groups.find_one({"_id": _valid_object_id(payload.group_id, "group ID")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _enforce_branch(current_user, group)
    try:
        result = await generate_lesson_occurrences(
            db, group, payload.month, str(current_user["_id"])
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "generate", "lesson_occurrences", payload.group_id,
        {"month": payload.month, **result}, request.client.host if request.client else None,
    )
    return result


@router.get("/lesson-occurrences")
async def list_lesson_occurrences(
    group_id: str,
    month: str = Query(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"teacher"})
    group = await db.groups.find_one({"_id": _valid_object_id(group_id, "group ID")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.get("role") == "manager":
        _enforce_branch(current_user, group)
    if current_user.get("role") == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher or group.get("teacher_id") != str(teacher["_id"]):
            raise HTTPException(status_code=403, detail="Teachers can only see their own lessons")
    rows = await db.lesson_occurrences.find({
        "group_id": group_id,
        "generation_month": month,
        "superseded": {"$ne": True},
    }).sort("starts_at", 1).to_list(10_000)
    memberships = await db.group_memberships.find({
        "group_id": group_id,
    }).to_list(10_000)
    for row in rows:
        row["active_student_ids"] = sorted({
            membership["student_id"]
            for membership in memberships
            if _membership_active(
                [membership],
                group_id,
                row["local_date"],
                row.get("starts_at"),
            )
        })
    return finance_document_to_json(rows)


@router.post("/lesson-occurrences/{occurrence_id}/resolve")
async def resolve_lesson(
    occurrence_id: str,
    payload: LessonResolutionCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES | {"teacher"})
    occurrence = await db.lesson_occurrences.find_one({
        "_id": _valid_object_id(occurrence_id, "lesson occurrence ID")
    })
    if not occurrence:
        raise HTTPException(status_code=404, detail="Lesson occurrence not found")
    if current_user.get("role") == "manager":
        _enforce_branch(current_user, occurrence)
    if current_user.get("role") == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher or occurrence.get("teacher_id") != str(teacher["_id"]):
            raise HTTPException(status_code=403, detail="Teachers can only resolve their own lessons")
        if payload.resolution.value == "held":
            await _require_teacher_attendance_completion(db, occurrence)
    try:
        result = await record_lesson_resolution(db, occurrence, payload, current_user)
    except ValueError as error:
        _service_error(error)
    try:
        rolling = await generate_draft_invoices(
            db,
            occurrence["generation_month"],
            occurrence.get("branch_id"),
            str(current_user["_id"]),
        )
        result["rolling_accrual"] = {"status": "updated", **rolling}
    except ValueError as error:
        # The lesson resolution is an immutable fact. Keep it committed and
        # expose a visible repair state instead of pretending it rolled back.
        result["rolling_accrual"] = {
            "status": "needs_attention",
            "detail": str(error),
        }
    await create_audit_log(
        str(current_user["_id"]),
        "resolve_and_refresh_accrual",
        "lesson_occurrence",
        occurrence_id,
        {
            "resolution": payload.resolution.value,
            "rolling_accrual": result.get("rolling_accrual"),
        },
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.post("/lesson-exceptions/{event_id}/decision")
async def decide_lesson_exception(
    event_id: str,
    payload: LessonExceptionApproval,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    event = await db.lesson_resolution_events.find_one({
        "_id": _valid_object_id(event_id, "resolution event ID")
    })
    if not event:
        raise HTTPException(status_code=404, detail="Resolution event not found")
    occurrence = await db.lesson_occurrences.find_one({"_id": ObjectId(event["occurrence_id"])})
    if not occurrence:
        raise HTTPException(status_code=404, detail="Lesson occurrence not found")
    _enforce_branch(current_user, occurrence)
    try:
        result = await approve_lesson_exception(db, event, occurrence, payload, current_user)
    except ValueError as error:
        _service_error(error)
    try:
        rolling = await generate_draft_invoices(
            db,
            occurrence["generation_month"],
            occurrence.get("branch_id"),
            str(current_user["_id"]),
        )
        result["rolling_accrual"] = {"status": "updated", **rolling}
    except ValueError as error:
        result["rolling_accrual"] = {
            "status": "needs_attention",
            "detail": str(error),
        }
    return finance_document_to_json(result)


@router.post("/lesson-occurrences/{occurrence_id}/replacement")
async def schedule_replacement_lesson(
    occurrence_id: str,
    payload: ReplacementLessonCreate,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    original = await db.lesson_occurrences.find_one({
        "_id": _valid_object_id(occurrence_id, "lesson occurrence ID")
    })
    if not original:
        raise HTTPException(status_code=404, detail="Lesson occurrence not found")
    _enforce_branch(current_user, original)
    if payload.teacher_id:
        if not await db.teachers.find_one({"_id": _valid_object_id(payload.teacher_id, "teacher ID")}):
            raise HTTPException(status_code=404, detail="Replacement teacher not found")
    try:
        result = await create_replacement_lesson(db, original, payload, current_user)
    except ValueError as error:
        _service_error(error)
    return finance_document_to_json(result)


@router.get("/invoice-readiness")
async def invoice_readiness(
    group_id: str,
    month: str = Query(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    group = await db.groups.find_one({"_id": _valid_object_id(group_id, "group ID")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _enforce_branch(current_user, group)
    base = {"group_id": group_id, "generation_month": month, "superseded": {"$ne": True}}
    originals = await db.lesson_occurrences.find({
        **base, "counts_as_scheduled": True,
    }).to_list(10_000)
    replacement_ids = [
        ObjectId(row["replacement_occurrence_id"])
        for row in originals
        if ObjectId.is_valid(row.get("replacement_occurrence_id"))
    ]
    replacements = []
    if replacement_ids:
        replacements = await db.lesson_occurrences.find({
            "_id": {"$in": replacement_ids},
            "superseded": {"$ne": True},
        }).to_list(len(replacement_ids))
    replacements_by_id = {str(row["_id"]): row for row in replacements}
    unresolved_keys = []
    replacement_pending = 0
    for original in originals:
        if original.get("resolution_status") != "resolved":
            unresolved_keys.append(original["occurrence_key"])
            continue
        replacement_id = original.get("replacement_occurrence_id")
        if replacement_id:
            replacement = replacements_by_id.get(replacement_id)
            if not replacement or not (
                replacement.get("resolution_status") == "resolved"
                and replacement.get("lesson_status") == "held"
            ):
                unresolved_keys.append(original["occurrence_key"])
                replacement_pending += 1
    total = len(originals)
    unresolved = len(unresolved_keys)
    return {
        "group_id": group_id,
        "month": month,
        "scheduled_lesson_count": total,
        "unresolved_lesson_count": unresolved,
        "replacement_pending_count": replacement_pending,
        "unresolved_lesson_keys": unresolved_keys,
        "ready_to_finalize": total > 0 and unresolved == 0,
    }


@router.post("/invoices/generate-drafts")
async def generate_invoice_drafts(
    payload: InvoiceDraftGenerationRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    branch_id = payload.branch_id
    if current_user.get("role") == "manager":
        if branch_id and branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Managers can only generate their own branch invoices")
        branch_id = current_user.get("branch_id")
    try:
        result = await generate_draft_invoices(
            db, payload.service_month, branch_id, str(current_user["_id"])
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "generate_drafts", "finance_invoices",
        payload.service_month, result, request.client.host if request.client else None,
    )
    return result


@router.post("/invoices/finalize-month")
async def finalize_month_invoices(
    payload: InvoiceMonthFinalizeRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    branch_id = payload.branch_id
    if current_user.get("role") == "manager":
        if branch_id and branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Managers can only finalize their own branch invoices")
        branch_id = current_user.get("branch_id")
    try:
        result = await finalize_invoice_month(
            db,
            payload.service_month,
            branch_id,
            str(current_user["_id"]),
            payload.idempotency_key,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    result["mandatory_notifications_queued"] = await queue_finalized_invoice_notifications(
        db, payload.service_month, branch_id
    )
    await create_audit_log(
        str(current_user["_id"]), "finalize_month", "finance_invoices",
        payload.service_month, result, request.client.host if request.client else None,
    )
    return result


async def _student_visibility_query(db, current_user: dict) -> dict:
    role = current_user.get("role")
    if role in {"super_admin"}:
        return {}
    if role in {"manager", "reception"}:
        return {"branch_id": current_user.get("branch_id")}
    if role == "student":
        student = await db.students.find_one({"user_id": str(current_user["_id"])})
        return {"student_id": str(student["_id"])} if student else {"student_id": "__none__"}
    if role == "parent":
        parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
        return {"student_id": {"$in": parent.get("student_ids", [])}} if parent else {"student_id": "__none__"}
    raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/invoices")
async def list_invoices(
    student_id: Optional[str] = None,
    service_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    query = await _student_visibility_query(db, current_user)
    if student_id:
        visible_student = query.get("student_id")
        if isinstance(visible_student, str) and visible_student != student_id:
            raise HTTPException(status_code=403, detail="Student invoice access denied")
        if isinstance(visible_student, dict) and student_id not in visible_student.get("$in", []):
            raise HTTPException(status_code=403, detail="Student invoice access denied")
        query["student_id"] = student_id
    if service_month:
        query["service_month"] = service_month
    if status:
        query["status"] = status
    if payment_status:
        query["payment_status"] = payment_status
    if overdue_only:
        query["status"] = "finalized"
        query["balance_uzs"] = {"$gt": 0}
        query["due_date"] = {"$lt": _academy_today().isoformat()}
    rows = await db.finance_invoices.find(query).sort([
        ("due_date", -1), ("invoice_number", -1)
    ]).limit(limit).to_list(limit)
    student_ids = sorted({row["student_id"] for row in rows})
    available_by_student = {student_id: 0 for student_id in student_ids}
    if student_ids:
        credits = await db.finance_credit_lots.find({
            "student_id": {"$in": student_ids},
            "status": "active",
            "remaining_amount_uzs": {"$gt": 0},
        }).to_list(100_000)
        for credit in credits:
            available_by_student[credit["student_id"]] = (
                available_by_student.get(credit["student_id"], 0)
                + int(credit.get("remaining_amount_uzs", 0))
            )

    # A receipt never mutates a provisional invoice. Display how active credit
    # would cover rolling drafts, oldest month first; finalization later posts
    # the real immutable allocation.
    coverage_by_invoice = {}
    for row in sorted(
        (item for item in rows if item.get("status") == "draft"),
        key=lambda item: (item["student_id"], item["service_month"], str(item["_id"])),
    ):
        available = available_by_student.get(row["student_id"], 0)
        covered = min(int(row.get("amount_due_uzs", 0)), available)
        coverage_by_invoice[str(row["_id"])] = covered
        available_by_student[row["student_id"]] = available - covered
    for row in rows:
        if row.get("status") == "draft":
            covered = coverage_by_invoice.get(str(row["_id"]), 0)
            row["prepayment_covered_uzs"] = covered
            row["uncovered_balance_uzs"] = max(0, int(row.get("amount_due_uzs", 0)) - covered)
            row["rolling_statement"] = True
        else:
            row["prepayment_covered_uzs"] = 0
            row["uncovered_balance_uzs"] = int(row.get("balance_uzs", 0))
            row["rolling_statement"] = False
    return finance_document_to_json(rows)


@router.get("/invoices/{invoice_id}/lines")
async def list_invoice_lines(
    invoice_id: str,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    invoice = await db.finance_invoices.find_one({"_id": _valid_object_id(invoice_id, "invoice ID")})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    visibility = await _student_visibility_query(db, current_user)
    visible_student = visibility.get("student_id")
    if isinstance(visible_student, str) and invoice["student_id"] != visible_student:
        raise HTTPException(status_code=403, detail="Invoice access denied")
    if isinstance(visible_student, dict) and invoice["student_id"] not in visible_student.get("$in", []):
        raise HTTPException(status_code=403, detail="Invoice access denied")
    if visibility.get("branch_id") and invoice.get("branch_id") != visibility["branch_id"]:
        raise HTTPException(status_code=403, detail="Invoice access denied")
    rows = await db.finance_invoice_lines.find({
        "invoice_id": invoice_id,
        "generation_run_id": invoice["current_generation_run_id"],
    }).sort("lesson_date", 1).to_list(10_000)
    return finance_document_to_json(rows)


@router.post("/invoices/{invoice_id}/adjustments")
async def add_invoice_adjustment(
    invoice_id: str,
    payload: InvoiceAdjustmentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    invoice = await db.finance_invoices.find_one({
        "_id": _valid_object_id(invoice_id, "invoice ID")
    })
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _enforce_branch(current_user, invoice)
    try:
        result = await adjust_finalized_invoice(
            db,
            invoice,
            payload.kind.value,
            payload.amount_uzs,
            payload.reason,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not result.get("idempotent_replay"):
        adjustment = result["adjustment"]
        await enqueue_mandatory_financial_notification(
            db,
            event_type="invoice_adjusted",
            student_id=invoice["student_id"],
            invoice_id=invoice_id,
            receipt_id=None,
            scheduled_for=datetime.utcnow(),
            payload={
                "invoice_number": invoice.get("invoice_number"),
                "adjustment_kind": adjustment["kind"],
                "adjustment_amount_uzs": adjustment["amount_uzs"],
                "new_balance_uzs": result["invoice"]["balance_uzs"],
                "reason": adjustment["reason"],
            },
            idempotency_key=f"invoice-adjusted:{adjustment['_id']}",
        )
    result["freeze_reconciliation"] = await reconcile_student_finance_freeze(
        db, invoice["student_id"], _academy_today(), str(current_user["_id"])
    )
    if not result.get("idempotent_replay"):
        await create_audit_log(
            str(current_user["_id"]), "adjust", "finance_invoice", invoice_id,
            payload.model_dump(mode="json"), request.client.host if request.client else None,
        )
    return finance_document_to_json(result)


@router.post("/invoices/{invoice_id}/reverse-and-replace")
async def reverse_and_replace_invoice(
    invoice_id: str,
    payload: FinancialReversalCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    invoice = await db.finance_invoices.find_one({
        "_id": _valid_object_id(invoice_id, "invoice ID")
    })
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        result = await reverse_invoice_and_create_replacement(
            db, invoice, payload.reason, payload.idempotency_key, current_user
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not result.get("idempotent_replay"):
        reversal = result["reversal"]
        await enqueue_mandatory_financial_notification(
            db,
            event_type="invoice_reversed_replacement_created",
            student_id=invoice["student_id"],
            invoice_id=invoice_id,
            receipt_id=None,
            scheduled_for=datetime.utcnow(),
            payload={
                "invoice_number": invoice.get("invoice_number"),
                "replacement_invoice_id": reversal["replacement_invoice_id"],
                "reason": reversal["reason"],
            },
            idempotency_key=f"invoice-reversed:{reversal['_id']}",
        )
    result["freeze_reconciliation"] = await reconcile_student_finance_freeze(
        db, invoice["student_id"], _academy_today(), str(current_user["_id"])
    )
    await create_audit_log(
        str(current_user["_id"]), "reverse_and_replace", "finance_invoice", invoice_id,
        {"reason": payload.reason, "replacement_invoice_id": str(result["replacement"]["_id"])},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.post("/cash-shifts/open")
async def open_main_cash_shift(
    payload: CashShiftOpen,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager"})
    raise HTTPException(
        status_code=409,
        detail="The main cashbox opens automatically each Tashkent business day",
    )


@router.get("/cash-shifts/current")
async def get_current_cash_shift(current_user: dict = Depends(get_current_user_dep)):
    from server import db

    _require_role(current_user, {"super_admin", "manager", "reception"})
    try:
        shift = await ensure_daily_cash_shift(db)
    except ValueError as error:
        _service_error(error)
    return finance_document_to_json(shift)


@router.get("/cash-shifts")
async def list_cash_shifts(
    status: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    await ensure_daily_cash_shift(db)
    query = {}
    if status:
        query["status"] = status
    if current_user.get("role") == "manager":
        query["$or"] = [
            {"branch_id": current_user.get("branch_id")},
            {"branch_id": None},
        ]
    rows = await db.cash_shifts.find(query).sort("opened_at", -1).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.get("/cash-events")
async def list_cash_events(
    cash_shift_id: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if cash_shift_id:
        query["cash_shift_id"] = cash_shift_id
    if current_user.get("role") == "manager":
        shifts = await db.cash_shifts.find({
            "$or": [
                {"branch_id": current_user.get("branch_id")},
                {"branch_id": None},
            ]
        }, {"_id": 1}).to_list(100_000)
        visible_shift_ids = [str(row["_id"]) for row in shifts]
        if cash_shift_id and cash_shift_id not in visible_shift_ids:
            raise HTTPException(status_code=403, detail="Cash event access denied")
        query["cash_shift_id"] = {"$in": visible_shift_ids}
    rows = await db.cash_events.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/cash-shifts/{shift_id}/removals")
async def record_cash_removal(
    shift_id: str,
    payload: CashRemovalCreate,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager"})
    shift = await db.cash_shifts.find_one({"_id": _valid_object_id(shift_id, "cash shift ID")})
    if not shift:
        raise HTTPException(status_code=404, detail="Cash shift not found")
    _enforce_branch(current_user, shift)
    try:
        event = await add_cash_removal(
            db, shift, payload.amount_uzs, payload.purpose, payload.idempotency_key, current_user
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return finance_document_to_json(event)


@router.post("/cash-shifts/{shift_id}/close")
async def close_main_cash_shift(
    shift_id: str,
    payload: CashShiftClose,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager"})
    raise HTTPException(
        status_code=409,
        detail="Cash days close automatically; confirm the previous day's physical count instead",
    )


@router.post("/cash-shifts/{shift_id}/confirm")
async def confirm_main_cash_day(
    shift_id: str,
    payload: CashShiftClose,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager"})
    shift = await db.cash_shifts.find_one({"_id": _valid_object_id(shift_id, "cash shift ID")})
    if not shift:
        raise HTTPException(status_code=404, detail="Cash day not found")
    if current_user.get("role") == "manager":
        _enforce_branch(current_user, shift)
    try:
        stored = await confirm_cash_shift(
            db,
            shift,
            payload.actual_closing_balance_uzs,
            payload.notes,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return finance_document_to_json(stored)


@router.post("/cash-shifts/{shift_id}/discrepancy-review")
async def review_cash_shift_discrepancy(
    shift_id: str,
    payload: CashDiscrepancyReview,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    shift = await db.cash_shifts.find_one({
        "_id": _valid_object_id(shift_id, "cash shift ID")
    })
    if not shift:
        raise HTTPException(status_code=404, detail="Cash shift not found")
    try:
        result = await review_cash_discrepancy(
            db,
            shift,
            payload.accepted,
            payload.reason,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not result.get("idempotent_replay"):
        await create_audit_log(
            str(current_user["_id"]),
            "review_cash_discrepancy",
            "cash_shift",
            shift_id,
            {"accepted": payload.accepted, "reason": payload.reason},
            request.client.host if request.client else None,
        )
    return finance_document_to_json(result)


async def _payment_destination_query(db, current_user: dict, include_inactive: bool) -> dict:
    role = current_user.get("role")
    status_query = {} if include_inactive and role in FINANCE_ROLES else {"status": "active"}
    if role == "super_admin":
        return status_query
    if role == "manager":
        return {
            **status_query,
            "$or": [
                {"branch_id": current_user.get("branch_id")},
                {"branch_id": None},
            ],
        }
    if role == "student":
        student = await db.students.find_one({
            "user_id": str(current_user["_id"]),
            "status": {"$ne": "archived"},
        })
        if not student:
            return {"_id": {"$exists": False}}
        return {
            "status": "active",
            "$or": [{"branch_id": student.get("branch_id")}, {"branch_id": None}],
        }
    if role == "parent":
        parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
        if not parent:
            return {"_id": {"$exists": False}}
        student_ids = [
            ObjectId(student_id)
            for student_id in parent.get("student_ids", [])
            if ObjectId.is_valid(student_id)
        ]
        students = await db.students.find(
            {"_id": {"$in": student_ids}, "status": {"$ne": "archived"}},
            {"branch_id": 1},
        ).to_list(10_000)
        branch_ids = list({student.get("branch_id") for student in students})
        return {
            "status": "active",
            "branch_id": {"$in": list({*branch_ids, None})},
        }
    raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/payment-destinations")
async def list_payment_destinations(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"parent", "student"})
    query = await _payment_destination_query(db, current_user, include_inactive)
    rows = await db.finance_payment_destinations.find(query).sort([
        ("status", 1), ("provider", 1), ("created_at", -1)
    ]).to_list(1_000)
    try:
        return [serialize_payment_destination(row) for row in rows]
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))


@router.post("/payment-destinations")
async def add_payment_destination(
    payload: PaymentDestinationCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    branch_id = (
        current_user.get("branch_id")
        if current_user.get("role") == "manager"
        else payload.branch_id
    )
    try:
        destination, replay = await create_payment_destination(
            db, payload, current_user, branch_id
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not replay:
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "finance_payment_destination",
            str(destination["_id"]),
            {
                "provider": destination["provider"],
                "card_last4": destination["card_last4"],
                "cardholder_name": destination["cardholder_name"],
                "branch_id": destination.get("branch_id"),
            },
            request.client.host if request.client else None,
        )
    return {
        "destination": serialize_payment_destination(destination),
        "idempotent_replay": replay,
    }


@router.put("/payment-destinations/{destination_id}")
async def edit_payment_destination(
    destination_id: str,
    payload: PaymentDestinationUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    destination = await db.finance_payment_destinations.find_one({
        "_id": _valid_object_id(destination_id, "receiving card ID")
    })
    if not destination:
        raise HTTPException(status_code=404, detail="Receiving card not found")
    if (
        current_user.get("role") == "manager"
        and destination.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Managers can only manage their branch receiving cards")
    try:
        updated, replay = await update_payment_destination(
            db, destination, payload, current_user
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not replay:
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "finance_payment_destination",
            destination_id,
            {
                "provider": updated["provider"],
                "card_last4": updated["card_last4"],
                "status": updated["status"],
                "reason": payload.reason,
            },
            request.client.host if request.client else None,
        )
    return {
        "destination": serialize_payment_destination(updated),
        "idempotent_replay": replay,
    }


@router.get("/card-payment-reports")
async def list_card_payment_reports(
    status: Optional[str] = Query(default=None, pattern=r"^(?:unresolved|confirmed|rejected)$"),
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"parent", "student"})
    query = {}
    if status:
        query["status"] = status
    if current_user.get("role") == "manager":
        query["branch_id"] = current_user.get("branch_id")
    elif current_user.get("role") == "parent":
        query["reported_by"] = str(current_user["_id"])
    elif current_user.get("role") == "student":
        query["reported_by"] = str(current_user["_id"])
    rows = await db.finance_card_payment_reports.find(query).sort(
        "reported_at", -1
    ).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/card-payment-reports")
async def report_card_payment(
    payload: CardPaymentReportCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"parent", "student"})
    if current_user.get("role") == "parent":
        reporter_profile = await db.parents.find_one({"user_id": str(current_user["_id"])})
        if not reporter_profile:
            raise HTTPException(status_code=403, detail="Parent profile is not linked")
        if payload.student_id not in {str(value) for value in reporter_profile.get("student_ids", [])}:
            raise HTTPException(status_code=403, detail="Parent can only report a payment for their child")
    else:
        reporter_profile = await db.students.find_one({
            "user_id": str(current_user["_id"]),
            "status": {"$ne": "archived"},
        })
        if not reporter_profile or payload.student_id != str(reporter_profile["_id"]):
            raise HTTPException(status_code=403, detail="Students can only report their own payment")
    student = await db.students.find_one({
        "_id": _valid_object_id(payload.student_id, "student ID"),
        "status": {"$ne": "archived"},
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    destination = await db.finance_payment_destinations.find_one({
        "_id": _valid_object_id(payload.destination_id, "receiving card ID"),
        "status": "active",
    })
    if not destination:
        raise HTTPException(status_code=404, detail="Active receiving card not found")
    if destination.get("branch_id") not in {None, student.get("branch_id")}:
        raise HTTPException(status_code=403, detail="Receiving card is not available for this student")
    try:
        report, replay = await create_card_payment_report(
            db,
            payload=payload,
            reporter_profile=reporter_profile,
            student=student,
            destination=destination,
            actor=current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not replay:
        await create_audit_log(
            str(current_user["_id"]),
            "report_card_payment",
            "finance_card_payment_report",
            str(report["_id"]),
            {
                "student_id": report["student_id"],
                "amount_uzs": report["amount_uzs"],
                "provider": report["provider"],
                "destination_last4": report["destination_last4"],
                "paid_at": report["paid_at"].isoformat(),
            },
            request.client.host if request.client else None,
        )
        await notify_staff_payment_report(db, report)
    return {
        "report": finance_document_to_json(report),
        "idempotent_replay": replay,
    }


@router.post("/card-payment-reports/{report_id}/resolve")
async def resolve_reported_card_payment(
    report_id: str,
    payload: CardPaymentReportResolution,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    report = await db.finance_card_payment_reports.find_one({
        "_id": _valid_object_id(report_id, "payment report ID")
    })
    if not report:
        raise HTTPException(status_code=404, detail="Payment report not found")
    if (
        current_user.get("role") == "manager"
        and report.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Managers can only resolve their branch payments")
    try:
        result = await resolve_card_payment_report(db, report, payload, current_user)
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    resolved = result["report"]
    if not result.get("idempotent_replay"):
        await create_audit_log(
            str(current_user["_id"]),
            f"{payload.decision.value}_card_payment",
            "finance_card_payment_report",
            report_id,
            {
                "student_id": resolved["student_id"],
                "amount_uzs": resolved["amount_uzs"],
                "provider": resolved["provider"],
                "reason": resolved.get("resolution_reason"),
                "receipt_id": resolved.get("receipt_id"),
            },
            request.client.host if request.client else None,
        )
        if result.get("receipt"):
            await queue_receipt_notification(db, result["receipt"])
            result["freeze_reconciliation"] = await reconcile_student_finance_freeze(
                db,
                resolved["student_id"],
                _academy_today(),
                str(current_user["_id"]),
            )
        await notify_reporter_resolution(db, resolved)
    return finance_document_to_json(result)


@router.post("/receipts/cash")
async def post_cash_receipt(
    payload: CashReceiptCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin", "manager", "reception"})
    student = await db.students.find_one({
        "_id": _valid_object_id(payload.student_id, "student ID"),
        "status": {"$ne": "archived"},
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if current_user.get("role") in {"manager", "reception"} and student.get("branch_id") != current_user.get("branch_id"):
        raise HTTPException(status_code=403, detail="Student belongs to another branch")
    current_shift = await ensure_daily_cash_shift(db)
    shift = await db.cash_shifts.find_one({"_id": _valid_object_id(payload.cash_shift_id, "cash shift ID")})
    if not shift:
        raise HTTPException(status_code=404, detail="Cash shift not found")
    if shift["_id"] != current_shift["_id"] or shift.get("status") != "open":
        raise HTTPException(status_code=409, detail="Reload the current automatic cash day before recording payment")
    try:
        result = await record_cash_receipt(
            db,
            student,
            shift,
            payload.amount_uzs,
            payload.notes,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await queue_receipt_notification(db, result["receipt"])
    result["freeze_reconciliation"] = await reconcile_student_finance_freeze(
        db, payload.student_id, _academy_today(), str(current_user["_id"])
    )
    await create_audit_log(
        str(current_user["_id"]), "record_cash_receipt", "finance_receipt",
        str(result["receipt"]["_id"]),
        {"student_id": payload.student_id, "amount_uzs": payload.amount_uzs},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.get("/receipts")
async def list_receipts(
    student_id: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager", "reception", "parent", "student"})
    query = await _student_visibility_query(db, current_user)
    if student_id:
        visible_student = query.get("student_id")
        if isinstance(visible_student, str) and visible_student != student_id:
            raise HTTPException(status_code=403, detail="Receipt access denied")
        if isinstance(visible_student, dict) and student_id not in visible_student.get("$in", []):
            raise HTTPException(status_code=403, detail="Receipt access denied")
        query["student_id"] = student_id
    rows = await db.finance_receipts.find(query).sort("received_at", -1).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/receipts/{receipt_id}/reverse")
async def reverse_receipt(
    receipt_id: str,
    payload: FinancialReversalCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    receipt = await db.finance_receipts.find_one({
        "_id": _valid_object_id(receipt_id, "receipt ID")
    })
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    try:
        result = await reverse_cash_receipt(
            db, receipt, payload.reason, payload.idempotency_key, current_user
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    if not result.get("idempotent_replay"):
        reversal = result["reversal"]
        await enqueue_mandatory_financial_notification(
            db,
            event_type="payment_receipt_reversed",
            student_id=receipt["student_id"],
            invoice_id=None,
            receipt_id=receipt_id,
            scheduled_for=datetime.utcnow(),
            payload={
                "receipt_number": receipt.get("receipt_number"),
                "amount_uzs": receipt["amount_uzs"],
                "reason": reversal["reason"],
            },
            idempotency_key=f"receipt-reversed:{reversal['_id']}",
        )
    result["freeze_reconciliation"] = await reconcile_student_finance_freeze(
        db, receipt["student_id"], _academy_today(), str(current_user["_id"])
    )
    await create_audit_log(
        str(current_user["_id"]), "reverse", "finance_receipt", receipt_id,
        {"reason": payload.reason}, request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.get("/teacher-earnings")
async def list_teacher_earnings(
    service_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    teacher_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"teacher"})
    query = {}
    if current_user.get("role") == "manager":
        query["$or"] = [
            {"branch_id": current_user.get("branch_id")},
            {"branch_id": None},
        ]
    elif current_user.get("role") == "teacher":
        teacher = await db.teachers.find_one({"user_id": str(current_user["_id"])})
        if not teacher:
            return []
        query["teacher_id"] = str(teacher["_id"])
    elif teacher_id:
        query["teacher_id"] = teacher_id
    if service_month:
        query["service_month"] = service_month
    rows = await db.teacher_earnings.find(query).sort("service_month", -1).to_list(10_000)
    return finance_document_to_json(rows)


@router.get("/teacher-earnings/summary")
async def get_teacher_earnings_summary(
    service_month: str = Query(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    teacher_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES | {"teacher"})
    if current_user.get("role") == "teacher":
        teacher = await db.teachers.find_one({
            "user_id": str(current_user["_id"]),
            "is_deleted": {"$ne": True},
        })
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher profile is not linked")
        selected_teacher_id = str(teacher["_id"])
    else:
        if not teacher_id:
            raise HTTPException(status_code=400, detail="teacher_id is required for staff access")
        teacher = await db.teachers.find_one({
            "_id": _valid_object_id(teacher_id, "teacher ID"),
            "is_deleted": {"$ne": True},
        })
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        if current_user.get("role") == "manager":
            _enforce_branch(current_user, teacher)
        selected_teacher_id = teacher_id
    try:
        result = await teacher_earnings_snapshot(db, selected_teacher_id, service_month)
    except ValueError as error:
        _service_error(error)
    result["teacher_name"] = f"{teacher.get('first_name', '')} {teacher.get('last_name', '')}".strip()
    return finance_document_to_json(result)


@router.post("/expenses/generate-recurring")
async def generate_recurring_expenses(
    payload: ExpenseObligationGenerationRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    if (
        current_user.get("role") == "manager"
        and payload.branch_id
        and payload.branch_id != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Managers can only generate their branch expenses")
    # The approved recurring costs are centre-wide obligations. Keeping one
    # global obligation makes scheduler and manual generation idempotent and
    # prevents the same rent/tax/utilities from being accrued once per branch.
    branch_id = None
    result = await generate_recurring_expense_obligations(
        db, payload.service_month, branch_id, str(current_user["_id"])
    )
    await create_audit_log(
        str(current_user["_id"]), "generate_recurring", "expense_obligations",
        payload.service_month, result, request.client.host if request.client else None,
    )
    return result


@router.post("/expenses/other")
async def add_other_expense(
    payload: OtherExpenseCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    branch_id = payload.branch_id
    if current_user.get("role") == "manager":
        if branch_id and branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Managers can only record their branch expenses")
        branch_id = current_user.get("branch_id")
    document = await create_other_expense_obligation(
        db,
        category=payload.category,
        recipient=payload.recipient,
        expense_date=payload.expense_date,
        amount_uzs=payload.amount_uzs,
        explanation=payload.explanation,
        proof_reference=payload.proof_reference,
        branch_id=branch_id,
        idempotency_key=payload.idempotency_key,
        actor_id=str(current_user["_id"]),
    )
    await create_audit_log(
        str(current_user["_id"]), "create", "expense_obligation", str(document["_id"]),
        payload.model_dump(mode="json"), request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.get("/expenses")
async def list_expense_obligations(
    service_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    status: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if current_user.get("role") == "manager":
        query["$or"] = [
            {"branch_id": current_user.get("branch_id")},
            {"branch_id": None},
        ]
    if service_month:
        query["service_month"] = service_month
    if status:
        query["status"] = status
    rows = await db.finance_expense_obligations.find(query).sort([
        ("obligation_date", -1), ("category", 1)
    ]).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/expenses/{obligation_id}/payments")
async def pay_expense(
    obligation_id: str,
    payload: ExpensePaymentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    obligation = await db.finance_expense_obligations.find_one({
        "_id": _valid_object_id(obligation_id, "expense obligation ID")
    })
    if not obligation:
        raise HTTPException(status_code=404, detail="Expense obligation not found")
    _enforce_branch(current_user, obligation)
    shift_id = _valid_object_id(payload.cash_shift_id, "cash shift ID")
    try:
        payment = await pay_expense_obligation(
            db, obligation, payload.amount_uzs, shift_id, payload.notes,
            payload.idempotency_key, current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]), "pay", "expense_obligation", obligation_id,
        {"amount_uzs": payload.amount_uzs}, request.client.host if request.client else None,
    )
    return finance_document_to_json(payment)


@router.post("/expenses/{obligation_id}/set-amount")
async def set_manual_recurring_expense_amount(
    obligation_id: str,
    payload: ManualExpenseAmountCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    obligation = await db.finance_expense_obligations.find_one({
        "_id": _valid_object_id(obligation_id, "expense obligation ID")
    })
    if not obligation:
        raise HTTPException(status_code=404, detail="Expense obligation not found")
    _enforce_branch(current_user, obligation)
    try:
        result = await set_manual_expense_obligation_amount(
            db,
            obligation,
            payload.amount_uzs,
            payload.reason,
            payload.idempotency_key,
            str(current_user["_id"]),
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]), "set_amount", "expense_obligation", obligation_id,
        {"amount_uzs": payload.amount_uzs, "reason": payload.reason},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.post("/expenses/{obligation_id}/adjust-amount")
async def correct_expense_obligation_amount(
    obligation_id: str,
    payload: ExpenseAmountAdjustmentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    obligation = await db.finance_expense_obligations.find_one({
        "_id": _valid_object_id(obligation_id, "expense obligation ID")
    })
    if not obligation:
        raise HTTPException(status_code=404, detail="Expense obligation not found")
    try:
        result = await adjust_expense_obligation_amount(
            db,
            obligation,
            payload.amount_uzs,
            payload.reason,
            payload.idempotency_key,
            str(current_user["_id"]),
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]),
        "correct_amount",
        "expense_obligation",
        obligation_id,
        {"amount_uzs": payload.amount_uzs, "reason": payload.reason},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.post("/teacher-earnings/{earning_id}/payouts")
async def pay_teacher_salary(
    earning_id: str,
    payload: TeacherPayoutCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    earning = await db.teacher_earnings.find_one({
        "_id": _valid_object_id(earning_id, "teacher earning ID")
    })
    if not earning:
        raise HTTPException(status_code=404, detail="Teacher earning not found")
    _enforce_branch(current_user, earning)
    try:
        payout = await pay_teacher_earning(
            db, earning, payload.amount_uzs,
            _valid_object_id(payload.cash_shift_id, "cash shift ID"),
            payload.notes, payload.idempotency_key, current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]), "pay", "teacher_earning", earning_id,
        {"amount_uzs": payload.amount_uzs}, request.client.host if request.client else None,
    )
    return finance_document_to_json(payout)


@router.get("/outgoing-payments")
async def list_outgoing_payments(
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {}
    if current_user.get("role") == "manager":
        query["$or"] = [
            {"branch_id": current_user.get("branch_id")},
            {"branch_id": None},
        ]
    expense_rows = await db.finance_expense_payments.find(query).sort(
        "paid_at", -1
    ).limit(limit).to_list(limit)
    teacher_rows = await db.teacher_payouts.find(query).sort(
        "paid_at", -1
    ).limit(limit).to_list(limit)
    rows = [
        {**row, "payment_kind": "expense"} for row in expense_rows
    ] + [
        {**row, "payment_kind": "teacher"} for row in teacher_rows
    ]
    rows.sort(key=lambda row: row.get("paid_at", datetime.min), reverse=True)
    return finance_document_to_json(rows[:limit])


@router.post("/outgoing-payments/{payment_kind}/{payment_id}/reverse")
async def reverse_outgoing_payment(
    payment_kind: str,
    payment_id: str,
    payload: FinancialReversalCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    if payment_kind not in {"expense", "teacher"}:
        raise HTTPException(status_code=400, detail="Invalid outgoing payment kind")
    collection = (
        db.finance_expense_payments
        if payment_kind == "expense"
        else db.teacher_payouts
    )
    payment = await collection.find_one({
        "_id": _valid_object_id(payment_id, "outgoing payment ID")
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Outgoing payment not found")
    try:
        result = await reverse_cash_outflow(
            db,
            payment,
            payment_kind,
            payload.reason,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]),
        "reverse_cash_outflow",
        f"{payment_kind}_payment",
        payment_id,
        {"reason": payload.reason},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.post("/other-income")
async def add_other_income(
    payload: OtherIncomeCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    branch_id = payload.branch_id
    if current_user.get("role") == "manager":
        if branch_id and branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Managers can only record their branch income")
        branch_id = current_user.get("branch_id")
    try:
        document = await record_other_income(
            db,
            source=payload.source,
            income_date=payload.income_date,
            amount_uzs=payload.amount_uzs,
            shift_id=_valid_object_id(payload.cash_shift_id, "cash shift ID"),
            notes=payload.notes,
            branch_id=branch_id,
            idempotency_key=payload.idempotency_key,
            actor=current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]), "record", "other_income", str(document["_id"]),
        {"amount_uzs": payload.amount_uzs, "source": payload.source},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(document)


@router.get("/other-income")
async def list_other_income(
    service_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    limit: int = Query(default=500, ge=1, le=2_000),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {"status": "posted"}
    if service_month:
        query["service_month"] = service_month
    if current_user.get("role") == "manager":
        query["branch_id"] = current_user.get("branch_id")
    rows = await db.finance_other_income.find(query).sort(
        [("income_date", -1), ("recorded_at", -1)]
    ).limit(limit).to_list(limit)
    return finance_document_to_json(rows)


@router.post("/other-income/{income_id}/reverse")
async def reverse_other_income_record(
    income_id: str,
    payload: FinancialReversalCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, {"super_admin"})
    income = await db.finance_other_income.find_one({
        "_id": _valid_object_id(income_id, "other income ID")
    })
    if not income:
        raise HTTPException(status_code=404, detail="Other income not found")
    try:
        result = await reverse_other_income(
            db,
            income,
            payload.reason,
            payload.idempotency_key,
            current_user,
        )
    except ValueError as error:
        _service_error(error)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    await create_audit_log(
        str(current_user["_id"]),
        "reverse",
        "other_income",
        income_id,
        {"reason": payload.reason},
        request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.get("/position")
async def get_financial_position(
    service_month: str = Query(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$"),
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    if current_user.get("role") == "manager":
        if branch_id and branch_id != current_user.get("branch_id"):
            raise HTTPException(status_code=403, detail="Managers can only view their branch position")
        branch_id = current_user.get("branch_id")
    return await financial_position(db, service_month, branch_id)


@router.post("/daily-controls/run")
async def run_daily_finance_controls(
    payload: DailyFinanceRunRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    try:
        result = await evaluate_finance_freezes(
            db, payload.as_of_date, str(current_user["_id"]), payload.idempotency_key
        )
    except ValueError as error:
        _service_error(error)
    result["reminder_jobs_queued"] = await queue_due_reminders(db, payload.as_of_date)
    await create_audit_log(
        str(current_user["_id"]), "run_daily_controls", "finance_controls",
        payload.as_of_date.isoformat(), result, request.client.host if request.client else None,
    )
    return result


@router.post("/students/{student_id}/freeze-override")
async def override_student_finance_freeze(
    student_id: str,
    payload: StudentFreezeOverrideCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import create_audit_log, db

    _require_role(current_user, FINANCE_ROLES)
    if payload.action.value == "unfreeze" and current_user.get("role") != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Only the super admin can manually unfreeze a student",
        )
    student = await db.students.find_one({"_id": _valid_object_id(student_id, "student ID")})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    _enforce_branch(current_user, student)
    try:
        result = await manual_freeze_override(
            db,
            student_id,
            payload.action.value,
            payload.effective_on,
            payload.reason,
            payload.idempotency_key,
            str(current_user["_id"]),
        )
    except ValueError as error:
        _service_error(error)
    await create_audit_log(
        str(current_user["_id"]), "finance_freeze_override", "student", student_id,
        payload.model_dump(mode="json"), request.client.host if request.client else None,
    )
    return finance_document_to_json(result)


@router.get("/freeze-recommendations")
async def list_freeze_recommendations(
    status: str = "pending",
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, FINANCE_ROLES)
    query = {"status": status}
    rows = await db.finance_freeze_recommendations.find(query).sort("as_of_date", -1).to_list(10_000)
    if current_user.get("role") == "manager":
        student_ids = [ObjectId(row["student_id"]) for row in rows if ObjectId.is_valid(row["student_id"])]
        visible = await db.students.find({
            "_id": {"$in": student_ids}, "branch_id": current_user.get("branch_id")
        }).to_list(len(student_ids)) if student_ids else []
        visible_ids = {str(row["_id"]) for row in visible}
        rows = [row for row in rows if row["student_id"] in visible_ids]
    return finance_document_to_json(rows)


@router.get("/reception/call-list")
async def reception_finance_call_list(
    days_ahead: int = Query(default=5, ge=0, le=31),
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db

    _require_role(current_user, {"super_admin", "manager", "reception"})
    today_date = datetime.now(ZoneInfo(ACADEMY_TIMEZONE)).date()
    today = today_date.isoformat()
    latest_due = (today_date + timedelta(days=days_ahead)).isoformat()
    query = {
        "status": "finalized",
        "balance_uzs": {"$gt": 0},
        "due_date": {"$lte": latest_due},
    }
    if current_user.get("role") in {"manager", "reception"}:
        query["branch_id"] = current_user.get("branch_id")
    invoices = await db.finance_invoices.find(query).sort("due_date", 1).to_list(100_000)
    student_ids = [ObjectId(row["student_id"]) for row in invoices if ObjectId.is_valid(row["student_id"])]
    students = await db.students.find({"_id": {"$in": student_ids}}).to_list(len(student_ids)) if student_ids else []
    student_map = {str(row["_id"]): row for row in students}
    parent_ids = [ObjectId(row["parent_id"]) for row in students if ObjectId.is_valid(str(row.get("parent_id")))]
    parents = await db.parents.find({"_id": {"$in": parent_ids}}).to_list(len(parent_ids)) if parent_ids else []
    parent_map = {str(row["_id"]): row for row in parents}
    result = []
    for invoice in invoices:
        student = student_map.get(invoice["student_id"], {})
        parent = parent_map.get(str(student.get("parent_id")), {})
        failed_jobs = await db.finance_notification_jobs.count_documents({
            "invoice_id": str(invoice["_id"]),
            "status": {"$in": ["failed", "pending"]},
        })
        result.append({
            "invoice_id": str(invoice["_id"]),
            "invoice_number": invoice["invoice_number"],
            "student_id": invoice["student_id"],
            "student_name": f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
            "student_phone": student.get("phone"),
            "parent_name": f"{parent.get('first_name', '')} {parent.get('last_name', '')}".strip(),
            "parent_phone": parent.get("phone"),
            "balance_uzs": invoice["balance_uzs"],
            "due_date": invoice["due_date"],
            "call_reason": "overdue" if invoice["due_date"] < today else "upcoming",
            "notification_attention_count": failed_jobs,
        })
    return result
