"""Server-side Eskiz SMS delivery with an explicit non-production mock mode."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx


logger = logging.getLogger(__name__)


class SmsConfigurationError(RuntimeError):
    pass


class SmsDeliveryError(RuntimeError):
    pass


@dataclass(frozen=True)
class SmsDelivery:
    status: str
    provider_message_id: Optional[str] = None


_token: Optional[str] = None
_token_lock = asyncio.Lock()


def delivery_mode() -> str:
    return os.environ.get("SMS_DELIVERY_MODE", "disabled").strip().lower()


def validate_sms_configuration() -> None:
    mode = delivery_mode()
    if mode not in {"disabled", "mock", "live"}:
        raise SmsConfigurationError("SMS_DELIVERY_MODE must be disabled, mock, or live")
    if mode == "mock" and os.environ.get("APP_ENV", "").strip().lower() in {"production", "prod"}:
        raise SmsConfigurationError("SMS_DELIVERY_MODE=mock is forbidden in production")
    if mode != "live":
        return
    required = ("ESKIZ_BASE_URL", "ESKIZ_EMAIL", "ESKIZ_SECRET_KEY", "ESKIZ_SENDER")
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise SmsConfigurationError("Missing live Eskiz configuration: " + ", ".join(missing))


def _extract_token(payload: object) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        value = data.get("token")
        if isinstance(value, str):
            return value
    value = payload.get("token")
    return value if isinstance(value, str) else None


def _extract_message_id(payload: object) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    for container in (payload, payload.get("data")):
        if not isinstance(container, dict):
            continue
        for key in ("id", "message_id", "request_id"):
            value = container.get(key)
            if value is not None:
                return str(value)
    return None


async def _authenticate(client: httpx.AsyncClient) -> str:
    global _token
    async with _token_lock:
        if _token:
            return _token
        base_url = os.environ["ESKIZ_BASE_URL"].rstrip("/")
        try:
            response = await client.post(
                f"{base_url}/auth/login",
                data={
                    "email": os.environ["ESKIZ_EMAIL"],
                    # Eskiz labels the issued API secret as a secret key, while
                    # the HTTP authentication field is named "password".
                    "password": os.environ["ESKIZ_SECRET_KEY"],
                },
            )
            response.raise_for_status()
            token = _extract_token(response.json())
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise SmsDeliveryError("Eskiz authentication failed") from exc
        if not token:
            raise SmsDeliveryError("Eskiz authentication returned no token")
        _token = token
        return token


async def _send_live(phone: str, message: str) -> SmsDelivery:
    global _token
    base_url = os.environ["ESKIZ_BASE_URL"].rstrip("/")
    timeout = httpx.Timeout(15.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await _authenticate(client)
        payload = {
            "mobile_phone": phone.removeprefix("+"),
            "message": message,
            "from": os.environ["ESKIZ_SENDER"],
        }
        callback_url = os.environ.get("ESKIZ_CALLBACK_URL", "").strip()
        if callback_url:
            payload["callback_url"] = callback_url

        async def submit(current_token: str):
            return await client.post(
                f"{base_url}/message/sms/send",
                data=payload,
                headers={"Authorization": f"Bearer {current_token}"},
            )

        try:
            response = await submit(token)
            if response.status_code == 401:
                _token = None
                response = await submit(await _authenticate(client))
            response.raise_for_status()
            response_payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise SmsDeliveryError("Eskiz rejected the SMS request") from exc
        return SmsDelivery("sent", _extract_message_id(response_payload))


async def send_sms(phone: str, message: str) -> SmsDelivery:
    """Send one SMS without ever logging credentials, OTP codes, or message text."""
    validate_sms_configuration()
    mode = delivery_mode()
    if mode == "disabled":
        raise SmsConfigurationError("SMS delivery is disabled")
    if mode == "mock":
        logger.info("Mock SMS accepted for a verified-format phone number")
        return SmsDelivery("mock", "mock-message")
    return await _send_live(phone, message)


def clear_cached_eskiz_token() -> None:
    global _token
    _token = None
