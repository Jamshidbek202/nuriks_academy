"""
Notification Helper Module for Nurik's Academy
Provides centralized notification triggering for all modules
"""
import logging
from typing import List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Import the core notification functions
from routes_notifications import (
    send_expo_push_notification,
    get_user_tokens,
    get_tokens_by_role
)

async def notify_homework_assigned(db, student_ids: List[str], homework_title: str, due_date: str, group_name: str = ""):
    """
    Send notification when homework is assigned to students
    Also notifies parents of the students
    """
    for student_id in student_ids:
        try:
            # Get student's user account
            student = await db.students.find_one({"_id": student_id}) or await db.students.find_one({"user_id": student_id})
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            # Check preferences
            prefs = await db.notification_preferences.find_one({"user_id": user_id})
            if prefs and not prefs.get("homework_notifications", True):
                continue
            
            # Send to student
            tokens = await get_user_tokens(user_id, db)
            if tokens:
                await send_expo_push_notification(
                    tokens,
                    "📚 New Homework Assigned",
                    f"'{homework_title}' is due on {due_date}" + (f" ({group_name})" if group_name else ""),
                    {"type": "homework_assigned", "student_id": student_id}
                )
            
            # Also notify parent if exists
            if student.get("parent_id"):
                parent = await db.parents.find_one({"_id": student["parent_id"]})
                if parent and parent.get("user_id"):
                    parent_tokens = await get_user_tokens(parent["user_id"], db)
                    if parent_tokens:
                        student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
                        await send_expo_push_notification(
                            parent_tokens,
                            "📚 Homework for Your Child",
                            f"'{homework_title}' assigned to {student_name}, due {due_date}",
                            {"type": "homework_assigned", "student_id": student_id}
                        )
        except Exception as e:
            logger.error(f"Error sending homework notification to {student_id}: {e}")

async def notify_test_scheduled(db, student_ids: List[str], test_title: str, test_date: str, test_type: str = "test"):
    """
    Send notification when a test is scheduled
    Also notifies parents
    """
    emoji = "📝" if test_type == "mid_test" else "📋"
    type_label = "Mid-Term Test" if test_type == "mid_test" else "End Test"
    
    for student_id in student_ids:
        try:
            student = await db.students.find_one({"_id": student_id}) or await db.students.find_one({"user_id": student_id})
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            # Check preferences
            prefs = await db.notification_preferences.find_one({"user_id": user_id})
            if prefs and not prefs.get("test_notifications", True):
                continue
            
            # Send to student
            tokens = await get_user_tokens(user_id, db)
            if tokens:
                await send_expo_push_notification(
                    tokens,
                    f"{emoji} {type_label} Scheduled",
                    f"'{test_title}' on {test_date}",
                    {"type": "test_scheduled", "test_type": test_type, "student_id": student_id}
                )
            
            # Notify parent
            if student.get("parent_id"):
                parent = await db.parents.find_one({"_id": student["parent_id"]})
                if parent and parent.get("user_id"):
                    parent_tokens = await get_user_tokens(parent["user_id"], db)
                    if parent_tokens:
                        student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
                        await send_expo_push_notification(
                            parent_tokens,
                            f"{emoji} Test for Your Child",
                            f"'{test_title}' for {student_name} on {test_date}",
                            {"type": "test_scheduled", "student_id": student_id}
                        )
        except Exception as e:
            logger.error(f"Error sending test notification to {student_id}: {e}")

async def notify_payment_reminder(db, parent_user_id: str, student_name: str, amount: float, due_date: str):
    """
    Send payment reminder to parent
    """
    try:
        prefs = await db.notification_preferences.find_one({"user_id": parent_user_id})
        if prefs and not prefs.get("payment_reminders", True):
            return
        
        tokens = await get_user_tokens(parent_user_id, db)
        if tokens:
            await send_expo_push_notification(
                tokens,
                "💰 Payment Reminder",
                f"Payment of {amount:,.0f} UZS for {student_name} is due on {due_date}",
                {"type": "payment_reminder", "parent_user_id": parent_user_id}
            )
    except Exception as e:
        logger.error(f"Error sending payment reminder to {parent_user_id}: {e}")

async def notify_payment_received(db, parent_user_id: str, student_name: str, amount: float):
    """
    Send payment confirmation notification
    """
    try:
        tokens = await get_user_tokens(parent_user_id, db)
        if tokens:
            await send_expo_push_notification(
                tokens,
                "✅ Payment Received",
                f"Payment of {amount:,.0f} UZS for {student_name} has been processed",
                {"type": "payment_received", "parent_user_id": parent_user_id}
            )
    except Exception as e:
        logger.error(f"Error sending payment confirmation to {parent_user_id}: {e}")

async def notify_news_posted(db, news_title: str, target_roles: Optional[List[str]] = None):
    """
    Send notification when news is posted
    By default, sends to all roles
    """
    try:
        roles = target_roles or ["student", "parent", "teacher", "support", "manager", "super_admin"]
        tokens = await get_tokens_by_role(roles, db)
        
        if tokens:
            await send_expo_push_notification(
                tokens,
                "📰 News from Nurik's Academy",
                news_title[:100] + ("..." if len(news_title) > 100 else ""),
                {"type": "news_announcement"}
            )
    except Exception as e:
        logger.error(f"Error sending news notification: {e}")

async def notify_chat_message(db, sender_id: str, recipient_id: str, sender_name: str, message_preview: str, conversation_id: str):
    """
    Send notification for new chat message
    """
    try:
        # Check if recipient wants chat notifications (use admin_broadcasts as fallback)
        prefs = await db.notification_preferences.find_one({"user_id": recipient_id})
        # We'll allow chat messages by default
        
        tokens = await get_user_tokens(recipient_id, db)
        if tokens:
            # Truncate message preview
            preview = message_preview[:50] + ("..." if len(message_preview) > 50 else "")
            
            await send_expo_push_notification(
                tokens,
                f"💬 {sender_name}",
                preview,
                {
                    "type": "chat_message",
                    "conversation_id": conversation_id,
                    "sender_id": sender_id
                }
            )
    except Exception as e:
        logger.error(f"Error sending chat notification to {recipient_id}: {e}")

async def notify_certificate_issued(db, student_user_id: str, student_name: str, certificate_type: str):
    """
    Send notification when certificate is issued
    """
    try:
        tokens = await get_user_tokens(student_user_id, db)
        if tokens:
            await send_expo_push_notification(
                tokens,
                "🎓 Certificate Issued",
                f"Your {certificate_type} certificate is ready for download",
                {"type": "certificate", "student_user_id": student_user_id}
            )
    except Exception as e:
        logger.error(f"Error sending certificate notification: {e}")

async def notify_attendance_marked(db, student_user_id: str, status: str, date: str, parent_user_id: Optional[str] = None):
    """
    Send notification when attendance is marked (especially for absences)
    """
    try:
        if status in ["absent", "late"]:
            emoji = "❌" if status == "absent" else "⏰"
            status_text = "Absent" if status == "absent" else "Late"
            
            # Notify student
            tokens = await get_user_tokens(student_user_id, db)
            if tokens:
                await send_expo_push_notification(
                    tokens,
                    f"{emoji} Attendance: {status_text}",
                    f"You were marked {status} on {date}",
                    {"type": "attendance", "status": status}
                )
            
            # Notify parent
            if parent_user_id:
                parent_tokens = await get_user_tokens(parent_user_id, db)
                if parent_tokens:
                    await send_expo_push_notification(
                        parent_tokens,
                        f"{emoji} Child Attendance: {status_text}",
                        f"Your child was marked {status} on {date}",
                        {"type": "attendance", "status": status}
                    )
    except Exception as e:
        logger.error(f"Error sending attendance notification: {e}")

async def notify_lesson_reminder(db, student_ids: List[str], lesson_name: str, start_time: str, teacher_name: str = ""):
    """
    Send lesson reminder notification (typically 30 minutes before)
    """
    for student_id in student_ids:
        try:
            student = await db.students.find_one({"_id": student_id}) or await db.students.find_one({"user_id": student_id})
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            prefs = await db.notification_preferences.find_one({"user_id": user_id})
            if prefs and not prefs.get("lesson_reminders", True):
                continue
            
            tokens = await get_user_tokens(user_id, db)
            if tokens:
                body = f"'{lesson_name}' starts at {start_time}"
                if teacher_name:
                    body += f" with {teacher_name}"
                
                await send_expo_push_notification(
                    tokens,
                    "🎓 Lesson Starting Soon",
                    body,
                    {"type": "lesson_reminder", "student_id": student_id}
                )
        except Exception as e:
            logger.error(f"Error sending lesson reminder to {student_id}: {e}")

async def notify_grade_posted(db, student_user_id: str, subject: str, grade: str, parent_user_id: Optional[str] = None):
    """
    Send notification when a grade is posted
    """
    try:
        tokens = await get_user_tokens(student_user_id, db)
        if tokens:
            await send_expo_push_notification(
                tokens,
                "📊 New Grade Posted",
                f"You received {grade} in {subject}",
                {"type": "grade", "subject": subject}
            )
        
        # Notify parent
        if parent_user_id:
            parent_tokens = await get_user_tokens(parent_user_id, db)
            if parent_tokens:
                await send_expo_push_notification(
                    parent_tokens,
                    "📊 Child's Grade Posted",
                    f"Your child received {grade} in {subject}",
                    {"type": "grade", "subject": subject}
                )
    except Exception as e:
        logger.error(f"Error sending grade notification: {e}")

# Export all notification functions
__all__ = [
    'notify_homework_assigned',
    'notify_test_scheduled',
    'notify_payment_reminder',
    'notify_payment_received',
    'notify_news_posted',
    'notify_chat_message',
    'notify_certificate_issued',
    'notify_attendance_marked',
    'notify_lesson_reminder',
    'notify_grade_posted'
]
