import unittest

from bson import ObjectId

from routes_notifications import create_user_notification


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


if __name__ == "__main__":
    unittest.main()
