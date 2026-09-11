"""Telegram Bot API transport for account invitations and recovery codes."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

import httpx


logger = logging.getLogger(__name__)
BOT_API_BASE = "https://api.telegram.org"
DEFAULT_BOT_USERNAME = "nuriksacademy_bot"


class TelegramConfigurationError(RuntimeError):
    pass


class TelegramDeliveryError(RuntimeError):
    def __init__(self, message: str, code: str = "TELEGRAM_PROVIDER_ERROR"):
        super().__init__(message)
        self.code = code


def _delivery_error(exc: Exception, operation: str) -> TelegramDeliveryError:
    """Translate provider exceptions without ever echoing a bot-token URL."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 401:
            return TelegramDeliveryError(
                "Telegram rejected the bot token. Generate a new token in BotFather and update Render.",
                "BOT_TOKEN_REJECTED",
            )
        if status == 403:
            return TelegramDeliveryError(
                "Telegram refused access. The user may have blocked the bot.",
                "BOT_ACCESS_FORBIDDEN",
            )
        if status == 429:
            return TelegramDeliveryError(
                "Telegram is temporarily rate limiting the bot. Try again shortly.",
                "BOT_RATE_LIMITED",
            )
        return TelegramDeliveryError(
            f"Telegram returned an error while {operation}.",
            "TELEGRAM_HTTP_ERROR",
        )
    if isinstance(exc, httpx.RequestError):
        return TelegramDeliveryError(
            "Telegram could not be reached. Check the network and try again.",
            "TELEGRAM_NETWORK_ERROR",
        )
    return TelegramDeliveryError(
        f"Telegram returned an invalid response while {operation}.",
        "TELEGRAM_INVALID_RESPONSE",
    )


@dataclass(frozen=True)
class TelegramDelivery:
    status: str
    provider_message_id: Optional[str] = None


def delivery_mode() -> str:
    configured = os.environ.get("TELEGRAM_DELIVERY_MODE", "").strip().lower()
    if configured:
        return configured
    return "live" if os.environ.get("TELEGRAM_BOT_TOKEN", "").strip() else "disabled"


def bot_username() -> str:
    return os.environ.get("TELEGRAM_BOT_USERNAME", DEFAULT_BOT_USERNAME).strip().lstrip("@")


def webhook_secret() -> str:
    configured = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if configured:
        return configured
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if token:
        return hashlib.sha256(f"nuriks-telegram-webhook:{token}".encode()).hexdigest()
    if delivery_mode() == "mock":
        return "nuriks-telegram-mock-webhook-secret"
    raise TelegramConfigurationError("TELEGRAM_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN is required")


def validate_telegram_configuration() -> None:
    mode = delivery_mode()
    if mode not in {"disabled", "mock", "live"}:
        raise TelegramConfigurationError(
            "TELEGRAM_DELIVERY_MODE must be disabled, mock, or live"
        )
    environment = os.environ.get("APP_ENV", "").strip().lower()
    if mode == "mock" and environment in {"production", "prod"}:
        raise TelegramConfigurationError(
            "TELEGRAM_DELIVERY_MODE=mock is forbidden in production"
        )
    username = bot_username()
    if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", username) or not username.lower().endswith("bot"):
        raise TelegramConfigurationError("TELEGRAM_BOT_USERNAME must be a valid bot username")
    if mode == "live" and not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        raise TelegramConfigurationError("TELEGRAM_BOT_TOKEN is required for live delivery")
    if mode != "disabled":
        secret = webhook_secret()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", secret):
            raise TelegramConfigurationError(
                "TELEGRAM_WEBHOOK_SECRET may only contain letters, numbers, underscores, and hyphens"
            )


def telegram_start_url(start_parameter: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", start_parameter):
        raise ValueError("Invalid Telegram start parameter")
    return f"https://t.me/{bot_username()}?start={start_parameter}"


def _webhook_url() -> Optional[str]:
    explicit = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "").strip()
    if hostname:
        return f"https://{hostname}/api/telegram/webhook"
    return None


async def configure_telegram_webhook() -> bool:
    """Idempotently configure the webhook and the bot's command menu."""
    validate_telegram_configuration()
    if delivery_mode() != "live":
        return False
    url = _webhook_url()
    if not url:
        logger.warning(
            "Telegram live delivery is enabled but no webhook URL is available; "
            "set TELEGRAM_WEBHOOK_URL outside Render"
        )
        return False
    token = os.environ["TELEGRAM_BOT_TOKEN"].strip()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            response = await client.post(
                f"{BOT_API_BASE}/bot{token}/setWebhook",
                data={
                    "url": url,
                    "secret_token": webhook_secret(),
                    "allowed_updates": json.dumps(["message"]),
                    "drop_pending_updates": "false",
                },
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("ok") is not True:
                raise TelegramDeliveryError("Telegram rejected webhook configuration")
            commands_response = await client.post(
                f"{BOT_API_BASE}/bot{token}/setMyCommands",
                json={"commands": [
                    {"command": "code", "description": "Send my access or password-reset code"},
                    {"command": "status", "description": "Check whether my account is connected"},
                    {"command": "help", "description": "How Nurik's Academy codes work"},
                ]},
            )
            commands_response.raise_for_status()
            commands_payload = commands_response.json()
            if not isinstance(commands_payload, dict) or commands_payload.get("ok") is not True:
                raise TelegramDeliveryError(
                    "Telegram rejected the bot command menu",
                    "BOT_COMMANDS_REJECTED",
                )
    except TelegramDeliveryError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise _delivery_error(exc, "configuring the bot") from exc
    logger.info("Telegram webhook and commands configured successfully")
    return True


async def telegram_provider_health() -> dict:
    """Return safe delivery diagnostics without exposing bot credentials."""
    validate_telegram_configuration()
    mode = delivery_mode()
    base = {
        "mode": mode,
        "bot_username": bot_username(),
        "token_configured": bool(os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()),
        "expected_webhook_url": _webhook_url(),
    }
    if mode != "live":
        return {
            **base,
            "healthy": mode == "mock",
            "message": "Telegram delivery is not running in live mode",
        }
    token = os.environ["TELEGRAM_BOT_TOKEN"].strip()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            identity_response = await client.get(f"{BOT_API_BASE}/bot{token}/getMe")
            webhook_response = await client.get(f"{BOT_API_BASE}/bot{token}/getWebhookInfo")
            identity_response.raise_for_status()
            webhook_response.raise_for_status()
            identity_payload = identity_response.json()
            webhook_payload = webhook_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        error = _delivery_error(exc, "checking bot health")
        return {
            **base,
            "healthy": False,
            "issue_code": error.code,
            "message": str(error),
        }
    identity = identity_payload.get("result", {}) if isinstance(identity_payload, dict) else {}
    webhook = webhook_payload.get("result", {}) if isinstance(webhook_payload, dict) else {}
    expected_url = _webhook_url()
    actual_url = webhook.get("url")
    username_matches = str(identity.get("username", "")).lower() == bot_username().lower()
    webhook_matches = bool(expected_url and actual_url == expected_url)
    last_error = webhook.get("last_error_message")
    return {
        **base,
        "healthy": bool(
            identity_payload.get("ok") is True
            and webhook_payload.get("ok") is True
            and username_matches
            and webhook_matches
            and not last_error
        ),
        "provider_bot_username": identity.get("username"),
        "username_matches": username_matches,
        "webhook_configured": bool(actual_url),
        "webhook_matches": webhook_matches,
        "pending_update_count": int(webhook.get("pending_update_count", 0) or 0),
        "last_error_at": webhook.get("last_error_date"),
        "last_error_message": last_error,
        "message": (
            "Telegram bot and webhook are ready"
            if username_matches and webhook_matches and not last_error
            else "Telegram needs attention; review the mismatch or provider error below"
        ),
    }


async def send_telegram_message(chat_id: int, message: str) -> TelegramDelivery:
    """Send one private bot message without logging its contents or credentials."""
    validate_telegram_configuration()
    mode = delivery_mode()
    if mode == "disabled":
        raise TelegramConfigurationError("Telegram delivery is disabled")
    if mode == "mock":
        logger.info("Mock Telegram message accepted")
        return TelegramDelivery("mock", "mock-telegram-message")
    token = os.environ["TELEGRAM_BOT_TOKEN"].strip()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            response = await client.post(
                f"{BOT_API_BASE}/bot{token}/sendMessage",
                json={
                    "chat_id": int(chat_id),
                    "text": message,
                    "disable_web_page_preview": True,
                },
            )
            response.raise_for_status()
            payload = response.json()
            result = payload.get("result") if isinstance(payload, dict) else None
            message_id = result.get("message_id") if isinstance(result, dict) else None
            if not isinstance(payload, dict) or payload.get("ok") is not True:
                raise TelegramDeliveryError("Telegram rejected the message")
    except TelegramDeliveryError:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise _delivery_error(exc, "sending a message") from exc
    return TelegramDelivery("sent", str(message_id) if message_id is not None else None)
