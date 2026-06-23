from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nurik_academy')]

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

# Helper function to serialize MongoDB documents
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    doc['id'] = str(doc['_id'])
    del doc['_id']
    # Convert ObjectId fields to strings
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, list):
            doc[key] = [str(v) if isinstance(v, ObjectId) else v for v in value]
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
    return doc

# Audit log helper
async def create_audit_log(user_id: str, action: str, resource_type: str, resource_id: str = None, changes: dict = None, ip: str = None):
    """Create an audit log entry"""
    audit_log = {
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "changes": changes,
        "ip_address": ip,
        "timestamp": datetime.utcnow()
    }
    await db.audit_logs.insert_one(audit_log)

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

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(lambda creds: get_current_user(creds, db))):
    """Get current user info"""
    user_data = serialize_doc(current_user.copy())
    if "password_hash" in user_data:
        del user_data["password_hash"]
    if "two_factor_secret" in user_data:
        del user_data["two_factor_secret"]
    return user_data

# ==================== 2FA ====================

@api_router.post("/auth/2fa/setup", response_model=TwoFactorSetup)
async def setup_2fa(current_user: dict = Depends(lambda creds: get_current_user(creds, db))):
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
    current_user: dict = Depends(lambda creds: get_current_user(creds, db))
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
    current_user: dict = Depends(lambda creds: get_current_user(creds, db))
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

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
