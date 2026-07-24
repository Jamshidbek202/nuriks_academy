"""
Push Notifications System for Nurik's Academy
Supports: Payment reminders, Homework, Tests, Lessons, News, Admin broadcasts
Uses Expo Push Notifications
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import httpx
import logging
import os

router = APIRouter(prefix="/notifications", tags=["Notifications"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

# Expo Push API
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

class PushToken(BaseModel):
    token: str
    device_type: Optional[str] = None  # ios, android, web

class NotificationCreate(BaseModel):
    title: str
    body: str
    data: Optional[dict] = None
    target_roles: Optional[List[str]] = None  # Target specific roles
    target_user_ids: Optional[List[str]] = None  # Target specific users

class NotificationPreferences(BaseModel):
    chat_notifications: bool = True
    payment_reminders: bool = True
    homework_notifications: bool = True
    test_notifications: bool = True
    lesson_reminders: bool = True
    attendance_notifications: bool = True
    news_announcements: bool = True
    admin_broadcasts: bool = True

NOTIFICATION_CATEGORIES = {
    "chat_message": "chat",
    "homework_assigned": "academic",
    "test_scheduled": "academic",
    "lesson_reminder": "academic",
    "grade": "academic",
    "attendance": "academic",
    "certificate": "academic",
    "payment_reminder": "payments",
    "payment_received": "payments",
    "news_announcement": "news",
    "admin_broadcast": "system",
}

PREFERENCE_BY_TYPE = {
    "chat_message": "chat_notifications",
    "homework_assigned": "homework_notifications",
    "test_scheduled": "test_notifications",
    "lesson_reminder": "lesson_reminders",
    "attendance": "attendance_notifications",
    "payment_reminder": "payment_reminders",
    "payment_received": "payment_reminders",
    "news_announcement": "news_announcements",
    "admin_broadcast": "admin_broadcasts",
}

async def remove_stale_news_notifications(db, user_id: str, notifications: list) -> list:
    """Remove retracted news from a user's inbox, including legacy entries."""
    news_notifications = [
        notification for notification in notifications
        if notification.get("type") == "news_announcement"
    ]
    if not news_notifications:
        return notifications

    published_news = await db.news.find({"is_published": True}).to_list(5000)
    published_ids = {str(item["_id"]) for item in published_news}
    published_messages = {
        item.get("title", "")[:100] + ("..." if len(item.get("title", "")) > 100 else "")
        for item in published_news
    }

    stale_ids = []
    for notification in news_notifications:
        news_id = (notification.get("data") or {}).get("news_id")
        is_live = (
            str(news_id) in published_ids
            if news_id
            else notification.get("message") in published_messages
        )
        if not is_live:
            stale_ids.append(notification["_id"])

    if not stale_ids:
        return notifications

    await db.notifications.delete_many({
        "_id": {"$in": stale_ids},
        "user_id": str(user_id),
    })
    stale_id_set = set(stale_ids)
    return [notification for notification in notifications if notification["_id"] not in stale_id_set]

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    from auth import get_current_user
    return await get_current_user(credentials, db)

async def create_user_notification(
    db,
    user_id: str,
    title: str,
    message: str,
    notification_type: str,
    data: Optional[dict] = None,
    preference_key: Optional[str] = None,
    send_push: bool = True,
):
    """Respect preferences, persist an inbox item, and optionally send push."""
    user_id = str(user_id)
    preference_key = preference_key or PREFERENCE_BY_TYPE.get(notification_type)
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    mandatory_financial = notification_type in {"payment_reminder", "payment_received"}
    if not mandatory_financial and preference_key and prefs and not prefs.get(preference_key, True):
        return None

    now = datetime.utcnow()
    document = {
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "category": NOTIFICATION_CATEGORIES.get(notification_type, "system"),
        "data": data or {},
        "is_read": False,
        "read_at": None,
        "created_at": now,
        "sent_at": now,
    }
    result = await db.notifications.insert_one(document)

    if send_push:
        tokens = await get_user_tokens(user_id, db)
        if tokens:
            await send_expo_push_notification(tokens, title, message, {
                **(data or {}),
                "type": notification_type,
                "notification_id": str(result.inserted_id),
            })

    document["_id"] = result.inserted_id
    return document

# ==================== DEVICE TOKEN MANAGEMENT ====================

@router.post("/register-token")
async def register_push_token(
    data: PushToken,
    current_user: dict = Depends(get_current_user_dep)
):
    """Register a device push token for the current user"""
    from server import db
    
    user_id = str(current_user["_id"])
    
    # Check if token already registered
    existing = await db.push_tokens.find_one({
        "user_id": user_id,
        "token": data.token
    })
    
    if existing:
        # Update last seen
        await db.push_tokens.update_one(
            {"_id": existing["_id"]},
            {"$set": {"last_used": datetime.utcnow()}}
        )
        return {"message": "Token already registered", "token_id": str(existing["_id"])}
    
    # Register new token
    token_doc = {
        "user_id": user_id,
        "token": data.token,
        "device_type": data.device_type,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_used": datetime.utcnow()
    }
    
    result = await db.push_tokens.insert_one(token_doc)
    
    return {"message": "Token registered successfully", "token_id": str(result.inserted_id)}

@router.delete("/unregister-token")
async def unregister_push_token(
    token: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Unregister a device push token"""
    from server import db
    
    user_id = str(current_user["_id"])
    
    result = await db.push_tokens.delete_one({
        "user_id": user_id,
        "token": token
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Token not found")
    
    return {"message": "Token unregistered successfully"}

# ==================== NOTIFICATION PREFERENCES ====================

@router.get("/preferences")
async def get_notification_preferences(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get user's notification preferences"""
    from server import db
    
    user_id = str(current_user["_id"])
    
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    
    if not prefs:
        # Return defaults
        return NotificationPreferences().dict()
    
    return {
        "chat_notifications": prefs.get("chat_notifications", True),
        "payment_reminders": True,
        "homework_notifications": prefs.get("homework_notifications", True),
        "test_notifications": prefs.get("test_notifications", True),
        "lesson_reminders": prefs.get("lesson_reminders", True),
        "attendance_notifications": prefs.get("attendance_notifications", True),
        "news_announcements": prefs.get("news_announcements", True),
        "admin_broadcasts": prefs.get("admin_broadcasts", True)
    }

@router.put("/preferences")
async def update_notification_preferences(
    prefs: NotificationPreferences,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update user's notification preferences"""
    from server import db
    
    user_id = str(current_user["_id"])
    
    await db.notification_preferences.update_one(
        {"user_id": user_id},
        {"$set": {
            **prefs.dict(),
            "payment_reminders": True,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    
    return {"message": "Preferences updated successfully"}

# ==================== PERSONAL NOTIFICATION INBOX ====================

@router.get("")
async def get_my_notifications(
    category: Optional[str] = None,
    unread_only: bool = False,
    sort: str = "newest",
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep),
):
    """Return only the signed-in user's inbox notifications."""
    from server import db, serialize_doc

    if category and category not in {"chat", "academic", "payments", "news", "system"}:
        raise HTTPException(status_code=400, detail="Invalid notification category")
    if sort not in {"newest", "oldest"}:
        raise HTTPException(status_code=400, detail="Sort must be newest or oldest")

    query = {"user_id": str(current_user["_id"])}
    if category:
        legacy_types = [notification_type for notification_type, mapped_category in NOTIFICATION_CATEGORIES.items() if mapped_category == category]
        query["$or"] = [{"category": category}, {"category": {"$exists": False}, "type": {"$in": legacy_types}}]
    if unread_only:
        query["is_read"] = False

    safe_limit = min(max(limit, 1), 200)
    notifications = await db.notifications.find(query).sort(
        "created_at", -1 if sort == "newest" else 1
    ).skip(max(skip, 0)).limit(safe_limit).to_list(safe_limit)
    notifications = await remove_stale_news_notifications(
        db, str(current_user["_id"]), notifications
    )
    for notification in notifications:
        notification.setdefault("category", NOTIFICATION_CATEGORIES.get(notification.get("type"), "system"))
    return [serialize_doc(notification) for notification in notifications]

@router.get("/unread-count")
async def get_unread_notification_count(current_user: dict = Depends(get_current_user_dep)):
    from server import db
    user_id = str(current_user["_id"])
    news_notifications = await db.notifications.find({
        "user_id": user_id,
        "type": "news_announcement",
    }).to_list(5000)
    await remove_stale_news_notifications(db, user_id, news_notifications)
    count = await db.notifications.count_documents({
        "user_id": user_id, "is_read": False,
    })
    return {"count": count}

@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(status_code=400, detail="Invalid notification ID")
    result = await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": str(current_user["_id"])},
        {"$set": {"is_read": True, "read_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@router.post("/read-all")
async def mark_all_notifications_read(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep),
):
    from server import db
    query = {"user_id": str(current_user["_id"]), "is_read": False}
    if category:
        if category not in {"chat", "academic", "payments", "news", "system"}:
            raise HTTPException(status_code=400, detail="Invalid notification category")
        legacy_types = [notification_type for notification_type, mapped_category in NOTIFICATION_CATEGORIES.items() if mapped_category == category]
        query["$or"] = [{"category": category}, {"category": {"$exists": False}, "type": {"$in": legacy_types}}]
    result = await db.notifications.update_many(
        query, {"$set": {"is_read": True, "read_at": datetime.utcnow()}},
    )
    return {"message": "Notifications marked as read", "updated_count": result.modified_count}

# ==================== SEND NOTIFICATIONS ====================

async def send_expo_push_notification(tokens: List[str], title: str, body: str, data: dict = None):
    """Send push notification via Expo Push API"""
    
    messages = []
    for token in tokens:
        if not token.startswith("ExponentPushToken"):
            continue
            
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "priority": "high",
            "channelId": "default"
        }
        messages.append(message)
    
    if not messages:
        logger.warning("No valid Expo push tokens to send to")
        return {"success": False, "error": "No valid tokens"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Push notification sent successfully: {len(messages)} messages")
                return {"success": True, "result": result}
            else:
                logger.error(f"Push notification failed: {response.status_code} - {response.text}")
                return {"success": False, "error": response.text}
                
    except Exception as e:
        logger.error(f"Push notification error: {e}")
        return {"success": False, "error": str(e)}

async def get_user_tokens(user_id: str, db) -> List[str]:
    """Get all active push tokens for a user"""
    tokens = await db.push_tokens.find({
        "user_id": user_id,
        "is_active": True
    }).to_list(10)
    
    return [t["token"] for t in tokens]

async def get_tokens_by_role(roles: List[str], db) -> List[str]:
    """Get all active push tokens for users with specified roles"""
    users = await db.users.find({
        "role": {"$in": roles},
        "is_active": True
    }).to_list(1000)
    
    user_ids = [str(u["_id"]) for u in users]
    
    tokens = await db.push_tokens.find({
        "user_id": {"$in": user_ids},
        "is_active": True
    }).to_list(5000)
    
    return [t["token"] for t in tokens]

# ==================== NOTIFICATION ENDPOINTS ====================

@router.post("/send")
async def send_notification(
    notification: NotificationCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Send a notification to specific users or roles (Admin only)"""
    from server import db, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")

    branch_id = current_user.get("branch_id") if current_user["role"] == "manager" else None
    recipient_ids = set()
    requested_user_ids = set(notification.target_user_ids or [])
    if requested_user_ids:
        invalid_ids = [user_id for user_id in requested_user_ids if not ObjectId.is_valid(user_id)]
        if invalid_ids:
            raise HTTPException(status_code=400, detail="A target user ID is invalid")
        target_query = {
            "_id": {"$in": [ObjectId(user_id) for user_id in requested_user_ids]},
            "is_active": True,
        }
        if branch_id is not None:
            target_query["branch_id"] = branch_id
        target_users = await db.users.find(target_query).to_list(len(requested_user_ids))
        recipient_ids.update(str(user["_id"]) for user in target_users)
        if len(recipient_ids) != len(requested_user_ids):
            raise HTTPException(status_code=403, detail="A target user is outside your branch or inactive")
    if notification.target_roles:
        role_query = {"role": {"$in": notification.target_roles}, "is_active": True}
        if branch_id is not None:
            role_query["branch_id"] = branch_id
        users = await db.users.find(role_query).to_list(5000)
        recipient_ids.update(str(user["_id"]) for user in users)
    
    # Save notification to history
    notif_doc = {
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "target_roles": notification.target_roles,
        "target_user_ids": notification.target_user_ids,
        "sent_by": str(current_user["_id"]),
        "sent_count": len(recipient_ids),
        "branch_id": branch_id,
        "created_at": datetime.utcnow()
    }
    await db.notification_history.insert_one(notif_doc)
    
    delivered = 0
    for user_id in recipient_ids:
        saved = await create_user_notification(
            db, user_id, notification.title, notification.body,
            "admin_broadcast", notification.data, preference_key="admin_broadcasts",
        )
        delivered += int(saved is not None)

    return {"message": "Notification delivered", "sent_count": delivered}

@router.post("/broadcast")
async def broadcast_notification(
    notification: NotificationCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user_dep)
):
    """Broadcast notification to all users (Admin only)"""
    from server import db
    
    if current_user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    users = await db.users.find({"is_active": True}).to_list(10000)
    
    # Save to history
    notif_doc = {
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "type": "broadcast",
        "sent_by": str(current_user["_id"]),
        "sent_count": len(users),
        "created_at": datetime.utcnow()
    }
    await db.notification_history.insert_one(notif_doc)
    
    delivered = 0
    for user in users:
        saved = await create_user_notification(
            db, str(user["_id"]), notification.title, notification.body,
            "admin_broadcast", notification.data, preference_key="admin_broadcasts",
        )
        delivered += int(saved is not None)

    return {"message": "Broadcast delivered", "sent_count": delivered}

@router.get("/history")
async def get_notification_history(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get notification history (Admin only)"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if current_user["role"] == "manager":
        query["branch_id"] = current_user.get("branch_id")
    notifications = await db.notification_history.find(query).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(limit)
    
    return [serialize_doc(n) for n in notifications]

# ==================== AUTOMATED NOTIFICATIONS ====================

async def send_payment_reminder(db, user_id: str, student_name: str, amount: float, due_date: str):
    """Send payment reminder notification"""
    tokens = await get_user_tokens(user_id, db)
    if tokens:
        await send_expo_push_notification(
            tokens,
            "💰 Payment Reminder",
            f"Payment of ${amount:.2f} for {student_name} is due on {due_date}",
            {"type": "payment_reminder", "user_id": user_id}
        )

async def send_homework_notification(db, user_id: str, homework_title: str, due_date: str):
    """Send homework notification"""
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    if prefs and not prefs.get("homework_notifications", True):
        return
    
    tokens = await get_user_tokens(user_id, db)
    if tokens:
        await send_expo_push_notification(
            tokens,
            "📚 New Homework Assigned",
            f"'{homework_title}' is due on {due_date}",
            {"type": "homework", "user_id": user_id}
        )

async def send_test_notification(db, user_id: str, test_title: str, test_date: str):
    """Send test/exam notification"""
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    if prefs and not prefs.get("test_notifications", True):
        return
    
    tokens = await get_user_tokens(user_id, db)
    if tokens:
        await send_expo_push_notification(
            tokens,
            "📝 Upcoming Test",
            f"'{test_title}' is scheduled for {test_date}",
            {"type": "test", "user_id": user_id}
        )

async def send_lesson_reminder(db, user_id: str, lesson_title: str, start_time: str):
    """Send lesson reminder notification"""
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    if prefs and not prefs.get("lesson_reminders", True):
        return
    
    tokens = await get_user_tokens(user_id, db)
    if tokens:
        await send_expo_push_notification(
            tokens,
            "🎓 Lesson Reminder",
            f"'{lesson_title}' starts at {start_time}",
            {"type": "lesson_reminder", "user_id": user_id}
        )

async def send_news_notification(db, roles: List[str], news_title: str):
    """Send news announcement notification"""
    tokens = await get_tokens_by_role(roles, db)
    
    # Filter by preferences
    # For simplicity, we send to all - in production, filter individually
    
    if tokens:
        await send_expo_push_notification(
            tokens,
            "📰 News from Nurik's Academy",
            news_title,
            {"type": "news"}
        )

# ==================== TEST ENDPOINT ====================

@router.post("/test")
async def test_notification(
    current_user: dict = Depends(get_current_user_dep)
):
    """Send a test notification to the current user"""
    from server import db
    
    result = await create_user_notification(
        db, str(current_user["_id"]), "🔔 Test Notification",
        "This is a test notification from Nurik's Academy",
        "admin_broadcast", {"test": True}, preference_key=None,
    )
    return {"message": "Test notification sent", "success": result is not None}
