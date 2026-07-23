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
import traceback

# Import models and auth
from models import *
from auth import (
    get_password_hash, verify_password, create_access_token,
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

logger.info("All route modules loaded and registered")

# Start payment reminder scheduler
from scheduler import start_scheduler
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
    await ensure_finance_indexes(db)
    await ensure_finance_ledger_indexes(db)
    await ensure_accounting_indexes(db)
    await ensure_finance_control_indexes(db)
    await ensure_finance_live_indexes(db)
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
    """Initial setup: Create super admin and default data"""
    try:
        # Check if super admin already exists
        existing_admin = await db.users.find_one({"role": "super_admin"})
        if existing_admin:
            raise HTTPException(status_code=400, detail="System already initialized")
        
        # Create default branch
        branch = {
            "name": "Main Branch",
            "address": "Tashkent, Uzbekistan",
            "phone": "+998901234567",
            "email": "info@nuriksacademy.uz",
            "is_active": True,
            "created_at": datetime.utcnow()
        }
        branch_result = await db.branches.insert_one(branch)
        branch_id = str(branch_result.inserted_id)
        
        # Create super admin user
        super_admin_user = {
            "login": "admin",
            "password_hash": get_password_hash("Admin@2025"),
            "email": "admin@nuriksacademy.uz",
            "phone": "+998901234567",
            "full_name": "Super Administrator",
            "role": "super_admin",
            "is_active": True,
            "two_factor_enabled": False,
            "two_factor_secret": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        user_result = await db.users.insert_one(super_admin_user)
        
        # Create system settings
        system_settings = {
            "academy_name": "Nurik's Academy",
            "logo": None,
            "phone": "+998901234567",
            "email": "info@nuriksacademy.uz",
            "address": "Tashkent, Uzbekistan",
            "payment_reminder_date": 5,
            "payment_reminder_time": "17:00",
            "lesson_reminder_minutes": 20,
            "support_booking_duration": 60,
            "support_working_hours": {"start": "09:00", "end": "18:00"},
            "updated_at": datetime.utcnow()
        }
        await db.system_settings.insert_one(system_settings)
        
        # Create default feature flags
        features = [
            {"feature_name": "support_booking", "is_enabled": True},
            {"feature_name": "online_lessons", "is_enabled": True},
            {"feature_name": "certificates", "is_enabled": True},
            {"feature_name": "news", "is_enabled": True},
            {"feature_name": "crm", "is_enabled": True},
            {"feature_name": "parent_portal", "is_enabled": True},
            {"feature_name": "testing_module", "is_enabled": True},
            {"feature_name": "homework_submission", "is_enabled": False},
            {"feature_name": "student_file_uploads", "is_enabled": False},
            {"feature_name": "student_image_uploads", "is_enabled": False},
        ]
        await db.feature_flags.insert_many(features)
        
        # Create default courses
        courses = [
            {
                "name": "General English",
                "description": "Comprehensive English language course",
                "duration_months": 12,
                "price_per_month": 500000,
                "age_range": {"min": 13, "max": 100},
                "levels": ["Beginner", "Elementary", "Pre-Intermediate", "Intermediate", "Upper-Intermediate", "Advanced"],
                "is_active": True,
                "created_at": datetime.utcnow()
            },
            {
                "name": "IELTS",
                "description": "IELTS preparation course",
                "duration_months": 6,
                "price_per_month": 700000,
                "age_range": {"min": 16, "max": 100},
                "levels": ["IELTS 5.0", "IELTS 5.5", "IELTS 6.0", "IELTS 6.5", "IELTS 7.0+"],
                "is_active": True,
                "created_at": datetime.utcnow()
            },
            {
                "name": "SAT",
                "description": "SAT preparation course",
                "duration_months": 6,
                "price_per_month": 800000,
                "age_range": {"min": 15, "max": 100},
                "levels": ["SAT 1000-1200", "SAT 1200-1400", "SAT 1400+"],
                "is_active": True,
                "created_at": datetime.utcnow()
            },
            {
                "name": "CEFR",
                "description": "CEFR certification course",
                "duration_months": 9,
                "price_per_month": 600000,
                "age_range": {"min": 14, "max": 100},
                "levels": ["A1", "A2", "B1", "B2", "C1", "C2"],
                "is_active": True,
                "created_at": datetime.utcnow()
            },
            {
                "name": "Kids English",
                "description": "English course for children aged 9-12",
                "duration_months": 12,
                "price_per_month": 450000,
                "age_range": {"min": 9, "max": 12},
                "levels": ["Kids Beginner", "Kids Elementary", "Kids Pre-Intermediate"],
                "is_active": True,
                "created_at": datetime.utcnow()
            }
        ]
        await db.courses.insert_many(courses)
        
        # Initialize counters
        await db.counters.insert_one({"_id": "student_id", "seq": 0})
        await db.counters.insert_one({"_id": "payment_id", "seq": 0})
        await db.counters.insert_one({"_id": "lead_id", "seq": 0})
        await db.counters.insert_one({"_id": "booking_id", "seq": 0})
        await db.counters.insert_one({"_id": "certificate_id", "seq": 0})
        
        return {
            "message": "System initialized successfully",
            "admin_login": "admin",
            "admin_password": "Admin@2025",
            "note": "Please change the password immediately and enable 2FA"
        }
    except Exception as e:
        logger.error(f"Setup error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# ==================== AUTHENTICATION ====================

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin, request: Request):
    """User login"""
    try:
        user = await db.users.find_one({"login": credentials.login})
        if not user or not verify_password(credentials.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is inactive")
        
        # Update last login
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login": datetime.utcnow()}}
        )
        
        # Create audit log
        await create_audit_log(
            str(user["_id"]),
            "login",
            "user",
            str(user["_id"]),
            None,
            request.client.host if request.client else None
        )
        
        # Create access token
        access_token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"]})
        
        user_data = serialize_doc(user)
        del user_data["password_hash"]
        if "two_factor_secret" in user_data:
            del user_data["two_factor_secret"]
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency to get current user"""
    return await get_current_user(credentials, db)

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user_dependency)):
    """Get current user info"""
    user_data = serialize_doc(current_user.copy())
    if "password_hash" in user_data:
        del user_data["password_hash"]
    if "two_factor_secret" in user_data:
        del user_data["two_factor_secret"]
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

# ==================== COURSES ====================

@api_router.get("/courses")
async def get_courses(
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get all courses"""
    try:
        courses = await db.courses.find({"is_active": True}).to_list(100)
        return [serialize_doc(c) for c in courses]
    except Exception as e:
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
        await db.feature_flags.update_one(
            {"feature_name": feature_name},
            {"$set": {"is_enabled": enabled, "updated_at": datetime.utcnow(), "updated_by": str(current_user["_id"])}},
            upsert=True
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
        total_teachers = await db.teachers.count_documents(branch_query)
        
        # Support count
        total_support = await db.support_staff.count_documents(branch_query)
        
        # Today's lessons
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
        today_lessons = await db.schedules.count_documents({
            **branch_query,
            "date": {"$gte": today_start, "$lte": today_end},
            "status": "scheduled"
        })
        
        # Today's support bookings
        today_bookings = await db.support_bookings.count_documents({
            "booking_date": {"$gte": today_start, "$lte": today_end},
            "status": "scheduled"
        })
        
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
                "support_bookings": today_bookings
            }
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
