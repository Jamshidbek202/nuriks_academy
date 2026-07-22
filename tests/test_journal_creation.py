import os
import unittest
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi import BackgroundTasks, HTTPException
from pymongo.errors import DuplicateKeyError

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-journal-creation")

from routes_journal import JournalEntryCreate, StudentPerformance, create_journal_entry


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return deepcopy(self.documents)


class StaticCollection:
    def __init__(self, document):
        self.document = document

    async def find_one(self, _query):
        return deepcopy(self.document)


class StudentCollection(StaticCollection):
    def find(self, _query):
        return Cursor([self.document])


class UpsertResult:
    def __init__(self, upserted_id=None):
        self.upserted_id = upserted_id


class JournalCollection:
    def __init__(self):
        self.document = None
        self.insert_count = 0

    async def update_one(self, query, update, upsert=False):
        if not upsert or "$setOnInsert" not in update:
            return UpsertResult()
        candidate = deepcopy(update["$setOnInsert"])
        if self.document:
            if query.get("creation_key") == self.document.get("creation_key"):
                return UpsertResult()
            if candidate.get("lesson_key") == self.document.get("lesson_key"):
                raise DuplicateKeyError("duplicate lesson key")
        journal_id = ObjectId()
        self.document = {"_id": journal_id, **candidate}
        self.insert_count += 1
        return UpsertResult(journal_id)

    async def find_one(self, query):
        if not self.document:
            return None
        if query.get("_id") == self.document.get("_id"):
            return deepcopy(self.document)
        if query.get("creation_key") == self.document.get("creation_key"):
            return deepcopy(self.document)
        if query.get("lesson_key") == self.document.get("lesson_key"):
            return deepcopy(self.document)
        return None


def serialize(document):
    result = deepcopy(document)
    result["id"] = str(result.pop("_id"))
    for key, value in list(result.items()):
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result


class JournalCreationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.teacher_user_id = ObjectId()
        self.teacher_id = ObjectId()
        self.group_id = ObjectId()
        self.student_id = ObjectId()
        self.journal = JournalCollection()
        self.fake_db = SimpleNamespace(
            teachers=StaticCollection({
                "_id": self.teacher_id,
                "user_id": str(self.teacher_user_id),
                "group_ids": [str(self.group_id)],
            }),
            groups=StaticCollection({
                "_id": self.group_id,
                "teacher_id": str(self.teacher_id),
                "student_ids": [str(self.student_id)],
                "branch_id": "main",
            }),
            students=StudentCollection({
                "_id": self.student_id,
                "first_name": "Ali",
                "last_name": "Valiyev",
                "group_ids": [str(self.group_id)],
                "status": "active",
            }),
            teacher_journal=self.journal,
        )
        self.payload = JournalEntryCreate(
            group_id=str(self.group_id),
            lesson_date=datetime.utcnow(),
            lesson_number=12,
            topic="Speaking",
            materials_covered="Unit 4",
            student_performance=[StudentPerformance(
                student_id=str(self.student_id), participation=4,
            )],
        )
        self.user = {"_id": self.teacher_user_id, "role": "teacher"}

    async def create(self, key):
        tasks = BackgroundTasks()
        with patch("server.db", self.fake_db), patch("server.serialize_doc", side_effect=serialize):
            result = await create_journal_entry(
                self.payload,
                SimpleNamespace(headers={"Idempotency-Key": key}, client=None),
                tasks,
                self.user,
            )
        return result, tasks

    async def test_same_submission_key_creates_one_entry_and_returns_it_twice(self):
        first, first_tasks = await self.create("journal-key-1")
        second, second_tasks = await self.create("journal-key-1")

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.journal.insert_count, 1)
        self.assertEqual(first["student_performance"][0]["student_name"], "Ali Valiyev")
        self.assertEqual(len(first_tasks.tasks), 1)
        self.assertEqual(len(second_tasks.tasks), 0)

    async def test_same_group_lesson_cannot_be_created_twice(self):
        await self.create("journal-key-1")
        with self.assertRaises(HTTPException) as raised:
            await self.create("journal-key-2")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(self.journal.insert_count, 1)


if __name__ == "__main__":
    unittest.main()
