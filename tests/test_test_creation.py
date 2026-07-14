import os
import unittest
from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-test-creation")

from routes_tests import TestCreate, create_test


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return deepcopy(self.documents)


class FindOneCollection:
    def __init__(self, document):
        self.document = document

    async def find_one(self, _query):
        return deepcopy(self.document)


class EmptyFindCollection(FindOneCollection):
    def __init__(self):
        super().__init__(None)

    def find(self, _query):
        return Cursor([])


class InsertResult:
    def __init__(self):
        self.inserted_id = ObjectId()


class NotificationCollection:
    def __init__(self):
        self.documents = []

    async def find_one(self, query):
        for document in self.documents:
            if (
                document.get("user_id") == query.get("user_id")
                and document.get("type") == query.get("type")
                and document.get("data", {}).get("test_id") == query.get("data.test_id")
                and document.get("data", {}).get("student_id") == query.get("data.student_id")
            ):
                return deepcopy(document)
        return None

    async def insert_one(self, document):
        saved = deepcopy(document)
        saved["_id"] = ObjectId()
        self.documents.append(saved)
        return InsertResult()


class StudentCollection(FindOneCollection):
    def find(self, _query):
        return Cursor([self.document])


class UpsertResult:
    def __init__(self, upserted_id=None):
        self.upserted_id = upserted_id


class TestCollection:
    def __init__(self):
        self.document = None

    async def update_one(self, query, update, upsert=False):
        if "$setOnInsert" in update and upsert:
            test_id = ObjectId()
            self.document = {"_id": test_id, **deepcopy(update["$setOnInsert"])}
            return UpsertResult(test_id)
        if self.document and query.get("_id") == self.document["_id"]:
            self.document.update(deepcopy(update.get("$set", {})))
        return UpsertResult()

    async def find_one(self, query):
        if not self.document:
            return None
        if query.get("_id") == self.document["_id"]:
            return deepcopy(self.document)
        if query.get("creation_key") == self.document.get("creation_key"):
            return deepcopy(self.document)
        return None


class TestCreationTests(unittest.IsolatedAsyncioTestCase):
    async def test_idempotent_create_returns_persisted_test_and_delivers_notification(self):
        teacher_user_id = ObjectId()
        teacher_id = ObjectId()
        group_id = ObjectId()
        student_id = ObjectId()
        fake_db = SimpleNamespace(
            teachers=FindOneCollection({
                "_id": teacher_id,
                "user_id": str(teacher_user_id),
                "group_ids": [str(group_id)],
            }),
            groups=FindOneCollection({
                "_id": group_id,
                "teacher_id": str(teacher_id),
                "student_ids": [],
            }),
            students=StudentCollection({
                "_id": student_id,
                "user_id": str(ObjectId()),
                "group_ids": [str(group_id)],
                "status": "active",
            }),
            tests=TestCollection(),
            notification_preferences=FindOneCollection(None),
            notifications=NotificationCollection(),
            parents=FindOneCollection(None),
            push_tokens=EmptyFindCollection(),
        )

        def serialize(document):
            result = deepcopy(document)
            result["id"] = str(result.pop("_id"))
            for key, value in list(result.items()):
                if isinstance(value, datetime):
                    result[key] = value.isoformat()
            return result

        with patch("server.db", fake_db), \
             patch("server.serialize_doc", side_effect=serialize), \
             patch("server.create_audit_log", new=AsyncMock()):
            result = await create_test(
                TestCreate(
                    test_type="mid_test",
                    group_id=str(group_id),
                    course_id=str(ObjectId()),
                    title="Unit 5 Test",
                    test_date=datetime.utcnow() + timedelta(days=1),
                    max_score=100,
                ),
                SimpleNamespace(
                    headers={"Idempotency-Key": "create-key-1"},
                    client=None,
                ),
                {"_id": teacher_user_id, "role": "teacher"},
            )

        self.assertEqual(result["id"], str(fake_db.tests.document["_id"]))
        self.assertEqual(result["notification_delivery"]["student_notifications"], 1)
        self.assertEqual(len(fake_db.notifications.documents), 1)
        notification = fake_db.notifications.documents[0]
        self.assertEqual(notification["user_id"], fake_db.students.document["user_id"])
        self.assertEqual(notification["type"], "test_scheduled")
        self.assertEqual(notification["data"]["test_id"], result["id"])


if __name__ == "__main__":
    unittest.main()
