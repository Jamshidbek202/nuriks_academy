import unittest
import os
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-group-membership")

from routes_groups import remove_student_from_group


class UpdateResult:
    def __init__(self, matched_count):
        self.matched_count = matched_count


class FakeCollection:
    def __init__(self, documents):
        self.documents = {document["_id"]: deepcopy(document) for document in documents}

    async def find_one(self, query):
        document = self.documents.get(query.get("_id"))
        return deepcopy(document) if document else None

    async def update_one(self, query, update):
        document = self.documents.get(query.get("_id"))
        if not document:
            return UpdateResult(0)

        for field, value in update.get("$pull", {}).items():
            document[field] = [item for item in document.get(field, []) if item != value]
        for field, value in update.get("$addToSet", {}).items():
            if value not in document.setdefault(field, []):
                document[field].append(value)
        return UpdateResult(1)


class GroupMembershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_super_admin_removal_updates_both_group_and_student(self):
        group_id = ObjectId()
        student_id = ObjectId()
        group_id_string = str(group_id)
        student_id_string = str(student_id)
        fake_db = SimpleNamespace(
            groups=FakeCollection([{
                "_id": group_id,
                "name": "Group A",
                "student_ids": [student_id_string],
            }]),
            students=FakeCollection([{
                "_id": student_id,
                "first_name": "Student",
                "last_name": "One",
                "group_ids": [group_id_string],
            }]),
        )

        def serialize(document):
            result = deepcopy(document)
            result["id"] = str(result.pop("_id"))
            return result

        with patch("server.db", fake_db), \
             patch("server.serialize_doc", side_effect=serialize), \
             patch("server.create_audit_log", new=AsyncMock()):
            result = await remove_student_from_group(
                group_id_string,
                student_id_string,
                SimpleNamespace(client=None),
                {"_id": ObjectId(), "role": "super_admin"},
            )

        stored_group = fake_db.groups.documents[group_id]
        stored_student = fake_db.students.documents[student_id]
        self.assertNotIn(student_id_string, stored_group["student_ids"])
        self.assertNotIn(group_id_string, stored_student["group_ids"])
        self.assertEqual(result["group"]["student_ids"], [])
        self.assertEqual(result["student"]["group_ids"], [])


if __name__ == "__main__":
    unittest.main()
