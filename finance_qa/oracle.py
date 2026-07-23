"""Independent whole-UZS accounting oracle used only by the QA harness.

Keep these calculations separate from ``backend/finance_domain.py``.  Expected
results must not be produced by the same functions that the harness is testing.
"""

from fractions import Fraction
from typing import Dict, Iterable, List, Sequence, Tuple


def round_half_up(value: Fraction) -> int:
    if value < 0:
        raise ValueError("Money values cannot be negative")
    whole, remainder = divmod(value.numerator, value.denominator)
    return whole + int(remainder * 2 >= value.denominator)


def expected_charge(lessons: Sequence[dict], discount_basis_points: int) -> dict:
    if not lessons:
        return {
            "scheduled_lesson_count": 0,
            "billable_lesson_count": 0,
            "gross_tuition_uzs": 0,
            "discount_amount_uzs": 0,
            "amount_due_uzs": 0,
            "line_amounts": {},
        }
    if not 0 <= discount_basis_points <= 10_000:
        raise ValueError("Discount must use 0..10000 basis points")

    denominator = len(lessons)
    billable = [row for row in lessons if row["billable"]]
    exact = [Fraction(int(row["price_uzs"]), denominator) for row in billable]
    gross = round_half_up(sum(exact, Fraction(0)))
    floors = [value.numerator // value.denominator for value in exact]
    missing = gross - sum(floors)
    order = sorted(
        range(len(billable)),
        key=lambda index: (-(exact[index] - floors[index]), billable[index]["key"]),
    )
    for index in order[:missing]:
        floors[index] += 1
    discount = round_half_up(Fraction(gross * discount_basis_points, 10_000))
    return {
        "scheduled_lesson_count": denominator,
        "billable_lesson_count": len(billable),
        "gross_tuition_uzs": gross,
        "discount_amount_uzs": discount,
        "amount_due_uzs": gross - discount,
        "line_amounts": {
            row["key"]: amount for row, amount in zip(billable, floors)
        },
    }


def expected_teacher_earning(gross_tuition_uzs: int, share_basis_points: int) -> int:
    return round_half_up(Fraction(gross_tuition_uzs * share_basis_points, 10_000))


def expected_oldest_first_allocation(
    amount_uzs: int, debts: Sequence[dict]
) -> Tuple[Tuple[dict, ...], int]:
    remaining = amount_uzs
    allocations: List[dict] = []
    ordered = sorted(
        debts,
        key=lambda row: (row["due_date"], row.get("invoice_number", ""), row["id"]),
    )
    for debt in ordered:
        if remaining == 0:
            break
        balance = int(debt["balance_uzs"])
        if balance <= 0:
            continue
        amount = min(balance, remaining)
        allocations.append({"invoice_id": debt["id"], "amount_uzs": amount})
        remaining -= amount
    return tuple(allocations), remaining


def apply_allocations(balances: Dict[str, int], allocations: Iterable[dict]) -> None:
    for allocation in allocations:
        invoice_id = allocation["invoice_id"]
        balances[invoice_id] -= int(allocation["amount_uzs"])
        if balances[invoice_id] < 0:
            raise AssertionError(f"Allocation overpaid invoice {invoice_id}")
