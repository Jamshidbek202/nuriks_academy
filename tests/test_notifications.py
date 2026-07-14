import unittest

from bson import ObjectId

from routes_notifications import create_user_notification, remove_stale_news_notifications


class FakeInsertResult:
    def __init__(self):
        self.inserted_id = ObjectId()


class FakeCollection:
    def __init__(self, document=None):
        self.document = document
        self.inserted = []

    async def find_one(self, query):
        return self.document

    async def insert_one(self, document):
        self.inserted.append(document)
        return FakeInsertResult()


class FakeDatabase:
    def __init__(self, preferences=None):
        self.notification_preferences = FakeCollection(preferences)
        self.notifications = FakeCollection()


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return self.documents


class FakeNewsCollection:
    def __init__(self, documents):
        self.documents = documents

    def find(self, _query):
        return FakeCursor(self.documents)


class FakeNotificationCleanupCollection:
    def __init__(self):
        self.deleted_ids = []

    async def delete_many(self, query):
        self.deleted_ids.extend(query["_id"]["$in"])


class FakeCleanupDatabase:
    def __init__(self, published_news):
        self.news = FakeNewsCollection(published_news)
        self.notifications = FakeNotificationCleanupCollection()


class NotificationDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_enabled_notification_is_saved_without_push_token(self):
        db = FakeDatabase()
        result = await create_user_notification(
            db, "user-1", "New message", "Hello", "chat_message",
            {"conversation_id": "conversation-1"}, send_push=False,
        )

        self.assertIsNotNone(result)
        self.assertEqual(len(db.notifications.inserted), 1)
        self.assertEqual(db.notifications.inserted[0]["category"], "chat")
        self.assertFalse(db.notifications.inserted[0]["is_read"])

    async def test_disabled_preference_prevents_inbox_and_push_delivery(self):
        db = FakeDatabase({"user_id": "user-1", "homework_notifications": False})
        result = await create_user_notification(
            db, "user-1", "Homework", "New assignment", "homework_assigned",
            {}, send_push=False,
        )

        self.assertIsNone(result)
        self.assertEqual(db.notifications.inserted, [])

    async def test_disabled_news_preference_prevents_web_inbox_delivery(self):
        db = FakeDatabase({"user_id": "user-1", "news_announcements": False})
        result = await create_user_notification(
            db, "user-1", "Academy news", "New announcement",
            "news_announcement", {}, send_push=False,
        )

        self.assertIsNone(result)
        self.assertEqual(db.notifications.inserted, [])

    async def test_retracted_news_is_removed_from_inbox_including_legacy_items(self):
        live_news_id = ObjectId()
        deleted_news_id = ObjectId()
        db = FakeCleanupDatabase([{
            "_id": live_news_id,
            "title": "Current announcement",
            "is_published": True,
        }])
        live_notification_id = ObjectId()
        stale_notification_id = ObjectId()
        legacy_live_id = ObjectId()
        legacy_stale_id = ObjectId()
        notifications = [
            {
                "_id": live_notification_id,
                "type": "news_announcement",
                "message": "Current announcement",
                "data": {"news_id": str(live_news_id)},
            },
            {
                "_id": stale_notification_id,
                "type": "news_announcement",
                "message": "Deleted announcement",
                "data": {"news_id": str(deleted_news_id)},
            },
            {
                "_id": legacy_live_id,
                "type": "news_announcement",
                "message": "Current announcement",
                "data": {},
            },
            {
                "_id": legacy_stale_id,
                "type": "news_announcement",
                "message": "Old deleted announcement",
                "data": {},
            },
        ]

        remaining = await remove_stale_news_notifications(db, "user-1", notifications)

        self.assertEqual(
            {item["_id"] for item in remaining},
            {live_notification_id, legacy_live_id},
        )
        self.assertEqual(
            set(db.notifications.deleted_ids),
            {stale_notification_id, legacy_stale_id},
        )


if __name__ == "__main__":
    unittest.main()
