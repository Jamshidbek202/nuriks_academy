from datetime import date, datetime, timezone
import unittest

from pydantic import ValidationError
from bson import ObjectId

from finance_domain import (
    ChargeInput,
    build_occurrence_blueprints,
    calculate_student_charge,
    calculate_teacher_earning,
    closure_applies,
    enrollment_format_transition,
    validate_manual_format_change,
    validate_schedule_no_overlaps,
    capped_discount_basis_points,
    allocate_oldest_debts,
    payment_status,
)
from finance_models import GroupFormat, TariffVersionCreate
from finance_models import BillingRulesVersionCreate
from finance_controls import _invoice_is_freeze_eligible, financial_reminder_event
from finance_ledger import (
    _expected_group_version,
    _invoice_source_fingerprint,
    _membership_active,
)
from finance_accounting import calculate_projected_teacher_salary
from finance_service import DEFAULT_FINANCE_POLICIES
from finance_service import seed_reception_user


class FinanceDomainTests(unittest.TestCase):
    def test_reception_seed_requires_branch_scope(self):
        with self.assertRaisesRegex(ValueError, "must be assigned to a branch"):
            import asyncio

            asyncio.run(seed_reception_user(None, None, "test-actor"))

    def test_default_tariffs_match_approved_prices(self):
        tariffs = {
            (row["value"]["program_code"], row["value"]["group_format"]): row["value"]["monthly_price_uzs"]
            for row in DEFAULT_FINANCE_POLICIES
            if row["policy_kind"] == "tariff"
        }
        self.assertEqual(tariffs[("general", "normal")], 450_000)
        self.assertEqual(tariffs[("ielts", "normal")], 550_000)
        self.assertEqual(tariffs[("general", "mini")], 650_000)
        self.assertEqual(tariffs[("ielts", "mini")], 750_000)
        self.assertEqual(tariffs[("general", "individual")], 1_200_000)
        self.assertEqual(tariffs[("ielts", "individual")], 1_400_000)
        self.assertEqual(tariffs[("pre_ielts", "normal")], 550_000)
        self.assertEqual(tariffs[("pre_ielts", "mini")], 750_000)
        self.assertEqual(tariffs[("pre_ielts", "individual")], 1_400_000)

    def test_unapproved_recurring_amounts_remain_manual(self):
        expenses = {
            row["policy_key"]: row["value"]
            for row in DEFAULT_FINANCE_POLICIES
            if row["policy_kind"] == "recurring_expense"
        }
        self.assertEqual(expenses["expense:rent"]["amount_uzs"], 10_500_000)
        self.assertEqual(expenses["expense:accountant"]["amount_uzs"], 500_000)
        self.assertEqual(expenses["expense:wifi"]["amount_uzs"], 400_000)
        for key in ("expense:tax", "expense:electricity", "expense:gas"):
            self.assertIsNone(expenses[key]["amount_uzs"])
            self.assertEqual(expenses[key]["amount_mode"], "manual")

    def test_money_models_reject_floats(self):
        with self.assertRaises(ValidationError):
            TariffVersionCreate(
                program_code="general",
                group_format="normal",
                monthly_price_uzs=450_000.0,
                effective_from=date(2026, 7, 1),
                reason="Float is unsafe",
            )

    def test_one_closure_uses_original_thirteen_lesson_denominator(self):
        lessons = [
            ChargeInput(str(index), 450_000, student_billable=index != 4)
            for index in range(13)
        ]
        charge = calculate_student_charge(lessons)
        self.assertEqual(charge.scheduled_lesson_count, 13)
        self.assertEqual(charge.billable_lesson_count, 12)
        self.assertEqual(charge.undiscounted_amount_uzs, 415_385)
        self.assertEqual(sum(line.amount_uzs for line in charge.lines), 415_385)

    def test_midmonth_price_change_is_charged_per_scheduled_lesson(self):
        lessons = [ChargeInput(f"old-{index}", 450_000) for index in range(6)]
        lessons += [ChargeInput(f"new-{index}", 550_000) for index in range(6)]
        charge = calculate_student_charge(lessons)
        self.assertEqual(charge.undiscounted_amount_uzs, 500_000)

    def test_discount_is_centre_funded_and_does_not_reduce_teacher_share(self):
        charge = calculate_student_charge(
            [ChargeInput(str(index), 450_000) for index in range(12)],
            discount_basis_points=10_000,
        )
        self.assertEqual(charge.amount_due_uzs, 0)
        self.assertEqual(charge.discount_amount_uzs, 450_000)
        self.assertEqual(calculate_teacher_earning(charge.undiscounted_amount_uzs, 4_000), 180_000)

    def test_teacher_share_rules_are_40_and_50_percent(self):
        self.assertEqual(calculate_teacher_earning(550_000, 4_000), 220_000)
        self.assertEqual(calculate_teacher_earning(1_400_000, 5_000), 700_000)

    def test_mini_converts_at_fifth_student_but_normal_never_downgrades(self):
        self.assertEqual(enrollment_format_transition(GroupFormat.MINI, 4), GroupFormat.MINI)
        self.assertEqual(enrollment_format_transition(GroupFormat.MINI, 5), GroupFormat.NORMAL)
        self.assertEqual(enrollment_format_transition(GroupFormat.NORMAL, 4), GroupFormat.NORMAL)
        with self.assertRaises(ValueError):
            validate_manual_format_change(GroupFormat.NORMAL, GroupFormat.MINI)

    def test_capacity_limits_are_enforced(self):
        self.assertEqual(
            enrollment_format_transition(GroupFormat.NORMAL, 15),
            GroupFormat.NORMAL,
        )
        with self.assertRaises(ValueError):
            enrollment_format_transition(GroupFormat.INDIVIDUAL, 2)

    def test_schedule_expands_in_tashkent_and_persists_utc(self):
        rows = build_occurrence_blueprints(
            [{"day": "monday", "start_time": "18:00", "end_time": "19:30", "room": "A"}],
            date(2026, 7, 6),
            date(2026, 7, 6),
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].starts_at, datetime(2026, 7, 6, 13, 0, tzinfo=timezone.utc))
        self.assertEqual(rows[0].ends_at, datetime(2026, 7, 6, 14, 30, tzinfo=timezone.utc))

    def test_overlapping_schedule_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_schedule_no_overlaps([
                {"day": "monday", "start_time": "10:00", "end_time": "11:30"},
                {"day": "monday", "start_time": "11:00", "end_time": "12:00"},
            ])

    def test_closure_scope_and_time_must_both_match(self):
        occurrence = build_occurrence_blueprints(
            [{"day": "monday", "start_time": "18:00", "end_time": "19:30"}],
            date(2026, 7, 6),
            date(2026, 7, 6),
        )[0]
        closure = {
            "starts_at": datetime(2026, 7, 6, 12, 0, tzinfo=timezone.utc),
            "ends_at": datetime(2026, 7, 6, 15, 0, tzinfo=timezone.utc),
            "group_ids": ["group-a"],
            "branch_id": "branch-a",
        }
        self.assertTrue(closure_applies(occurrence, closure, "group-a", "branch-a"))
        self.assertFalse(closure_applies(occurrence, closure, "group-b", "branch-a"))
        self.assertFalse(closure_applies(occurrence, closure, "group-a", "branch-b"))

    def test_discounts_stack_but_never_exceed_a_free_month(self):
        self.assertEqual(capped_discount_basis_points(1_000, 1_000), 2_000)
        self.assertEqual(capped_discount_basis_points(1_000, 10_000), 10_000)

    def test_partial_payment_allocates_oldest_invoice_first(self):
        allocations, advance = allocate_oldest_debts(600_000, [
            {"id": "new", "invoice_number": "INV-2", "due_date": "2026-08-10", "balance_uzs": 450_000},
            {"id": "old", "invoice_number": "INV-1", "due_date": "2026-07-10", "balance_uzs": 300_000},
        ])
        self.assertEqual(allocations, (
            {"invoice_id": "old", "amount_uzs": 300_000},
            {"invoice_id": "new", "amount_uzs": 300_000},
        ))
        self.assertEqual(advance, 0)
        self.assertEqual(payment_status(450_000, 300_000), "partial")

    def test_same_day_membership_uses_exact_lesson_time(self):
        memberships = [{
            "group_id": "group-1",
            "effective_from": "2026-07-06",
            "effective_from_at": datetime(2026, 7, 6, 13, 30),
            "effective_to": None,
            "effective_to_at": None,
        }]
        self.assertFalse(_membership_active(
            memberships,
            "group-1",
            "2026-07-06",
            datetime(2026, 7, 6, 13, 0),
        ))
        self.assertTrue(_membership_active(
            memberships,
            "group-1",
            "2026-07-06",
            datetime(2026, 7, 6, 14, 0),
        ))

    def test_overpayment_becomes_advance(self):
        allocations, advance = allocate_oldest_debts(500_000, [
            {"id": "invoice", "due_date": "2026-07-10", "balance_uzs": 300_000},
        ])
        self.assertEqual(allocations[0]["amount_uzs"], 300_000)
        self.assertEqual(advance, 200_000)

    def test_configurable_freeze_day_does_not_freeze_early(self):
        rules = {"freeze_day": 15}
        invoice = {"due_date": "2026-07-10"}
        self.assertFalse(_invoice_is_freeze_eligible(invoice, date(2026, 7, 14), rules))
        self.assertTrue(_invoice_is_freeze_eligible(invoice, date(2026, 7, 15), rules))
        self.assertTrue(_invoice_is_freeze_eligible(invoice, date(2026, 8, 1), rules))

    def test_payment_reminders_follow_configurable_due_date(self):
        due = date(2026, 8, 15)
        self.assertEqual(
            financial_reminder_event(date(2026, 8, 10), due),
            "balance_reminder",
        )
        self.assertEqual(
            financial_reminder_event(date(2026, 8, 14), due),
            "final_payment_warning",
        )
        self.assertEqual(
            financial_reminder_event(date(2026, 8, 16), due),
            "overdue_freeze_notice",
        )
        self.assertIsNone(financial_reminder_event(date(2026, 8, 9), due))

    def test_projected_teacher_salary_matches_per_teacher_rounding(self):
        lines = [
            {
                "payable_teacher_id": "teacher-a",
                "amount_uzs": 33,
                "teacher_share_basis_points": 4_000,
            },
            {
                "payable_teacher_id": "teacher-a",
                "amount_uzs": 34,
                "teacher_share_basis_points": 4_000,
            },
            {
                "payable_teacher_id": "teacher-b",
                "amount_uzs": 1,
                "teacher_share_basis_points": 5_000,
            },
        ]
        self.assertEqual(calculate_projected_teacher_salary(lines), 28)

    def test_shadow_mode_cannot_enable_automatic_freeze(self):
        with self.assertRaises(ValidationError):
            BillingRulesVersionCreate(
                effective_from=date(2026, 7, 1),
                student_due_day=10,
                freeze_day=11,
                operation_mode="shadow",
                automatic_freeze_enabled=True,
                reason="Unsafe shadow configuration",
            )

    def test_invoice_fingerprint_changes_when_lesson_revision_changes(self):
        student_id = ObjectId()
        membership_id = ObjectId()
        occurrence_id = ObjectId()
        policy_id = ObjectId()
        group_version_id = ObjectId()
        student = {
            "_id": student_id,
            "status": "active",
            "parent_id": None,
        }
        occurrence = {
            "_id": occurrence_id,
            "revision": 1,
            "group_id": "group-1",
            "local_date": "2026-07-06",
            "starts_at": datetime(2026, 7, 6, 13, 0),
            "ends_at": datetime(2026, 7, 6, 14, 30),
            "program_code": "general",
            "group_format": "normal",
            "teacher_id": "teacher-1",
            "payable_teacher_id": "teacher-1",
            "resolution_status": "resolved",
            "lesson_status": "held",
            "student_billable": True,
            "teacher_payable": True,
            "counts_as_scheduled": True,
            "superseded": False,
        }
        inputs = {
            "memberships": [{
                "_id": membership_id,
                "group_id": "group-1",
                "student_id": str(student_id),
                "effective_from": "2026-07-01",
                "effective_to": None,
            }],
            "occurrences_by_group": {"group-1": [occurrence]},
            "freeze_periods": [],
            "policies": [{
                "_id": policy_id,
                "policy_key": "tariff:general:normal",
                "version": 1,
                "effective_from": "2026-01-01",
                "value": {"monthly_price_uzs": 450_000},
            }],
            "group_versions": [{
                "_id": group_version_id,
                "group_id": "group-1",
                "version": 1,
                "effective_from": "2026-01-01",
                "program_code": "general",
                "group_format": "normal",
                "teacher_id": "teacher-1",
                "schedule": [{
                    "day": "monday",
                    "start_time": "18:00",
                    "end_time": "19:30",
                    "room": None,
                }],
            }],
        }
        first = _invoice_source_fingerprint(inputs, student, 0, [])
        occurrence["revision"] = 2
        second = _invoice_source_fingerprint(inputs, student, 0, [])
        self.assertNotEqual(first, second)

    def test_effective_group_version_changes_midmonth(self):
        old_id = ObjectId()
        new_id = ObjectId()
        inputs = {
            "group_versions": [
                {
                    "_id": old_id,
                    "group_id": "group-1",
                    "version": 1,
                    "effective_from": "2026-07-01",
                },
                {
                    "_id": new_id,
                    "group_id": "group-1",
                    "version": 2,
                    "effective_from": "2026-07-15",
                },
            ]
        }
        self.assertEqual(
            _expected_group_version(inputs, "group-1", "2026-07-14")["_id"],
            old_id,
        )
        self.assertEqual(
            _expected_group_version(inputs, "group-1", "2026-07-15")["_id"],
            new_id,
        )


if __name__ == "__main__":
    unittest.main()
