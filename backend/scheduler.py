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
                from routes_notifications import create_user_notification
                data = {"student_id": str(student["_id"]), "month": current_month}
                await create_user_notification(
                    db, student["user_id"], "Payment Reminder",
                    f"Your payment for {current_month} is pending. Please complete your payment as soon as possible.",
                    "payment_reminder", data, preference_key="payment_reminders",
                )
                
                # Also notify parent if exists
                if student.get("parent_id"):
                    from bson import ObjectId
                    parent_id = student["parent_id"]
                    parent_key = ObjectId(parent_id) if ObjectId.is_valid(str(parent_id)) else parent_id
                    parent = await db.parents.find_one({"_id": parent_key})
                    if parent:
                        await create_user_notification(
                            db, parent["user_id"], "Payment Reminder",
                            f"Payment for {student['first_name']} {student['last_name']} for {current_month} is pending.",
                            "payment_reminder", data, preference_key="payment_reminders",
                        )
                else:
                    parent = await db.parents.find_one({"student_ids": str(student["_id"])})
                    if parent and parent.get("user_id"):
                        await create_user_notification(
                            db, parent["user_id"], "Payment Reminder",
                            f"Payment for {student['first_name']} {student['last_name']} for {current_month} is pending.",
                            "payment_reminder", data, preference_key="payment_reminders",
                        )
                
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
