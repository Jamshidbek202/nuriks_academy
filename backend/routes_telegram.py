"""Public Telegram webhook. Telegram identity never creates an application session."""

from __future__ import annotations

import hmac
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request

from telegram_auth import TelegramLinkError, process_telegram_start
from telegram_service import TelegramDeliveryError, webhook_secret


router = APIRouter(prefix="/telegram", tags=["Telegram"])
logger = logging.getLogger(__name__)


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(default=None),
):
    expected = webhook_secret()
    if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, expected
    ):
        raise HTTPException(status_code=403, detail="Invalid Telegram webhook secret")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Telegram update") from exc
    from server import create_audit_log, db

    try:
        consumed = await process_telegram_start(db, payload)
        if consumed:
            await create_audit_log(
                str(consumed.user["_id"]),
                "telegram_connected",
                "user",
                str(consumed.user["_id"]),
                {
                    "purpose": consumed.purpose,
                    "replaced_existing_connection": consumed.replaced_existing_connection,
                },
                "telegram_webhook",
            )
    except TelegramLinkError as error:
        logger.info("Telegram connection link rejected: %s", error.code)
    except TelegramDeliveryError:
        # Telegram retries non-2xx webhook responses. The account-link claim is
        # already durable, so acknowledge and let the user request another code.
        logger.exception("Telegram response delivery failed after webhook processing")
    except Exception:
        logger.exception("Unexpected Telegram webhook processing failure")
    return {"ok": True}
