import unittest

from auth import get_password_hash, verify_password
from phone_auth import (
    issue_access_code,
    migrate_phone_auth_users,
    phone_required_user_document,
    validate_password,
)


class _Collection:
    def __init__(self):
        self.calls = []

    async def update_one(self, query, update):
        self.calls.append((query, update))
        return type("Result", (), {"modified_count": 1})()

    async def update_many(self, query, update):
        self.calls.append((query, update))

    async def delete_many(self, query):
        self.calls.append((query, {"delete_many": True}))


class _AsyncDocuments:
    def __init__(self, documents):
        self.documents = documents

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration as error:
            raise StopAsyncIteration from error


class _MigrationUsers(_Collection):
    def __init__(self, documents):
        super().__init__()
        self.documents = documents

    def find(self, _query):
        return _AsyncDocuments(self.documents)

    async def find_one(self, query):
        phone = query.get("phone_normalized")
        excluded = query.get("_id", {}).get("$ne")
        return next((doc for doc in self.documents if doc.get("phone_normalized") == phone and doc.get("_id") != excluded), None)

    async def update_one(self, query, update):
        await super().update_one(query, update)
        target = next(doc for doc in self.documents if doc["_id"] == query["_id"])
        target.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            target.pop(key, None)
        return type("Result", (), {"modified_count": 1})()


class _Db:
    def __init__(self):
        self.users = _Collection()
        self.auth_challenges = _Collection()
        self.telegram_links = _Collection()


class ManagedCredentialTests(unittest.IsolatedAsyncioTestCase):
    async def test_credential_issue_returns_once_and_stores_only_hash(self):
        db = _Db()
        user = {
            "_id": "user-1",
            "login": "+998901234567",
            "phone": "+998901234567",
            "phone_normalized": "+998901234567",
            "account_status": "credentials_required",
        }
        result = await issue_access_code(
            db,
            user,
            purpose="invite",
            actor_id="admin-1",
            request_ip="127.0.0.1",
        )
        self.assertEqual(result.delivery_status, "credentials_ready")
        self.assertEqual(result.login, "+998901234567")
        validate_password(result.temporary_password)
        update = db.users.calls[0][1]
        self.assertNotIn(result.temporary_password, repr(update))
        self.assertTrue(verify_password(result.temporary_password, update["$set"]["password_hash"]))
        self.assertTrue(update["$set"]["must_change_password"])
        self.assertEqual(update["$set"]["identity_verified_via"], "managed_credentials")
        self.assertIn("telegram_chat_id", update["$unset"])

    async def test_each_reset_generates_a_different_password(self):
        db = _Db()
        user = {"_id": "user-1", "login": "na-000001", "account_status": "active"}
        first = await issue_access_code(db, user, purpose="password_reset", actor_id="admin-1", request_ip=None)
        second = await issue_access_code(db, user, purpose="password_reset", actor_id="admin-1", request_ip=None)
        self.assertNotEqual(first.temporary_password, second.temporary_password)

    async def test_student_id_account_does_not_require_a_phone(self):
        db = _Db()
        user = phone_required_user_document(
            login="na-000123",
            full_name="Student Example",
            role="student",
            email=None,
            branch_id="branch-1",
            language_preference="ru",
            created_by="admin-1",
        )
        user["_id"] = "user-2"
        self.assertEqual(user["account_status"], "credentials_required")
        issued = await issue_access_code(
            db,
            user,
            purpose="invite",
            actor_id="admin-1",
            request_ip=None,
        )
        self.assertEqual(issued.login, "na-000123")
        self.assertTrue(verify_password(
            issued.temporary_password,
            db.users.calls[0][1]["$set"]["password_hash"],
        ))

    async def test_migration_preserves_linked_users_existing_password(self):
        password_hash = get_password_hash("ExistingPass1!")
        linked = {
            "_id": "user-3",
            "phone": "+998901234567",
            "phone_normalized": "+998901234567",
            "password_hash": password_hash,
            "account_status": "active",
            "is_active": True,
            "telegram_chat_id": 123,
            "telegram_link_status": "linked",
            "token_version": 4,
        }
        db = _Db()
        db.users = _MigrationUsers([linked])
        await migrate_phone_auth_users(db)
        self.assertEqual(linked["password_hash"], password_hash)
        self.assertEqual(linked["account_status"], "active")
        self.assertTrue(linked["is_active"])
        self.assertFalse(linked["must_change_password"])
        self.assertNotIn("telegram_chat_id", linked)
        self.assertTrue(verify_password("ExistingPass1!", linked["password_hash"]))


if __name__ == "__main__":
    unittest.main()
