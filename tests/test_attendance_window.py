"""Schedule and lock rules for the teacher attendance register."""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-attendance-window")

from routes_attendance import attendance_is_open, attendance_window_state  # noqa: E402


class AttendanceWindowTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 8, 10, 8, 0)
        self.end = datetime(2026, 8, 10, 9, 30)
        self.occurrence = {
            "starts_at": self.start,
            "ends_at": self.end,
            "resolution_status": "unresolved",
            "locked_at": None,
            "superseded": False,
        }

    def test_opens_exactly_at_start_and_stays_open_through_end(self):
        self.assertEqual(
            attendance_window_state(self.occurrence, self.start - timedelta(microseconds=1)),
            "upcoming",
        )
        self.assertFalse(attendance_is_open(self.occurrence, self.start - timedelta(microseconds=1)))
        self.assertEqual(attendance_window_state(self.occurrence, self.start), "in_progress")
        self.assertTrue(attendance_is_open(self.occurrence, self.start))
        self.assertEqual(attendance_window_state(self.occurrence, self.end), "in_progress")
        self.assertTrue(attendance_is_open(self.occurrence, self.end))

    def test_unresolved_lesson_keeps_recovery_access_after_end(self):
        after_end = self.end + timedelta(minutes=1)
        self.assertEqual(attendance_window_state(self.occurrence, after_end), "ended_unresolved")
        self.assertTrue(attendance_is_open(self.occurrence, after_end))

    def test_resolution_or_financial_lock_does_not_close_attendance(self):
        for change in (
            {"resolution_status": "resolved"},
            {"resolution_status": "pending_approval"},
            {"resolution_status": "replacement_required"},
            {"locked_at": self.end},
        ):
            occurrence = {**self.occurrence, **change}
            self.assertEqual(attendance_window_state(occurrence, self.end), "in_progress")
            self.assertTrue(attendance_is_open(occurrence, self.end))
            self.assertEqual(
                attendance_window_state(occurrence, self.end + timedelta(days=30)),
                "ended_unresolved",
            )
            self.assertTrue(attendance_is_open(occurrence, self.end + timedelta(days=30)))

    def test_superseded_occurrence_is_not_a_real_lesson_register(self):
        occurrence = {**self.occurrence, "superseded": True}
        self.assertEqual(attendance_window_state(occurrence, self.end), "closed")
        self.assertFalse(attendance_is_open(occurrence, self.end))

    def test_timezone_aware_instants_are_compared_as_utc(self):
        occurrence = {
            **self.occurrence,
            "starts_at": self.start.replace(tzinfo=timezone.utc),
            "ends_at": self.end.replace(tzinfo=timezone.utc),
        }
        now = (self.start + timedelta(minutes=5)).replace(tzinfo=timezone.utc)
        self.assertEqual(attendance_window_state(occurrence, now), "in_progress")


if __name__ == "__main__":
    unittest.main()
