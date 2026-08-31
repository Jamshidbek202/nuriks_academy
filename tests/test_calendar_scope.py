from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException

from routes_calendar import _visible_groups


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, _limit):
        return self.rows


class FakeCollection:
    def __init__(self, rows=None, one=None):
        self.rows = rows or []
        self.one = one
        self.last_query = None

    async def find_one(self, query):
        self.last_query = query
        return self.one

    def find(self, query):
        self.last_query = query
        return FakeCursor(self.rows)


@pytest.mark.asyncio
async def test_manager_calendar_is_scoped_to_own_branch() -> None:
    groups = FakeCollection([])
    db = SimpleNamespace(groups=groups)
    await _visible_groups(db, {"_id": ObjectId(), "role": "manager", "branch_id": "branch-a"})
    assert groups.last_query["branch_id"] == "branch-a"


@pytest.mark.asyncio
async def test_student_calendar_only_queries_own_groups() -> None:
    group_id = ObjectId()
    student_id = ObjectId()
    groups = FakeCollection([])
    db = SimpleNamespace(
        groups=groups,
        students=FakeCollection(one={"_id": student_id, "group_ids": [str(group_id)]}),
    )
    await _visible_groups(db, {"_id": ObjectId(), "role": "student"})
    assert groups.last_query["$or"] == [
        {"_id": {"$in": [group_id]}},
        {"student_ids": str(student_id)},
    ]


@pytest.mark.asyncio
async def test_unsupported_role_cannot_read_calendar() -> None:
    with pytest.raises(HTTPException) as error:
        await _visible_groups(SimpleNamespace(), {"_id": ObjectId(), "role": "support"})
    assert error.value.status_code == 403
