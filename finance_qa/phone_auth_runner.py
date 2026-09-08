#!/usr/bin/env python3
"""Disposable end-to-end QA for phone invitations and password recovery."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import os
from pathlib import Path
import sys

import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("APP_ENV", "finance_qa")
os.environ.setdefault("TELEGRAM_DELIVERY_MODE", "mock")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "nuriksacademy_bot")
os.environ.setdefault("TELEGRAM_WEBHOOK_SECRET", "nuriks-finance-qa-webhook-secret")
os.environ.setdefault("DISABLE_SCHEDULER", "1")
os.environ.setdefault("SECRET_KEY", "phone-auth-qa-secret-key-only")
os.environ.setdefault("OTP_RESEND_COOLDOWN_SECONDS", "15")

from auth import create_access_token, get_password_hash  # noqa: E402
from database import assert_disposable_database_name  # noqa: E402
from phone_auth import ensure_phone_auth_indexes, migrate_phone_auth_users  # noqa: E402
from telegram_auth import ensure_telegram_indexes  # noqa: E402
from server import app, db  # noqa: E402


ADMIN_PHONE = "+998908488787"
ADMIN_PASSWORD = "AdminPhone@2026"
NEW_PASSWORD = "ManagerNew@2026!"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def json_ok(response: httpx.Response, expected: int, label: str) -> dict:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected HTTP {expected}, got {response.status_code}: {response.text}"
        )
    return response.json()


async def latest_code(phone: str, purpose: str) -> str:
    challenge = await db.auth_challenges.find_one(
        {"phone_normalized": phone, "purpose": purpose, "invalidated_at": None},
        sort=[("created_at", -1)],
    )
    check(bool(challenge and challenge.get("test_code")), f"Missing mock {purpose} code for {phone}")
    return challenge["test_code"]


async def connect_mock_telegram(client: httpx.AsyncClient, phone: str, telegram_id: int) -> str:
    user = await db.users.find_one({"phone_normalized": phone})
    check(bool(user), f"Missing user for Telegram connection: {phone}")
    link = await db.telegram_links.find_one(
        {"user_id": str(user["_id"]), "used_at": None, "revoked_at": None},
        sort=[("created_at", -1)],
    )
    check(bool(link and link.get("test_token")), f"Missing mock Telegram link for {phone}")
    response = await client.post(
        "/api/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": "nuriks-finance-qa-webhook-secret"},
        json={
            "update_id": telegram_id,
            "message": {
                "message_id": telegram_id,
                "text": f"/start connect_{link['test_token']}",
                "from": {"id": telegram_id, "first_name": "QA", "username": f"qa_{telegram_id}"},
                "chat": {"id": telegram_id, "type": "private"},
            },
        },
    )
    check(response.status_code == 200, f"Telegram webhook failed for {phone}: {response.text}")
    return link["test_token"]


async def run() -> None:
    assert_disposable_database_name(db.name)
    await db.client.drop_database(db.name)
    await ensure_phone_auth_indexes(db)
    await ensure_telegram_indexes(db)
    admin = {
        "login": ADMIN_PHONE,
        "phone": ADMIN_PHONE,
        "phone_normalized": ADMIN_PHONE,
        "phone_verified": True,
        "password_hash": get_password_hash(ADMIN_PASSWORD),
        "full_name": "Phone QA Super Admin",
        "role": "super_admin",
        "is_active": True,
        "account_status": "active",
        "language_preference": "en",
        "token_version": 0,
        "qa_fixture": True,
    }
    admin_result = await db.users.insert_one(admin)
    admin["_id"] = admin_result.inserted_id
    admin_token = create_access_token({
        "sub": str(admin["_id"]), "role": "super_admin", "token_version": 0,
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://phone-auth-qa") as client:
        invalid_webhook = await client.post(
            "/api/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
            json={"update_id": 1},
        )
        check(invalid_webhook.status_code == 403, "Telegram webhook must reject an invalid secret")
        provider_health = await json_ok(
            await client.get("/api/auth/telegram/provider-health", headers=admin_headers),
            200,
            "Telegram provider health",
        )
        check(provider_health["healthy"] is True, "Mock Telegram provider must report healthy")

        # A never-activated test account may be removed completely. Its
        # Telegram identity and phone number must immediately become reusable.
        disposable_phone = "+998909999991"
        disposable = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "Disposable Manager", "phone": disposable_phone, "role": "manager"},
            ),
            201,
            "create disposable manager",
        )
        await connect_mock_telegram(client, disposable_phone, 90099999991)
        await json_ok(
            await client.delete(f"/api/staff-accounts/{disposable['id']}", headers=admin_headers),
            200,
            "delete disposable manager",
        )
        check(
            await db.users.find_one({"phone_normalized": disposable_phone}) is None,
            "Deleted manager phone must be released",
        )

        telegram_reuse_phone = "+998909999992"
        telegram_reuse = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "Telegram Reuse", "phone": telegram_reuse_phone, "role": "reception"},
            ),
            201,
            "create Telegram reuse account",
        )
        await connect_mock_telegram(client, telegram_reuse_phone, 90099999991)
        await json_ok(
            await client.delete(f"/api/staff-accounts/{telegram_reuse['id']}", headers=admin_headers),
            200,
            "delete Telegram reuse account",
        )

        phone_reuse = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "Phone Reuse", "phone": disposable_phone, "role": "manager"},
            ),
            201,
            "reuse deleted manager phone",
        )
        await json_ok(
            await client.delete(f"/api/staff-accounts/{phone_reuse['id']}", headers=admin_headers),
            200,
            "delete phone reuse account",
        )

        role_phone = "+998909999993"
        role_account = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "Wrong Role Example", "phone": role_phone, "role": "manager"},
            ),
            201,
            "create account for role correction",
        )
        support_role = await json_ok(
            await client.patch(
                f"/api/staff-accounts/{role_account['id']}/role",
                headers=admin_headers,
                json={"role": "support", "reason": "Created under the wrong operational role"},
            ),
            200,
            "correct manager to support",
        )
        check(support_role["account"]["role"] == "support", "Role must change to support")
        check(
            await db.support_staff.count_documents({"user_id": role_account["id"]}) == 1,
            "Support role correction must create exactly one support profile",
        )
        reception_role = await json_ok(
            await client.patch(
                f"/api/staff-accounts/{role_account['id']}/role",
                headers=admin_headers,
                json={"role": "reception", "reason": "Correct final reception assignment"},
            ),
            200,
            "correct support to reception",
        )
        check(reception_role["account"]["role"] == "reception", "Role must change to reception")
        check(
            await db.support_staff.count_documents({"user_id": role_account["id"]}) == 0,
            "Unused support profile must be removed after role correction",
        )
        await json_ok(
            await client.delete(f"/api/staff-accounts/{role_account['id']}", headers=admin_headers),
            200,
            "delete role correction account",
        )
        delete_audit = await db.audit_logs.find_one({"resource_id": disposable["id"]})
        check(delete_audit is None, "No-trace deletion must remove the account audit trail")

        manager_phone = "+998901111111"
        created = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={
                    "full_name": "QA Manager",
                    "phone": "90 111 11 11",
                    "role": "manager",
                    "language_preference": "ru",
                },
            ),
            201,
            "create manager",
        )
        check(created["account_status"] == "pending_invite", "Manager must start pending")
        check(created["is_active"] is False, "Pending manager must not be active")
        check(created["invite_delivery_status"] == "link_ready", "QA must create a Telegram link")
        check(bool(created.get("telegram_invite_url")), "Telegram invitation URL must be returned")

        # Render can restart between account creation and activation. The
        # idempotent startup migration must preserve the pending invitation.
        await migrate_phone_auth_users(db)
        pending_after_restart = await db.users.find_one({"phone_normalized": manager_phone})
        check(
            pending_after_restart["account_status"] == "pending_invite",
            "Startup migration must preserve pending invitations",
        )
        check(pending_after_restart["is_active"] is False, "Pending account must remain inactive")

        duplicate = await client.post(
            "/api/staff-accounts",
            headers=admin_headers,
            json={"full_name": "Duplicate", "phone": "+998 90 111 11 11", "role": "reception"},
        )
        check(duplicate.status_code == 409, "Normalized duplicate phone must be rejected")

        pending_login = await client.post(
            "/api/auth/login", json={"phone": manager_phone, "password": NEW_PASSWORD},
        )
        check(pending_login.status_code in {401, 403}, "Pending account must not log in")

        manager_link_token = await connect_mock_telegram(client, manager_phone, 90011111111)
        invite_count_before_replay = await db.auth_challenges.count_documents({
            "phone_normalized": manager_phone, "purpose": "invite",
        })
        replayed_link = await client.post(
            "/api/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "nuriks-finance-qa-webhook-secret"},
            json={
                "update_id": 90011111112,
                "message": {
                    "message_id": 90011111112,
                    "text": f"/start connect_{manager_link_token}",
                    "from": {"id": 90011111112, "first_name": "Forwarded"},
                    "chat": {"id": 90011111112, "type": "private"},
                },
            },
        )
        check(replayed_link.status_code == 200, "Telegram must acknowledge a replay safely")
        linked_manager = await db.users.find_one({"phone_normalized": manager_phone})
        check(linked_manager.get("telegram_user_id") == 90011111111, "A used link must not transfer accounts")
        check(
            await db.auth_challenges.count_documents({
                "phone_normalized": manager_phone, "purpose": "invite",
            }) == invite_count_before_replay,
            "A replayed Telegram link must not issue another code",
        )
        invite_code = await latest_code(manager_phone, "invite")
        await json_ok(
            await client.post(
                "/api/auth/invitations/accept",
                json={"phone": manager_phone, "code": invite_code, "password": NEW_PASSWORD},
            ),
            200,
            "accept manager invitation",
        )
        activated_manager = await db.users.find_one({"phone_normalized": manager_phone})
        check(activated_manager.get("identity_verified_via") == "telegram", "Activation channel must be Telegram")
        check(activated_manager.get("phone_verified") is False, "Telegram must not falsely mark the phone as SMS-verified")
        replay = await client.post(
            "/api/auth/invitations/accept",
            json={"phone": manager_phone, "code": invite_code, "password": NEW_PASSWORD},
        )
        check(replay.status_code == 400, "Invitation code replay must fail")

        manager_login = await json_ok(
            await client.post(
                "/api/auth/login", json={"phone": manager_phone, "password": NEW_PASSWORD},
            ),
            200,
            "manager login",
        )
        manager_token = manager_login["access_token"]
        manager_headers = {"Authorization": f"Bearer {manager_token}"}

        forbidden_manager = await client.post(
            "/api/staff-accounts",
            headers=manager_headers,
            json={"full_name": "Forbidden Manager", "phone": "+998901111112", "role": "manager"},
        )
        check(forbidden_manager.status_code == 403, "Manager must not create another manager")

        teacher_phone = "+998902222222"
        teacher = await json_ok(
            await client.post(
                "/api/teachers",
                headers=manager_headers,
                json={
                    "first_name": "QA",
                    "last_name": "Teacher",
                    "phone": teacher_phone,
                    "specialization": [],
                    "courses": [],
                },
            ),
            200,
            "manager creates teacher",
        )
        check(teacher["account_status"] == "pending_invite", "Teacher must start pending")
        await connect_mock_telegram(client, teacher_phone, 90022222222)
        teacher_code = await latest_code(teacher_phone, "invite")
        await json_ok(
            await client.post(
                "/api/auth/invitations/accept",
                json={"phone": teacher_phone, "code": teacher_code, "password": "TeacherQA@2026!"},
            ),
            200,
            "accept teacher invitation",
        )

        reception_phone = "+998903333333"
        reception = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "QA Reception", "phone": reception_phone, "role": "reception"},
            ),
            201,
            "create reception",
        )
        check(reception["role"] == "reception", "Reception role must be retained")
        reception_user = await db.users.find_one({"phone_normalized": reception_phone})
        reception_link = await db.telegram_links.find_one({
            "user_id": str(reception_user["_id"]), "used_at": None, "revoked_at": None,
        })
        check(bool(reception_link and reception_link.get("test_token")), "Reception link must exist")
        await db.telegram_links.update_one(
            {"_id": reception_link["_id"]},
            {"$set": {"expires_at": datetime.utcnow() - timedelta(seconds=1)}},
        )
        expired_attempt = await client.post(
            "/api/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "nuriks-finance-qa-webhook-secret"},
            json={
                "update_id": 90033333333,
                "message": {
                    "message_id": 90033333333,
                    "text": f"/start connect_{reception_link['test_token']}",
                    "from": {"id": 90033333333, "first_name": "Expired"},
                    "chat": {"id": 90033333333, "type": "private"},
                },
            },
        )
        check(expired_attempt.status_code == 200, "Expired Telegram links must be safely acknowledged")
        reception_user = await db.users.find_one({"_id": reception_user["_id"]})
        check(not reception_user.get("telegram_user_id"), "Expired links must not connect an account")

        parent_phone = "+998904444444"
        lead = await json_ok(
            await client.post(
                "/api/leads",
                headers=admin_headers,
                json={
                    "first_name": "ParentManaged",
                    "last_name": "Student",
                    "phone": parent_phone,
                    "parent_name": "QA Parent",
                    "parent_phone": parent_phone,
                    "account_access_mode": "parent_only",
                    "source": "walk_in",
                },
            ),
            200,
            "create parent-managed lead",
        )
        conversion = await json_ok(
            await client.post(
                f"/api/leads/{lead['id']}/convert", headers=admin_headers,
            ),
            200,
            "convert parent-managed lead",
        )
        check(conversion["account_access_mode"] == "parent_only", "Parent ownership must be retained")
        check(conversion["student_account_status"] == "phone_required", "Child must not share the parent login")
        check(bool(conversion["telegram_invites"].get("parent")), "Parent Telegram link must be returned")
        await connect_mock_telegram(client, parent_phone, 90044444444)
        parent_code = await latest_code(parent_phone, "invite")
        await json_ok(
            await client.post(
                "/api/auth/invitations/accept",
                json={
                    "phone": parent_phone,
                    "code": parent_code,
                    "password": "ParentAccess@2026!",
                },
            ),
            200,
            "activate parent account through Telegram",
        )
        parent_login = await json_ok(
            await client.post(
                "/api/auth/login",
                json={"phone": parent_phone, "password": "ParentAccess@2026!"},
            ),
            200,
            "parent login after Telegram code",
        )
        check(parent_login["user"]["role"] == "parent", "Activated parent must retain parent role")

        # Wait out no cooldown by using the original invite only; password
        # reset runs on the already activated manager and has a separate purpose.
        await json_ok(
            await client.post(
                "/api/auth/password-reset/request", json={"phone": manager_phone},
            ),
            202,
            "request password reset",
        )
        reset_code = await latest_code(manager_phone, "password_reset")
        reset_password = "ManagerReset@2027!"
        await json_ok(
            await client.post(
                "/api/auth/password-reset/confirm",
                json={"phone": manager_phone, "code": reset_code, "password": reset_password},
            ),
            200,
            "confirm password reset",
        )
        revoked = await client.get("/api/auth/me", headers=manager_headers)
        check(revoked.status_code == 401, "Password reset must revoke old sessions")
        old_password = await client.post(
            "/api/auth/login", json={"phone": manager_phone, "password": NEW_PASSWORD},
        )
        check(old_password.status_code == 401, "Old password must stop working")
        new_login = await json_ok(
            await client.post(
                "/api/auth/login", json={"phone": manager_phone, "password": reset_password},
            ),
            200,
            "login after reset",
        )

        disconnected = await json_ok(
            await client.delete(
                "/api/auth/telegram/link",
                headers={"Authorization": f"Bearer {new_login['access_token']}"},
            ),
            200,
            "disconnect Telegram",
        )
        check(disconnected["connected"] is False, "Telegram must report disconnected")
        manager_after_disconnect = await db.users.find_one({"phone_normalized": manager_phone})
        check(not manager_after_disconnect.get("telegram_chat_id"), "Telegram chat ID must be removed")
        check(
            manager_after_disconnect.get("telegram_verified") is True,
            "Disconnecting code delivery must not erase completed account activation",
        )
        await json_ok(
            await client.post(
                "/api/auth/login", json={"phone": manager_phone, "password": reset_password},
            ),
            200,
            "phone-and-password login after Telegram disconnect",
        )

        reconnect_login = await json_ok(
            await client.post(
                "/api/auth/login", json={"phone": manager_phone, "password": reset_password},
            ),
            200,
            "login before Telegram reconnect",
        )
        await json_ok(
            await client.post(
                "/api/auth/telegram/link",
                headers={"Authorization": f"Bearer {reconnect_login['access_token']}"},
            ),
            200,
            "create reconnect link",
        )
        await connect_mock_telegram(client, manager_phone, 90011111111)
        manager_before_deactivate = await db.users.find_one({"phone_normalized": manager_phone})
        check(manager_before_deactivate.get("telegram_chat_id") == 90011111111, "Manager must reconnect")

        deactivate = await json_ok(
            await client.patch(
                f"/api/staff-accounts/{created['id']}/deactivate", headers=admin_headers,
            ),
            200,
            "deactivate manager",
        )
        check(deactivate["account_status"] == "deactivated", "Account must be deactivated")
        check(deactivate["telegram_connected"] is False, "Deactivation must report Telegram released")
        manager_after_deactivate = await db.users.find_one({"phone_normalized": manager_phone})
        check(not manager_after_deactivate.get("telegram_user_id"), "Deactivation must free Telegram identity")
        deactivated_session = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {new_login['access_token']}"},
        )
        check(deactivated_session.status_code in {401, 403}, "Deactivation must revoke access")

        permanent_delete = await json_ok(
            await client.delete(
                f"/api/staff-accounts/{created['id']}", headers=admin_headers,
            ),
            200,
            "permanently delete activated manager",
        )
        check(
            permanent_delete["deletion_mode"] == "hard_delete",
            "Activated staff must be physically removed",
        )
        deleted_manager = await db.users.find_one({"_id": activated_manager["_id"]})
        check(deleted_manager is None, "Permanent deletion must remove the user document")
        await migrate_phone_auth_users(db)
        deleted_manager = await db.users.find_one({"_id": activated_manager["_id"]})
        check(deleted_manager is None, "Startup migration must not recreate deleted users")
        removed_login = await client.post(
            "/api/auth/login", json={"phone": manager_phone, "password": reset_password},
        )
        check(removed_login.status_code == 401, "Permanently deleted staff must not log in")
        reused_manager = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={"full_name": "Reused Manager Phone", "phone": manager_phone, "role": "manager"},
            ),
            201,
            "reuse permanently deleted manager phone",
        )
        reused_delete = await json_ok(
            await client.delete(
                f"/api/staff-accounts/{reused_manager['id']}", headers=admin_headers,
            ),
            200,
            "delete replacement unactivated manager",
        )
        check(reused_delete["deletion_mode"] == "hard_delete", "Unused replacement must hard-delete")
        delete_audit = await db.audit_logs.find_one({
            "resource_id": created["id"],
        })
        check(delete_audit is None, "No-trace deletion must remove activated account audits")

        forbidden_seed = await client.post(
            "/api/finance/configuration/seed-reception",
            headers=admin_headers,
            json={},
        )
        check(forbidden_seed.status_code == 410, "Temporary reception password endpoint must stay retired")

    print("PHONE_AUTH_QA_PASS Telegram pairing, expiry, replay, roles, activation, reset, and revocation")


if __name__ == "__main__":
    asyncio.run(run())
