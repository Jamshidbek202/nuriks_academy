"""Asia/Tashkent scheduler for draft generation and shadow finance controls.

The scheduler never finalizes invoices, posts money, sends provider SMS, or
enables a freeze outside the active billing policy. Human approval remains
required for finalization and the default operation mode is shadow.
"""

from datetime import datetime, timedelta
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from finance_accounting import generate_recurring_expense_obligations
from finance_controls import evaluate_finance_freezes, queue_due_reminders
from finance_ledger import generate_draft_invoices
from finance_models import ACADEMY_TIMEZONE
from finance_service import generate_lesson_occurrences


logger = logging.getLogger(__name__)
ACADEMY_TZ = ZoneInfo(ACADEMY_TIMEZONE)


async def run_daily_finance_controls(db):
    as_of = datetime.now(ACADEMY_TZ).date()
    try:
        await queue_due_reminders(db, as_of)
    except Exception:
        logger.exception("Daily finance reminder queueing failed safely")
    try:
        await evaluate_finance_freezes(
            db,
            as_of,
            "system-finance-scheduler",
            f"scheduler:freeze-evaluation:{as_of.isoformat()}",
        )
    except Exception:
        logger.exception("Daily finance freeze evaluation failed safely")


async def generate_current_month_lesson_occurrences(db):
    now = datetime.now(ACADEMY_TZ)
    month = now.strftime("%Y-%m")
    try:
        configured_group_ids = await db.group_finance_versions.distinct("group_id", {
            "effective_from": {"$lte": now.date().isoformat()}
        })
        from bson import ObjectId

        for group_id in configured_group_ids:
            try:
                if not ObjectId.is_valid(group_id):
                    continue
                group = await db.groups.find_one({"_id": ObjectId(group_id), "status": "active"})
                if group:
                    await generate_lesson_occurrences(
                        db, group, month, "system-finance-scheduler"
                    )
            except Exception:
                logger.exception("Lesson occurrence generation failed for group %s", group_id)
    except Exception:
        logger.exception("Monthly lesson occurrence generation failed safely")


async def generate_previous_month_drafts_and_expenses(db):
    now = datetime.now(ACADEMY_TZ)
    previous_month_day = now.replace(day=1) - timedelta(days=1)
    service_month = previous_month_day.strftime("%Y-%m")
    try:
        await generate_draft_invoices(
            db, service_month, None, "system-finance-scheduler"
        )
    except Exception:
        logger.exception("Monthly invoice draft generation failed safely")
    try:
        await generate_recurring_expense_obligations(
            db, service_month, None, "system-finance-scheduler"
        )
    except Exception:
        logger.exception("Monthly recurring expense generation failed safely")


def start_scheduler(db):
    scheduler = AsyncIOScheduler(timezone=ACADEMY_TZ)
    scheduler.add_job(
        run_daily_finance_controls,
        "cron",
        hour=0,
        minute=15,
        args=[db],
        id="finance_daily_controls",
        replace_existing=True,
    )
    scheduler.add_job(
        generate_current_month_lesson_occurrences,
        "cron",
        day=1,
        hour=0,
        minute=1,
        args=[db],
        id="finance_monthly_lesson_generation",
        replace_existing=True,
    )
    scheduler.add_job(
        generate_previous_month_drafts_and_expenses,
        "cron",
        day=1,
        hour=0,
        minute=10,
        args=[db],
        id="finance_monthly_drafts",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Finance scheduler started in %s", ACADEMY_TIMEZONE)
    return scheduler
