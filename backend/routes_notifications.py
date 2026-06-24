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
    payment_reminders: bool = True
    homework_notifications: bool = True
    test_notifications: bool = True
    lesson_reminders: bool = True
    news_announcements: bool = True
    admin_broadcasts: bool = True

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    from auth import get_current_user
    return await get_current_user(credentials, db)

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
        "payment_reminders": prefs.get("payment_reminders", True),
        "homework_notifications": prefs.get("homework_notifications", True),
        "test_notifications": prefs.get("test_notifications", True),
        "lesson_reminders": prefs.get("lesson_reminders", True),
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
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    
    return {"message": "Preferences updated successfully"}

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
    
    tokens = []
    
    if notification.target_user_ids:
        for user_id in notification.target_user_ids:
            user_tokens = await get_user_tokens(user_id, db)
            tokens.extend(user_tokens)
    
    if notification.target_roles:
        role_tokens = await get_tokens_by_role(notification.target_roles, db)
        tokens.extend(role_tokens)
    
    # Remove duplicates
    tokens = list(set(tokens))
    
    if not tokens:
        return {"message": "No registered devices found", "sent_count": 0}
    
    # Save notification to history
    notif_doc = {
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "target_roles": notification.target_roles,
        "target_user_ids": notification.target_user_ids,
        "sent_by": str(current_user["_id"]),
        "sent_count": len(tokens),
        "created_at": datetime.utcnow()
    }
    await db.notification_history.insert_one(notif_doc)
    
    # Send in background
    background_tasks.add_task(
        send_expo_push_notification,
        tokens,
        notification.title,
        notification.body,
        notification.data
    )
    
    return {"message": "Notification queued", "sent_count": len(tokens)}

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
    
    # Get all active tokens
    all_tokens = await db.push_tokens.find({"is_active": True}).to_list(10000)
    tokens = [t["token"] for t in all_tokens]
    
    if not tokens:
        return {"message": "No registered devices found", "sent_count": 0}
    
    # Save to history
    notif_doc = {
        "title": notification.title,
        "body": notification.body,
        "data": notification.data,
        "type": "broadcast",
        "sent_by": str(current_user["_id"]),
        "sent_count": len(tokens),
        "created_at": datetime.utcnow()
    }
    await db.notification_history.insert_one(notif_doc)
    
    background_tasks.add_task(
        send_expo_push_notification,
        tokens,
        notification.title,
        notification.body,
        notification.data
    )
    
    return {"message": "Broadcast notification queued", "sent_count": len(tokens)}

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
    
    notifications = await db.notification_history.find({}).sort(
        "created_at", -1
    ).skip(skip).limit(limit).to_list(limit)
    
    return [serialize_doc(n) for n in notifications]

# ==================== AUTOMATED NOTIFICATIONS ====================

async def send_payment_reminder(db, user_id: str, student_name: str, amount: float, due_date: str):
    """Send payment reminder notification"""
    # Check user preferences
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    if prefs and not prefs.get("payment_reminders", True):
        return
    
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
    
    tokens = await get_user_tokens(str(current_user["_id"]), db)
    
    if not tokens:
        return {"message": "No push tokens registered for this user", "success": False}
    
    result = await send_expo_push_notification(
        tokens,
        "🔔 Test Notification",
        "This is a test notification from Nurik's Academy",
        {"type": "test"}
    )
    
    return {"message": "Test notification sent", "tokens_count": len(tokens), "result": result}
