"""
Routes for System Settings, Feature Flags, Analytics, News, Audit Logs
Super Admin only endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pydantic import BaseModel
from auth import get_current_user
import csv
import gzip
import hashlib
import html
import io
import json
from bson import json_util

router = APIRouter(prefix="/admin", tags=["Admin"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

def require_admin(user: dict):
    """Require super_admin or manager role"""
    if user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")

def require_super_admin(user: dict):
    """Require super_admin role only"""
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")


def academy_month_window(year: int, month: int):
    """Return an academy calendar month as naive UTC database boundaries."""
    local_tz = ZoneInfo("Asia/Tashkent")
    start_local = datetime(year, month, 1, tzinfo=local_tz)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    end_local = datetime(next_year, next_month, 1, tzinfo=local_tz)
    return (
        start_local.astimezone(timezone.utc).replace(tzinfo=None),
        end_local.astimezone(timezone.utc).replace(tzinfo=None),
    )


def shifted_month(value: datetime, offset: int):
    absolute_month = value.year * 12 + value.month - 1 + offset
    return absolute_month // 12, absolute_month % 12 + 1

# ==================== FEATURE FLAGS ====================

class FeatureFlagsUpdate(BaseModel):
    homework_submission: Optional[bool] = None
    student_file_uploads: Optional[bool] = None
    student_image_uploads: Optional[bool] = None
    online_lessons: Optional[bool] = None
    chat_system: Optional[bool] = None
    push_notifications: Optional[bool] = None
    support_booking: Optional[bool] = None

@router.get("/feature-flags")
async def get_feature_flags(current_user: dict = Depends(get_current_user_dep)):
    """Get all feature flags"""
    from server import db, serialize_doc
    require_admin(current_user)
    
    try:
        flags = await db.feature_flags.find_one({"_id": "global"})
        if not flags:
            # Initialize default flags
            default_flags = {
                "_id": "global",
                "homework_submission": False,
                "student_file_uploads": False,
                "student_image_uploads": False,
                "online_lessons": False,
                "chat_system": False,
                "push_notifications": True,
                "support_booking": True,
                "updated_at": datetime.utcnow(),
                "updated_by": str(current_user["_id"])
            }
            await db.feature_flags.insert_one(default_flags)
            flags = default_flags

        # Keep the legacy per-feature documents used by runtime gates in sync
        # with the admin screen's canonical global document. Without this, the
        # UI can display "enabled" while the protected feature still rejects it.
        for feature_name in FeatureFlagsUpdate.model_fields:
            await db.feature_flags.update_one(
                {"feature_name": feature_name},
                {"$set": {
                    "feature_name": feature_name,
                    "is_enabled": bool(flags.get(feature_name, False)),
                    "updated_at": flags.get("updated_at", datetime.utcnow()),
                    "updated_by": flags.get("updated_by", str(current_user["_id"])),
                }},
                upsert=True,
            )
        return serialize_doc(flags)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/feature-flags")
async def update_feature_flags(
    flags: FeatureFlagsUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update feature flags (Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    require_super_admin(current_user)
    
    try:
        update_data = {k: v for k, v in flags.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        update_data["updated_by"] = str(current_user["_id"])
        
        await db.feature_flags.update_one(
            {"_id": "global"},
            {"$set": update_data},
            upsert=True
        )

        for feature_name, is_enabled in update_data.items():
            if feature_name not in FeatureFlagsUpdate.model_fields:
                continue
            await db.feature_flags.update_one(
                {"feature_name": feature_name},
                {"$set": {
                    "feature_name": feature_name,
                    "is_enabled": bool(is_enabled),
                    "updated_at": update_data["updated_at"],
                    "updated_by": update_data["updated_by"],
                }},
                upsert=True,
            )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "feature_flags",
            "global",
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.feature_flags.find_one({"_id": "global"})
        return serialize_doc(updated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SYSTEM SETTINGS ====================

class SystemSettingsUpdate(BaseModel):
    academy_name: Optional[str] = None
    academy_email: Optional[str] = None
    academy_phone: Optional[str] = None
    academy_address: Optional[str] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None
    support_working_hours_start: Optional[str] = None
    support_working_hours_end: Optional[str] = None
    student_id_prefix: Optional[str] = None
    student_id_digits: Optional[int] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    click_merchant_id: Optional[str] = None
    click_service_id: Optional[str] = None
    payme_merchant_id: Optional[str] = None

@router.get("/settings")
async def get_system_settings(current_user: dict = Depends(get_current_user_dep)):
    """Get system settings"""
    from server import db, serialize_doc
    require_admin(current_user)
    
    try:
        settings = await db.system_settings.find_one({"_id": "global"})
        if not settings:
            default_settings = {
                "_id": "global",
                "academy_name": "Nurik's Academy",
                "academy_email": "info@nuriksacademy.uz",
                "academy_phone": "+998901234567",
                "academy_address": "Tashkent, Uzbekistan",
                "working_hours_start": "09:00",
                "working_hours_end": "18:00",
                "support_working_hours": {"start": "09:00", "end": "18:00"},
                "student_id_prefix": "NA",
                "student_id_digits": 6,
                "timezone": "Asia/Tashkent",
                "currency": "UZS",
                "click_merchant_id": "",
                "click_service_id": "",
                "payme_merchant_id": "",
                "updated_at": datetime.utcnow()
            }
            await db.system_settings.insert_one(default_settings)
            return serialize_doc(default_settings)
        return serialize_doc(settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/settings")
async def update_system_settings(
    settings: SystemSettingsUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update system settings (Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    require_super_admin(current_user)
    
    try:
        update_data = {k: v for k, v in settings.dict().items() if v is not None}
        
        # Handle support working hours specially
        if settings.support_working_hours_start or settings.support_working_hours_end:
            current = await db.system_settings.find_one({"_id": "global"})
            support_hours = current.get("support_working_hours", {"start": "09:00", "end": "18:00"}) if current else {"start": "09:00", "end": "18:00"}
            if settings.support_working_hours_start:
                support_hours["start"] = settings.support_working_hours_start
                del update_data["support_working_hours_start"]
            if settings.support_working_hours_end:
                support_hours["end"] = settings.support_working_hours_end
                del update_data["support_working_hours_end"]
            update_data["support_working_hours"] = support_hours
        
        update_data["updated_at"] = datetime.utcnow()
        update_data["updated_by"] = str(current_user["_id"])
        
        await db.system_settings.update_one(
            {"_id": "global"},
            {"$set": update_data},
            upsert=True
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "system_settings",
            "global",
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.system_settings.find_one({"_id": "global"})
        return serialize_doc(updated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ANALYTICS ====================

@router.get("/analytics")
async def get_analytics(current_user: dict = Depends(get_current_user_dep)):
    """Get comprehensive analytics data"""
    from server import db
    require_admin(current_user)
    
    try:
        branch_id = current_user.get("branch_id") if current_user["role"] == "manager" else None
        branch_query = {"branch_id": branch_id} if branch_id is not None else {}

        # Student statistics use the same current/archived definition as the
        # dashboard and student list.
        current_students = await db.students.count_documents({
            **branch_query,
            "status": {"$ne": "archived"}
        })
        active_students = await db.students.count_documents({**branch_query, "status": "active"})
        graduated_students = await db.students.count_documents({**branch_query, "status": "graduated"})
        frozen_students = await db.students.count_documents({**branch_query, "status": "frozen"})

        # Revenue is posted cash from the authoritative finance ledger. The
        # legacy payments collection is intentionally not consulted.
        now = datetime.now(ZoneInfo("Asia/Tashkent"))
        month_start, month_end = academy_month_window(now.year, now.month)
        previous_year, previous_month = shifted_month(now, -1)
        previous_start, previous_end = academy_month_window(previous_year, previous_month)

        async def posted_cash(start: datetime, end: datetime) -> int:
            rows = await db.finance_receipts.find({
                **branch_query,
                "status": "posted",
                "received_at": {"$gte": start, "$lt": end},
            }).to_list(100_000)
            return sum(int(row.get("amount_uzs", 0)) for row in rows)

        monthly_revenue = await posted_cash(month_start, month_end)
        prev_month_revenue = await posted_cash(previous_start, previous_end)

        # Academic collections are group-scoped, so resolve the visible groups
        # once and apply that same scope to attendance and tests.
        visible_groups = await db.groups.find(branch_query).to_list(5_000)
        visible_group_ids = [str(group["_id"]) for group in visible_groups]
        academic_query = {"group_id": {"$in": visible_group_ids}}
        total_attendance = await db.attendance.count_documents(academic_query)
        present_attendance = await db.attendance.count_documents({
            **academic_query,
            "status": {"$in": ["present", "late"]},
        })
        attendance_rate = round((present_attendance / total_attendance * 100) if total_attendance > 0 else 0, 1)

        tests = await db.tests.find(academic_query).to_list(5_000)
        mid_tests = [row for row in tests if row.get("test_type") == "mid_test"]
        end_tests = [row for row in tests if row.get("test_type") == "end_of_course"]
        mid_scores = [
            float(result.get("percentage", 0))
            for row in mid_tests for result in row.get("results", [])
        ]
        end_scores = [
            float(result.get("percentage", 0))
            for row in end_tests for result in row.get("results", [])
        ]
        mid_test_avg = round(sum(mid_scores) / len(mid_scores), 1) if mid_scores else 0
        end_test_avg = round(sum(end_scores) / len(end_scores), 1) if end_scores else 0

        # Teacher performance (based on student progress)
        teachers = await db.teachers.find({
            **branch_query,
            "is_deleted": {"$ne": True},
        }).to_list(5_000)
        teacher_count = len(teachers)
        teacher_performance = []
        if current_user["role"] == "super_admin":
            feedback_rows = await db.lesson_feedback.find({}).to_list(5000)
            journal_rows = await db.teacher_journal.find({}).to_list(5000)
            feedback_by_teacher = {}
            lessons_by_teacher = {}
            for feedback in feedback_rows:
                teacher_id = feedback.get("teacher_id")
                if teacher_id:
                    feedback_by_teacher.setdefault(teacher_id, []).append(feedback.get("rating", 0))
            for entry in journal_rows:
                teacher_id = entry.get("teacher_id")
                if teacher_id:
                    lessons_by_teacher[teacher_id] = lessons_by_teacher.get(teacher_id, 0) + 1
            for teacher in teachers:
                teacher_id = str(teacher["_id"])
                ratings = feedback_by_teacher.get(teacher_id, [])
                average_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0
                teacher_performance.append({
                    "teacher_id": teacher_id,
                    "teacher_name": f"{teacher.get('first_name', '')} {teacher.get('last_name', '')}".strip(),
                    "average_rating": average_rating,
                    "progress_percent": round(average_rating / 5 * 100, 1),
                    "feedback_count": len(ratings),
                    "lessons_logged": lessons_by_teacher.get(teacher_id, 0),
                })
            teacher_performance.sort(key=lambda row: (-row["progress_percent"], row["teacher_name"]))
        
        # Support sessions and leads follow the same manager branch scope.
        booking_query = {}
        if branch_id is not None:
            visible_students = await db.students.find(branch_query).to_list(5_000)
            booking_query = {"student_id": {"$in": [str(row["_id"]) for row in visible_students]}}
        total_bookings = await db.support_bookings.count_documents(booking_query)
        completed_bookings = await db.support_bookings.count_documents({**booking_query, "status": "completed"})
        pending_bookings = await db.support_bookings.count_documents({
            **booking_query,
            "status": {"$in": ["scheduled", "confirmed"]},
        })

        # Lead conversion rate
        total_leads = await db.leads.count_documents(branch_query)
        converted_leads = await db.leads.count_documents({**branch_query, "status": "converted"})
        lead_conversion_rate = round((converted_leads / total_leads * 100) if total_leads > 0 else 0, 1)

        # Monthly trends (last 6 months)
        monthly_trends = []
        for i in range(5, -1, -1):
            trend_year, trend_month = shifted_month(now, -i)
            trend_start, trend_end = academy_month_window(trend_year, trend_month)
            month_students = await db.students.count_documents({
                **branch_query,
                "enrollment_date": {"$gte": trend_start, "$lt": trend_end},
            })
            trend_revenue = await posted_cash(trend_start, trend_end)
            monthly_trends.append({
                "month": datetime(trend_year, trend_month, 1).strftime("%b %Y"),
                "revenue": trend_revenue,
                "new_students": month_students
            })
        
        return {
            "students": {
                "total": current_students,
                "active": active_students,
                "graduated": graduated_students,
                "frozen": frozen_students
            },
            "revenue": {
                "monthly": monthly_revenue,
                "previous_month": prev_month_revenue,
                "change_percent": round(((monthly_revenue - prev_month_revenue) / prev_month_revenue * 100) if prev_month_revenue > 0 else 0, 1)
            },
            "attendance": {
                "rate": attendance_rate,
                "total_records": total_attendance,
                "present": present_attendance
            },
            "tests": {
                "mid_test_average": mid_test_avg,
                "end_test_average": end_test_avg,
                "total_mid_tests": len(mid_tests),
                "total_end_tests": len(end_tests)
            },
            "teachers": {
                "total": teacher_count,
                **({"performance": teacher_performance} if current_user["role"] == "super_admin" else {})
            },
            "support": {
                "total_bookings": total_bookings,
                "completed": completed_bookings,
                "pending": pending_bookings
            },
            "leads": {
                "total": total_leads,
                "converted": converted_leads,
                "conversion_rate": lead_conversion_rate
            },
            "monthly_trends": monthly_trends
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== NEWS MANAGEMENT ====================

class NewsCreate(BaseModel):
    title: str
    content: str
    target_audience: str = "all"  # all, students, parents, teachers
    is_published: bool = False
    # Retained for compatibility with existing clients. Published news now
    # always notifies its target audience; recipient preferences still apply.
    send_notification: bool = True

class NewsUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    target_audience: Optional[str] = None
    is_published: Optional[bool] = None

NEWS_AUDIENCE_ROLES = {
    "all": ["student", "parent", "teacher", "support", "reception", "manager", "super_admin"],
    "students": ["student"],
    "parents": ["parent"],
    "teachers": ["teacher"],
    "staff": ["teacher", "support", "reception", "manager", "super_admin"],
}

def get_news_target_roles(target_audience: str) -> List[str]:
    return NEWS_AUDIENCE_ROLES.get(target_audience, NEWS_AUDIENCE_ROLES["all"])

@router.get("/news")
async def get_news(
    published_only: bool = False,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all news articles"""
    from server import db, serialize_doc
    
    try:
        query = {}
        if published_only or current_user["role"] not in ["super_admin", "manager"]:
            query["is_published"] = True
            # Filter by target audience for non-admins
            if current_user["role"] == "student":
                query["target_audience"] = {"$in": ["all", "students"]}
            elif current_user["role"] == "parent":
                query["target_audience"] = {"$in": ["all", "parents"]}
            elif current_user["role"] == "teacher":
                query["target_audience"] = {"$in": ["all", "teachers"]}
            elif current_user["role"] == "support":
                query["target_audience"] = {"$in": ["all", "staff"]}
            elif current_user["role"] == "reception":
                query["target_audience"] = {"$in": ["all", "staff"]}
        
        news = await db.news.find(query).sort("created_at", -1).to_list(100)
        return [serialize_doc(n) for n in news]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/news")
async def create_news(
    news_data: NewsCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a news article (Admin only)"""
    from server import db, serialize_doc, create_audit_log
    require_admin(current_user)
    
    try:
        news = {
            "title": news_data.title,
            "content": news_data.content,
            "target_audience": news_data.target_audience,
            "is_published": news_data.is_published,
            "created_by": str(current_user["_id"]),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "published_at": datetime.utcnow() if news_data.is_published else None
        }
        
        result = await db.news.insert_one(news)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "news",
            str(result.inserted_id),
            {"title": news_data.title},
            request.client.host if request.client else None
        )
        
        # Inbox records drive the website toast, while the same delivery helper
        # optionally sends mobile push. It enforces each recipient's preference.
        if news_data.is_published:
            from notification_helpers import notify_news_posted
            background_tasks.add_task(
                notify_news_posted,
                db,
                news_data.title,
                get_news_target_roles(news_data.target_audience),
                str(result.inserted_id),
            )
        
        news["id"] = str(result.inserted_id)
        return serialize_doc(news)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/news/{news_id}")
async def update_news(
    news_id: str,
    news_data: NewsUpdate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update a news article"""
    from server import db, serialize_doc, create_audit_log
    require_admin(current_user)
    
    try:
        existing = await db.news.find_one({"_id": ObjectId(news_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="News not found")
        
        update_data = {k: v for k, v in news_data.dict().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        # Track publish time
        if news_data.is_published and not existing.get("is_published"):
            update_data["published_at"] = datetime.utcnow()
        
        await db.news.update_one(
            {"_id": ObjectId(news_id)},
            {"$set": update_data}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "news",
            news_id,
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.news.find_one({"_id": ObjectId(news_id)})

        # Publishing a draft is an announcement too. Notify exactly on the
        # unpublished -> published transition so ordinary edits do not spam.
        if news_data.is_published and not existing.get("is_published"):
            from notification_helpers import notify_news_posted
            background_tasks.add_task(
                notify_news_posted,
                db,
                updated.get("title", existing.get("title", "Academy news")),
                get_news_target_roles(updated.get("target_audience", "all")),
                news_id,
            )

        return serialize_doc(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/news/{news_id}")
async def delete_news(
    news_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Delete a news article"""
    from server import db, create_audit_log
    require_admin(current_user)

    if not ObjectId.is_valid(news_id):
        raise HTTPException(status_code=400, detail="Invalid news ID")
    
    try:
        existing = await db.news.find_one({"_id": ObjectId(news_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="News not found")
        
        await db.news.delete_one({"_id": ObjectId(news_id)})

        # Retracting news also retracts its inbox/toast entries. The title
        # fallback removes legacy notifications created before news_id was
        # attached to notification data.
        legacy_title = existing.get("title", "")
        legacy_message = legacy_title[:100] + ("..." if len(legacy_title) > 100 else "")
        await db.notifications.delete_many({
            "type": "news_announcement",
            "$or": [
                {"data.news_id": news_id},
                {
                    "data.news_id": {"$exists": False},
                    "message": legacy_message,
                },
            ],
        })
        
        await create_audit_log(
            str(current_user["_id"]),
            "delete",
            "news",
            news_id,
            {"title": existing.get("title")},
            request.client.host if request.client else None
        )
        
        return {"message": "News deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== AUDIT LOGS ====================

@router.get("/audit-logs")
async def get_audit_logs(
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get audit logs (Super Admin only)"""
    from server import db, serialize_doc
    require_super_admin(current_user)
    
    try:
        query = {}
        if entity_type:
            # Audit writers use resource_type. Keep legacy entity_type rows
            # visible while making the public filter match the stored schema.
            query["$or"] = [
                {"resource_type": entity_type},
                {"entity_type": entity_type},
            ]
        if action:
            query["action"] = action
        
        logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
        
        # Enrich with user info
        for log in logs:
            user = await db.users.find_one({"_id": ObjectId(log["user_id"])})
            if user:
                log["user_name"] = user.get("full_name", "Unknown")
                log["user_role"] = user.get("role", "unknown")
        
        return [serialize_doc(log) for log in logs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/audit-logs/login-history")
async def get_login_history(
    limit: int = 50,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get login history (Super Admin only)"""
    from server import db, serialize_doc
    require_super_admin(current_user)
    
    try:
        logs = await db.audit_logs.find({"action": "login"}).sort("timestamp", -1).limit(limit).to_list(limit)
        
        for log in logs:
            user = await db.users.find_one({"_id": ObjectId(log["user_id"])})
            if user:
                log["user_name"] = user.get("full_name", "Unknown")
                log["user_role"] = user.get("role", "unknown")
                log["user_login"] = user.get("login", "")
        
        return [serialize_doc(log) for log in logs]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BACKUPS ====================

class BackupCreate(BaseModel):
    backup_type: str = "manual"  # manual, scheduled
    include_collections: List[str] = []


BACKUP_CHUNK_BYTES = 4 * 1024 * 1024
BACKUP_EXCLUDED_COLLECTIONS = {"backups", "backup_chunks"}
EXPORT_COLLECTIONS = {
    "students": "students",
    "teachers": "teachers",
    "payments": "finance_receipts",
    "attendance": "attendance",
    "groups": "groups",
}


def _human_bytes(value: int) -> str:
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.1f} MB"
    return f"{value / 1024:.1f} KB"


def _plain_export_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(
            json.loads(json_util.dumps(value)),
            ensure_ascii=False,
            separators=(",", ":"),
        )
    if value is None:
        return ""
    return str(value)

@router.get("/backups")
async def get_backups(current_user: dict = Depends(get_current_user_dep)):
    """Get backup history"""
    from server import db, serialize_doc
    require_super_admin(current_user)
    
    try:
        backups = await db.backups.find({}).sort("created_at", -1).limit(50).to_list(50)
        return [serialize_doc(b) for b in backups]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/backups")
async def create_backup(
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a downloadable gzip-compressed Extended JSON database snapshot."""
    from server import db, serialize_doc, create_audit_log
    require_super_admin(current_user)
    
    try:
        collections = sorted(
            name for name in await db.list_collection_names()
            if name not in BACKUP_EXCLUDED_COLLECTIONS and not name.startswith("system.")
        )
        created_at = datetime.utcnow()
        snapshot = {
            "format": "nuriks-academy-backup",
            "version": 1,
            "created_at": created_at,
            "collections": {},
        }
        backup_stats = {}
        for collection_name in collections:
            rows = await db[collection_name].find({}).to_list(None)
            snapshot["collections"][collection_name] = rows
            backup_stats[collection_name] = len(rows)

        raw_payload = json_util.dumps(snapshot).encode("utf-8")
        compressed_payload = gzip.compress(raw_payload, compresslevel=6, mtime=0)
        checksum = hashlib.sha256(compressed_payload).hexdigest()
        backup_id = ObjectId()
        chunks = [
            {
                "backup_id": str(backup_id),
                "sequence": sequence,
                "data": compressed_payload[offset:offset + BACKUP_CHUNK_BYTES],
            }
            for sequence, offset in enumerate(range(0, len(compressed_payload), BACKUP_CHUNK_BYTES))
        ]
        if chunks:
            await db.backup_chunks.insert_many(chunks)
        total_records = sum(backup_stats.values())
        
        backup = {
            "_id": backup_id,
            "backup_type": "manual",
            "status": "completed",
            "created_by": str(current_user["_id"]),
            "created_at": created_at,
            "completed_at": datetime.utcnow(),
            "collections": backup_stats,
            "total_records": total_records,
            "size_estimate": _human_bytes(len(compressed_payload)),
            "size_bytes": len(compressed_payload),
            "sha256": checksum,
            "chunk_count": len(chunks),
            "format_version": 1,
            "downloadable": True,
        }
        
        try:
            await db.backups.insert_one(backup)
        except Exception:
            await db.backup_chunks.delete_many({"backup_id": str(backup_id)})
            raise
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "backup",
            str(backup_id),
            {"backup_type": "manual", "total_records": total_records},
            request.client.host if request.client else None
        )
        
        backup["id"] = str(backup_id)
        return serialize_doc(backup)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backups/{backup_id}/download")
async def download_backup(
    backup_id: str,
    current_user: dict = Depends(get_current_user_dep),
):
    """Download and integrity-check a previously created snapshot."""
    from server import db
    require_super_admin(current_user)

    if not ObjectId.is_valid(backup_id):
        raise HTTPException(status_code=400, detail="Invalid backup ID")
    backup = await db.backups.find_one({"_id": ObjectId(backup_id)})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    if not backup.get("downloadable"):
        raise HTTPException(status_code=409, detail="This legacy backup entry has no snapshot file")

    chunks = await db.backup_chunks.find({"backup_id": backup_id}).sort("sequence", 1).to_list(None)
    if len(chunks) != backup.get("chunk_count"):
        raise HTTPException(status_code=500, detail="Backup snapshot is incomplete")
    payload = b"".join(bytes(chunk["data"]) for chunk in chunks)
    if hashlib.sha256(payload).hexdigest() != backup.get("sha256"):
        raise HTTPException(status_code=500, detail="Backup snapshot integrity check failed")
    stamp = backup["created_at"].strftime("%Y%m%dT%H%M%SZ")
    return Response(
        content=payload,
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="nuriks-academy-backup-{stamp}.json.gz"',
            "Cache-Control": "no-store",
            "X-Content-SHA256": backup["sha256"],
        },
    )

@router.get("/export/{export_type}")
async def export_data(
    export_type: str,
    collection: str = "students",
    current_user: dict = Depends(get_current_user_dep)
):
    """Export a fixed, super-admin-only dataset as a real CSV or PDF file."""
    from server import db
    require_super_admin(current_user)
    
    try:
        if export_type not in {"csv", "pdf"}:
            raise HTTPException(status_code=400, detail="Export type must be csv or pdf")
        database_collection = EXPORT_COLLECTIONS.get(collection)
        if not database_collection:
            raise HTTPException(status_code=400, detail="Unsupported export collection")

        data = await db[database_collection].find({}).to_list(10_000)
        rows = [
            {key: _plain_export_value(value) for key, value in document.items()}
            for document in data
        ]
        stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        if export_type == "csv":
            headers = sorted({key for row in rows for key in row})
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
            return Response(
                content=("\ufeff" + output.getvalue()).encode("utf-8"),
                media_type="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": f'attachment; filename="{collection}-{stamp}.csv"',
                    "Cache-Control": "no-store",
                    "X-Record-Count": str(len(rows)),
                },
            )

        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

        output = io.BytesIO()
        styles = getSampleStyleSheet()
        document = SimpleDocTemplate(
            output,
            pagesize=A4,
            leftMargin=14 * mm,
            rightMargin=14 * mm,
            topMargin=14 * mm,
            bottomMargin=14 * mm,
            title=f"Nurik's Academy {collection} export",
        )
        story = [
            Paragraph(f"Nurik's Academy — {html.escape(collection.title())} export", styles["Title"]),
            Paragraph(f"Generated {stamp}; {len(rows)} record(s)", styles["Normal"]),
            Spacer(1, 8),
        ]
        if not rows:
            story.append(Paragraph("No records.", styles["Normal"]))
        for index, row in enumerate(rows, start=1):
            story.append(Paragraph(f"<b>Record {index}</b>", styles["Heading3"]))
            for key, value in row.items():
                safe_key = html.escape(str(key))
                safe_value = html.escape(str(value)).replace("\n", "<br/>")
                story.append(Paragraph(f"<b>{safe_key}:</b> {safe_value}", styles["BodyText"]))
            story.append(Spacer(1, 6))
        document.build(story)
        return Response(
            content=output.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{collection}-{stamp}.pdf"',
                "Cache-Control": "no-store",
                "X-Record-Count": str(len(rows)),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BRANCHES ====================

class BranchCreate(BaseModel):
    name: str
    address: str
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True

@router.get("/branches")
async def get_branches(current_user: dict = Depends(get_current_user_dep)):
    """Get all branches"""
    from server import db, serialize_doc
    require_admin(current_user)
    
    try:
        branches = await db.branches.find({}).to_list(100)
        return [serialize_doc(b) for b in branches]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/branches")
async def create_branch(
    branch: BranchCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new branch"""
    from server import db, serialize_doc, create_audit_log
    require_super_admin(current_user)
    
    try:
        branch_doc = {
            **branch.dict(),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await db.branches.insert_one(branch_doc)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "branch",
            str(result.inserted_id),
            {"name": branch.name},
            request.client.host if request.client else None
        )
        
        branch_doc["id"] = str(result.inserted_id)
        return serialize_doc(branch_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
