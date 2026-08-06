"""Personal-card receiving destinations and human-verified payment reports.

Click and Payme personal-card transfers do not provide a trusted merchant
callback. A parent report is therefore only an unresolved claim. Money enters
the finance ledger atomically after an authorized staff member verifies the
transfer in the receiving card application.
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from typing import Optional
from zoneinfo import ZoneInfo

from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, OperationFailure

from finance_ledger import record_card_transfer_receipt
from finance_models import ACADEMY_TIMEZONE, CardPaymentDecision


def _session(session) -> dict:
    return {"session": session} if session is not None else {}


def _is_transient_transaction_conflict(error: OperationFailure) -> bool:
    return error.has_error_label("TransientTransactionError") or error.code in {
        112,  # WriteConflict
        244,  # TransientTransactionError
        251,  # NoSuchTransaction after a competing commit
    }


def _card_secret() -> bytes:
    configured = (
        os.environ.get("PAYMENT_CARD_ENCRYPTION_KEY", "").strip()
        or os.environ.get("SECRET_KEY", "").strip()
    )
    if not configured:
        raise RuntimeError(
            "PAYMENT_CARD_ENCRYPTION_KEY or SECRET_KEY is required for receiving cards"
        )
    digest = hashlib.sha256(f"nuriks-payment-card:{configured}".encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    return Fernet(_card_secret())


def encrypt_card_number(card_number: str) -> str:
    return _fernet().encrypt(card_number.encode("ascii")).decode("ascii")


def decrypt_card_number(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("ascii")
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise RuntimeError("Receiving card data cannot be decrypted with the configured key") from exc


def card_fingerprint(card_number: str) -> str:
    return hmac.new(
        _card_secret(),
        f"receiving-card:{card_number}".encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


def payment_report_fingerprint(
    *, reporter_id: str, student_id: str, destination_id: str,
    amount_uzs: int, paid_at: datetime,
) -> str:
    value = ":".join((
        reporter_id,
        student_id,
        destination_id,
        str(amount_uzs),
        paid_at.isoformat(timespec="minutes"),
    ))
    return hmac.new(_card_secret(), value.encode("utf-8"), hashlib.sha256).hexdigest()


async def ensure_card_payment_indexes(db) -> None:
    await db.finance_payment_destinations.create_index("idempotency_key", unique=True)
    await db.finance_payment_destinations.create_index(
        [("provider", ASCENDING), ("branch_id", ASCENDING), ("card_fingerprint", ASCENDING)],
        unique=True,
        name="active_receiving_card_unique",
        partialFilterExpression={"status": "active"},
    )
    await db.finance_payment_destinations.create_index(
        [("branch_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]
    )
    await db.finance_payment_destination_events.create_index("idempotency_key", unique=True)
    await db.finance_card_payment_reports.create_index("idempotency_key", unique=True)
    await db.finance_card_payment_reports.create_index("report_fingerprint", unique=True)
    await db.finance_card_payment_reports.create_index(
        [("branch_id", ASCENDING), ("status", ASCENDING), ("reported_at", DESCENDING)]
    )
    await db.finance_card_payment_resolutions.create_index("idempotency_key", unique=True)
    await db.finance_card_payment_resolutions.create_index("payment_report_id", unique=True)
    await db.finance_card_payment_notifications.create_index(
        [("payment_report_id", ASCENDING), ("user_id", ASCENDING), ("event", ASCENDING)],
        unique=True,
    )
    await db.finance_receipts.create_index("payment_report_id", unique=True, sparse=True)


def serialize_payment_destination(document: dict) -> dict:
    result = {
        key: value for key, value in document.items()
        if key not in {"card_number_ciphertext", "card_fingerprint", "idempotency_key"}
    }
    result["id"] = str(document["_id"])
    result.pop("_id", None)
    result["card_number"] = decrypt_card_number(document["card_number_ciphertext"])
    for key, value in list(result.items()):
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
    return result


async def create_payment_destination(db, payload, actor: dict, branch_id: Optional[str]) -> tuple[dict, bool]:
    fingerprint = card_fingerprint(payload.card_number)
    replay = await db.finance_payment_destinations.find_one(
        {"idempotency_key": payload.idempotency_key}
    )
    if replay:
        if (
            replay.get("created_by") != str(actor["_id"])
            or replay.get("branch_id") != branch_id
            or replay.get("provider") != payload.provider.value
            or replay.get("card_fingerprint") != fingerprint
        ):
            raise ValueError("Idempotency key was already used for another receiving card")
        return replay, True
    now = datetime.utcnow()
    document = {
        "provider": payload.provider.value,
        "card_number_ciphertext": encrypt_card_number(payload.card_number),
        "card_fingerprint": fingerprint,
        "card_last4": payload.card_number[-4:],
        "cardholder_name": payload.cardholder_name,
        "label": payload.label.strip() if payload.label else None,
        "branch_id": branch_id,
        "status": "active",
        "created_by": str(actor["_id"]),
        "created_at": now,
        "updated_by": str(actor["_id"]),
        "updated_at": now,
        "idempotency_key": payload.idempotency_key,
        "revision": 1,
    }
    try:
        result = await db.finance_payment_destinations.insert_one(document)
    except DuplicateKeyError:
        replay = await db.finance_payment_destinations.find_one(
            {"idempotency_key": payload.idempotency_key}
        )
        if replay:
            return replay, True
        raise ValueError("This active receiving card is already configured for the provider")
    document["_id"] = result.inserted_id
    return document, False


async def update_payment_destination(db, destination: dict, payload, actor: dict) -> tuple[dict, bool]:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_payment_destination_events.find_one(
                    {"idempotency_key": payload.idempotency_key}, **_session(session)
                )
                if replay:
                    if replay.get("destination_id") != str(destination["_id"]):
                        raise ValueError(
                            "Idempotency key was already used for another receiving-card change"
                        )
                    current = await db.finance_payment_destinations.find_one(
                        {"_id": destination["_id"]}, **_session(session)
                    )
                    return current, True
                stored = await db.finance_payment_destinations.find_one(
                    {"_id": destination["_id"]}, **_session(session)
                )
                if not stored:
                    raise ValueError("Receiving card no longer exists")
                changes = {}
                safe_changes = {}
                if payload.provider is not None:
                    changes["provider"] = payload.provider.value
                    safe_changes["provider"] = payload.provider.value
                if payload.card_number is not None:
                    changes.update({
                        "card_number_ciphertext": encrypt_card_number(payload.card_number),
                        "card_fingerprint": card_fingerprint(payload.card_number),
                        "card_last4": payload.card_number[-4:],
                    })
                    safe_changes["card_last4"] = payload.card_number[-4:]
                if payload.cardholder_name is not None:
                    changes["cardholder_name"] = payload.cardholder_name
                    safe_changes["cardholder_name"] = payload.cardholder_name
                if payload.label is not None:
                    changes["label"] = payload.label.strip() or None
                    safe_changes["label"] = changes["label"]
                if payload.is_active is not None:
                    changes["status"] = "active" if payload.is_active else "inactive"
                    safe_changes["status"] = changes["status"]
                if not changes:
                    raise ValueError("No receiving-card changes were provided")
                now = datetime.utcnow()
                changes.update({
                    "updated_at": now,
                    "updated_by": str(actor["_id"]),
                })
                result = await db.finance_payment_destinations.update_one(
                    {"_id": stored["_id"], "revision": stored.get("revision", 1)},
                    {"$set": changes, "$inc": {"revision": 1}},
                    **_session(session),
                )
                if result.modified_count != 1:
                    raise ValueError("Receiving card changed concurrently; reload before editing")
                event = {
                    "destination_id": str(stored["_id"]),
                    "changes": safe_changes,
                    "reason": payload.reason.strip(),
                    "idempotency_key": payload.idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }
                await db.finance_payment_destination_events.insert_one(
                    event, **_session(session)
                )
                updated = await db.finance_payment_destinations.find_one(
                    {"_id": stored["_id"]}, **_session(session)
                )
                return updated, False
    except DuplicateKeyError as exc:
        raise ValueError("This active receiving card is already configured for the provider") from exc
    except OperationFailure as exc:
        raise RuntimeError(
            "Receiving-card changes require transaction support; nothing was changed"
        ) from exc


def normalize_reported_payment_time(value: datetime) -> datetime:
    local_tz = ZoneInfo(ACADEMY_TIMEZONE)
    if value.tzinfo is None:
        local_value = value.replace(tzinfo=local_tz)
    else:
        local_value = value.astimezone(local_tz)
    now = datetime.now(local_tz)
    if local_value > now + timedelta(minutes=5):
        raise ValueError("Payment time cannot be in the future")
    if local_value < now - timedelta(days=366):
        raise ValueError("Payment time is too old to report in the app")
    return local_value.astimezone(timezone.utc).replace(tzinfo=None)


async def create_card_payment_report(
    db,
    *,
    payload,
    reporter_profile: dict,
    student: dict,
    destination: dict,
    actor: dict,
) -> tuple[dict, bool]:
    paid_at = normalize_reported_payment_time(payload.paid_at)
    reporter_id = str(actor["_id"])
    fingerprint = payment_report_fingerprint(
        reporter_id=reporter_id,
        student_id=str(student["_id"]),
        destination_id=str(destination["_id"]),
        amount_uzs=payload.amount_uzs,
        paid_at=paid_at,
    )
    replay = await db.finance_card_payment_reports.find_one(
        {"idempotency_key": payload.idempotency_key}
    )
    if replay:
        if replay.get("report_fingerprint") != fingerprint:
            raise ValueError("Idempotency key was already used for another payment report")
        return replay, True
    reporter_name = (
        f"{reporter_profile.get('first_name', '')} {reporter_profile.get('last_name', '')}".strip()
        or actor.get("full_name", "")
    )
    report = {
        "student_id": str(student["_id"]),
        "student_number": student.get("student_id"),
        "student_name": f"{student.get('first_name', '')} {student.get('last_name', '')}".strip(),
        "parent_id": str(reporter_profile["_id"]) if actor.get("role") == "parent" else None,
        "parent_name": reporter_name if actor.get("role") == "parent" else None,
        "reporter_name": reporter_name,
        "reporter_role": actor.get("role"),
        "reported_by": reporter_id,
        "destination_id": str(destination["_id"]),
        "provider": destination["provider"],
        "destination_last4": destination["card_last4"],
        "destination_cardholder_name": destination["cardholder_name"],
        "amount_uzs": int(payload.amount_uzs),
        "paid_at": paid_at,
        "reported_at": datetime.utcnow(),
        "branch_id": student.get("branch_id"),
        "status": "unresolved",
        "idempotency_key": payload.idempotency_key,
        "report_fingerprint": fingerprint,
        "revision": 1,
        "immutable_report": True,
    }
    try:
        result = await db.finance_card_payment_reports.insert_one(report)
    except DuplicateKeyError:
        replay = await db.finance_card_payment_reports.find_one({
            "$or": [
                {"idempotency_key": payload.idempotency_key},
                {"report_fingerprint": fingerprint},
            ]
        })
        if replay:
            return replay, True
        raise
    report["_id"] = result.inserted_id
    return report, False


async def resolve_card_payment_report(db, report: dict, payload, actor: dict) -> dict:
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                replay = await db.finance_card_payment_resolutions.find_one(
                    {"idempotency_key": payload.idempotency_key}, **_session(session)
                )
                if replay:
                    if (
                        replay.get("payment_report_id") != str(report["_id"])
                        or replay.get("decision") != payload.decision.value
                    ):
                        raise ValueError(
                            "Idempotency key was already used for another payment resolution"
                        )
                    current = await db.finance_card_payment_reports.find_one(
                        {"_id": report["_id"]}, **_session(session)
                    )
                    receipt = None
                    if replay.get("receipt_id") and ObjectId.is_valid(replay["receipt_id"]):
                        receipt = await db.finance_receipts.find_one(
                            {"_id": ObjectId(replay["receipt_id"])}, **_session(session)
                        )
                    return {
                        "report": current,
                        "resolution": replay,
                        "receipt": receipt,
                        "idempotent_replay": True,
                    }
                stored = await db.finance_card_payment_reports.find_one(
                    {"_id": report["_id"]}, **_session(session)
                )
                if not stored:
                    raise ValueError("Payment report no longer exists")
                if stored.get("status") != "unresolved":
                    raise ValueError("Payment report has already been resolved")
                student = await db.students.find_one(
                    {"_id": ObjectId(stored["student_id"]), "status": {"$ne": "archived"}},
                    **_session(session),
                )
                if not student:
                    raise ValueError("Student is no longer available")
                receipt_result = None
                if payload.decision == CardPaymentDecision.CONFIRM:
                    receipt_result = await record_card_transfer_receipt(
                        db, student, stored, actor, session
                    )
                now = datetime.utcnow()
                new_status = (
                    "confirmed"
                    if payload.decision == CardPaymentDecision.CONFIRM
                    else "rejected"
                )
                receipt = receipt_result["receipt"] if receipt_result else None
                update = await db.finance_card_payment_reports.update_one(
                    {"_id": stored["_id"], "status": "unresolved", "revision": stored.get("revision", 1)},
                    {"$set": {
                        "status": new_status,
                        "resolved_at": now,
                        "resolved_by": str(actor["_id"]),
                        "resolved_by_name": actor.get("full_name"),
                        "resolution_reason": payload.reason.strip() if payload.reason else None,
                        "receipt_id": str(receipt["_id"]) if receipt else None,
                    }, "$inc": {"revision": 1}},
                    **_session(session),
                )
                if update.modified_count != 1:
                    raise ValueError("Payment report changed concurrently; reload before resolving")
                resolution = {
                    "payment_report_id": str(stored["_id"]),
                    "decision": payload.decision.value,
                    "reason": payload.reason.strip() if payload.reason else None,
                    "receipt_id": str(receipt["_id"]) if receipt else None,
                    "idempotency_key": payload.idempotency_key,
                    "created_by": str(actor["_id"]),
                    "created_at": now,
                    "immutable": True,
                }
                inserted = await db.finance_card_payment_resolutions.insert_one(
                    resolution, **_session(session)
                )
                resolution["_id"] = inserted.inserted_id
                updated = await db.finance_card_payment_reports.find_one(
                    {"_id": stored["_id"]}, **_session(session)
                )
                return {
                    "report": updated,
                    "resolution": resolution,
                    "receipt": receipt,
                    "allocations": receipt_result.get("allocations", []) if receipt_result else [],
                    "advance_amount_uzs": receipt_result.get("advance_amount_uzs", 0) if receipt_result else 0,
                    "idempotent_replay": False,
                }
    except DuplicateKeyError as exc:
        current = await db.finance_card_payment_reports.find_one({"_id": report["_id"]})
        if current and current.get("status") != "unresolved":
            raise ValueError("Payment report has already been resolved") from exc
        raise ValueError("Payment confirmation changed concurrently; reload and retry") from exc
    except OperationFailure as exc:
        current = await db.finance_card_payment_reports.find_one({"_id": report["_id"]})
        if current and current.get("status") != "unresolved":
            raise ValueError("Payment report has already been resolved") from exc
        if _is_transient_transaction_conflict(exc):
            raise ValueError(
                "Payment confirmation changed concurrently; reload and retry"
            ) from exc
        raise RuntimeError(
            "Payment confirmation requires transaction support; nothing was changed"
        ) from exc


def _tashkent_display(value: datetime) -> str:
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return aware.astimezone(ZoneInfo(ACADEMY_TIMEZONE)).strftime("%Y-%m-%d %H:%M")


async def _notify_user(db, *, user: dict, report: dict, event: str, title: str, message: str) -> None:
    notification_key = {
        "payment_report_id": str(report["_id"]),
        "user_id": str(user["_id"]),
        "event": event,
    }
    existing = await db.finance_card_payment_notifications.find_one(notification_key)
    if existing:
        return
    delivery = {
        **notification_key,
        "in_app": "pending",
        "telegram": "not_linked",
        "created_at": datetime.utcnow(),
    }
    try:
        await db.finance_card_payment_notifications.insert_one(delivery)
    except DuplicateKeyError:
        return
    try:
        from routes_notifications import create_user_notification

        await create_user_notification(
            db,
            str(user["_id"]),
            title,
            message,
            event,
            {"payment_report_id": str(report["_id"]), "student_id": report["student_id"]},
            preference_key="payment_reminders",
        )
        await db.finance_card_payment_notifications.update_one(
            notification_key, {"$set": {"in_app": "sent", "in_app_sent_at": datetime.utcnow()}}
        )
    except Exception as exc:
        await db.finance_card_payment_notifications.update_one(
            notification_key,
            {"$set": {"in_app": "failed", "in_app_error": type(exc).__name__}},
        )
    if user.get("telegram_link_status") != "linked" or not user.get("telegram_chat_id"):
        return
    try:
        from telegram_service import send_telegram_message

        sent = await send_telegram_message(int(user["telegram_chat_id"]), f"{title}\n\n{message}")
        await db.finance_card_payment_notifications.update_one(
            notification_key,
            {"$set": {
                "telegram": sent.status,
                "telegram_message_id": sent.provider_message_id,
                "telegram_sent_at": datetime.utcnow(),
            }},
        )
    except Exception as exc:
        await db.finance_card_payment_notifications.update_one(
            notification_key,
            {"$set": {"telegram": "failed", "telegram_error": type(exc).__name__}},
        )


async def notify_staff_payment_report(db, report: dict) -> None:
    staff = await db.users.find({
        "role": {"$in": ["super_admin", "manager"]},
        "is_active": {"$ne": False},
        "account_status": {"$ne": "deactivated"},
    }).to_list(10_000)
    amount = f"{int(report['amount_uzs']):,}".replace(",", " ")
    message = (
        f"Reported by: {report.get('reporter_name') or report.get('parent_name') or report['student_name']} ({report.get('reporter_role') or 'parent'})\n"
        f"Student: {report['student_name']} ({report.get('student_number') or 'no ID'})\n"
        f"Amount: {amount} UZS\n"
        f"Reported payment time: {_tashkent_display(report['paid_at'])}\n"
        f"Destination: {report['provider'].title()} •••• {report['destination_last4']}\n"
        "Status: unresolved. Verify the transfer in the receiving card app."
    )
    for user in staff:
        if user.get("role") == "manager" and user.get("branch_id") != report.get("branch_id"):
            continue
        await _notify_user(
            db,
            user=user,
            report=report,
            event="card_payment_reported",
            title="Card payment needs verification",
            message=message,
        )


async def notify_reporter_resolution(db, report: dict) -> None:
    if not ObjectId.is_valid(report.get("reported_by", "")):
        return
    user = await db.users.find_one({"_id": ObjectId(report["reported_by"])})
    if not user:
        return
    amount = f"{int(report['amount_uzs']):,}".replace(",", " ")
    if report["status"] == "confirmed":
        title = "Card payment confirmed"
        message = (
            f"The {amount} UZS payment for {report['student_name']} was confirmed "
            "and applied to the official finance ledger."
        )
        event = "card_payment_confirmed"
    else:
        title = "Card payment was not confirmed"
        reason = report.get("resolution_reason") or "The transfer could not be verified."
        message = f"The {amount} UZS report for {report['student_name']} was rejected. Reason: {reason}"
        event = "card_payment_rejected"
    await _notify_user(
        db, user=user, report=report, event=event, title=title, message=message
    )
