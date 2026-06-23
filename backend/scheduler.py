"""
Payment Reminder Scheduler
Runs daily at 17:00 starting from the 5th of each month
Sends reminders to students with unpaid monthly fees
"""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def send_payment_reminders(db):
    """Send payment reminders to students with unpaid fees"""
    try:
        current_day = datetime.utcnow().day
        
        # Only send reminders from 5th onwards
        if current_day < 5:
            logger.info("Not time for payment reminders yet (before 5th)")
            return
        
        current_month = datetime.utcnow().strftime("%Y-%m")
        logger.info(f"Checking for unpaid students for month: {current_month}")
        
        # Get all active students
        students = await db.students.find({"status": "active"}).to_list(1000)
        
        unpaid_count = 0
        for student in students:
            # Check if student has completed payment for current month
            payment = await db.payments.find_one({
                "student_id": str(student["_id"]),
                "month": current_month,
                "payment_status": "completed"
            })
            
            if not payment:
                # Student hasn't paid - send notification
                notification = {
                    "user_id": student["user_id"],
                    "title": "Payment Reminder",
                    "message": f"Your payment for {current_month} is pending. Please complete your payment as soon as possible.",
                    "type": "payment_reminder",
                    "data": {
                        "student_id": str(student["_id"]),
                        "month": current_month
                    },
                    "is_read": False,
                    "sent_at": datetime.utcnow(),
                    "created_at": datetime.utcnow()
                }
                await db.notifications.insert_one(notification)
                
                # Also notify parent if exists
                if student.get("parent_id"):
                    parent = await db.parents.find_one({"_id": student["parent_id"]})
                    if parent:
                        parent_notification = {
                            "user_id": parent["user_id"],
                            "title": "Payment Reminder",
                            "message": f"Payment reminder for {student['first_name']} {student['last_name']} for {current_month} is pending.",
                            "type": "payment_reminder",
                            "data": {
                                "student_id": str(student["_id"]),
                                "month": current_month
                            },
                            "is_read": False,
                            "sent_at": datetime.utcnow(),
                            "created_at": datetime.utcnow()
                        }
                        await db.notifications.insert_one(parent_notification)
                
                unpaid_count += 1
        
        logger.info(f"Sent payment reminders to {unpaid_count} students/parents")
        
    except Exception as e:
        logger.error(f"Error sending payment reminders: {str(e)}")

def start_scheduler(db):
    """Start the payment reminder scheduler"""
    scheduler = AsyncIOScheduler()
    
    # Schedule payment reminders daily at 17:00 (5:00 PM)
    scheduler.add_job(
        send_payment_reminders,
        'cron',
        hour=17,
        minute=0,
        args=[db],
        id='payment_reminders',
        replace_existing=True
    )
    
    # For testing: also run every hour (comment out in production)
    # scheduler.add_job(
    #     send_payment_reminders,
    #     'interval',
    #     hours=1,
    #     args=[db],
    #     id='payment_reminders_hourly',
    #     replace_existing=True
    # )
    
    scheduler.start()
    logger.info("Payment reminder scheduler started (runs daily at 17:00)")
    
    return scheduler
