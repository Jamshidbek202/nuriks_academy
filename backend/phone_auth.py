"""Phone identity, invitation, OTP, and password-policy primitives."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from pymongo import ReturnDocument

from telegram_service import (
    TelegramConfigurationError,
    TelegramDeliveryError,
    delivery_mode,
    send_telegram_message,
)


PHONE_PATTERN = re.compile(r"^\+998\d{9}$")
SAFE_TEST_ENVS = {"test", "qa", "app_qa", "finance_qa", "sandbox", "shadow"}
OTP_PURPOSES = {"invite", "password_reset"}


class PhoneValidationError(ValueError):
    pass


class PasswordPolicyError(ValueError):
    pass


class OtpRateLimitError(ValueError):
    def __init__(self, message: str, retry_after_seconds: int):
        super().__init__(message)
        self.retry_after_seconds = max(1, retry_after_seconds)


class OtpCodeError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class OtpDeliveryError(RuntimeError):
    pass


@dataclass(frozen=True)
class OtpIssueResult:
    challenge_id: str
    delivery_status: str
    expires_in_seconds: int
    retry_after_seconds: int


@dataclass(frozen=True)
class AccessIssueResult:
    delivery_status: str
    retry_after_seconds: int
    expires_in_seconds: int
    telegram_invite_url: Optional[str] = None
    telegram_invite_qr: Optional[str] = None
    telegram_invite_expires_at: Optional[datetime] = None


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def otp_ttl_seconds() -> int:
    return _env_int("OTP_TTL_SECONDS", 300, 60, 900)


def otp_resend_cooldown_seconds() -> int:
    return _env_int("OTP_RESEND_COOLDOWN_SECONDS", 60, 15, 600)


def otp_max_attempts() -> int:
    return _env_int("OTP_MAX_ATTEMPTS", 5, 3, 10)


def otp_daily_limit() -> int:
    return _env_int("OTP_DAILY_LIMIT_PER_PHONE", 10, 3, 50)


def normalize_phone(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PhoneValidationError("Phone number is required")
    raw = value.strip()
    if raw.startswith("+") and not raw.startswith("+998"):
        raise PhoneValidationError("Only Uzbekistan +998 phone numbers are supported")
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 9:
        digits = "998" + digits
    elif len(digits) == 10 and digits.startswith("0"):
        digits = "998" + digits[1:]
    if len(digits) != 12 or not digits.startswith("998"):
        raise PhoneValidationError("Use an Uzbekistan number in +998XXXXXXXXX format")
    normalized = "+" + digits
    if not PHONE_PATTERN.fullmatch(normalized):
        raise PhoneValidationError("Use an Uzbekistan number in +998XXXXXXXXX format")
    return normalized


def validate_password(password: str) -> None:
    if not isinstance(password, str):
        raise PasswordPolicyError("Password is required")
    if len(password) < 10 or len(password.encode("utf-8")) > 72:
        raise PasswordPolicyError("Password must contain at least 10 characters and no more than 72 bytes")
    if password != password.strip() or any(character.isspace() for character in password):
        raise PasswordPolicyError("Password cannot contain whitespace")
    requirements = (
        (re.search(r"[a-z]", password), "a lowercase letter"),
        (re.search(r"[A-Z]", password), "an uppercase letter"),
        (re.search(r"\d", password), "a number"),
        (re.search(r"[^A-Za-z0-9]", password), "a symbol"),
    )
    missing = [label for matched, label in requirements if not matched]
    if missing:
        raise PasswordPolicyError("Password must include " + ", ".join(missing))


def legacy_login_allowed() -> bool:
    environment = os.environ.get("APP_ENV", "").strip().lower()
    if environment in {"production", "prod"}:
        return False
    return environment in SAFE_TEST_ENVS or os.environ.get("ALLOW_LEGACY_LOGIN", "0") == "1"


def _otp_hash(challenge_id: str, purpose: str, phone: str, code: str) -> str:
    secret = os.environ.get("OTP_HASH_SECRET") or os.environ.get("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY or OTP_HASH_SECRET must be configured")
    payload = f"{challenge_id}:{purpose}:{phone}:{code}".encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def _otp_message(purpose: str, code: str, language: str) -> str:
    language = language if language in {"en", "ru", "uz"} else "en"
    minutes = max(1, otp_ttl_seconds() // 60)
    configured_name = f"TELEGRAM_{purpose.upper()}_TEMPLATE_{language.upper()}"
    configured_template = os.environ.get(configured_name, "").strip()
    if configured_template:
        if "{code}" not in configured_template:
            raise RuntimeError(f"{configured_name} must contain {{code}}")
        try:
            return configured_template.format(code=code, minutes=minutes)
        except (KeyError, ValueError) as error:
            raise RuntimeError(f"{configured_name} contains an unsupported placeholder") from error
    if purpose == "invite":
        messages = {
            "en": f"Nurik's Academy invitation code: {code}. Valid for {minutes} minutes.",
            "ru": f"Nurik's Academy: код приглашения {code}. Действителен {minutes} минут.",
            "uz": f"Nurik's Academy: taklif kodi {code}. {minutes} daqiqa amal qiladi.",
        }
    else:
        messages = {
            "en": f"Nurik's Academy password reset code: {code}. Valid for {minutes} minutes.",
            "ru": f"Nurik's Academy: код сброса пароля {code}. Действителен {minutes} минут.",
            "uz": f"Nurik's Academy: parolni tiklash kodi {code}. {minutes} daqiqa amal qiladi.",
        }
    return messages[language]


async def issue_otp(
    db,
    *,
    user: dict,
    purpose: str,
    requested_by: Optional[str] = None,
    request_ip: Optional[str] = None,
) -> OtpIssueResult:
    if purpose not in OTP_PURPOSES:
        raise ValueError("Unsupported OTP purpose")
    phone = normalize_phone(user.get("phone_normalized") or user.get("phone"))
    now = datetime.utcnow()
    cooldown = otp_resend_cooldown_seconds()
    delivered_query = {
        "phone_normalized": phone,
        "purpose": purpose,
        "delivery_status": {"$in": ["sent", "mock"]},
    }
    latest = await db.auth_challenges.find_one(
        delivered_query,
        sort=[("created_at", -1)],
    )
    if latest and latest.get("created_at"):
        elapsed = int((now - latest["created_at"]).total_seconds())
        if elapsed < cooldown:
            raise OtpRateLimitError("Please wait before requesting another code", cooldown - elapsed)
    sent_today = await db.auth_challenges.count_documents({
        **delivered_query,
        "created_at": {"$gte": now - timedelta(hours=24)},
    })
    if sent_today >= otp_daily_limit():
        raise OtpRateLimitError("Daily verification-code limit reached", 24 * 60 * 60)

    await db.auth_challenges.update_many(
        {
            "phone_normalized": phone,
            "purpose": purpose,
            "consumed_at": None,
            "invalidated_at": None,
        },
        {"$set": {"invalidated_at": now, "invalidation_reason": "superseded"}},
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = str(uuid.uuid4())
    ttl = otp_ttl_seconds()
    document = {
        "challenge_id": challenge_id,
        "user_id": str(user["_id"]),
        "phone_normalized": phone,
        "purpose": purpose,
        "code_hash": _otp_hash(challenge_id, purpose, phone, code),
        "attempts": 0,
        "max_attempts": otp_max_attempts(),
        "delivery_status": "pending",
        "provider_message_id": None,
        "delivery_channel": "telegram",
        "requested_by": requested_by,
        "request_ip": request_ip,
        "created_at": now,
        "expires_at": now + timedelta(seconds=ttl),
        "consumed_at": None,
        "invalidated_at": None,
    }
    if delivery_mode() == "mock" and os.environ.get("APP_ENV", "").lower() in SAFE_TEST_ENVS:
        document["test_code"] = code
    await db.auth_challenges.insert_one(document)
    try:
        chat_id = user.get("telegram_chat_id")
        if not chat_id or user.get("telegram_link_status") != "linked":
            raise TelegramConfigurationError("Telegram is not connected to this account")
        delivery = await send_telegram_message(
            int(chat_id),
            _otp_message(purpose, code, user.get("language_preference", "en")),
        )
    except (TelegramConfigurationError, TelegramDeliveryError, RuntimeError) as exc:
        await db.auth_challenges.update_one(
            {"challenge_id": challenge_id},
            {"$set": {"delivery_status": "failed", "delivery_failed_at": datetime.utcnow()}},
        )
        raise OtpDeliveryError("The verification code could not be delivered through Telegram") from exc
    await db.auth_challenges.update_one(
        {"challenge_id": challenge_id},
        {"$set": {
            "delivery_status": delivery.status,
            "provider_message_id": delivery.provider_message_id,
            "sent_at": datetime.utcnow(),
        }},
    )
    return OtpIssueResult(challenge_id, delivery.status, ttl, cooldown)


async def consume_otp(
    db,
    *,
    phone: str,
    purpose: str,
    code: str,
    session=None,
) -> dict:
    normalized = normalize_phone(phone)
    now = datetime.utcnow()
    kwargs = {"session": session} if session is not None else {}
    challenge = await db.auth_challenges.find_one(
        {
            "phone_normalized": normalized,
            "purpose": purpose,
            "consumed_at": None,
            "invalidated_at": None,
            "delivery_status": {"$in": ["sent", "mock"]},
        },
        sort=[("created_at", -1)],
        **kwargs,
    )
    if not challenge:
        raise OtpCodeError("CODE_NOT_FOUND", "No active verification code was found")
    if challenge["expires_at"] <= now:
        await db.auth_challenges.update_one(
            {"_id": challenge["_id"]},
            {"$set": {"invalidated_at": now, "invalidation_reason": "expired"}},
            **kwargs,
        )
        raise OtpCodeError("CODE_EXPIRED", "Verification code has expired")
    if challenge.get("attempts", 0) >= challenge.get("max_attempts", otp_max_attempts()):
        raise OtpCodeError("TOO_MANY_ATTEMPTS", "Too many incorrect attempts")
    expected = _otp_hash(challenge["challenge_id"], purpose, normalized, code)
    if not hmac.compare_digest(expected, challenge["code_hash"]):
        attempts = challenge.get("attempts", 0) + 1
        update = {"$inc": {"attempts": 1}, "$set": {"last_failed_at": now}}
        if attempts >= challenge.get("max_attempts", otp_max_attempts()):
            update["$set"].update({
                "invalidated_at": now,
                "invalidation_reason": "too_many_attempts",
            })
        await db.auth_challenges.update_one({"_id": challenge["_id"]}, update, **kwargs)
        raise OtpCodeError("INVALID_CODE", "Verification code is incorrect")
    consumed = await db.auth_challenges.find_one_and_update(
        {"_id": challenge["_id"], "consumed_at": None, "invalidated_at": None},
        {"$set": {"consumed_at": now}},
        return_document=ReturnDocument.AFTER,
        **kwargs,
    )
    if not consumed:
        raise OtpCodeError("CODE_ALREADY_USED", "Verification code has already been used")
    return consumed


def invited_user_document(
    *,
    phone: str,
    full_name: str,
    role: str,
    email: Optional[str],
    branch_id: Optional[str],
    language_preference: str,
    created_by: str,
) -> dict:
    normalized = normalize_phone(phone)
    now = datetime.utcnow()
    return {
        "login": normalized,
        "password_hash": None,
        "email": email,
        "phone": normalized,
        "phone_normalized": normalized,
        "phone_verified": False,
        "telegram_verified": False,
        "telegram_link_status": "not_connected",
        "full_name": full_name.strip(),
        "role": role,
        "is_active": False,
        "account_status": "pending_invite",
        "two_factor_enabled": False,
        "language_preference": language_preference,
        "token_version": 0,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "branch_id": branch_id,
    }


def phone_required_user_document(
    *,
    login: str,
    full_name: str,
    role: str,
    email: Optional[str],
    branch_id: Optional[str],
    language_preference: str,
    created_by: str,
) -> dict:
    """Create a non-login account placeholder until a unique phone is supplied."""
    now = datetime.utcnow()
    return {
        "login": login,
        "password_hash": None,
        "email": email,
        "phone": None,
        "phone_normalized": None,
        "phone_verified": False,
        "full_name": full_name.strip(),
        "role": role,
        "is_active": False,
        "account_status": "phone_required",
        "two_factor_enabled": False,
        "language_preference": language_preference,
        "token_version": 0,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "branch_id": branch_id,
    }


async def issue_access_code(
    db,
    user: dict,
    *,
    purpose: str,
    actor_id: str,
    request_ip: Optional[str],
) -> AccessIssueResult:
    if purpose not in OTP_PURPOSES:
        raise ValueError("Unsupported access-code purpose")
    if user.get("telegram_chat_id") and user.get("telegram_link_status") == "linked":
        issued = await issue_otp(
            db,
            user=user,
            purpose=purpose,
            requested_by=actor_id,
            request_ip=request_ip,
        )
        return AccessIssueResult(
            issued.delivery_status,
            issued.retry_after_seconds,
            issued.expires_in_seconds,
        )
    from telegram_auth import create_telegram_link

    link = await create_telegram_link(
        db,
        user=user,
        purpose=purpose,
        actor_id=actor_id,
        request_ip=request_ip,
    )
    return AccessIssueResult(
        "link_ready",
        0,
        max(0, int((link.expires_at - datetime.utcnow()).total_seconds())),
        link.url,
        link.qr_data_url,
        link.expires_at,
    )


async def issue_invitation(
    db, user: dict, *, actor_id: str, request_ip: Optional[str]
) -> AccessIssueResult:
    result = await issue_access_code(
        db, user, purpose="invite", actor_id=actor_id, request_ip=request_ip,
    )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "invite_delivery_status": result.delivery_status,
            "invite_sent_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }},
    )
    return result


async def get_user_by_phone(db, phone: str, *, session=None) -> Optional[dict]:
    normalized = normalize_phone(phone)
    kwargs = {"session": session} if session is not None else {}
    return await db.users.find_one({"phone_normalized": normalized}, **kwargs)


async def ensure_phone_auth_indexes(db) -> None:
    await db.users.create_index(
        "phone_normalized",
        unique=True,
        partialFilterExpression={"phone_normalized": {"$type": "string"}},
    )
    await db.users.create_index([("account_status", 1), ("role", 1)])
    await db.auth_challenges.create_index("challenge_id", unique=True)
    await db.auth_challenges.create_index(
        [("phone_normalized", 1), ("purpose", 1), ("created_at", -1)]
    )
    await db.auth_challenges.create_index("expires_at", expireAfterSeconds=0)


async def migrate_phone_auth_users(db) -> dict:
    """Idempotently migrate legacy users without inventing missing phone numbers."""
    production_style = not legacy_login_allowed()
    migrated = 0
    phone_required = 0
    async for user in db.users.find({}):
        updates = {"token_version": int(user.get("token_version", 0))}
        phone = user.get("phone_normalized") or user.get("phone")
        if phone:
            normalized = normalize_phone(phone)
            collision = await db.users.find_one({
                "phone_normalized": normalized,
                "_id": {"$ne": user["_id"]},
            })
            if collision:
                raise RuntimeError("Duplicate normalized phone numbers must be resolved before startup")
            updates.update({"phone": normalized, "phone_normalized": normalized})
            if production_style:
                updates["login"] = normalized
            existing_status = user.get("account_status")
            if existing_status == "pending_invite":
                # Pending invitations are deliberately inactive. Preserve that
                # state across deploys so an issued invitation survives a
                # backend restart and is not mistaken for a deactivation.
                updates.update({"account_status": "pending_invite", "phone_verified": False})
            elif existing_status == "deactivated" or (
                existing_status is None and not user.get("is_active", True)
            ):
                updates.update({
                    "account_status": "deactivated",
                    "phone_verified": bool(user.get("phone_verified", False)),
                })
            elif user.get("password_hash"):
                updates["account_status"] = "active"
                if user.get("identity_verified_via") == "telegram":
                    updates.update({
                        "phone_verified": bool(user.get("phone_verified", False)),
                        "telegram_verified": bool(user.get("telegram_verified", True)),
                    })
                else:
                    updates["phone_verified"] = True
            else:
                updates.update({"account_status": "pending_invite", "phone_verified": False})
        else:
            if legacy_login_allowed() and user.get("qa_fixture") and user.get("password_hash"):
                # Disposable QA aliases intentionally exercise the rest of the
                # application without external delivery. Production never enters
                # this compatibility branch.
                updates.update({"account_status": "active", "phone_verified": True})
            else:
                updates.update({"account_status": "phone_required", "phone_verified": False})
                phone_required += 1
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {**updates, "updated_at": user.get("updated_at", datetime.utcnow())}},
        )
        migrated += 1
    return {"migrated": migrated, "phone_required": phone_required}
