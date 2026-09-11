import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from phone_auth import OtpDeliveryError
from routes_auth import _request_code
from telegram_auth import process_telegram_start
from telegram_service import telegram_provider_health


class _Users:
    def __init__(self, user=None):
        self.user = user

    async def find_one(self, query):
        if not self.user:
            return None
        for key, value in query.items():
            if self.user.get(key) != value:
                return None
        return self.user


class _Db:
    def __init__(self, user=None):
        self.users = _Users(user)


class _UnauthorizedClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url):
        return httpx.Response(401, request=httpx.Request("GET", url))


class TelegramBotTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_reports_a_linked_private_account(self):
        user = {
            "_id": "user-1",
            "telegram_user_id": 101,
            "telegram_chat_id": 101,
            "telegram_link_status": "linked",
            "account_status": "active",
        }
        update = {
            "message": {
                "text": "/status",
                "chat": {"id": 101, "type": "private"},
                "from": {"id": 101, "language_code": "en"},
            },
        }
        sender = AsyncMock()
        with patch("telegram_auth.send_telegram_message", sender):
            result = await process_telegram_start(_Db(user), update)
        self.assertIsNone(result)
        self.assertIn("Connected", sender.await_args.args[1])

    async def test_code_command_issues_password_reset_for_active_account(self):
        user = {
            "_id": "user-1",
            "telegram_user_id": 101,
            "telegram_chat_id": 101,
            "telegram_link_status": "linked",
            "account_status": "active",
        }
        update = {
            "message": {
                "text": "/code",
                "chat": {"id": 101, "type": "private"},
                "from": {"id": 101, "language_code": "ru"},
            },
        }
        issue = AsyncMock()
        with patch("phone_auth.issue_otp", issue):
            await process_telegram_start(_Db(user), update)
        self.assertEqual(issue.await_args.kwargs["purpose"], "password_reset")
        self.assertEqual(issue.await_args.kwargs["request_ip"], "telegram_command")

    async def test_provider_health_classifies_rejected_token_without_exposing_it(self):
        environment = {
            "APP_ENV": "production",
            "TELEGRAM_DELIVERY_MODE": "live",
            "TELEGRAM_BOT_TOKEN": "invalid-token-value",
            "TELEGRAM_BOT_USERNAME": "nuriksacademy_bot",
            "TELEGRAM_WEBHOOK_URL": "https://example.test/api/telegram/webhook",
        }
        with patch.dict(os.environ, environment, clear=False), patch(
            "telegram_service.httpx.AsyncClient", return_value=_UnauthorizedClient()
        ):
            result = await telegram_provider_health()
        self.assertFalse(result["healthy"])
        self.assertEqual(result["issue_code"], "BOT_TOKEN_REJECTED")
        self.assertNotIn(environment["TELEGRAM_BOT_TOKEN"], result["message"])

    async def test_password_reset_does_not_claim_success_when_delivery_failed(self):
        request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
        user = {"_id": "user-1", "is_active": True, "account_status": "active"}
        error = OtpDeliveryError(
            "delivery failed",
            "BOT_TOKEN_REJECTED",
        )
        with patch("routes_auth.get_user_by_phone", AsyncMock(return_value=user)), patch(
            "routes_auth.issue_otp", AsyncMock(side_effect=error)
        ):
            with self.assertRaises(HTTPException) as caught:
                await _request_code(
                    _Db(user),
                    phone="+998901234567",
                    purpose="password_reset",
                    request=request,
                )
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail["code"], "BOT_TOKEN_REJECTED")


if __name__ == "__main__":
    unittest.main()
