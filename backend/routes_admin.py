"""
Routes for System Settings, Feature Flags, Analytics, News, Audit Logs
Super Admin only endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from auth import get_current_user

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
            return serialize_doc(default_flags)
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
        # Student statistics
        current_students = await db.students.count_documents({
            "status": {"$ne": "archived"}
        })
        active_students = await db.students.count_documents({"status": "active"})
        graduated_students = await db.students.count_documents({"status": "graduated"})
        frozen_students = await db.students.count_documents({"status": "frozen"})
        
        # Monthly revenue
        now = datetime.utcnow()
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        monthly_payments = await db.payments.find({
            "payment_date": {"$gte": first_of_month},
            "status": "completed"
        }).to_list(1000)
        monthly_revenue = sum(p.get("amount", 0) for p in monthly_payments)
        
        # Previous month revenue for comparison
        first_of_prev_month = (first_of_month - timedelta(days=1)).replace(day=1)
        prev_month_payments = await db.payments.find({
            "payment_date": {"$gte": first_of_prev_month, "$lt": first_of_month},
            "status": "completed"
        }).to_list(1000)
        prev_month_revenue = sum(p.get("amount", 0) for p in prev_month_payments)
        
        # Attendance rate
        total_attendance = await db.attendance_records.count_documents({})
        present_attendance = await db.attendance_records.count_documents({"status": {"$in": ["present", "late"]}})
        attendance_rate = round((present_attendance / total_attendance * 100) if total_attendance > 0 else 0, 1)
        
        # Test statistics
        mid_tests = await db.test_results.find({"test_type": "mid"}).to_list(1000)
        end_tests = await db.test_results.find({"test_type": "end"}).to_list(1000)
        
        mid_test_avg = round(sum(t.get("score", 0) for t in mid_tests) / len(mid_tests), 1) if mid_tests else 0
        end_test_avg = round(sum(t.get("score", 0) for t in end_tests) / len(end_tests), 1) if end_tests else 0
        
        # Teacher performance (based on student progress)
        teachers = await db.teachers.find({}).to_list(100)
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
        
        # Support session statistics
        total_bookings = await db.support_bookings.count_documents({})
        completed_bookings = await db.support_bookings.count_documents({"status": "completed"})
        pending_bookings = await db.support_bookings.count_documents({"status": {"$in": ["scheduled", "confirmed"]}})
        
        # Lead conversion rate
        total_leads = await db.leads.count_documents({})
        converted_leads = await db.leads.count_documents({"status": "converted"})
        lead_conversion_rate = round((converted_leads / total_leads * 100) if total_leads > 0 else 0, 1)
        
        # Monthly trends (last 6 months)
        monthly_trends = []
        for i in range(5, -1, -1):
            month_start = (now - timedelta(days=30*i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if i > 0:
                month_end = (now - timedelta(days=30*(i-1))).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                month_end = now
            
            month_payments = await db.payments.find({
                "payment_date": {"$gte": month_start, "$lt": month_end},
                "status": "completed"
            }).to_list(1000)
            
            month_students = await db.students.count_documents({
                "enrollment_date": {"$gte": month_start, "$lt": month_end}
            })
            
            monthly_trends.append({
                "month": month_start.strftime("%b %Y"),
                "revenue": sum(p.get("amount", 0) for p in month_payments),
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
    "all": ["student", "parent", "teacher", "support", "manager", "super_admin"],
    "students": ["student"],
    "parents": ["parent"],
    "teachers": ["teacher"],
    "staff": ["teacher", "support", "manager", "super_admin"],
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
            query["entity_type"] = entity_type
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
    """Create a manual backup (Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    require_super_admin(current_user)
    
    try:
        # Get collection counts for backup metadata
        collections = ["users", "students", "teachers", "groups", "payments", "attendance_records", "test_results"]
        backup_stats = {}
        total_records = 0
        
        for coll in collections:
            count = await db[coll].count_documents({})
            backup_stats[coll] = count
            total_records += count
        
        backup = {
            "backup_type": "manual",
            "status": "completed",
            "created_by": str(current_user["_id"]),
            "created_at": datetime.utcnow(),
            "completed_at": datetime.utcnow(),
            "collections": backup_stats,
            "total_records": total_records,
            "size_estimate": f"{total_records * 0.5:.1f} KB"  # Rough estimate
        }
        
        result = await db.backups.insert_one(backup)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "backup",
            str(result.inserted_id),
            {"backup_type": "manual", "total_records": total_records},
            request.client.host if request.client else None
        )
        
        backup["id"] = str(result.inserted_id)
        return serialize_doc(backup)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export/{export_type}")
async def export_data(
    export_type: str,
    collection: str = "students",
    current_user: dict = Depends(get_current_user_dep)
):
    """Export data to Excel/PDF format"""
    from server import db
    require_super_admin(current_user)
    
    try:
        # Get data from collection
        data = await db[collection].find({}).to_list(1000)
        
        # For now, return JSON data that frontend can convert
        # In production, would use openpyxl for Excel or reportlab for PDF
        return {
            "export_type": export_type,
            "collection": collection,
            "record_count": len(data),
            "data": [
                {k: str(v) if isinstance(v, (ObjectId, datetime)) else v 
                 for k, v in doc.items()} 
                for doc in data
            ]
        }
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
