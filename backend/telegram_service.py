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
    pass


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
    """Idempotently point Telegram at this deployment when a public URL is available."""
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
    except (httpx.HTTPError, ValueError) as exc:
        raise TelegramDeliveryError("Telegram webhook configuration failed") from exc
    logger.info("Telegram webhook configured successfully")
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
        raise TelegramDeliveryError("Telegram health check failed") from exc
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
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise TelegramDeliveryError("Telegram message delivery failed") from exc
    return TelegramDelivery("sent", str(message_id) if message_id is not None else None)
