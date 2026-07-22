import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-attendance-side-effects")

from routes_attendance import complete_attendance_side_effects


class ParentCollection:
    async def find_one(self, _query):
        return None


class AttendanceSideEffectTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_and_audit_failures_do_not_change_save_outcome(self):
        student_id = ObjectId()
        db = SimpleNamespace(parents=ParentCollection())
        audit = AsyncMock(side_effect=RuntimeError("audit unavailable"))
        notifier = AsyncMock(side_effect=RuntimeError("provider unavailable"))

        with patch("server.create_audit_log", new=audit), patch(
            "notification_helpers.notify_attendance_marked", new=notifier
        ):
            await complete_attendance_side_effects(
                db,
                {"_id": student_id, "user_id": "student-user"},
                str(ObjectId()),
                "present",
                "2026-07-21",
                None,
                "teacher-user",
                None,
            )

        audit.assert_awaited_once()
        notifier.assert_awaited_once()

    async def test_unchanged_status_does_not_repeat_notification(self):
        db = SimpleNamespace(parents=ParentCollection())
        audit = AsyncMock()
        notifier = AsyncMock()

        with patch("server.create_audit_log", new=audit), patch(
            "notification_helpers.notify_attendance_marked", new=notifier
        ):
            await complete_attendance_side_effects(
                db,
                {"_id": ObjectId(), "user_id": "student-user"},
                str(ObjectId()),
                "late",
                "2026-07-21",
                "late",
                "teacher-user",
                None,
            )

        audit.assert_awaited_once()
        notifier.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
