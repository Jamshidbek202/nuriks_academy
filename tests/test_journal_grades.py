import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-journal-grades")

from routes_journal import notify_performance_changes


class FindOneCollection:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query):
        for document in self.documents:
            if query.get("_id") == document.get("_id"):
                return document
            if query.get("student_ids") in document.get("student_ids", []):
                return document
        return None


class JournalGradeNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_lesson_grade_notifies_student_and_parent(self):
        student_id = ObjectId()
        parent_id = ObjectId()
        db = SimpleNamespace(
            students=FindOneCollection([{
                "_id": student_id,
                "user_id": "student-user",
                "parent_id": str(parent_id),
            }]),
            parents=FindOneCollection([{
                "_id": parent_id,
                "user_id": "parent-user",
                "student_ids": [str(student_id)],
            }]),
        )
        notifier = AsyncMock()
        entry_id = ObjectId()
        with patch("notification_helpers.notify_grade_posted", new=notifier):
            await notify_performance_changes(db, {
                "_id": entry_id,
                "group_id": str(ObjectId()),
                "topic": "Speaking",
                "lesson_number": 2,
                "student_performance": [{"student_id": str(student_id), "participation": 4}],
            })

        notifier.assert_awaited_once()
        args = notifier.await_args.args
        self.assertEqual(args[1], "student-user")
        self.assertEqual(args[2], "Speaking")
        self.assertEqual(args[3], "4/5")
        self.assertEqual(args[4], "parent-user")

    async def test_unchanged_grade_does_not_duplicate_notification(self):
        student_id = str(ObjectId())
        notifier = AsyncMock()
        with patch("notification_helpers.notify_grade_posted", new=notifier):
            await notify_performance_changes(
                SimpleNamespace(),
                {"student_performance": [{"student_id": student_id, "participation": 3}]},
                [{"student_id": student_id, "participation": 3}],
            )
        notifier.assert_not_awaited()

    async def test_notification_failure_does_not_turn_saved_journal_into_error(self):
        student_id = ObjectId()
        db = SimpleNamespace(
            students=FindOneCollection([{
                "_id": student_id,
                "user_id": "student-user",
            }]),
            parents=FindOneCollection([]),
        )
        notifier = AsyncMock(side_effect=RuntimeError("provider unavailable"))
        with patch("notification_helpers.notify_grade_posted", new=notifier):
            await notify_performance_changes(db, {
                "_id": ObjectId(),
                "group_id": str(ObjectId()),
                "topic": "Speaking",
                "student_performance": [{
                    "student_id": str(student_id),
                    "participation": 5,
                }],
            })

        notifier.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
