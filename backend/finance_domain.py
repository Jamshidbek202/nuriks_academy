"""Pure, deterministic finance calculations.

The functions in this module do not read the database or current clock.  That
makes the money rules independently testable and keeps route handlers from
inventing slightly different calculations.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from fractions import Fraction
from typing import Dict, Iterable, List, Optional, Sequence
from zoneinfo import ZoneInfo

from finance_models import ACADEMY_TIMEZONE, GroupFormat, ScheduleSlot


FORMAT_CAPACITY = {
    GroupFormat.MINI: 4,
    GroupFormat.INDIVIDUAL: 1,
}


@dataclass(frozen=True)
class OccurrenceBlueprint:
    local_date: date
    starts_at: datetime
    ends_at: datetime
    room: Optional[str]


@dataclass(frozen=True)
class ChargeInput:
    key: str
    monthly_price_uzs: int
    student_billable: bool = True


@dataclass(frozen=True)
class ChargeLine:
    key: str
    amount_uzs: int
    monthly_price_uzs: int
    denominator: int


@dataclass(frozen=True)
class StudentCharge:
    scheduled_lesson_count: int
    billable_lesson_count: int
    undiscounted_amount_uzs: int
    discount_amount_uzs: int
    amount_due_uzs: int
    lines: Sequence[ChargeLine]


def month_bounds(month: str) -> tuple:
    """Return inclusive local-date bounds for a YYYY-MM value."""
    try:
        year, month_number = (int(part) for part in month.split("-", 1))
        last_day = monthrange(year, month_number)[1]
    except (TypeError, ValueError):
        raise ValueError("Month must use YYYY-MM")
    return date(year, month_number, 1), date(year, month_number, last_day)


def _as_slot_dict(slot) -> Dict[str, Optional[str]]:
    if isinstance(slot, ScheduleSlot):
        return slot.model_dump()
    return dict(slot)


def validate_schedule_no_overlaps(schedule: Sequence) -> None:
    """Reject duplicate or overlapping schedule slots on the same weekday."""
    by_day: Dict[str, List[tuple]] = {}
    for raw in schedule:
        slot = _as_slot_dict(raw)
        day = str(slot["day"]).lower()
        start = time.fromisoformat(str(slot["start_time"]))
        end = time.fromisoformat(str(slot["end_time"]))
        if end <= start:
            raise ValueError("Schedule end time must be after start time")
        by_day.setdefault(day, []).append((start, end))

    for day, intervals in by_day.items():
        intervals.sort()
        for previous, current in zip(intervals, intervals[1:]):
            if current[0] < previous[1]:
                raise ValueError(f"Schedule slots overlap on {day}")


def build_occurrence_blueprints(
    schedule: Sequence,
    starts_on: date,
    ends_on: date,
    timezone_name: str = ACADEMY_TIMEZONE,
) -> List[OccurrenceBlueprint]:
    """Expand a schedule into concrete UTC lesson times.

    The input and output bounds are inclusive.  Local time is always interpreted
    in the academy timezone and persisted in UTC, while local_date is retained
    for accounting and UI grouping.
    """
    if ends_on < starts_on:
        raise ValueError("Occurrence range end cannot precede its start")
    validate_schedule_no_overlaps(schedule)
    academy_tz = ZoneInfo(timezone_name)
    slots_by_day: Dict[str, List[Dict[str, Optional[str]]]] = {}
    for raw in schedule:
        slot = _as_slot_dict(raw)
        slots_by_day.setdefault(str(slot["day"]).lower(), []).append(slot)

    result: List[OccurrenceBlueprint] = []
    cursor = starts_on
    while cursor <= ends_on:
        for slot in sorted(slots_by_day.get(cursor.strftime("%A").lower(), []), key=lambda row: str(row["start_time"])):
            local_start = datetime.combine(cursor, time.fromisoformat(str(slot["start_time"])), academy_tz)
            local_end = datetime.combine(cursor, time.fromisoformat(str(slot["end_time"])), academy_tz)
            result.append(OccurrenceBlueprint(
                local_date=cursor,
                starts_at=local_start.astimezone(timezone.utc),
                ends_at=local_end.astimezone(timezone.utc),
                room=slot.get("room"),
            ))
        cursor += timedelta(days=1)
    return result


def intervals_overlap(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    return start_a < end_b and start_b < end_a


def closure_applies(occurrence: OccurrenceBlueprint, closure: dict, group_id: str, branch_id: Optional[str]) -> bool:
    group_ids = [str(value) for value in closure.get("group_ids", [])]
    closure_branch = closure.get("branch_id")
    if group_ids and group_id not in group_ids:
        return False
    if closure_branch and closure_branch != branch_id:
        return False
    return intervals_overlap(
        occurrence.starts_at,
        occurrence.ends_at,
        _aware_utc(closure["starts_at"]),
        _aware_utc(closure["ends_at"]),
    )


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def round_fraction_half_up(value: Fraction) -> int:
    if value < 0:
        raise ValueError("Money values cannot be negative")
    quotient, remainder = divmod(value.numerator, value.denominator)
    return quotient + (1 if remainder * 2 >= value.denominator else 0)


def calculate_student_charge(
    scheduled_lessons: Sequence[ChargeInput],
    discount_basis_points: int = 0,
) -> StudentCharge:
    """Calculate one student's monthly charge from scheduled occurrences.

    Every billable lesson contributes ``price active on that lesson / number of
    originally scheduled lessons in the month``.  Excluded closures remain in
    the denominator but contribute no charge.  Remainders are distributed in a
    stable order so line totals always equal the invoice total exactly.
    """
    if not scheduled_lessons:
        return StudentCharge(0, 0, 0, 0, 0, ())
    if not 0 <= discount_basis_points <= 10_000:
        raise ValueError("Discount must be between 0 and 10000 basis points")
    if any(item.monthly_price_uzs <= 0 for item in scheduled_lessons):
        raise ValueError("Monthly price must be a positive whole UZS amount")

    denominator = len(scheduled_lessons)
    billable = [item for item in scheduled_lessons if item.student_billable]
    exact_values = [Fraction(item.monthly_price_uzs, denominator) for item in billable]
    undiscounted_total = round_fraction_half_up(sum(exact_values, Fraction(0)))

    floors = [value.numerator // value.denominator for value in exact_values]
    remaining = undiscounted_total - sum(floors)
    remainder_order = sorted(
        range(len(exact_values)),
        key=lambda index: (
            -(exact_values[index] - floors[index]),
            billable[index].key,
        ),
    )
    for index in remainder_order[:remaining]:
        floors[index] += 1

    lines = tuple(
        ChargeLine(
            key=item.key,
            amount_uzs=amount,
            monthly_price_uzs=item.monthly_price_uzs,
            denominator=denominator,
        )
        for item, amount in zip(billable, floors)
    )
    discount = round_fraction_half_up(Fraction(undiscounted_total * discount_basis_points, 10_000))
    return StudentCharge(
        scheduled_lesson_count=denominator,
        billable_lesson_count=len(billable),
        undiscounted_amount_uzs=undiscounted_total,
        discount_amount_uzs=discount,
        amount_due_uzs=undiscounted_total - discount,
        lines=lines,
    )


def calculate_teacher_earning(undiscounted_tuition_uzs: int, share_basis_points: int) -> int:
    """Teacher share is independent of discounts and student collection."""
    if undiscounted_tuition_uzs < 0:
        raise ValueError("Tuition cannot be negative")
    if not 0 <= share_basis_points <= 10_000:
        raise ValueError("Teacher share must be between 0 and 10000 basis points")
    return round_fraction_half_up(Fraction(undiscounted_tuition_uzs * share_basis_points, 10_000))


def enrollment_format_transition(current_format: GroupFormat, active_student_count_after: int) -> GroupFormat:
    """Apply capacity and the one-way mini-to-normal conversion rule."""
    if active_student_count_after < 0:
        raise ValueError("Student count cannot be negative")
    if current_format == GroupFormat.INDIVIDUAL and active_student_count_after > 1:
        raise ValueError("An individual class can have only one active student")
    if current_format == GroupFormat.MINI and active_student_count_after >= 5:
        return GroupFormat.NORMAL
    return current_format


def validate_manual_format_change(current_format: GroupFormat, new_format: GroupFormat) -> None:
    """Normal groups are never allowed to become mini groups."""
    if current_format == GroupFormat.NORMAL and new_format == GroupFormat.MINI:
        raise ValueError("A normal group cannot be converted into a mini group")


def capped_discount_basis_points(*discounts: int) -> int:
    if any(value < 0 for value in discounts):
        raise ValueError("Discounts cannot be negative")
    return min(sum(discounts), 10_000)


def payment_status(amount_due_uzs: int, amount_paid_uzs: int) -> str:
    if amount_due_uzs < 0 or amount_paid_uzs < 0:
        raise ValueError("Invoice amounts cannot be negative")
    if amount_paid_uzs == 0:
        return "unpaid" if amount_due_uzs else "paid"
    if amount_paid_uzs < amount_due_uzs:
        return "partial"
    return "paid"


def allocate_oldest_debts(amount_uzs: int, debts: Sequence[dict]) -> tuple:
    """Return deterministic oldest-first allocations and unallocated advance."""
    if amount_uzs < 0:
        raise ValueError("Payment cannot be negative")
    remaining = amount_uzs
    allocations = []
    ordered = sorted(debts, key=lambda row: (row["due_date"], row.get("invoice_number", ""), row["id"]))
    for debt in ordered:
        balance = int(debt["balance_uzs"])
        if balance <= 0 or remaining == 0:
            continue
        allocated = min(balance, remaining)
        allocations.append({"invoice_id": debt["id"], "amount_uzs": allocated})
        remaining -= allocated
    return tuple(allocations), remaining
