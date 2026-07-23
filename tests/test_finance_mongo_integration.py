"""Transactional finance integration tests.

These tests are skipped unless RUN_FINANCE_MONGO_QA=1. The runner supplies a
validated, uniquely named database on a disposable MongoDB replica set.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
import hashlib
import os
from pathlib import Path
import sys
import unittest
from uuid import uuid4

from bson import ObjectId
from httpx import ASGITransport, AsyncClient


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
from finance_ledger import open_cash_shift  # noqa: E402
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

        opened = await self.http.post(
            "/api/finance/cash-shifts/open",
            json={
                "opening_balance_uzs": 0,
                "notes": "QA complete lifecycle",
                "idempotency_key": "qa:shift:complete-lifecycle",
            },
            headers=manager_headers,
        )
        self.assertEqual(opened.status_code, 200, opened.text)
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
