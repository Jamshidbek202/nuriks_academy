"""Shared validation helpers for user-supplied dates and numeric values."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import re

from fastapi import HTTPException


def as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def require_date_window(value: datetime, *, past_days: int = 0, future_days: int = 0, label: str = "Date") -> datetime:
    normalized = as_utc_naive(value)
    today = datetime.now(ZoneInfo("Asia/Tashkent")).date()
    earliest = today - timedelta(days=past_days)
    latest = today + timedelta(days=future_days)
    if normalized.date() < earliest or normalized.date() > latest:
        if past_days == 0:
            detail = f"{label} must be between today and {future_days} days from now"
        elif future_days == 0:
            detail = f"{label} must be within the past {past_days} days and cannot be in the future"
        else:
            detail = f"{label} must be between {past_days} days ago and {future_days} days from now"
        raise HTTPException(status_code=400, detail=detail)
    return normalized


def require_date_string_window(value: str, *, future_days: int, label: str = "Date") -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise HTTPException(status_code=400, detail=f"{label} must use YYYY-MM-DD format")
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} is not a valid calendar date")
    today = datetime.now(ZoneInfo("Asia/Tashkent")).date()
    if parsed < today or parsed > today + timedelta(days=future_days):
        raise HTTPException(status_code=400, detail=f"{label} must be between today and {future_days} days from now")
    return parsed


def require_time_string(value: str, *, label: str = "Time") -> None:
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        raise HTTPException(status_code=400, detail=f"{label} must use a valid 24-hour HH:MM time")


def require_month_window(value: str, *, past_months: int = 24, future_months: int = 12) -> None:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value):
        raise HTTPException(status_code=400, detail="Month must use YYYY-MM format")
    year, month = map(int, value.split("-"))
    selected_index = year * 12 + month
    today = datetime.now(ZoneInfo("Asia/Tashkent"))
    current_index = today.year * 12 + today.month
    if selected_index < current_index - past_months or selected_index > current_index + future_months:
        raise HTTPException(
            status_code=400,
            detail=f"Payment month must be within the past {past_months} months or next {future_months} months",
        )
