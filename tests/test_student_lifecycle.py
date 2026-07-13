import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from auth import get_current_user
from student_lifecycle import (
    StudentLifecycleConflict,
    archive_student_account,
    permanently_delete_student_account,
    reconcile_archived_student_accounts,
    restore_student_account,
)


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return self.documents


def collection(find_one=None, find_documents=None, modified_count=0, count=0):
    value = SimpleNamespace()
    value.find_one = AsyncMock(return_value=find_one)
    value.find = MagicMock(return_value=FakeCursor(find_documents or []))
    value.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1, modified_count=1))
    value.update_many = AsyncMock(return_value=SimpleNamespace(modified_count=modified_count))
    value.count_documents = AsyncMock(return_value=count)
    value.delete_one = AsyncMock(return_value=SimpleNamespace(deleted_count=1))
    value.delete_many = AsyncMock(return_value=SimpleNamespace(deleted_count=0))
    return value


def lifecycle_database(student_user=None, payment_count=0):
    return SimpleNamespace(
        users=collection(find_one=student_user),
        students=collection(),
        groups=collection(),
        parents=collection(),
        payments=collection(count=payment_count),
        attendance=collection(),
        attendance_records=collection(),
        test_results=collection(),
        tests=collection(),
        homework=collection(),
        teacher_journal=collection(),
        certificates=collection(),
        support_bookings=collection(),
        messages=collection(),
        conversations=collection(),
        notifications=collection(),
        notification_history=collection(),
        notification_preferences=collection(),
        push_tokens=collection(),
    )


class StudentLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_archive_deactivates_login_without_touching_history(self):
        student_id = ObjectId()
        user_id = ObjectId()
        group_id = ObjectId()
        student = {
            "_id": student_id,
            "user_id": str(user_id),
            "status": "active",
            "group_ids": [str(group_id)],
        }
        user = {"_id": user_id, "role": "student", "is_active": True}
        db = SimpleNamespace(
            users=collection(find_one=user),
            students=collection(),
            groups=collection(find_documents=[{"_id": group_id}]),
        )

        result = await archive_student_account(db, student, "admin-id")

        self.assertEqual(result["status"], "archived")
        user_update = db.users.update_one.await_args.args[1]["$set"]
        self.assertFalse(user_update["is_active"])
        student_update = db.students.update_one.await_args.args[1]["$set"]
        self.assertEqual(student_update["status"], "archived")
        self.assertEqual(student_update["pre_archive_status"], "active")
        self.assertEqual(student_update["archived_group_ids"], [str(group_id)])
        self.assertFalse(hasattr(db, "attendance"))
        self.assertFalse(hasattr(db, "tests"))
        self.assertFalse(hasattr(db, "homework"))

    async def test_restore_reactivates_login_and_valid_group_memberships(self):
        student_id = ObjectId()
        user_id = ObjectId()
        group_id = ObjectId()
        student = {
            "_id": student_id,
            "user_id": str(user_id),
            "status": "archived",
            "pre_archive_status": "frozen",
            "account_was_active_before_archive": True,
            "archived_group_ids": [str(group_id), "invalid-id"],
        }
        user = {"_id": user_id, "role": "student", "is_active": False}
        db = SimpleNamespace(
            users=collection(find_one=user),
            students=collection(),
            groups=collection(find_documents=[{"_id": group_id}]),
        )

        result = await restore_student_account(db, student, "admin-id")

        self.assertEqual(result["status"], "frozen")
        self.assertEqual(result["restored_group_count"], 1)
        student_update = db.students.update_one.await_args.args[1]["$set"]
        self.assertEqual(student_update["group_ids"], [str(group_id)])
        user_update = db.users.update_one.await_args.args[1]["$set"]
        self.assertTrue(user_update["is_active"])

    async def test_legacy_reconciliation_is_idempotent_and_role_scoped(self):
        user_id = ObjectId()
        students = [
            {"_id": ObjectId(), "user_id": str(user_id)},
            {"_id": ObjectId(), "user_id": "broken"},
        ]
        db = SimpleNamespace(
            students=collection(find_documents=students),
            users=collection(modified_count=1),
        )

        result = await reconcile_archived_student_accounts(db)

        self.assertEqual(result["archived_students"], 2)
        self.assertEqual(result["accounts_deactivated"], 1)
        user_query = db.users.update_many.await_args.args[0]
        self.assertEqual(user_query["role"], "student")
        self.assertEqual(user_query["is_active"], {"$ne": False})

    async def test_permanent_delete_is_blocked_when_history_exists(self):
        user_id = ObjectId()
        student = {
            "_id": ObjectId(),
            "user_id": str(user_id),
            "student_id": "NA-000001",
            "status": "archived",
        }
        user = {"_id": user_id, "role": "student", "is_active": False}
        db = lifecycle_database(student_user=user, payment_count=1)

        with self.assertRaises(StudentLifecycleConflict) as raised:
            await permanently_delete_student_account(db, student)

        self.assertIn("payments", str(raised.exception))
        db.students.delete_one.assert_not_awaited()
        db.users.delete_one.assert_not_awaited()

    async def test_unused_archived_student_can_be_permanently_deleted(self):
        user_id = ObjectId()
        student = {
            "_id": ObjectId(),
            "user_id": str(user_id),
            "student_id": "NA-000001",
            "status": "archived",
        }
        user = {"_id": user_id, "role": "student", "is_active": False}
        db = lifecycle_database(student_user=user)

        result = await permanently_delete_student_account(db, student)

        self.assertTrue(result["deleted"])
        self.assertTrue(result["linked_account_deleted"])
        db.students.delete_one.assert_awaited_once()
        db.users.delete_one.assert_awaited_once()

    async def test_inactive_account_cannot_reuse_existing_token(self):
        user_id = ObjectId()
        db = SimpleNamespace(users=collection(find_one={
            "_id": user_id,
            "role": "student",
            "is_active": False,
        }))
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")

        with patch("auth.verify_token", return_value={"sub": str(user_id)}):
            with self.assertRaises(HTTPException) as raised:
                await get_current_user(credentials, db)

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
