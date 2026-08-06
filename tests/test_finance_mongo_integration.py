"""Transactional finance integration tests.

These tests are skipped unless RUN_FINANCE_MONGO_QA=1. The runner supplies a
validated, uniquely named database on a disposable MongoDB replica set.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
import hashlib
import os
from pathlib import Path
import sys
import unittest
from uuid import uuid4
from zoneinfo import ZoneInfo

from bson import ObjectId
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("SECRET_KEY", "finance-qa-only-secret")

from finance_accounting import (  # noqa: E402
    adjust_expense_obligation_amount,
    create_other_expense_obligation,
    financial_position,
    pay_expense_obligation,
)
from finance_ledger import ensure_finance_ledger_indexes, open_cash_shift  # noqa: E402
from finance_live import FINANCE_LIVE_COLLECTIONS, finance_change_is_visible  # noqa: E402
from finance_live import consume_finance_live_ticket  # noqa: E402
from finance_models import (  # noqa: E402
    GroupFinanceVersionCreate,
    GroupFormat,
    LessonResolution,
    LessonResolutionCreate,
    ProgramCode,
    ScheduleSlot,
)
from finance_service import create_group_finance_version, record_lesson_resolution  # noqa: E402
from finance_qa.mongo_support import (  # noqa: E402
    QA_PASSWORD,
    QA_USERS,
    open_qa_database,
    seed_finance_browser_fixture,
    seed_finance_qa_database,
)


RUN_MONGO_QA = os.environ.get("RUN_FINANCE_MONGO_QA") == "1"


@unittest.skipUnless(RUN_MONGO_QA, "requires disposable MongoDB finance QA replica set")
class FinanceMongoIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        method_key = hashlib.sha256(self._testMethodName.encode("utf-8")).hexdigest()[:10]
        self.database_name = f"nurik_finance_qa_{method_key}_{uuid4().hex[:8]}"
        self.mongo_client, self.db = await open_qa_database(
            os.environ["MONGO_URL"], self.database_name
        )
        self.fixture = await seed_finance_qa_database(self.db)

        import database
        import server

        self.server = server
        self.database_module = database
        self.previous_server_db = server.db
        self.previous_database_db = database.db
        server.db = self.db
        database.db = self.db
        self.http = AsyncClient(
            transport=ASGITransport(app=server.app, raise_app_exceptions=False),
            base_url="http://finance-qa",
        )

    async def asyncTearDown(self):
        await self.http.aclose()
        self.server.db = self.previous_server_db
        self.database_module.db = self.previous_database_db
        await self.mongo_client.drop_database(self.database_name)
        self.mongo_client.close()

    async def login(self, login: str) -> dict:
        response = await self.http.post(
            "/api/auth/login",
            json={"login": login, "password": QA_PASSWORD},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def test_finance_indexes_preserve_legacy_cash_shifts_without_business_dates(self):
        index_name = "cashbox_id_1_business_date_1"
        await self.db.cash_shifts.drop_index(index_name)
        legacy_ids = [ObjectId(), ObjectId()]
        await self.db.cash_shifts.insert_many([
            {
                "_id": legacy_ids[0],
                "cashbox_id": "main",
                "business_date": None,
                "status": "closed",
                "opening_mode": "manual",
                "idempotency_key": "qa:legacy-cash:one",
            },
            {
                "_id": legacy_ids[1],
                "cashbox_id": "main",
                "status": "closed",
                "opening_mode": "manual",
                "idempotency_key": "qa:legacy-cash:two",
            },
        ])

        await ensure_finance_ledger_indexes(self.db)

        self.assertEqual(
            await self.db.cash_shifts.count_documents({"_id": {"$in": legacy_ids}}),
            2,
        )
        index = (await self.db.cash_shifts.index_information())[index_name]
        self.assertTrue(index["unique"])
        self.assertEqual(
            index["partialFilterExpression"],
            {"opening_mode": "automatic"},
        )

        automatic = {
            "cashbox_id": "main",
            "business_date": "2026-08-06",
            "status": "closed",
            "opening_mode": "automatic",
        }
        await self.db.cash_shifts.insert_one({
            **automatic,
            "idempotency_key": "qa:auto-cash:one",
        })
        with self.assertRaises(DuplicateKeyError):
            await self.db.cash_shifts.insert_one({
                **automatic,
                "idempotency_key": "qa:auto-cash:two",
            })

    async def test_automatic_cash_day_reception_boundary_and_manager_confirmation(self):
        reception_headers = await self.login(QA_USERS["reception_a"])
        manager_headers = await self.login(QA_USERS["manager_a"])
        current_response = await self.http.get(
            "/api/finance/cash-shifts/current", headers=reception_headers
        )
        self.assertEqual(current_response.status_code, 200, current_response.text)
        current = current_response.json()
        self.assertEqual(current["status"], "open")
        self.assertEqual(current["opening_mode"], "automatic")
        self.assertTrue(current.get("business_date"))

        forbidden_open = await self.http.post(
            "/api/finance/cash-shifts/open",
            headers=reception_headers,
            json={
                "opening_balance_uzs": 0,
                "notes": None,
                "idempotency_key": "qa:reception:manual-open",
            },
        )
        self.assertEqual(forbidden_open.status_code, 403, forbidden_open.text)
        forbidden_close = await self.http.post(
            f"/api/finance/cash-shifts/{current['id']}/close",
            headers=reception_headers,
            json={
                "actual_closing_balance_uzs": 0,
                "notes": None,
                "idempotency_key": "qa:reception:manual-close",
            },
        )
        self.assertEqual(forbidden_close.status_code, 403, forbidden_close.text)

        await self.db.cash_shifts.update_one(
            {"_id": ObjectId(current["id"])},
            {"$set": {
                "business_date": "2000-01-01",
                "idempotency_key": "qa:cash-day:old-fixture",
                "opening_balance_uzs": 500_000,
                "receipt_total_uzs": 100_000,
                "removal_total_uzs": 25_000,
            }},
        )
        next_day = (await self.http.get(
            "/api/finance/cash-shifts/current", headers=reception_headers
        )).json()
        self.assertNotEqual(next_day["id"], current["id"])
        self.assertEqual(next_day["opening_balance_uzs"], 575_000)
        pending = await self.db.cash_shifts.find_one({"_id": ObjectId(current["id"])})
        self.assertEqual(pending["status"], "awaiting_confirmation")
        self.assertEqual(pending["expected_closing_balance_uzs"], 575_000)

        confirmed = await self.http.post(
            f"/api/finance/cash-shifts/{current['id']}/confirm",
            headers=manager_headers,
            json={
                "actual_closing_balance_uzs": 565_000,
                "notes": "QA physical count",
                "idempotency_key": "qa:manager:cash-confirm",
            },
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["status"], "closed")
        self.assertEqual(confirmed.json()["discrepancy_uzs"], -10_000)
        self.assertEqual(confirmed.json()["discrepancy_status"], "pending_review")

        reception_dashboard = await self.http.get("/api/dashboard", headers=reception_headers)
        self.assertEqual(reception_dashboard.status_code, 200, reception_dashboard.text)
        safe_dashboard = reception_dashboard.json()
        self.assertIn("payments", safe_dashboard)
        self.assertIn("cash_day", safe_dashboard)
        self.assertNotIn("revenue", safe_dashboard)
        self.assertNotIn("profit", safe_dashboard)
        revenue_forbidden = await self.http.get(
            f"/api/finance/position?service_month={date.today():%Y-%m}",
            headers=reception_headers,
        )
        self.assertEqual(revenue_forbidden.status_code, 403, revenue_forbidden.text)

        removal = await self.http.post(
            f"/api/finance/cash-shifts/{next_day['id']}/removals",
            headers=manager_headers,
            json={
                "amount_uzs": 25_000,
                "purpose": "Deposit to bank during QA",
                "idempotency_key": "qa:manager:cash-removal",
            },
        )
        self.assertEqual(removal.status_code, 200, removal.text)
        forbidden_removal = await self.http.post(
            f"/api/finance/cash-shifts/{next_day['id']}/removals",
            headers=reception_headers,
            json={
                "amount_uzs": 1,
                "purpose": "Not permitted",
                "idempotency_key": "qa:reception:cash-removal",
            },
        )
        self.assertEqual(forbidden_removal.status_code, 403, forbidden_removal.text)

    async def test_reception_can_view_and_cancel_own_branch_support_booking(self):
        browser_fixture = await seed_finance_browser_fixture(self.db, self.fixture)
        student_headers = await self.login(QA_USERS["student_a"])
        reception_headers = await self.login(QA_USERS["reception_a"])
        booking = await self.http.post(
            "/api/support-bookings",
            headers=student_headers,
            json={
                "support_staff_id": browser_fixture["support_staff_id"],
                "booking_date": (date.today() + timedelta(days=1)).isoformat(),
                "start_time": "11:00",
                "duration_minutes": 40,
                "topic": "Reception cancellation QA",
            },
        )
        self.assertEqual(booking.status_code, 200, booking.text)
        booking_id = booking.json()["id"]
        reception_rows = await self.http.get(
            "/api/support-bookings", headers=reception_headers
        )
        self.assertEqual(reception_rows.status_code, 200, reception_rows.text)
        self.assertIn(booking_id, {row["id"] for row in reception_rows.json()})
        cancelled = await self.http.put(
            f"/api/support-bookings/{booking_id}/cancel", headers=reception_headers
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        second_cancel = await self.http.put(
            f"/api/support-bookings/{booking_id}/cancel", headers=reception_headers
        )
        self.assertEqual(second_cancel.status_code, 409, second_cancel.text)

    async def test_concurrent_idempotent_expense_and_cash_payment_reconcile(self):
        manager = await self.db.users.find_one({"login": QA_USERS["manager_a"]})
        branch_id = self.fixture["branch_a_id"]
        service_date = date.today()

        async def create_same_expense():
            return await create_other_expense_obligation(
                self.db,
                category="Other",
                recipient="QA emergency repair",
                expense_date=service_date,
                amount_uzs=600_000,
                explanation="Concurrent idempotency campaign",
                proof_reference=None,
                branch_id=branch_id,
                idempotency_key="qa:expense:concurrent",
                actor_id=str(manager["_id"]),
            )

        created = await asyncio.gather(*(create_same_expense() for _ in range(20)))
        expense_ids = {str(row["_id"]) for row in created}
        self.assertEqual(len(expense_ids), 1)
        self.assertEqual(
            await self.db.finance_expense_obligations.count_documents(
                {"idempotency_key": "qa:expense:concurrent"}
            ),
            1,
        )

        expense = created[0]
        shift = await open_cash_shift(
            self.db, 1_000_000, "QA cash", "qa:shift:open", manager
        )

        async def post_same_piece_payment():
            return await pay_expense_obligation(
                self.db,
                expense,
                200_000,
                shift["_id"],
                "First piece",
                "qa:expense-payment:piece-1",
                manager,
            )

        outcomes = await asyncio.gather(
            *(post_same_piece_payment() for _ in range(10)),
            return_exceptions=True,
        )
        self.assertTrue(any(not isinstance(value, Exception) for value in outcomes))
        self.assertEqual(
            await self.db.finance_expense_payments.count_documents(
                {"idempotency_key": "qa:expense-payment:piece-1"}
            ),
            1,
        )
        stored_expense = await self.db.finance_expense_obligations.find_one(
            {"_id": expense["_id"]}
        )
        stored_shift = await self.db.cash_shifts.find_one({"_id": shift["_id"]})
        self.assertEqual(stored_expense["paid_amount_uzs"], 200_000)
        self.assertEqual(stored_expense["outstanding_amount_uzs"], 400_000)
        self.assertEqual(stored_shift["removal_total_uzs"], 200_000)
        self.assertEqual(
            await self.db.cash_events.count_documents(
                {"idempotency_key": "qa:expense-payment:piece-1"}
            ),
            1,
        )

        position = await financial_position(
            self.db, service_date.strftime("%Y-%m"), branch_id
        )
        self.assertEqual(position["expenses_accrued_uzs"], 600_000)
        self.assertEqual(position["expenses_paid_uzs"], 200_000)
        self.assertEqual(position["expenses_outstanding_uzs"], 400_000)
        self.assertEqual(position["period_cash_outflow_uzs"], 200_000)
        self.assertEqual(position["cashbox_position_uzs"], 800_000)
        self.assertEqual(position["accrued_operating_profit_uzs"], -600_000)

    async def test_real_api_roles_branch_isolation_and_position_reconciliation(self):
        manager_a_headers = await self.login(QA_USERS["manager_a"])
        manager_b_headers = await self.login(QA_USERS["manager_b"])
        super_headers = await self.login(QA_USERS["super_admin"])
        service_date = date.today()
        service_month = service_date.strftime("%Y-%m")

        payload = {
            "category": "Other",
            "recipient": "QA live supplier",
            "expense_date": service_date.isoformat(),
            "amount_uzs": 250_000,
            "explanation": "API branch and dashboard reconciliation",
            "proof_reference": None,
            "branch_id": None,
            "idempotency_key": "qa:api:expense",
        }
        created = await self.http.post(
            "/api/finance/expenses/other", json=payload, headers=manager_a_headers
        )
        self.assertEqual(created.status_code, 200, created.text)
        expense = created.json()
        self.assertEqual(expense["branch_id"], self.fixture["branch_a_id"])

        cross_branch = await self.http.post(
            "/api/finance/expenses/other",
            json={
                **payload,
                "branch_id": self.fixture["branch_b_id"],
                "idempotency_key": "qa:api:cross-branch",
            },
            headers=manager_a_headers,
        )
        self.assertEqual(cross_branch.status_code, 403, cross_branch.text)
        self.assertEqual(
            await self.db.finance_expense_obligations.count_documents(
                {"idempotency_key": "qa:api:cross-branch"}
            ),
            0,
        )

        manager_b_rows = await self.http.get(
            "/api/finance/expenses",
            params={"service_month": service_month},
            headers=manager_b_headers,
        )
        self.assertEqual(manager_b_rows.status_code, 200, manager_b_rows.text)
        self.assertNotIn(expense["id"], {row["id"] for row in manager_b_rows.json()})

        manager_position = await self.http.get(
            "/api/finance/position",
            params={"service_month": service_month},
            headers=manager_a_headers,
        )
        global_position = await self.http.get(
            "/api/finance/position",
            params={"service_month": service_month},
            headers=super_headers,
        )
        self.assertEqual(manager_position.status_code, 200, manager_position.text)
        self.assertEqual(global_position.status_code, 200, global_position.text)
        self.assertEqual(manager_position.json()["expenses_accrued_uzs"], 250_000)
        self.assertEqual(global_position.json()["expenses_accrued_uzs"], 250_000)
        self.assertEqual(manager_position.json()["accrued_operating_profit_uzs"], -250_000)

        corrected = await self.http.post(
            f"/api/finance/expenses/{expense['id']}/adjust-amount",
            json={
                "amount_uzs": 325_000,
                "reason": "QA authorized correction",
                "idempotency_key": "qa:api:expense-correction",
            },
            headers=super_headers,
        )
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertEqual(corrected.json()["obligation"]["accrued_amount_uzs"], 325_000)
        self.assertEqual(
            await self.db.finance_expense_amount_events.count_documents(
                {"idempotency_key": "qa:api:expense-correction"}
            ),
            1,
        )
        position_after = await self.http.get(
            "/api/finance/position",
            params={"service_month": service_month},
            headers=manager_a_headers,
        )
        self.assertEqual(position_after.json()["expenses_accrued_uzs"], 325_000)
        self.assertEqual(position_after.json()["accrued_operating_profit_uzs"], -325_000)

    async def test_full_lesson_invoice_payroll_piece_payment_and_advance_lifecycle(self):
        manager = await self.db.users.find_one({"login": QA_USERS["manager_a"]})
        manager_headers = await self.login(QA_USERS["manager_a"])
        branch_id = self.fixture["branch_a_id"]
        service_month = date.today().strftime("%Y-%m")
        month_start = date.fromisoformat(f"{service_month}-01")

        teacher = {
            "_id": ObjectId(),
            "first_name": "QA",
            "last_name": "Teacher",
            "branch_id": branch_id,
            "status": "active",
            "created_at": datetime.utcnow(),
        }
        student = {
            "_id": ObjectId(),
            "student_id": "QA-000001",
            "first_name": "QA",
            "last_name": "Student",
            "branch_id": branch_id,
            "parent_id": None,
            "status": "active",
            "created_at": datetime.utcnow(),
        }
        group = {
            "_id": ObjectId(),
            "name": "QA General Normal",
            "branch_id": branch_id,
            "teacher_id": str(teacher["_id"]),
            "student_ids": [str(student["_id"])],
            "status": "active",
            "start_date": datetime(month_start.year, month_start.month, 1),
            "end_date": None,
            "created_at": datetime.utcnow(),
        }
        await self.db.teachers.insert_one(teacher)
        await self.db.students.insert_one(student)
        await self.db.groups.insert_one(group)

        version = await create_group_finance_version(
            self.db,
            group,
            GroupFinanceVersionCreate(
                program_code=ProgramCode.GENERAL,
                group_format=GroupFormat.NORMAL,
                effective_from=month_start,
                schedule=[
                    ScheduleSlot(day="monday", start_time="18:00", end_time="19:30", room="QA"),
                    ScheduleSlot(day="wednesday", start_time="18:00", end_time="19:30", room="QA"),
                    ScheduleSlot(day="friday", start_time="18:00", end_time="19:30", room="QA"),
                ],
                reason="QA complete finance lifecycle",
            ),
            str(manager["_id"]),
        )
        self.assertEqual(version["occurrence_refresh"]["status"], "up_to_date")
        await self.db.group_memberships.insert_one({
            "group_id": str(group["_id"]),
            "student_id": str(student["_id"]),
            "effective_from": month_start.isoformat(),
            "effective_from_at": None,
            "effective_to": None,
            "effective_to_at": None,
            "created_by": str(manager["_id"]),
            "created_at": datetime.utcnow(),
            "immutable_history": True,
        })

        occurrences = await self.db.lesson_occurrences.find({
            "group_id": str(group["_id"]),
            "generation_month": service_month,
            "counts_as_scheduled": True,
        }).sort("starts_at", 1).to_list(100)
        self.assertGreaterEqual(len(occurrences), 8)
        for index, occurrence in enumerate(occurrences):
            result = await record_lesson_resolution(
                self.db,
                occurrence,
                LessonResolutionCreate(
                    resolution=LessonResolution.HELD,
                    idempotency_key=f"qa:lesson-held:{index:03d}",
                ),
                manager,
            )
            self.assertTrue(result["occurrence"]["student_billable"])
            self.assertTrue(result["occurrence"]["teacher_payable"])

        draft = await self.http.post(
            "/api/finance/invoices/generate-drafts",
            json={"service_month": service_month, "branch_id": None},
            headers=manager_headers,
        )
        self.assertEqual(draft.status_code, 200, draft.text)
        self.assertEqual(draft.json()["invoice_count"], 1)
        self.assertEqual(draft.json()["amount_due_uzs"], 450_000)
        self.assertEqual(draft.json()["not_ready_count"], 0)

        finalized = await self.http.post(
            "/api/finance/invoices/finalize-month",
            json={
                "service_month": service_month,
                "branch_id": None,
                "idempotency_key": "qa:finalize:complete-lifecycle",
            },
            headers=manager_headers,
        )
        self.assertEqual(finalized.status_code, 200, finalized.text)
        self.assertEqual(finalized.json()["amount_due_uzs"], 450_000)
        self.assertEqual(finalized.json()["teacher_count"], 1)
        self.assertEqual(finalized.json()["mandatory_notifications_queued"], 1)
        finalize_replay = await self.http.post(
            "/api/finance/invoices/finalize-month",
            json={
                "service_month": service_month,
                "branch_id": None,
                "idempotency_key": "qa:finalize:complete-lifecycle",
            },
            headers=manager_headers,
        )
        self.assertEqual(finalize_replay.status_code, 200, finalize_replay.text)
        self.assertTrue(finalize_replay.json()["idempotent_replay"])
        self.assertEqual(
            await self.db.finance_finalization_runs.count_documents({}), 1
        )

        invoice = await self.db.finance_invoices.find_one({"student_id": str(student["_id"])})
        lines = await self.db.finance_invoice_lines.find({
            "invoice_id": str(invoice["_id"]), "invoice_status": "finalized"
        }).to_list(100)
        earning = await self.db.teacher_earnings.find_one({
            "teacher_id": str(teacher["_id"]), "service_month": service_month
        })
        self.assertEqual(sum(row["amount_uzs"] for row in lines), 450_000)
        self.assertEqual(earning["gross_tuition_basis_uzs"], 450_000)
        self.assertEqual(earning["earned_amount_uzs"], 180_000)

        opened = await self.http.get(
            "/api/finance/cash-shifts/current",
            headers=manager_headers,
        )
        self.assertEqual(opened.status_code, 200, opened.text)
        self.assertEqual(opened.json()["opening_mode"], "automatic")
        shift_id = opened.json()["id"]

        async def receipt(amount: int, key: str):
            return await self.http.post(
                "/api/finance/receipts/cash",
                json={
                    "student_id": str(student["_id"]),
                    "amount_uzs": amount,
                    "cash_shift_id": shift_id,
                    "notes": "QA piece payment",
                    "idempotency_key": key,
                },
                headers=manager_headers,
            )

        first_piece = await receipt(200_000, "qa:receipt:piece-1")
        first_replay = await receipt(200_000, "qa:receipt:piece-1")
        second_piece = await receipt(300_000, "qa:receipt:piece-2")
        self.assertEqual(first_piece.status_code, 200, first_piece.text)
        self.assertEqual(first_replay.status_code, 200, first_replay.text)
        self.assertTrue(first_replay.json()["idempotent_replay"])
        self.assertEqual(second_piece.status_code, 200, second_piece.text)
        self.assertEqual(second_piece.json()["advance_amount_uzs"], 50_000)

        stored_invoice = await self.db.finance_invoices.find_one({"_id": invoice["_id"]})
        stored_earning = await self.db.teacher_earnings.find_one({"_id": earning["_id"]})
        credit = await self.db.finance_credit_lots.find_one({
            "student_id": str(student["_id"]), "remaining_amount_uzs": {"$gt": 0}
        })
        shift = await self.db.cash_shifts.find_one({"_id": ObjectId(shift_id)})
        self.assertEqual(stored_invoice["amount_paid_uzs"], 450_000)
        self.assertEqual(stored_invoice["balance_uzs"], 0)
        self.assertEqual(stored_invoice["payment_status"], "paid")
        self.assertEqual(stored_earning["earned_amount_uzs"], 180_000)
        self.assertEqual(stored_earning["paid_amount_uzs"], 0)
        self.assertEqual(credit["remaining_amount_uzs"], 50_000)
        self.assertEqual(shift["receipt_total_uzs"], 500_000)
        self.assertEqual(await self.db.finance_receipts.count_documents({}), 2)
        self.assertEqual(await self.db.finance_notification_jobs.count_documents({}), 3)

        position_response = await self.http.get(
            "/api/finance/position",
            params={"service_month": service_month},
            headers=manager_headers,
        )
        self.assertEqual(position_response.status_code, 200, position_response.text)
        position = position_response.json()
        self.assertEqual(position["gross_tuition_uzs"], 450_000)
        self.assertEqual(position["net_tuition_uzs"], 450_000)
        self.assertEqual(position["cash_received_uzs"], 500_000)
        self.assertEqual(position["receivables_uzs"], 0)
        self.assertEqual(position["advance_balances_uzs"], 50_000)
        self.assertEqual(position["teacher_salary_earned_uzs"], 180_000)
        self.assertEqual(position["teacher_salary_outstanding_uzs"], 180_000)
        self.assertEqual(position["cashbox_position_uzs"], 500_000)
        self.assertEqual(position["accrued_operating_profit_uzs"], 270_000)

    async def test_completed_lesson_updates_student_charge_teacher_pay_and_prepayment_live(self):
        """One attendance-approved class must move both sides of the ledger once."""
        manager = await self.db.users.find_one({"login": QA_USERS["manager_a"]})
        teacher_user = await self.db.users.find_one({"login": QA_USERS["teacher_a"]})
        student_user = await self.db.users.find_one({"login": QA_USERS["student_a"]})
        manager_headers = await self.login(QA_USERS["manager_a"])
        teacher_headers = await self.login(QA_USERS["teacher_a"])
        student_headers = await self.login(QA_USERS["student_a"])
        branch_id = self.fixture["branch_a_id"]
        academy_today = datetime.now(ZoneInfo("Asia/Tashkent")).date()
        service_month = academy_today.strftime("%Y-%m")
        month_start = academy_today.replace(day=1)
        weekday = academy_today.strftime("%A").lower()

        teacher = {
            "_id": ObjectId(),
            "user_id": str(teacher_user["_id"]),
            "first_name": "Rolling",
            "last_name": "Teacher",
            "branch_id": branch_id,
            "group_ids": [],
            "status": "active",
            "created_at": datetime.utcnow(),
        }
        student = {
            "_id": ObjectId(),
            "user_id": str(student_user["_id"]),
            "student_id": "QA-ROLLING-001",
            "first_name": "Rolling",
            "last_name": "Student",
            "branch_id": branch_id,
            "parent_id": None,
            "group_ids": [],
            "status": "active",
            "created_at": datetime.utcnow(),
        }
        group = {
            "_id": ObjectId(),
            "name": "QA Rolling Lesson Group",
            "branch_id": branch_id,
            "teacher_id": str(teacher["_id"]),
            "student_ids": [str(student["_id"])],
            "schedule": [{
                "day": weekday,
                "start_time": "09:00",
                "end_time": "10:30",
                "room": "ROLLING-QA",
            }],
            "status": "active",
            "start_date": datetime(month_start.year, month_start.month, 1),
            "end_date": None,
            "created_at": datetime.utcnow(),
        }
        student["group_ids"] = [str(group["_id"])]
        teacher["group_ids"] = [str(group["_id"])]
        await self.db.teachers.insert_one(teacher)
        await self.db.students.insert_one(student)
        await self.db.groups.insert_one(group)

        await create_group_finance_version(
            self.db,
            group,
            GroupFinanceVersionCreate(
                program_code=ProgramCode.GENERAL,
                group_format=GroupFormat.NORMAL,
                effective_from=month_start,
                schedule=[ScheduleSlot(
                    day=weekday,
                    start_time="09:00",
                    end_time="10:30",
                    room="ROLLING-QA",
                )],
                reason="QA rolling lesson accrual",
            ),
            str(manager["_id"]),
        )
        await self.db.group_memberships.insert_one({
            "group_id": str(group["_id"]),
            "student_id": str(student["_id"]),
            "effective_from": month_start.isoformat(),
            "effective_from_at": None,
            "effective_to": None,
            "effective_to_at": None,
            "created_by": str(manager["_id"]),
            "created_at": datetime.utcnow(),
            "immutable_history": True,
        })

        occurrences = await self.db.lesson_occurrences.find({
            "group_id": str(group["_id"]),
            "generation_month": service_month,
            "counts_as_scheduled": True,
            "superseded": {"$ne": True},
        }).sort("starts_at", 1).to_list(100)
        occurrence = next(row for row in occurrences if row["local_date"] == academy_today.isoformat())
        await self.db.lesson_occurrences.update_one(
            {"_id": occurrence["_id"]},
            {"$set": {
                "starts_at": datetime.utcnow(),
                "ends_at": datetime.utcnow() + timedelta(minutes=90),
            }},
        )
        occurrence_id = str(occurrence["_id"])

        occurrence_list = await self.http.get(
            "/api/finance/lesson-occurrences",
            params={"group_id": str(group["_id"]), "month": service_month},
            headers=teacher_headers,
        )
        self.assertEqual(occurrence_list.status_code, 200, occurrence_list.text)
        listed = next(row for row in occurrence_list.json() if row["id"] == occurrence_id)
        self.assertEqual(listed["active_student_ids"], [str(student["_id"])])

        resolution_payload = {
            "resolution": "held",
            "reason": "Attendance submitted for completed lesson",
            "idempotency_key": f"qa:rolling-held:{occurrence_id}",
        }
        before_end = await self.http.post(
            f"/api/finance/lesson-occurrences/{occurrence_id}/resolve",
            json=resolution_payload,
            headers=teacher_headers,
        )
        self.assertEqual(before_end.status_code, 409, before_end.text)
        self.assertIn("scheduled end", before_end.json()["detail"])
        await self.db.lesson_occurrences.update_one(
            {"_id": occurrence["_id"]},
            {"$set": {
                "starts_at": datetime.utcnow() - timedelta(minutes=95),
                "ends_at": datetime.utcnow() - timedelta(minutes=5),
            }},
        )
        missing_attendance = await self.http.post(
            f"/api/finance/lesson-occurrences/{occurrence_id}/resolve",
            json=resolution_payload,
            headers=teacher_headers,
        )
        self.assertEqual(missing_attendance.status_code, 409, missing_attendance.text)

        marked_absent = await self.http.post(
            "/api/attendance",
            json={
                "student_id": str(student["_id"]),
                "group_id": str(group["_id"]),
                "occurrence_id": occurrence_id,
                "date": f"{academy_today.isoformat()}T00:00:00",
                "status": "absent",
            },
            headers=teacher_headers,
        )
        self.assertEqual(marked_absent.status_code, 200, marked_absent.text)

        completed = await self.http.post(
            f"/api/finance/lesson-occurrences/{occurrence_id}/resolve",
            json=resolution_payload,
            headers=teacher_headers,
        )
        replay = await self.http.post(
            f"/api/finance/lesson-occurrences/{occurrence_id}/resolve",
            json=resolution_payload,
            headers=teacher_headers,
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["rolling_accrual"]["status"], "updated")
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertTrue(replay.json()["idempotent_replay"])
        self.assertEqual(
            await self.db.lesson_resolution_events.count_documents({
                "occurrence_id": occurrence_id,
            }),
            1,
        )

        student_invoices = await self.http.get(
            "/api/finance/invoices",
            params={"service_month": service_month},
            headers=student_headers,
        )
        self.assertEqual(student_invoices.status_code, 200, student_invoices.text)
        draft = next(row for row in student_invoices.json() if row["status"] == "draft")
        self.assertGreater(draft["amount_due_uzs"], 0)
        self.assertEqual(draft["uncovered_balance_uzs"], draft["amount_due_uzs"])
        self.assertEqual(draft["prepayment_covered_uzs"], 0)

        earnings = await self.http.get(
            "/api/finance/teacher-earnings/summary",
            params={"service_month": service_month},
            headers=teacher_headers,
        )
        self.assertEqual(earnings.status_code, 200, earnings.text)
        summary = earnings.json()
        self.assertEqual(summary["completed_lesson_count"], 1)
        self.assertEqual(summary["lessons"][0]["student_count"], 1)
        self.assertEqual(summary["lessons"][0]["tuition_basis_uzs"], draft["gross_tuition_uzs"])
        self.assertEqual(
            summary["earned_to_date_uzs"],
            (draft["gross_tuition_uzs"] * 4_000 + 5_000) // 10_000,
        )
        self.assertGreaterEqual(summary["projected_month_total_uzs"], summary["earned_to_date_uzs"])

        shift = await self.http.get(
            "/api/finance/cash-shifts/current", headers=manager_headers
        )
        self.assertEqual(shift.status_code, 200, shift.text)
        prepayment = await self.http.post(
            "/api/finance/receipts/cash",
            json={
                "student_id": str(student["_id"]),
                "amount_uzs": draft["amount_due_uzs"],
                "cash_shift_id": shift.json()["id"],
                "notes": "QA current-month lesson prepayment",
                "idempotency_key": "qa:rolling-current-prepayment",
            },
            headers=manager_headers,
        )
        self.assertEqual(prepayment.status_code, 200, prepayment.text)
        self.assertEqual(prepayment.json()["advance_amount_uzs"], draft["amount_due_uzs"])
        covered_invoices = await self.http.get(
            "/api/finance/invoices",
            params={"service_month": service_month},
            headers=student_headers,
        )
        covered = next(row for row in covered_invoices.json() if row["status"] == "draft")
        self.assertEqual(covered["prepayment_covered_uzs"], draft["amount_due_uzs"])
        self.assertEqual(covered["uncovered_balance_uzs"], 0)
        self.assertEqual(covered["amount_paid_uzs"], 0)

        for index, unresolved in enumerate(occurrences):
            if str(unresolved["_id"]) == occurrence_id:
                continue
            await record_lesson_resolution(
                self.db,
                unresolved,
                LessonResolutionCreate(
                    resolution=LessonResolution.TEACHER_CANCELLED,
                    reason="QA closes remaining schedule without charge",
                    idempotency_key=f"qa:rolling-cancel:{index:03d}",
                ),
                manager,
            )
        regenerated = await self.http.post(
            "/api/finance/invoices/generate-drafts",
            json={"service_month": service_month, "branch_id": branch_id},
            headers=manager_headers,
        )
        self.assertEqual(regenerated.status_code, 200, regenerated.text)
        finalized = await self.http.post(
            "/api/finance/invoices/finalize-month",
            json={
                "service_month": service_month,
                "branch_id": branch_id,
                "idempotency_key": "qa:rolling-finalize",
            },
            headers=manager_headers,
        )
        self.assertEqual(finalized.status_code, 200, finalized.text)
        self.assertEqual(finalized.json()["advance_applied_uzs"], draft["amount_due_uzs"])
        official = await self.db.teacher_earnings.find_one({
            "teacher_id": str(teacher["_id"]),
            "service_month": service_month,
        })
        self.assertEqual(official["earned_amount_uzs"], summary["earned_to_date_uzs"])
        final_invoice = await self.db.finance_invoices.find_one({
            "student_id": str(student["_id"]),
            "service_month": service_month,
        })
        self.assertEqual(final_invoice["status"], "finalized")
        self.assertEqual(final_invoice["balance_uzs"], 0)
        self.assertEqual(final_invoice["payment_status"], "paid")

    async def test_parent_card_report_is_pending_until_scoped_staff_confirmation(self):
        """A parent's claim is not money until an authorized human verifies it."""
        browser_fixture = await seed_finance_browser_fixture(self.db, self.fixture)
        branch_id = self.fixture["branch_a_id"]
        student_id = browser_fixture["student_id"]
        service_month = date.today().strftime("%Y-%m")
        month_start = date.fromisoformat(f"{service_month}-01")
        now = datetime.utcnow()
        invoice = {
            "_id": ObjectId(),
            "invoice_number": f"INV-{service_month.replace('-', '')}-CARD-QA",
            "student_id": student_id,
            "service_month": service_month,
            "branch_id": branch_id,
            "status": "finalized",
            "gross_tuition_uzs": 450_000,
            "discount_amount_uzs": 0,
            "amount_due_uzs": 450_000,
            "amount_paid_uzs": 0,
            "balance_uzs": 450_000,
            "payment_status": "unpaid",
            "due_date": date(month_start.year, month_start.month, 5).isoformat(),
            "finalized_at": now,
            "revision": 1,
        }
        await self.db.finance_invoices.insert_one(invoice)

        manager_a_headers = await self.login(QA_USERS["manager_a"])
        manager_b_headers = await self.login(QA_USERS["manager_b"])
        super_headers = await self.login(QA_USERS["super_admin"])
        parent_headers = await self.login(QA_USERS["parent_a"])
        student_headers = await self.login(QA_USERS["student_a"])

        destination_response = await self.http.post(
            "/api/finance/payment-destinations",
            json={
                "provider": "click",
                "card_number": "8600 1234 1234 1234",
                "cardholder_name": "NURIKS TEST OWNER",
                "label": "QA Click card",
                "branch_id": self.fixture["branch_b_id"],
                "idempotency_key": "qa:card-destination:create:a",
            },
            headers=manager_a_headers,
        )
        self.assertEqual(destination_response.status_code, 200, destination_response.text)
        destination_body = destination_response.json()
        destination_id = destination_body["destination"]["id"]
        self.assertEqual(destination_body["destination"]["branch_id"], branch_id)
        self.assertEqual(destination_body["destination"]["card_number"], "8600123412341234")

        stored_destination = await self.db.finance_payment_destinations.find_one(
            {"_id": ObjectId(destination_id)}
        )
        self.assertNotIn("8600123412341234", str(stored_destination))
        parent_destinations = await self.http.get(
            "/api/finance/payment-destinations", headers=parent_headers
        )
        self.assertEqual(parent_destinations.status_code, 200, parent_destinations.text)
        self.assertEqual(parent_destinations.json()[0]["card_number"], "8600123412341234")
        manager_b_destinations = await self.http.get(
            "/api/finance/payment-destinations", headers=manager_b_headers
        )
        self.assertEqual(manager_b_destinations.status_code, 200, manager_b_destinations.text)
        self.assertEqual(manager_b_destinations.json(), [])

        paid_at = datetime.now(ZoneInfo("Asia/Tashkent")).replace(second=0, microsecond=0)
        report_payload = {
            "student_id": student_id,
            "destination_id": destination_id,
            "amount_uzs": 200_000,
            "paid_at": paid_at.isoformat(),
            "idempotency_key": "qa:card-report:piece-1",
        }
        reported = await self.http.post(
            "/api/finance/card-payment-reports",
            json=report_payload,
            headers=parent_headers,
        )
        replay = await self.http.post(
            "/api/finance/card-payment-reports",
            json=report_payload,
            headers=parent_headers,
        )
        self.assertEqual(reported.status_code, 200, reported.text)
        self.assertEqual(reported.json()["report"]["status"], "unresolved")
        self.assertTrue(replay.json()["idempotent_replay"])
        report_id = reported.json()["report"]["id"]
        self.assertEqual(
            await self.db.finance_card_payment_reports.count_documents({}), 1
        )
        self.assertEqual(
            await self.db.finance_card_payment_notifications.count_documents(
                {"payment_report_id": report_id, "event": "card_payment_reported"}
            ),
            2,
        )

        pending_invoice = await self.db.finance_invoices.find_one({"_id": invoice["_id"]})
        self.assertEqual(pending_invoice["amount_paid_uzs"], 0)
        self.assertEqual(await self.db.finance_receipts.count_documents({}), 0)
        pending_position = (
            await self.http.get(
                "/api/finance/position",
                params={"service_month": service_month},
                headers=manager_a_headers,
            )
        ).json()
        self.assertEqual(pending_position["card_transfer_received_uzs"], 0)
        self.assertEqual(pending_position["total_collections_uzs"], 0)
        self.assertEqual(pending_position["receivables_uzs"], 450_000)

        manager_b_list = await self.http.get(
            "/api/finance/card-payment-reports", headers=manager_b_headers
        )
        self.assertEqual(manager_b_list.json(), [])
        forbidden = await self.http.post(
            f"/api/finance/card-payment-reports/{report_id}/resolve",
            json={
                "decision": "confirm",
                "reason": "Should not cross branches",
                "idempotency_key": "qa:card-resolution:forbidden",
            },
            headers=manager_b_headers,
        )
        self.assertEqual(forbidden.status_code, 403, forbidden.text)
        self.assertEqual(await self.db.finance_receipts.count_documents({}), 0)

        manager_resolution_payload = {
            "decision": "confirm",
            "reason": "Matched amount, timestamp and destination in Click history",
            "idempotency_key": "qa:card-resolution:confirm-1",
        }
        super_resolution_payload = {
            **manager_resolution_payload,
            "idempotency_key": "qa:card-resolution:confirm-concurrent",
        }
        resolution_url = f"/api/finance/card-payment-reports/{report_id}/resolve"
        outcomes = await asyncio.gather(
            self.http.post(
                resolution_url,
                json=manager_resolution_payload,
                headers=manager_a_headers,
            ),
            self.http.post(
                resolution_url,
                json=super_resolution_payload,
                headers=super_headers,
            ),
        )
        successful = [response for response in outcomes if response.status_code == 200]
        conflicted = [response for response in outcomes if response.status_code == 409]
        self.assertEqual(len(successful), 1, [response.text for response in outcomes])
        self.assertEqual(len(conflicted), 1, [response.text for response in outcomes])
        confirmed = successful[0]
        successful_payload = (
            manager_resolution_payload
            if outcomes[0].status_code == 200
            else super_resolution_payload
        )
        confirmed_replay = await self.http.post(
            resolution_url,
            json=successful_payload,
            headers=(manager_a_headers if outcomes[0].status_code == 200 else super_headers),
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["report"]["status"], "confirmed")
        self.assertTrue(confirmed_replay.json()["idempotent_replay"])
        self.assertEqual(await self.db.finance_receipts.count_documents({}), 1)
        receipt = await self.db.finance_receipts.find_one({"payment_report_id": report_id})
        self.assertEqual(receipt["payment_method"], "personal_card_transfer")
        self.assertEqual(receipt["payment_provider"], "click")
        self.assertNotIn("cash_shift_id", receipt)
        self.assertEqual(receipt["amount_uzs"], 200_000)

        paid_invoice = await self.db.finance_invoices.find_one({"_id": invoice["_id"]})
        self.assertEqual(paid_invoice["amount_paid_uzs"], 200_000)
        self.assertEqual(paid_invoice["balance_uzs"], 250_000)
        self.assertEqual(paid_invoice["payment_status"], "partial")
        confirmed_position = (
            await self.http.get(
                "/api/finance/position",
                params={"service_month": service_month},
                headers=manager_a_headers,
            )
        ).json()
        self.assertEqual(confirmed_position["cash_received_uzs"], 0)
        self.assertEqual(confirmed_position["card_transfer_received_uzs"], 200_000)
        self.assertEqual(confirmed_position["total_collections_uzs"], 200_000)
        self.assertEqual(confirmed_position["cashbox_position_uzs"], 0)
        self.assertEqual(confirmed_position["receivables_uzs"], 250_000)

        parent_reports = await self.http.get(
            "/api/finance/card-payment-reports", headers=parent_headers
        )
        self.assertEqual(parent_reports.json()[0]["status"], "confirmed")
        super_reports = await self.http.get(
            "/api/finance/card-payment-reports", headers=super_headers
        )
        self.assertEqual(super_reports.json()[0]["status"], "confirmed")

        reversed_response = await self.http.post(
            f"/api/finance/receipts/{receipt['_id']}/reverse",
            json={
                "reason": "QA verified card-transfer reversal",
                "idempotency_key": "qa:card-receipt:reverse-1",
            },
            headers=super_headers,
        )
        self.assertEqual(reversed_response.status_code, 200, reversed_response.text)
        restored_invoice = await self.db.finance_invoices.find_one({"_id": invoice["_id"]})
        self.assertEqual(restored_invoice["amount_paid_uzs"], 0)
        self.assertEqual(restored_invoice["balance_uzs"], 450_000)
        reversed_receipt = await self.db.finance_receipts.find_one({"_id": receipt["_id"]})
        self.assertEqual(reversed_receipt["status"], "reversed")

        rejected_report = await self.http.post(
            "/api/finance/card-payment-reports",
            json={
                **report_payload,
                "amount_uzs": 25_000,
                "idempotency_key": "qa:card-report:reject",
            },
            headers=parent_headers,
        )
        self.assertEqual(rejected_report.status_code, 200, rejected_report.text)
        rejected_report_id = rejected_report.json()["report"]["id"]
        rejected = await self.http.post(
            f"/api/finance/card-payment-reports/{rejected_report_id}/resolve",
            json={
                "decision": "reject",
                "reason": "No matching transfer in the Click card history",
                "idempotency_key": "qa:card-resolution:reject-1",
            },
            headers=manager_a_headers,
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["report"]["status"], "rejected")
        self.assertEqual(await self.db.finance_receipts.count_documents({}), 1)
        rejected_invoice = await self.db.finance_invoices.find_one({"_id": invoice["_id"]})
        self.assertEqual(rejected_invoice["amount_paid_uzs"], 0)
        self.assertEqual(rejected_invoice["balance_uzs"], 450_000)

        student_report = await self.http.post(
            "/api/finance/card-payment-reports",
            json={
                **report_payload,
                "amount_uzs": 30_000,
                "idempotency_key": "qa:card-report:student-self",
            },
            headers=student_headers,
        )
        self.assertEqual(student_report.status_code, 200, student_report.text)
        self.assertEqual(student_report.json()["report"]["status"], "unresolved")
        self.assertEqual(student_report.json()["report"]["reporter_role"], "student")
        self.assertEqual(
            student_report.json()["report"]["reported_by"],
            self.fixture["users"]["student_a"]["id"],
        )
        own_reports = await self.http.get(
            "/api/finance/card-payment-reports", headers=student_headers
        )
        self.assertEqual(own_reports.status_code, 200, own_reports.text)
        self.assertEqual(len(own_reports.json()), 1)
        self.assertEqual(own_reports.json()[0]["reporter_role"], "student")

    async def test_change_stream_emits_only_scoped_invalidation_metadata(self):
        manager_a = await self.db.users.find_one({"login": QA_USERS["manager_a"]})
        manager_b = await self.db.users.find_one({"login": QA_USERS["manager_b"]})
        pipeline = [{"$match": {
            "operationType": "insert",
            "ns.coll": {"$in": list(FINANCE_LIVE_COLLECTIONS)},
        }}]
        async with self.db.watch(
            pipeline, full_document="updateLookup", max_await_time_ms=1_000
        ) as stream:
            await stream.try_next()  # Establish the cursor before the write.
            await create_other_expense_obligation(
                self.db,
                category="Other",
                recipient="QA live event",
                expense_date=date.today(),
                amount_uzs=125_000,
                explanation="Change stream scope",
                proof_reference=None,
                branch_id=self.fixture["branch_a_id"],
                idempotency_key="qa:change-stream",
                actor_id=str(manager_a["_id"]),
            )
            change = None
            for _ in range(5):
                change = await stream.try_next()
                if change is not None:
                    break
            self.assertIsNotNone(change)
            self.assertTrue(finance_change_is_visible(change, manager_a))
            self.assertFalse(finance_change_is_visible(change, manager_b))
            client_payload = {"type": "finance_changed"}
            self.assertNotIn("fullDocument", client_payload)
            self.assertNotIn("amount_uzs", client_payload)

    async def test_live_ticket_is_short_lived_hashed_and_one_time(self):
        manager_headers = await self.login(QA_USERS["manager_a"])
        response = await self.http.post(
            "/api/finance/live-ticket", headers=manager_headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        ticket = response.json()["ticket"]
        stored = await self.db.finance_live_tickets.find_one({})
        self.assertIsNotNone(stored)
        self.assertNotEqual(stored["ticket_hash"], ticket)
        self.assertNotIn("ticket", stored)

        user = await consume_finance_live_ticket(self.db, ticket)
        self.assertEqual(user["login"], QA_USERS["manager_a"])
        self.assertIsNone(await consume_finance_live_ticket(self.db, ticket))

    async def test_superadmin_only_expense_correction_is_transactional_and_idempotent(self):
        super_admin = await self.db.users.find_one({"login": QA_USERS["super_admin"]})
        obligation = await create_other_expense_obligation(
            self.db,
            category="Other",
            recipient="QA correction",
            expense_date=date.today(),
            amount_uzs=500_000,
            explanation="Correction transaction",
            proof_reference=None,
            branch_id=self.fixture["branch_a_id"],
            idempotency_key="qa:correction:source",
            actor_id=str(super_admin["_id"]),
        )
        first = await adjust_expense_obligation_amount(
            self.db,
            obligation,
            425_000,
            "Approved QA correction",
            "qa:correction:event",
            str(super_admin["_id"]),
        )
        replay = await adjust_expense_obligation_amount(
            self.db,
            obligation,
            425_000,
            "Approved QA correction",
            "qa:correction:event",
            str(super_admin["_id"]),
        )
        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(
            await self.db.finance_expense_amount_events.count_documents(
                {"idempotency_key": "qa:correction:event"}
            ),
            1,
        )
        stored = await self.db.finance_expense_obligations.find_one(
            {"_id": obligation["_id"]}
        )
        self.assertEqual(stored["accrued_amount_uzs"], 425_000)
        self.assertEqual(stored["outstanding_amount_uzs"], 425_000)


if __name__ == "__main__":
    unittest.main()
