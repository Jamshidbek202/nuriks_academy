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
    create_user_notification,
)

async def _deliver(db, user_id: str, title: str, message: str, notification_type: str, data: dict, preference_key: Optional[str] = None, send_push: bool = True):
    return await create_user_notification(
        db, str(user_id), title, message, notification_type, data,
        preference_key=preference_key, send_push=send_push,
    )

async def _get_parent(db, student: dict):
    from bson import ObjectId
    parent_id = student.get("parent_id")
    if parent_id:
        query_id = ObjectId(parent_id) if ObjectId.is_valid(str(parent_id)) else parent_id
        parent = await db.parents.find_one({"_id": query_id})
        if parent:
            return parent
    return await db.parents.find_one({"student_ids": str(student["_id"])})

async def _get_student(db, student_id: str):
    from bson import ObjectId
    if ObjectId.is_valid(str(student_id)):
        student = await db.students.find_one({"_id": ObjectId(str(student_id))})
        if student:
            return student
    return await db.students.find_one({"user_id": str(student_id)})

async def notify_homework_assigned(db, student_ids: List[str], homework_title: str, due_date: str, group_name: str = ""):
    """
    Send notification when homework is assigned to students
    Also notifies parents of the students
    """
    for student_id in student_ids:
        try:
            # Get student's user account
            student = await _get_student(db, student_id)
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            await _deliver(
                db, user_id, "📚 New Homework Assigned",
                f"'{homework_title}' is due on {due_date}" + (f" ({group_name})" if group_name else ""),
                "homework_assigned", {"student_id": student_id}, "homework_notifications",
            )
            
            # Also notify parent if exists
            parent = await _get_parent(db, student)
            if parent and parent.get("user_id"):
                student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
                await _deliver(
                    db, parent["user_id"], "📚 Homework for Your Child",
                    f"'{homework_title}' assigned to {student_name}, due {due_date}",
                    "homework_assigned", {"student_id": student_id}, "homework_notifications",
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
            student = await _get_student(db, student_id)
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            await _deliver(
                db, user_id, f"{emoji} {type_label} Scheduled", f"'{test_title}' on {test_date}",
                "test_scheduled", {"test_type": test_type, "student_id": student_id}, "test_notifications",
            )
            
            # Notify parent
            parent = await _get_parent(db, student)
            if parent and parent.get("user_id"):
                student_name = f"{student.get('first_name', '')} {student.get('last_name', '')}".strip()
                await _deliver(
                    db, parent["user_id"], f"{emoji} Test for Your Child",
                    f"'{test_title}' for {student_name} on {test_date}",
                    "test_scheduled", {"student_id": student_id}, "test_notifications",
                )
        except Exception as e:
            logger.error(f"Error sending test notification to {student_id}: {e}")

async def notify_payment_reminder(db, parent_user_id: str, student_name: str, amount: float, due_date: str):
    """
    Send payment reminder to parent
    """
    try:
        await _deliver(
            db, parent_user_id, "💰 Payment Reminder",
            f"Payment of {amount:,.0f} UZS for {student_name} is due on {due_date}",
            "payment_reminder", {"parent_user_id": parent_user_id}, "payment_reminders",
        )
    except Exception as e:
        logger.error(f"Error sending payment reminder to {parent_user_id}: {e}")

async def notify_payment_received(db, parent_user_id: str, student_name: str, amount: float):
    """
    Send payment confirmation notification
    """
    try:
        await _deliver(
            db, parent_user_id, "✅ Payment Received",
            f"Payment of {amount:,.0f} UZS for {student_name} has been processed",
            "payment_received", {"parent_user_id": parent_user_id}, "payment_reminders",
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
        users = await db.users.find({"role": {"$in": roles}, "is_active": True}).to_list(5000)
        for user in users:
            await _deliver(
                db, str(user["_id"]), "📰 News from Nurik's Academy",
                news_title[:100] + ("..." if len(news_title) > 100 else ""),
                "news_announcement", {}, "news_announcements",
            )
    except Exception as e:
        logger.error(f"Error sending news notification: {e}")

async def notify_chat_message(db, sender_id: str, recipient_id: str, sender_name: str, message_preview: str, conversation_id: str, send_push: bool = True):
    """
    Send notification for new chat message
    """
    try:
        preview = message_preview[:100] + ("..." if len(message_preview) > 100 else "")
        await _deliver(
            db, recipient_id, f"💬 {sender_name}", preview, "chat_message",
            {"conversation_id": conversation_id, "sender_id": sender_id},
            "chat_notifications", send_push=send_push,
        )
    except Exception as e:
        logger.error(f"Error sending chat notification to {recipient_id}: {e}")

async def notify_certificate_issued(db, student_user_id: str, student_name: str, certificate_type: str):
    """
    Send notification when certificate is issued
    """
    try:
        await _deliver(
            db, student_user_id, "🎓 Certificate Issued",
            f"Your {certificate_type} certificate is ready for download",
            "certificate", {"student_user_id": student_user_id},
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
            
            await _deliver(
                db, student_user_id, f"{emoji} Attendance: {status_text}",
                f"You were marked {status} on {date}", "attendance", {"status": status},
            )
            
            # Notify parent
            if parent_user_id:
                await _deliver(
                    db, parent_user_id, f"{emoji} Child Attendance: {status_text}",
                    f"Your child was marked {status} on {date}", "attendance", {"status": status},
                )
    except Exception as e:
        logger.error(f"Error sending attendance notification: {e}")

async def notify_lesson_reminder(db, student_ids: List[str], lesson_name: str, start_time: str, teacher_name: str = ""):
    """
    Send lesson reminder notification (typically 30 minutes before)
    """
    for student_id in student_ids:
        try:
            student = await _get_student(db, student_id)
            if not student:
                continue
            
            user_id = student.get("user_id", str(student["_id"]))
            
            body = f"'{lesson_name}' starts at {start_time}"
            if teacher_name:
                body += f" with {teacher_name}"
            await _deliver(
                db, user_id, "🎓 Lesson Starting Soon", body,
                "lesson_reminder", {"student_id": student_id}, "lesson_reminders",
            )
        except Exception as e:
            logger.error(f"Error sending lesson reminder to {student_id}: {e}")

async def notify_grade_posted(db, student_user_id: str, subject: str, grade: str, parent_user_id: Optional[str] = None):
    """
    Send notification when a grade is posted
    """
    try:
        await _deliver(
            db, student_user_id, "📊 New Grade Posted",
            f"You received {grade} in {subject}", "grade", {"subject": subject},
        )
        
        # Notify parent
        if parent_user_id:
            await _deliver(
                db, parent_user_id, "📊 Child's Grade Posted",
                f"Your child received {grade} in {subject}", "grade", {"subject": subject},
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
