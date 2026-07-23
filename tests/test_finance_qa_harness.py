from datetime import date
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-finance-qa")

from finance_models import (
    InvoiceDraftGenerationRequest,
    OtherExpenseCreate,
    StudentFreezeOverrideCreate,
    TariffVersionCreate,
)
from finance_qa.role_audit import audit_finance_routes
from finance_qa.runner import REPO_ROOT, run_scenario_file, run_stress_campaign, scenario_files
from database import assert_disposable_database_name
from finance_live import finance_change_is_visible
from routes_finance import (
    FINANCE_ROLES,
    _enforce_branch,
    _require_role,
    add_other_expense,
    add_tariff_version,
    generate_invoice_drafts,
    get_financial_position,
    override_student_finance_freeze,
)


class DeterministicFinanceScenarioTests(unittest.TestCase):
    def test_approved_scenarios_match_independent_oracle(self):
        files = scenario_files()
        self.assertGreaterEqual(len(files), 4)
        reports = [run_scenario_file(path) for path in files]
        self.assertEqual(len(reports), len(files))
        self.assertTrue(all(report["assertion_count"] >= 20 for report in reports))

    def test_seeded_stress_campaign_is_repeatable(self):
        first = run_stress_campaign(seed=202608, iterations=250)
        second = run_stress_campaign(seed=202608, iterations=250)
        self.assertEqual(first, second)
        self.assertEqual(first["iterations"], 250)
        self.assertGreater(first["assertion_count"], 2_500)

    def test_every_finance_route_retains_role_guards(self):
        report = audit_finance_routes(REPO_ROOT / "backend" / "routes_finance.py")
        self.assertGreaterEqual(report["route_count"], 50)
        self.assertEqual(report["live_routes_checked"], 1)
        self.assertEqual(report["problems"], [])

    def test_qa_database_guard_rejects_production_looking_names(self):
        for safe_name in (
            "nurik_academy_finance_qa_run1",
            "nurik-academy-test-run1",
            "academy_shadow_202607",
            "academy_sandbox",
        ):
            assert_disposable_database_name(safe_name)
        for unsafe_name in ("nurik_academy", "production", "academy_financial"):
            with self.assertRaises(RuntimeError):
                assert_disposable_database_name(unsafe_name)

    def test_finance_live_invalidation_is_branch_scoped_without_money_payload(self):
        branch_a_change = {"fullDocument": {"branch_id": "branch-a", "amount_uzs": 500_000}}
        global_change = {"fullDocument": {"branch_id": None, "amount_uzs": 10_500_000}}
        manager_a = {"role": "manager", "branch_id": "branch-a"}
        manager_b = {"role": "manager", "branch_id": "branch-b"}
        super_admin = {"role": "super_admin", "branch_id": None}

        self.assertTrue(finance_change_is_visible(branch_a_change, manager_a))
        self.assertFalse(finance_change_is_visible(branch_a_change, manager_b))
        self.assertTrue(finance_change_is_visible(branch_a_change, super_admin))
        self.assertTrue(finance_change_is_visible(global_change, manager_a))
        self.assertEqual({"type": "finance_changed"}, {"type": "finance_changed"})


class FinanceRoleAccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.super_admin = {
            "_id": ObjectId(),
            "role": "super_admin",
            "branch_id": None,
        }
        self.manager = {
            "_id": ObjectId(),
            "role": "manager",
            "branch_id": "branch-a",
        }
        self.request = SimpleNamespace(client=None)

    def test_finance_roles_and_branch_helper_contract(self):
        self.assertEqual(FINANCE_ROLES, {"super_admin", "manager"})
        _require_role(self.super_admin, FINANCE_ROLES)
        _require_role(self.manager, FINANCE_ROLES)
        with self.assertRaises(HTTPException) as denied:
            _require_role({"role": "reception"}, FINANCE_ROLES)
        self.assertEqual(denied.exception.status_code, 403)

        _enforce_branch(self.super_admin, {"branch_id": "branch-b"})
        _enforce_branch(self.manager, {"branch_id": "branch-a"})
        _enforce_branch(self.manager, {"branch_id": None})
        with self.assertRaises(HTTPException) as cross_branch:
            _enforce_branch(self.manager, {"branch_id": "branch-b"})
        self.assertEqual(cross_branch.exception.status_code, 403)

    async def test_manager_position_is_forced_to_own_branch(self):
        position = AsyncMock(return_value={"branch_id": "branch-a"})
        with patch("routes_finance.financial_position", new=position):
            result = await get_financial_position("2026-08", None, self.manager)
        self.assertEqual(result["branch_id"], "branch-a")
        self.assertEqual(position.await_args.args[2], "branch-a")

        with patch("routes_finance.financial_position", new=AsyncMock()) as blocked_service:
            with self.assertRaises(HTTPException) as blocked:
                await get_financial_position("2026-08", "branch-b", self.manager)
        self.assertEqual(blocked.exception.status_code, 403)
        blocked_service.assert_not_awaited()

    async def test_super_admin_can_request_global_or_selected_branch_position(self):
        position = AsyncMock(side_effect=lambda _db, _month, branch: {"branch_id": branch})
        with patch("routes_finance.financial_position", new=position):
            global_result = await get_financial_position("2026-08", None, self.super_admin)
            branch_result = await get_financial_position("2026-08", "branch-b", self.super_admin)
        self.assertIsNone(global_result["branch_id"])
        self.assertEqual(branch_result["branch_id"], "branch-b")

    async def test_manager_invoice_generation_is_forced_to_own_branch(self):
        import server

        fake_db = object()
        service = AsyncMock(return_value={"invoice_count": 2})
        audit = AsyncMock()
        payload = InvoiceDraftGenerationRequest(service_month="2026-08")
        with patch.object(server, "db", fake_db), patch.object(
            server, "create_audit_log", new=audit
        ), patch("routes_finance.generate_draft_invoices", new=service):
            await generate_invoice_drafts(payload, self.request, self.manager)
        service.assert_awaited_once_with(
            fake_db,
            "2026-08",
            "branch-a",
            str(self.manager["_id"]),
        )

        cross_branch = InvoiceDraftGenerationRequest(
            service_month="2026-08", branch_id="branch-b"
        )
        blocked_service = AsyncMock()
        with patch.object(server, "db", fake_db), patch.object(
            server, "create_audit_log", new=AsyncMock()
        ), patch("routes_finance.generate_draft_invoices", new=blocked_service):
            with self.assertRaises(HTTPException) as blocked:
                await generate_invoice_drafts(cross_branch, self.request, self.manager)
        self.assertEqual(blocked.exception.status_code, 403)
        blocked_service.assert_not_awaited()

    async def test_manager_cannot_change_tariffs_but_super_admin_can(self):
        import server

        payload = TariffVersionCreate(
            program_code="general",
            group_format="normal",
            monthly_price_uzs=475_000,
            effective_from=date(2026, 9, 1),
            reason="Authorized September update",
        )
        with self.assertRaises(HTTPException) as blocked:
            await add_tariff_version(payload, self.request, self.manager)
        self.assertEqual(blocked.exception.status_code, 403)

        document = {"_id": ObjectId(), **payload.model_dump(mode="json")}
        service = AsyncMock(return_value=document)
        with patch.object(server, "create_audit_log", new=AsyncMock()), patch(
            "routes_finance.create_tariff_version", new=service
        ):
            result = await add_tariff_version(payload, self.request, self.super_admin)
        self.assertEqual(result["monthly_price_uzs"], 475_000)
        service.assert_awaited_once()

    async def test_manager_other_expense_is_forced_to_own_branch(self):
        import server

        payload = OtherExpenseCreate(
            category="Other",
            recipient="Emergency repair",
            expense_date=date(2026, 8, 12),
            amount_uzs=250_000,
            explanation="Urgent classroom door repair",
            branch_id=None,
            idempotency_key="manager-expense-20260812",
        )
        service = AsyncMock(return_value={"_id": ObjectId(), "amount_uzs": 250_000})
        with patch.object(server, "create_audit_log", new=AsyncMock()), patch(
            "routes_finance.create_other_expense_obligation", new=service
        ):
            await add_other_expense(payload, self.request, self.manager)
        self.assertEqual(service.await_args.kwargs["branch_id"], "branch-a")

        cross_branch = payload.model_copy(update={"branch_id": "branch-b"})
        blocked_service = AsyncMock()
        with patch.object(server, "create_audit_log", new=AsyncMock()), patch(
            "routes_finance.create_other_expense_obligation", new=blocked_service
        ):
            with self.assertRaises(HTTPException) as blocked:
                await add_other_expense(cross_branch, self.request, self.manager)
        self.assertEqual(blocked.exception.status_code, 403)
        blocked_service.assert_not_awaited()

    async def test_only_super_admin_can_manually_unfreeze(self):
        payload = StudentFreezeOverrideCreate(
            action="unfreeze",
            effective_on=date(2026, 8, 15),
            reason="Debt manually reviewed and cleared",
            idempotency_key="unfreeze-student-20260815",
        )
        with self.assertRaises(HTTPException) as blocked:
            await override_student_finance_freeze(
                str(ObjectId()), payload, self.request, self.manager
            )
        self.assertEqual(blocked.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
