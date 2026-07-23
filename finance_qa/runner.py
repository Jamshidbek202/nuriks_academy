"""Scenario and seeded stress runner for the production finance domain."""

import json
import random
import sys
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from finance_domain import (  # noqa: E402
    ChargeInput,
    allocate_oldest_debts,
    build_occurrence_blueprints,
    calculate_student_charge,
    calculate_teacher_earning,
)

from .oracle import (  # noqa: E402
    apply_allocations,
    expected_charge,
    expected_oldest_first_allocation,
    expected_teacher_earning,
)


APPROVED_PRICES = {
    ("general", "normal"): 450_000,
    ("ielts", "normal"): 550_000,
    ("pre_ielts", "normal"): 550_000,
    ("general", "mini"): 650_000,
    ("ielts", "mini"): 750_000,
    ("pre_ielts", "mini"): 750_000,
    ("general", "individual"): 1_200_000,
    ("ielts", "individual"): 1_400_000,
    ("pre_ielts", "individual"): 1_400_000,
}

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


class FinanceQaFailure(AssertionError):
    pass


def _check(condition: bool, message: str, counter: List[int]) -> None:
    counter[0] += 1
    if not condition:
        raise FinanceQaFailure(message)


def _month_bounds(service_month: str) -> tuple:
    year, month = (int(value) for value in service_month.split("-", 1))
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _independent_schedule_dates(service_month: str, schedule: Sequence[dict]) -> List[str]:
    start, end = _month_bounds(service_month)
    weekdays = {WEEKDAYS[row["day"].lower()] for row in schedule}
    values = []
    cursor = start
    while cursor <= end:
        if cursor.weekday() in weekdays:
            for _slot in [row for row in schedule if WEEKDAYS[row["day"].lower()] == cursor.weekday()]:
                values.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return values


def _active_price(prices: Sequence[dict], lesson_date: str) -> int:
    versions = [row for row in prices if row["effective_from"] <= lesson_date]
    if not versions:
        raise FinanceQaFailure(f"No price is active on {lesson_date}")
    selected = max(versions, key=lambda row: row["effective_from"])
    amount = selected["amount_uzs"]
    if type(amount) is not int or amount <= 0:
        raise FinanceQaFailure("Every tariff must be a positive whole-UZS integer")
    return amount


def _student_is_active(scenario: dict, lesson_date: str) -> bool:
    active_from = scenario.get("active_from", f"{scenario['service_month']}-01")
    active_to = scenario.get("active_to")
    return lesson_date >= active_from and (active_to is None or lesson_date < active_to)


def _compare_expected(report: dict, expected: dict, counter: List[int]) -> None:
    for key, value in expected.items():
        _check(key in report, f"Expected field {key} is missing from report", counter)
        _check(report[key] == value, f"{key}: expected {value}, got {report[key]}", counter)


def run_scenario(scenario: dict) -> dict:
    checks = [0]
    name = scenario.get("name", "unnamed-scenario")
    service_month = scenario["service_month"]
    schedule = scenario["schedule"]
    month_start, month_end = _month_bounds(service_month)

    actual_occurrences = build_occurrence_blueprints(schedule, month_start, month_end)
    actual_dates = [row.local_date.isoformat() for row in actual_occurrences]
    expected_dates = _independent_schedule_dates(service_month, schedule)
    _check(actual_dates == expected_dates, f"{name}: schedule expansion differs from oracle", checks)
    _check(len(actual_dates) == len(set((row.starts_at, row.ends_at) for row in actual_occurrences)), f"{name}: duplicate lesson occurrence", checks)

    closures = set(scenario.get("closures", []))
    absences = set(scenario.get("student_absences", []))
    _check(closures.issubset(set(actual_dates)), f"{name}: closure is outside the schedule", checks)
    _check(absences.issubset(set(actual_dates)), f"{name}: absence is outside the schedule", checks)

    lessons = []
    for index, occurrence in enumerate(actual_occurrences):
        lesson_date = occurrence.local_date.isoformat()
        price = _active_price(scenario["prices"], lesson_date)
        # A student absence is deliberately not part of this condition: missed
        # lessons remain billable.  Centre closures and inactive membership do not.
        billable = _student_is_active(scenario, lesson_date) and lesson_date not in closures
        lessons.append({
            "key": f"{lesson_date}:{occurrence.starts_at.isoformat()}:{index}",
            "price_uzs": price,
            "billable": billable,
        })

    discount_basis_points = int(scenario.get("discount_basis_points", 0))
    production = calculate_student_charge(
        [
            ChargeInput(row["key"], row["price_uzs"], row["billable"])
            for row in lessons
        ],
        discount_basis_points=discount_basis_points,
    )
    oracle = expected_charge(lessons, discount_basis_points)
    production_lines = {row.key: row.amount_uzs for row in production.lines}
    _check(production.scheduled_lesson_count == oracle["scheduled_lesson_count"], f"{name}: scheduled denominator mismatch", checks)
    _check(production.billable_lesson_count == oracle["billable_lesson_count"], f"{name}: billable lesson count mismatch", checks)
    _check(production.undiscounted_amount_uzs == oracle["gross_tuition_uzs"], f"{name}: gross tuition mismatch", checks)
    _check(production.discount_amount_uzs == oracle["discount_amount_uzs"], f"{name}: discount mismatch", checks)
    _check(production.amount_due_uzs == oracle["amount_due_uzs"], f"{name}: amount due mismatch", checks)
    _check(production_lines == oracle["line_amounts"], f"{name}: per-lesson rounding mismatch", checks)
    _check(sum(production_lines.values()) == production.undiscounted_amount_uzs, f"{name}: invoice lines do not reconcile", checks)

    share = int(scenario["teacher_share_basis_points"])
    production_teacher = calculate_teacher_earning(production.undiscounted_amount_uzs, share)
    oracle_teacher = expected_teacher_earning(oracle["gross_tuition_uzs"], share)
    _check(production_teacher == oracle_teacher, f"{name}: teacher earning mismatch", checks)

    current_invoice_id = f"current:{name}"
    debts = [dict(row) for row in scenario.get("prior_debts", [])]
    debts.append({
        "id": current_invoice_id,
        "invoice_number": f"INV-{service_month.replace('-', '')}-CURRENT",
        "due_date": scenario.get("current_due_date", (month_end + timedelta(days=10)).isoformat()),
        "balance_uzs": production.amount_due_uzs,
    })
    balances = {row["id"]: int(row["balance_uzs"]) for row in debts}
    advance = 0
    for payment_index, amount in enumerate(scenario.get("payments", [])):
        open_debts = [{**row, "balance_uzs": balances[row["id"]]} for row in debts]
        actual_allocations, actual_advance = allocate_oldest_debts(int(amount), open_debts)
        oracle_allocations, oracle_advance = expected_oldest_first_allocation(int(amount), open_debts)
        _check(actual_allocations == oracle_allocations, f"{name}: payment {payment_index} allocation mismatch", checks)
        _check(actual_advance == oracle_advance, f"{name}: payment {payment_index} advance mismatch", checks)
        apply_allocations(balances, actual_allocations)
        advance += actual_advance

    _check(all(value >= 0 for value in balances.values()), f"{name}: negative debt balance", checks)
    expenses = sum(int(row["amount_uzs"]) for row in scenario.get("expenses", []))
    other_income = sum(int(row["amount_uzs"]) for row in scenario.get("other_income", []))
    accrued_profit = production.amount_due_uzs + other_income - production_teacher - expenses
    report = {
        "name": name,
        "service_month": service_month,
        "scheduled_lesson_count": production.scheduled_lesson_count,
        "billable_lesson_count": production.billable_lesson_count,
        "gross_tuition_uzs": production.undiscounted_amount_uzs,
        "discount_amount_uzs": production.discount_amount_uzs,
        "amount_due_uzs": production.amount_due_uzs,
        "teacher_earning_uzs": production_teacher,
        "remaining_debt_uzs": sum(balances.values()),
        "advance_uzs": advance,
        "expenses_accrued_uzs": expenses,
        "other_income_uzs": other_income,
        "accrued_operating_profit_uzs": accrued_profit,
        "assertion_count": checks[0],
    }
    _compare_expected(report, scenario.get("expected", {}), checks)
    report["assertion_count"] = checks[0]
    return report


def run_scenario_file(path: Path) -> dict:
    return run_scenario(json.loads(path.read_text(encoding="utf-8")))


def scenario_files(root: Optional[Path] = None) -> List[Path]:
    location = root or Path(__file__).with_name("scenarios")
    return sorted(location.glob("*.json"))


def _stress_scenario(rng: random.Random, index: int) -> dict:
    year = rng.randint(2024, 2034)
    month = rng.randint(1, 12)
    service_month = f"{year:04d}-{month:02d}"
    program = rng.choice(["general", "ielts", "pre_ielts"])
    group_format = rng.choice(["normal", "mini", "individual"])
    base_price = APPROVED_PRICES[(program, group_format)]
    weekday_names = list(WEEKDAYS)
    rng.shuffle(weekday_names)
    schedule = [
        {"day": day, "start_time": f"{10 + slot:02d}:00", "end_time": f"{11 + slot:02d}:00"}
        for slot, day in enumerate(weekday_names[:rng.randint(1, 4)])
    ]
    dates = _independent_schedule_dates(service_month, schedule)
    closures = rng.sample(dates, k=min(len(dates), rng.randint(0, min(3, len(dates))))) if dates else []
    price_rows = [{"effective_from": f"{service_month}-01", "amount_uzs": base_price}]
    if rng.random() < 0.45:
        price_rows.append({
            "effective_from": f"{service_month}-{rng.randint(10, 22):02d}",
            "amount_uzs": base_price + rng.choice([50_000, 100_000, 200_000]),
        })
    last_day = monthrange(year, month)[1]
    active_from = f"{service_month}-{rng.randint(1, min(12, last_day)):02d}"
    return {
        "name": f"stress-{index}",
        "service_month": service_month,
        "program_code": program,
        "group_format": group_format,
        "schedule": schedule,
        "active_from": active_from,
        "prices": price_rows,
        "closures": closures,
        "student_absences": rng.sample(dates, k=min(len(dates), rng.randint(0, min(4, len(dates))))) if dates else [],
        "discount_basis_points": rng.choice([0, 500, 1_000, 2_000, 5_000, 10_000]),
        "teacher_share_basis_points": 5_000 if group_format == "individual" else 4_000,
        "prior_debts": [{
            "id": f"old-{index}",
            "invoice_number": f"INV-OLD-{index}",
            "due_date": f"{year - 1:04d}-12-10",
            "balance_uzs": rng.randint(0, 900_000),
        }],
        "payments": [rng.randint(1, 900_000) for _ in range(rng.randint(0, 4))],
        "expenses": [
            {"name": "rent", "amount_uzs": 10_500_000},
            {"name": "accountant", "amount_uzs": 500_000},
            {"name": "wifi", "amount_uzs": 400_000},
        ],
        "other_income": [{"amount_uzs": rng.randint(0, 2_000_000)}],
    }


def run_stress_campaign(seed: int, iterations: int) -> dict:
    rng = random.Random(seed)
    assertions = 0
    for index in range(iterations):
        result = run_scenario(_stress_scenario(rng, index))
        assertions += result["assertion_count"]
    return {"seed": seed, "iterations": iterations, "assertion_count": assertions}
