from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Import models and auth
from models import *
from auth import (
    get_current_user, require_role, generate_2fa_secret,
    generate_2fa_qr_code, verify_2fa_token, generate_student_id,
    generate_unique_id
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Import database utilities
from database import db, serialize_doc, create_audit_log

# Security
security = HTTPBearer()

# Create the main app without a prefix
app = FastAPI(title="Nurik's Academy API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
# Telegram Bot API credentials are part of the request path. Keep the HTTP
# client's request logging above INFO so provider URLs never reach app logs.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Import route modules (after app/api_router creation, before startup)
from routes_students import router as students_router
from routes_teachers import router as teachers_router
from routes_groups import router as groups_router
from routes_attendance import router as attendance_router
from routes_journal import router as journal_router
from routes_payments import router as payments_router
from routes_homework import router as homework_router
from routes_tests import router as tests_router
from routes_certificates import router as certificates_router
from routes_leads import router as leads_router
from routes_support import router as support_router
from routes_support import support_staff_router as support_booking_staff_router
from routes_admin import router as admin_router
from routes_chat import router as chat_router
from routes_support_staff import router as support_staff_router
from routes_notifications import router as notifications_router
from routes_finance import router as finance_router
from routes_auth import router as auth_router
from routes_staff_accounts import router as staff_accounts_router
from routes_telegram import router as telegram_router
from routes_courses import router as courses_router
from routes_calendar import router as calendar_router

# Include all routers
api_router.include_router(students_router)
api_router.include_router(teachers_router)
api_router.include_router(groups_router)
api_router.include_router(attendance_router)
api_router.include_router(journal_router)
api_router.include_router(payments_router)
api_router.include_router(homework_router)
api_router.include_router(tests_router)
api_router.include_router(certificates_router)
api_router.include_router(leads_router)
api_router.include_router(support_router)
api_router.include_router(support_booking_staff_router)
api_router.include_router(support_staff_router)
api_router.include_router(admin_router)
api_router.include_router(chat_router)
api_router.include_router(notifications_router)
api_router.include_router(finance_router)
api_router.include_router(auth_router)
api_router.include_router(staff_accounts_router)
api_router.include_router(telegram_router)
api_router.include_router(courses_router)
api_router.include_router(calendar_router)

logger.info("All route modules loaded and registered")

# Start payment reminder scheduler
from scheduler import start_scheduler
from account_integrity import (
    account_integrity_report,
    backfill_converted_lead_links,
    ensure_account_integrity_indexes,
    reconcile_orphan_accounts,
)
from student_lifecycle import reconcile_archived_student_accounts
scheduler = None

# Import client for shutdown
from database import client

@app.on_event("startup")
async def startup_event():
    global scheduler
    from finance_service import ensure_finance_indexes
    from finance_ledger import ensure_finance_ledger_indexes
    from finance_accounting import ensure_accounting_indexes
    from finance_controls import ensure_finance_control_indexes
    from finance_live import ensure_finance_live_indexes
    from finance_card_payments import ensure_card_payment_indexes
    from phone_auth import ensure_phone_auth_indexes, migrate_phone_auth_users
    from telegram_auth import ensure_telegram_indexes
    from routes_courses import ensure_course_indexes
    from telegram_service import (
        TelegramDeliveryError,
        configure_telegram_webhook,
        validate_telegram_configuration,
    )

    validate_telegram_configuration()
    phone_migration = await migrate_phone_auth_users(db)
    logger.info("Phone-auth user migration completed: %s", phone_migration)
    await ensure_phone_auth_indexes(db)
    await ensure_telegram_indexes(db)
    await ensure_course_indexes(db)
    try:
        await configure_telegram_webhook()
    except TelegramDeliveryError:
        # A temporary Telegram outage must not make the academy application
        # unavailable. Delivery remains visibly unavailable until the next
        # successful deploy/restart registers the webhook.
        logger.exception("Telegram webhook configuration failed")

    # Sparse keeps legacy tests valid; uniqueness makes repeated create
    # requests with the same client key atomic.
    await db.tests.create_index("creation_key", unique=True, sparse=True)
    await db.teacher_journal.create_index("creation_key", unique=True, sparse=True)
    await db.teacher_journal.create_index("lesson_key", unique=True, sparse=True)
    await db.teacher_journal.create_index([("group_id", 1), ("lesson_date", -1)])
    await db.users.create_index("login", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.lesson_feedback.create_index([("entry_id", 1), ("student_id", 1)], unique=True)
    lead_link_backfill = await backfill_converted_lead_links(db)
    logger.info("Converted lead link backfill completed: %s", lead_link_backfill)
    reconciliation = await reconcile_orphan_accounts(db)
    logger.info("Canonical account reconciliation completed: %s", reconciliation)
    integrity = await account_integrity_report(db)
    if not integrity["healthy"]:
        raise RuntimeError(f"Account integrity reconciliation failed: {integrity}")
    await ensure_account_integrity_indexes(db)
    await ensure_finance_indexes(db)
    await ensure_finance_ledger_indexes(db)
    await ensure_accounting_indexes(db)
    await ensure_finance_control_indexes(db)
    await ensure_finance_live_indexes(db)
    await ensure_card_payment_indexes(db)
    try:
        reconciliation = await reconcile_archived_student_accounts(db)
        logger.info("Student account reconciliation completed: %s", reconciliation)
    except Exception:
        # A legacy-data repair must not prevent the application from starting.
        # The archive endpoint enforces the invariant for all future changes.
        logger.exception("Student account reconciliation failed")
    if os.environ.get("DISABLE_SCHEDULER") == "1":
        scheduler = None
        logger.info("Application started with scheduler disabled")
    else:
        scheduler = start_scheduler(db)
        logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_db_client():
    if scheduler:
        scheduler.shutdown()
    client.close()
    logger.info("Application shutdown complete")

# ==================== INITIALIZATION ====================

@api_router.post("/init/setup")
async def initial_setup():
    """Shared default credentials are intentionally unavailable."""
    raise HTTPException(
        status_code=410,
        detail="Public bootstrap was retired. Provision the first super-admin through the controlled deployment process.",
    )

# ==================== AUTHENTICATION ====================

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to get current user"""
    return await get_current_user(credentials, db)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user_dependency)):
    """Get current user info"""
    user_data = serialize_doc(current_user.copy())
    for secret_field in (
        "password_hash", "two_factor_secret", "two_factor_secret_temp",
        "failed_login_attempts", "locked_until", "token_version",
        "telegram_user_id", "telegram_chat_id", "telegram_first_name",
        "telegram_last_name",
    ):
        user_data.pop(secret_field, None)
    user_data["telegram_connected"] = current_user.get("telegram_link_status") == "linked"
    return user_data

@api_router.put("/auth/preferences/language")
async def update_language_preference(
    payload: LanguagePreferenceUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Persist the signed-in user's app language across devices."""
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {
            "language_preference": payload.language.value,
            "updated_at": datetime.utcnow(),
        }},
    )
    await create_audit_log(
        str(current_user["_id"]),
        "update_language_preference",
        "user",
        str(current_user["_id"]),
        {"language_preference": payload.language.value},
        request.client.host if request.client else None,
    )
    return {"language_preference": payload.language.value}

# ==================== 2FA ====================

@api_router.post("/auth/2fa/setup", response_model=TwoFactorSetup)
async def setup_2fa(current_user: dict = Depends(get_current_user_dependency)):
    """Setup 2FA for user"""
    try:
        # Only super admin can enable 2FA
        if current_user["role"] != "super_admin":
            raise HTTPException(status_code=403, detail="Only super admin can enable 2FA")
        
        secret = generate_2fa_secret()
        qr_code = generate_2fa_qr_code(secret, current_user.get("email", current_user["login"]))
        
        # Store secret temporarily (will be confirmed on verification)
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"two_factor_secret_temp": secret}}
        )
        
        return {"secret": secret, "qr_code": qr_code}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"2FA setup error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/auth/2fa/verify")
async def verify_2fa(
    verification: TwoFactorVerify,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Verify and enable 2FA"""
    try:
        secret = current_user.get("two_factor_secret_temp")
        if not secret:
            raise HTTPException(status_code=400, detail="2FA setup not initiated")
        
        if not verify_2fa_token(secret, verification.token):
            raise HTTPException(status_code=400, detail="Invalid 2FA token")
        
        # Enable 2FA
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {
                "$set": {
                    "two_factor_enabled": True,
                    "two_factor_secret": secret
                },
                "$unset": {"two_factor_secret_temp": ""}
            }
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "2fa_enabled",
            "user",
            str(current_user["_id"])
        )
        
        return {"message": "2FA enabled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"2FA verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/auth/2fa/disable")
async def disable_2fa(
    verification: TwoFactorVerify,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Disable 2FA"""
    try:
        if not current_user.get("two_factor_enabled"):
            raise HTTPException(status_code=400, detail="2FA is not enabled")
        
        secret = current_user.get("two_factor_secret")
        if not verify_2fa_token(secret, verification.token):
            raise HTTPException(status_code=400, detail="Invalid 2FA token")
        
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {
                "$set": {"two_factor_enabled": False},
                "$unset": {"two_factor_secret": ""}
            }
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "2fa_disabled",
            "user",
            str(current_user["_id"])
        )
        
        return {"message": "2FA disabled successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"2FA disable error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SYSTEM SETTINGS ====================

@api_router.get("/settings")
async def get_system_settings(
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get system settings"""
    try:
        settings = await db.system_settings.find_one()
        if settings:
            return serialize_doc(settings)
        return {"academy_name": "Nurik's Academy"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/settings")
async def update_system_settings(
    settings_data: dict,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update system settings (Super Admin only)"""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can update settings")
    
    try:
        settings_data["updated_at"] = datetime.utcnow()
        settings_data["updated_by"] = str(current_user["_id"])
        
        await db.system_settings.update_one(
            {},
            {"$set": settings_data},
            upsert=True
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "system_settings",
            None,
            settings_data,
            request.client.host if request.client else None
        )
        
        return {"message": "Settings updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== FEATURE FLAGS ====================

@api_router.get("/features")
async def get_feature_flags(
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get feature flags"""
    try:
        features = await db.feature_flags.find().to_list(100)
        return [serialize_doc(f) for f in features]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/features/{feature_name}")
async def toggle_feature(
    feature_name: str,
    enabled: bool,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Toggle feature flag (Super Admin only)"""
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admin can toggle features")
    
    try:
        now = datetime.utcnow()
        await db.feature_flags.update_one(
            {"feature_name": feature_name},
            {"$set": {"is_enabled": enabled, "updated_at": now, "updated_by": str(current_user["_id"])}},
            upsert=True
        )
        await db.feature_flags.update_one(
            {"_id": "global"},
            {"$set": {
                feature_name: enabled,
                "updated_at": now,
                "updated_by": str(current_user["_id"]),
            }},
            upsert=True,
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "toggle_feature",
            "feature_flag",
            feature_name,
            {"is_enabled": enabled},
            request.client.host if request.client else None
        )
        
        return {"message": f"Feature '{feature_name}' {'enabled' if enabled else 'disabled'}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DASHBOARD ====================

@api_router.get("/health")
async def health_check():
    """Readiness probe used by local/CI test servers."""
    await db.command("ping")
    return {"status": "ok"}

@api_router.get("/dashboard")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get dashboard statistics"""
    if current_user.get("role") not in {"super_admin", "manager", "reception"}:
        raise HTTPException(status_code=403, detail="Staff dashboard access required")
    try:
        branch_query = {}
        if current_user["role"] != "super_admin":
            branch_query["branch_id"] = current_user.get("branch_id")
        
        # Student counts
        # Keep the dashboard total consistent with the default Students list.
        # Archived profiles are retained for history, but are not current
        # students and the list hides them unless explicitly requested.
        current_students = await db.students.count_documents({
            **branch_query,
            "status": {"$ne": "archived"}
        })
        active_students = await db.students.count_documents({**branch_query, "status": "active"})
        frozen_students = await db.students.count_documents({**branch_query, "status": "frozen"})
        graduated_students = await db.students.count_documents({**branch_query, "status": "graduated"})
        archived_students = await db.students.count_documents({**branch_query, "status": "archived"})
        
        # Teacher count
        total_teachers = await db.teachers.count_documents({
            **branch_query,
            "is_deleted": {"$ne": True},
        })
        
        # Support count
        total_support = await db.support_staff.count_documents({
            **branch_query,
            "is_deleted": {"$ne": True},
        })
        
        # Today's lessons
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
        today_lessons = await db.schedules.count_documents({
            **branch_query,
            "date": {"$gte": today_start, "$lte": today_end},
            "status": "scheduled"
        })
        
        # Booking dates are stored as YYYY-MM-DD strings. Compare like with
        # like in the academy timezone and scope managers through students.
        tashkent_today = datetime.now(ZoneInfo("Asia/Tashkent")).date().isoformat()
        booking_query = {
            "booking_date": tashkent_today,
            "status": "scheduled",
        }
        if current_user["role"] != "super_admin":
            visible_students = await db.students.find({
                **branch_query,
                "status": {"$ne": "archived"},
            }).to_list(5000)
            booking_query["student_id"] = {
                "$in": [str(student["_id"]) for student in visible_students]
            }
        today_bookings = await db.support_bookings.count_documents(booking_query)

        if current_user["role"] == "reception":
            from finance_ledger import ensure_daily_cash_shift

            visible_student_ids = [str(student["_id"]) for student in visible_students]
            overdue_students = await db.finance_invoices.distinct("student_id", {
                "student_id": {"$in": visible_student_ids},
                "status": "finalized",
                "balance_uzs": {"$gt": 0},
                "due_date": {"$lt": tashkent_today},
            })
            tashkent_zone = ZoneInfo("Asia/Tashkent")
            local_start = datetime.now(tashkent_zone).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            utc_start = local_start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            utc_end = (local_start + timedelta(days=1)).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
            paid_today = await db.finance_receipts.distinct("student_id", {
                "student_id": {"$in": visible_student_ids},
                "status": "posted",
                "received_at": {"$gte": utc_start, "$lt": utc_end},
            })
            active_groups = await db.groups.count_documents({
                **branch_query,
                "status": "active",
            })
            cash_day = await ensure_daily_cash_shift(db)
            return {
                "students": {
                    "total": current_students,
                    "active": active_students,
                    "frozen": frozen_students,
                },
                "groups": active_groups,
                "payments": {
                    "overdue_students": len(overdue_students),
                    "paid_today_students": len(paid_today),
                },
                "today": {
                    "lessons": today_lessons,
                    "support_bookings": today_bookings,
                },
                "cash_day": {
                    "business_date": cash_day.get("business_date"),
                    "status": cash_day.get("status"),
                },
            }

        # The manager landing view is an operational ledger, not a second
        # analytics page.  Build its rows from the same source records used by
        # attendance and finance so the first viewport stays actionable and
        # live without inventing dashboard-only state.
        academy_zone = ZoneInfo("Asia/Tashkent")
        utc_zone = ZoneInfo("UTC")
        academy_now = datetime.now(academy_zone)
        academy_day = academy_now.date().isoformat()
        occurrence_query = {
            **branch_query,
            "local_date": academy_day,
            "counts_as_scheduled": True,
            "superseded": {"$ne": True},
        }
        occurrences = await db.lesson_occurrences.find(occurrence_query).sort(
            "starts_at", 1
        ).to_list(100)
        group_ids = {
            row.get("group_id") for row in occurrences if row.get("group_id")
        }
        teacher_ids = {
            row.get("teacher_id") for row in occurrences if row.get("teacher_id")
        }
        groups = {
            str(row["_id"]): row
            for row in await db.groups.find({
                "_id": {"$in": [ObjectId(value) for value in group_ids if ObjectId.is_valid(value)]}
            }).to_list(100)
        }
        teachers = {
            str(row["_id"]): row
            for row in await db.teachers.find({
                "_id": {"$in": [ObjectId(value) for value in teacher_ids if ObjectId.is_valid(value)]}
            }).to_list(100)
        }

        def local_clock(value):
            if not isinstance(value, datetime):
                return "—"
            instant = value if value.tzinfo else value.replace(tzinfo=utc_zone)
            return instant.astimezone(academy_zone).strftime("%H:%M")

        daily_events = []
        now_utc = datetime.utcnow()
        for occurrence in occurrences:
            group = groups.get(occurrence.get("group_id"), {})
            teacher = teachers.get(occurrence.get("teacher_id"), {})
            starts_at = occurrence.get("starts_at")
            ends_at = occurrence.get("ends_at")
            resolution = occurrence.get("resolution_status", "unresolved")
            lesson_status = occurrence.get("lesson_status", "scheduled")
            if lesson_status == "centre_closed":
                status_key, status_label = "closed", "Centre closed"
            elif resolution == "resolved":
                status_key, status_label = "resolved", "Recorded"
            elif starts_at and starts_at <= now_utc <= ends_at:
                status_key, status_label = "open", "Attendance open"
            elif ends_at and ends_at < now_utc:
                status_key, status_label = "attention", "Needs resolution"
            else:
                status_key, status_label = "scheduled", "Scheduled"
            daily_events.append({
                "id": str(occurrence["_id"]),
                "kind": "lesson",
                "time": local_clock(starts_at),
                "ends_at": local_clock(ends_at),
                "title": group.get("name", "Scheduled lesson"),
                "student_count": len(group.get("student_ids", [])),
                "detail": (
                    f"{len(group.get('student_ids', []))} student"
                    if len(group.get("student_ids", [])) == 1
                    else f"{len(group.get('student_ids', []))} students"
                ),
                "owner": " ".join(filter(None, [teacher.get("first_name"), teacher.get("last_name")])) or "Teacher unassigned",
                "location": occurrence.get("room") or "Room not set",
                "status": status_key,
                "status_label": status_label,
            })

        booking_rows = await db.support_bookings.find(booking_query).sort(
            "start_time", 1
        ).to_list(100)
        booking_student_ids = {
            row.get("student_id") for row in booking_rows if row.get("student_id")
        }
        booking_support_ids = {
            row.get("support_staff_id") for row in booking_rows if row.get("support_staff_id")
        }
        booking_students = {
            str(row["_id"]): row
            for row in await db.students.find({
                "_id": {"$in": [ObjectId(value) for value in booking_student_ids if ObjectId.is_valid(value)]}
            }).to_list(100)
        }
        booking_support = {
            str(row["_id"]): row
            for row in await db.support_staff.find({
                "_id": {"$in": [ObjectId(value) for value in booking_support_ids if ObjectId.is_valid(value)]}
            }).to_list(100)
        }
        for booking in booking_rows:
            student = booking_students.get(booking.get("student_id"), {})
            support = booking_support.get(booking.get("support_staff_id"), {})
            daily_events.append({
                "id": str(booking["_id"]),
                "kind": "support",
                "time": booking.get("start_time") or "—",
                "ends_at": booking.get("end_time") or "—",
                "title": "Support session",
                "detail": " ".join(filter(None, [student.get("first_name"), student.get("last_name")])) or "Student",
                "owner": " ".join(filter(None, [support.get("first_name"), support.get("last_name")])) or "Support staff",
                "location": booking.get("room") or "Support room",
                "status": "scheduled",
                "status_label": "Scheduled",
            })
        daily_events.sort(key=lambda row: row.get("time") or "99:99")

        visible_student_rows = await db.students.find({
            **branch_query,
            "status": {"$ne": "archived"},
        }).to_list(5000)
        visible_student_ids = [str(student["_id"]) for student in visible_student_rows]
        overdue_query = {
            "student_id": {"$in": visible_student_ids},
            "status": "finalized",
            "balance_uzs": {"$gt": 0},
            "due_date": {"$lt": academy_day},
        }
        overdue_rows = await db.finance_invoices.find(overdue_query).to_list(5000)
        overdue_student_count = len({row.get("student_id") for row in overdue_rows})
        overdue_total = sum(int(row.get("balance_uzs", 0)) for row in overdue_rows)

        transfer_query = {"status": "unresolved"}
        if current_user["role"] != "super_admin":
            transfer_query["branch_id"] = current_user.get("branch_id")
        pending_transfers = await db.finance_card_payment_reports.find(
            transfer_query
        ).to_list(5000)

        from finance_ledger import ensure_daily_cash_shift
        cash_day = await ensure_daily_cash_shift(db)
        cash_awaiting_count = await db.cash_shifts.count_documents({
            "cashbox_id": "main",
            "status": "awaiting_confirmation",
        })
        local_start = academy_now.replace(hour=0, minute=0, second=0, microsecond=0)
        utc_start = local_start.astimezone(utc_zone).replace(tzinfo=None)
        utc_end = (local_start + timedelta(days=1)).astimezone(utc_zone).replace(tzinfo=None)
        receipt_rows = await db.finance_receipts.find({
            "status": "posted",
            "received_at": {"$gte": utc_start, "$lt": utc_end},
            "student_id": {"$in": visible_student_ids},
        }).to_list(5000)
        cash_received = sum(
            int(row.get("amount_uzs", 0))
            for row in receipt_rows
            if row.get("payment_method", "cash") == "cash"
        )
        verified_transfers = sum(
            int(row.get("amount_uzs", 0))
            for row in receipt_rows
            if row.get("payment_method") != "cash"
        )
        expected_cashbox = (
            int(cash_day.get("opening_balance_uzs", 0))
            + int(cash_day.get("receipt_total_uzs", 0))
            + int(cash_day.get("other_income_total_uzs", 0))
            - int(cash_day.get("removal_total_uzs", 0))
        )
        
        return {
            "students": {
                "total": current_students,
                "active": active_students,
                "frozen": frozen_students,
                "graduated": graduated_students,
                "archived": archived_students
            },
            "teachers": total_teachers,
            "support_staff": total_support,
            "today": {
                "lessons": today_lessons,
                "support_bookings": today_bookings,
                "events": daily_events,
            },
            "exceptions": {
                "lesson_resolutions": sum(1 for row in daily_events if row.get("status") == "attention"),
                "pending_transfers": len(pending_transfers),
                "pending_transfer_uzs": sum(int(row.get("amount_uzs", 0)) for row in pending_transfers),
                "overdue_students": overdue_student_count,
                "overdue_uzs": overdue_total,
                "cash_days": cash_awaiting_count,
            },
            "financial_ledger": {
                "cash_received_uzs": cash_received,
                "verified_transfers_uzs": verified_transfers,
                "expected_cashbox_uzs": expected_cashbox,
                "cash_day_status": cash_day.get("status"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Include main router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
