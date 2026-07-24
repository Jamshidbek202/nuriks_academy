#!/usr/bin/env python3
"""Disposable end-to-end QA for phone invitations and password recovery."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
import sys

import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("APP_ENV", "finance_qa")
os.environ.setdefault("SMS_DELIVERY_MODE", "mock")
os.environ.setdefault("DISABLE_SCHEDULER", "1")
os.environ.setdefault("SECRET_KEY", "phone-auth-qa-secret-key-only")
os.environ.setdefault("OTP_RESEND_COOLDOWN_SECONDS", "15")

from auth import create_access_token, get_password_hash  # noqa: E402
from database import assert_disposable_database_name  # noqa: E402
from phone_auth import ensure_phone_auth_indexes, migrate_phone_auth_users  # noqa: E402
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


async def run() -> None:
    assert_disposable_database_name(db.name)
    await db.client.drop_database(db.name)
    await ensure_phone_auth_indexes(db)
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
        check(created["invite_delivery_status"] == "mock", "QA must use mock SMS")

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

        invite_code = await latest_code(manager_phone, "invite")
        await json_ok(
            await client.post(
                "/api/auth/invitations/accept",
                json={"phone": manager_phone, "code": invite_code, "password": NEW_PASSWORD},
            ),
            200,
            "accept manager invitation",
        )
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

        deactivate = await json_ok(
            await client.patch(
                f"/api/staff-accounts/{created['id']}/deactivate", headers=admin_headers,
            ),
            200,
            "deactivate manager",
        )
        check(deactivate["account_status"] == "deactivated", "Account must be deactivated")
        deactivated_session = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {new_login['access_token']}"},
        )
        check(deactivated_session.status_code in {401, 403}, "Deactivation must revoke access")

        forbidden_seed = await client.post(
            "/api/finance/configuration/seed-reception",
            headers=admin_headers,
            json={},
        )
        check(forbidden_seed.status_code == 410, "Temporary reception password endpoint must stay retired")

    print("PHONE_AUTH_QA_PASS manager/reception/teacher invitations, permissions, reset, replay, revocation")


if __name__ == "__main__":
    asyncio.run(run())
