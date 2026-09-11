"""Single-use Telegram account-pairing links and webhook processing."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import qrcode
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from telegram_service import send_telegram_message, telegram_start_url


SAFE_TEST_ENVS = {"test", "qa", "app_qa", "finance_qa", "sandbox", "shadow"}
LINK_PURPOSES = {"connect", "invite", "password_reset"}


class TelegramLinkError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class TelegramLink:
    url: str
    qr_data_url: str
    expires_at: datetime
    purpose: str


@dataclass(frozen=True)
class TelegramLinkConsumption:
    user: dict
    purpose: str
    replaced_existing_connection: bool


def _link_ttl_seconds() -> int:
    raw = os.environ.get("TELEGRAM_LINK_TTL_SECONDS", "86400")
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("TELEGRAM_LINK_TTL_SECONDS must be an integer") from exc
    if not 300 <= value <= 604800:
        raise RuntimeError("TELEGRAM_LINK_TTL_SECONDS must be between 300 and 604800")
    return value


def _link_hash(raw_token: str) -> str:
    secret = (
        os.environ.get("TELEGRAM_LINK_HASH_SECRET")
        or os.environ.get("OTP_HASH_SECRET")
        or os.environ.get("SECRET_KEY")
    )
    if not secret:
        raise RuntimeError("SECRET_KEY or TELEGRAM_LINK_HASH_SECRET must be configured")
    return hmac.new(secret.encode(), f"telegram-link:{raw_token}".encode(), hashlib.sha256).hexdigest()


def _qr_data_url(url: str) -> str:
    image = qrcode.make(url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _message(language: str, key: str) -> str:
    language = language if language in {"en", "ru", "uz"} else "en"
    messages = {
        "linked": {
            "en": "Nurik's Academy: Telegram has been connected to your account.",
            "ru": "Nurik's Academy: Telegram подключён к вашему аккаунту.",
            "uz": "Nurik's Academy: Telegram akkauntingizga ulandi.",
        },
        "invalid": {
            "en": "This Nurik's Academy link is invalid, expired, or already used. Ask an administrator for a new link.",
            "ru": "Эта ссылка Nurik's Academy недействительна, истекла или уже использована. Попросите администратора создать новую ссылку.",
            "uz": "Bu Nurik's Academy havolasi noto‘g‘ri, muddati tugagan yoki ishlatilgan. Administratordan yangi havola so‘rang.",
        },
        "start": {
            "en": "Welcome to the Nurik's Academy security bot. Open the personal link provided by your administrator to connect your account. After connecting, use /code whenever you need an access or password-reset code.",
            "ru": "Добро пожаловать в бот безопасности Nurik's Academy. Откройте персональную ссылку от администратора, чтобы подключить аккаунт. После подключения используйте /code, когда нужен код доступа или сброса пароля.",
            "uz": "Nurik's Academy xavfsizlik botiga xush kelibsiz. Akkauntni ulash uchun administrator bergan shaxsiy havolani oching. Ulangandan keyin kirish yoki parolni tiklash kodi uchun /code buyrug‘idan foydalaning.",
        },
        "help": {
            "en": "Nurik's Academy security bot\n\n/code — send my access or password-reset code\n/status — check my connection\n/help — show these instructions\n\nCodes are sent only in this private chat. Academy staff will never ask you to forward a code.",
            "ru": "Бот безопасности Nurik's Academy\n\n/code — отправить мой код доступа или сброса пароля\n/status — проверить подключение\n/help — показать эту инструкцию\n\nКоды отправляются только в этот личный чат. Сотрудники академии никогда не попросят переслать код.",
            "uz": "Nurik's Academy xavfsizlik boti\n\n/code — kirish yoki parolni tiklash kodini yuborish\n/status — ulanishni tekshirish\n/help — yo‘riqnomani ko‘rsatish\n\nKodlar faqat shu shaxsiy chatga yuboriladi. Akademiya xodimlari kodni yuborishingizni hech qachon so‘ramaydi.",
        },
        "status_linked": {
            "en": "Connected. This Telegram account can receive Nurik's Academy security codes.",
            "ru": "Подключено. Этот Telegram-аккаунт может получать коды безопасности Nurik's Academy.",
            "uz": "Ulangan. Ushbu Telegram akkaunti Nurik's Academy xavfsizlik kodlarini olishi mumkin.",
        },
        "status_not_linked": {
            "en": "Not connected. Open the personal Telegram link provided by an administrator, then press Start.",
            "ru": "Не подключено. Откройте персональную Telegram-ссылку от администратора и нажмите Start.",
            "uz": "Ulanmagan. Administrator bergan shaxsiy Telegram havolasini oching va Start tugmasini bosing.",
        },
        "code_rate_limited": {
            "en": "A code was requested recently. Wait a minute, then use /code again.",
            "ru": "Код уже запрашивался недавно. Подождите минуту и снова используйте /code.",
            "uz": "Kod yaqinda so‘ralgan. Bir daqiqa kutib, /code buyrug‘ini yana yuboring.",
        },
        "code_unavailable": {
            "en": "No active or pending Nurik's Academy account is connected to this Telegram. Ask an administrator for a new personal link.",
            "ru": "К этому Telegram не подключён активный или ожидающий активации аккаунт Nurik's Academy. Попросите администратора создать новую персональную ссылку.",
            "uz": "Ushbu Telegramga faol yoki faollashtirilishi kutilayotgan Nurik's Academy akkaunti ulanmagan. Administratordan yangi shaxsiy havola so‘rang.",
        },
        "delivery_failed": {
            "en": "Your Telegram account was connected, but the code could not be created. Request another code in the Nurik's Academy app.",
            "ru": "Telegram подключён, но код создать не удалось. Запросите новый код в приложении Nurik's Academy.",
            "uz": "Telegram ulandi, lekin kod yaratilmadi. Nurik's Academy ilovasida yangi kod so‘rang.",
        },
    }
    return messages[key][language]


async def create_telegram_link(
    db,
    *,
    user: dict,
    purpose: str,
    actor_id: str,
    request_ip: Optional[str],
) -> TelegramLink:
    if purpose not in LINK_PURPOSES:
        raise ValueError("Unsupported Telegram link purpose")
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=_link_ttl_seconds())
    raw_token = secrets.token_urlsafe(32)
    start_parameter = f"connect_{raw_token}"
    url = telegram_start_url(start_parameter)
    await db.telegram_links.update_many(
        {
            "user_id": str(user["_id"]),
            "used_at": None,
            "revoked_at": None,
        },
        {"$set": {"revoked_at": now, "revocation_reason": "superseded"}},
    )
    document = {
        "token_hash": _link_hash(raw_token),
        "user_id": str(user["_id"]),
        "purpose": purpose,
        "created_by": actor_id,
        "request_ip": request_ip,
        "created_at": now,
        "expires_at": expires_at,
        "used_at": None,
        "revoked_at": None,
    }
    if os.environ.get("APP_ENV", "").strip().lower() in SAFE_TEST_ENVS:
        document["test_token"] = raw_token
    await db.telegram_links.insert_one(document)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "telegram_link_status": (
                "linked" if user.get("telegram_link_status") == "linked" else "awaiting_connection"
            ),
            "telegram_link_expires_at": expires_at,
            "updated_at": now,
        }},
    )
    return TelegramLink(url, _qr_data_url(url), expires_at, purpose)


async def consume_telegram_link(
    db,
    *,
    start_parameter: str,
    telegram_user: dict,
    chat: dict,
) -> TelegramLinkConsumption:
    if chat.get("type") != "private" or telegram_user.get("id") != chat.get("id"):
        raise TelegramLinkError("PRIVATE_CHAT_REQUIRED", "Open the link in a private bot chat")
    if not start_parameter.startswith("connect_"):
        raise TelegramLinkError("INVALID_LINK", "Invalid connection link")
    raw_token = start_parameter.removeprefix("connect_")
    if not raw_token:
        raise TelegramLinkError("INVALID_LINK", "Invalid connection link")
    now = datetime.utcnow()
    telegram_user_id = int(telegram_user["id"])
    chat_id = int(chat["id"])

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                link = await db.telegram_links.find_one(
                    {"token_hash": _link_hash(raw_token)}, session=session,
                )
                if not link or link.get("used_at") or link.get("revoked_at"):
                    raise TelegramLinkError("INVALID_LINK", "Connection link is no longer valid")
                if link.get("expires_at") <= now:
                    await db.telegram_links.update_one(
                        {"_id": link["_id"]},
                        {"$set": {"revoked_at": now, "revocation_reason": "expired"}},
                        session=session,
                    )
                    raise TelegramLinkError("EXPIRED_LINK", "Connection link has expired")
                from bson import ObjectId

                user = await db.users.find_one({"_id": ObjectId(link["user_id"])}, session=session)
                if not user or user.get("account_status") == "deactivated":
                    raise TelegramLinkError("ACCOUNT_UNAVAILABLE", "Account is unavailable")
                conflict = await db.users.find_one(
                    {"telegram_user_id": telegram_user_id, "_id": {"$ne": user["_id"]}},
                    session=session,
                )
                if conflict:
                    raise TelegramLinkError(
                        "TELEGRAM_ALREADY_LINKED",
                        "This Telegram account is already connected to another Nurik's Academy account",
                    )
                claimed = await db.telegram_links.find_one_and_update(
                    {"_id": link["_id"], "used_at": None, "revoked_at": None},
                    {"$set": {"used_at": now, "telegram_user_id": telegram_user_id}},
                    return_document=ReturnDocument.AFTER,
                    session=session,
                )
                if not claimed:
                    raise TelegramLinkError("LINK_ALREADY_USED", "Connection link was already used")
                replaced = bool(
                    user.get("telegram_user_id")
                    and int(user["telegram_user_id"]) != telegram_user_id
                )
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "telegram_user_id": telegram_user_id,
                        "telegram_chat_id": chat_id,
                        "telegram_username": telegram_user.get("username"),
                        "telegram_first_name": telegram_user.get("first_name"),
                        "telegram_last_name": telegram_user.get("last_name"),
                        "telegram_link_status": "linked",
                        "telegram_linked_at": now,
                        "telegram_verified": True,
                        "identity_verified_via": "telegram",
                        "updated_at": now,
                    }, "$unset": {"telegram_link_expires_at": ""}},
                    session=session,
                )
                user = await db.users.find_one({"_id": user["_id"]}, session=session)
    except DuplicateKeyError as exc:
        raise TelegramLinkError(
            "TELEGRAM_ALREADY_LINKED",
            "This Telegram account is already connected to another Nurik's Academy account",
        ) from exc
    return TelegramLinkConsumption(user, link["purpose"], replaced)


async def process_telegram_start(db, update: dict) -> Optional[TelegramLinkConsumption]:
    message = update.get("message") if isinstance(update, dict) else None
    if not isinstance(message, dict):
        return None
    text = message.get("text")
    chat = message.get("chat")
    sender = message.get("from")
    if not isinstance(text, str) or not isinstance(chat, dict) or not isinstance(sender, dict):
        return None
    sender_language = str(sender.get("language_code", "en")).split("-", 1)[0].lower()
    if sender_language not in {"en", "ru", "uz"}:
        sender_language = "en"
    if chat.get("type") != "private" or sender.get("id") != chat.get("id"):
        return None
    parts = text.split(maxsplit=1)
    command = parts[0].split("@", 1)[0].lower()

    if command == "/help":
        await send_telegram_message(int(chat["id"]), _message(sender_language, "help"))
        return None

    linked_user = await db.users.find_one({
        "telegram_user_id": int(sender["id"]),
        "telegram_chat_id": int(chat["id"]),
        "telegram_link_status": "linked",
    })
    if command == "/status":
        await send_telegram_message(
            int(chat["id"]),
            _message(sender_language, "status_linked" if linked_user else "status_not_linked"),
        )
        return None

    if command == "/code":
        if not linked_user or linked_user.get("account_status") not in {"active", "pending_invite"}:
            await send_telegram_message(int(chat["id"]), _message(sender_language, "code_unavailable"))
            return None
        from phone_auth import OtpDeliveryError, OtpRateLimitError, issue_otp

        purpose = "invite" if linked_user.get("account_status") == "pending_invite" else "password_reset"
        try:
            await issue_otp(
                db,
                user=linked_user,
                purpose=purpose,
                requested_by=str(linked_user["_id"]),
                request_ip="telegram_command",
            )
        except OtpRateLimitError:
            await send_telegram_message(int(chat["id"]), _message(sender_language, "code_rate_limited"))
        except OtpDeliveryError:
            # The provider failure is already persisted on the challenge. If
            # Telegram itself is unavailable, an additional reply cannot be
            # delivered reliably and should not create a retry loop.
            return None
        return None

    if command != "/start":
        await send_telegram_message(int(chat["id"]), _message(sender_language, "help"))
        return None

    if len(parts) == 1:
        await send_telegram_message(int(chat["id"]), _message(sender_language, "start"))
        return None
    parameter = parts[1].strip()
    try:
        consumed = await consume_telegram_link(
            db, start_parameter=parameter, telegram_user=sender, chat=chat,
        )
    except TelegramLinkError:
        await send_telegram_message(int(chat["id"]), _message(sender_language, "invalid"))
        raise

    language = consumed.user.get("language_preference", "en")
    if consumed.purpose in {"invite", "password_reset"}:
        from phone_auth import OtpDeliveryError, OtpRateLimitError, issue_otp

        try:
            await issue_otp(
                db,
                user=consumed.user,
                purpose=consumed.purpose,
                requested_by=str(consumed.user["_id"]),
                request_ip="telegram_webhook",
            )
        except (OtpDeliveryError, OtpRateLimitError):
            await send_telegram_message(
                int(chat["id"]), _message(language, "delivery_failed"),
            )
    else:
        await send_telegram_message(int(chat["id"]), _message(language, "linked"))
    return consumed


async def disconnect_telegram(db, user: dict, *, session=None) -> None:
    now = datetime.utcnow()
    operation_options = {"session": session} if session is not None else {}
    await db.telegram_links.update_many(
        {"user_id": str(user["_id"]), "used_at": None, "revoked_at": None},
        {"$set": {"revoked_at": now, "revocation_reason": "account_disconnected"}},
        **operation_options,
    )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"telegram_link_status": "not_connected", "updated_at": now}, "$unset": {
            "telegram_user_id": "",
            "telegram_chat_id": "",
            "telegram_username": "",
            "telegram_first_name": "",
            "telegram_last_name": "",
            "telegram_linked_at": "",
            "telegram_link_expires_at": "",
        }},
        **operation_options,
    )


async def ensure_telegram_indexes(db) -> None:
    await db.telegram_links.create_index("token_hash", unique=True)
    await db.telegram_links.create_index("expires_at", expireAfterSeconds=0)
    await db.telegram_links.create_index([("user_id", 1), ("created_at", -1)])
    await db.users.create_index(
        "telegram_user_id",
        unique=True,
        partialFilterExpression={"telegram_user_id": {"$exists": True}},
    )
