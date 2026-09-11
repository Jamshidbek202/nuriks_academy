#!/usr/bin/env python3
"""Disposable end-to-end QA for administrator-managed account credentials."""

from __future__ import annotations

import os
from pathlib import Path
import sys

import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("APP_ENV", "finance_qa")
os.environ.setdefault("DISABLE_SCHEDULER", "1")
os.environ.setdefault("SECRET_KEY", "managed-credentials-qa-secret-key-only")

from auth import create_access_token, get_password_hash, verify_password  # noqa: E402
from database import assert_disposable_database_name  # noqa: E402
from phone_auth import ensure_phone_auth_indexes, migrate_phone_auth_users  # noqa: E402
from server import app, db  # noqa: E402


ADMIN_PHONE = "+998908488787"
ADMIN_PASSWORD = "AdminPhone@2026"
MANAGER_PASSWORD = "ManagerPrivate@2026!"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


async def json_ok(response: httpx.Response, expected: int, label: str) -> dict:
    if response.status_code != expected:
        raise AssertionError(
            f"{label}: expected HTTP {expected}, got {response.status_code}: {response.text}"
        )
    return response.json()


async def login(client: httpx.AsyncClient, identity: str, password: str, label: str) -> dict:
    return await json_ok(
        await client.post(
            "/api/auth/login",
            json={"phone": identity, "login": identity, "password": password},
        ),
        200,
        label,
    )


async def choose_password(
    client: httpx.AsyncClient,
    token: str,
    temporary_password: str,
    new_password: str,
    label: str,
) -> None:
    await json_ok(
        await client.post(
            "/api/auth/password/change",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": temporary_password, "new_password": new_password},
        ),
        200,
        label,
    )


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
        "full_name": "Managed Credentials QA Super Admin",
        "role": "super_admin",
        "is_active": True,
        "account_status": "active",
        "language_preference": "en",
        "token_version": 0,
        "qa_fixture": True,
    }
    inserted_admin = await db.users.insert_one(admin)
    admin["_id"] = inserted_admin.inserted_id
    admin_token = create_access_token({
        "sub": str(admin["_id"]), "role": "super_admin", "token_version": 0,
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://managed-auth-qa") as client:
        retired = await client.post("/api/auth/password-reset/request", json={"phone": ADMIN_PHONE})
        check(retired.status_code == 410, "Public OTP password recovery must stay retired")
        webhook = await client.post("/api/telegram/webhook", json={"update_id": 1})
        check(webhook.status_code == 404, "Telegram webhook must not be mounted")

        manager_phone = "+998901111111"
        created = await json_ok(
            await client.post(
                "/api/staff-accounts",
                headers=admin_headers,
                json={
                    "full_name": "QA Manager",
                    "phone": manager_phone,
                    "role": "manager",
                    "language_preference": "ru",
                },
            ),
            201,
            "create manager",
        )
        credentials = created.get("credentials") or {}
        temporary_password = credentials.get("temporary_password")
        check(created["account_status"] == "active", "Manager must be active after credentials are issued")
        check(created["invite_delivery_status"] == "credentials_ready", "Credentials must be ready immediately")
        check(credentials.get("login") == manager_phone, "Manager login must use normalized phone")
        check(bool(temporary_password), "Temporary password must be returned exactly once")
        stored_manager = await db.users.find_one({"phone_normalized": manager_phone})
        check(bool(stored_manager), "Created manager must exist")
        check(temporary_password not in repr(stored_manager), "Plain temporary password must never be stored")
        check(verify_password(temporary_password, stored_manager["password_hash"]), "Stored hash must accept temporary password")

        temporary_login = await login(client, manager_phone, temporary_password, "temporary manager login")
        temporary_headers = {"Authorization": f"Bearer {temporary_login['access_token']}"}
        me = await json_ok(await client.get("/api/auth/me", headers=temporary_headers), 200, "temporary identity")
        check(me["must_change_password"] is True, "Temporary login must require password change")
        blocked = await client.get("/api/staff-accounts", headers=temporary_headers)
        check(blocked.status_code == 403, "Temporary password must not grant application access")
        check(blocked.json()["detail"]["code"] == "PASSWORD_CHANGE_REQUIRED", "Forced-change code must be stable")

        await choose_password(
            client,
            temporary_login["access_token"],
            temporary_password,
            MANAGER_PASSWORD,
            "manager chooses private password",
        )
        check((await client.get("/api/auth/me", headers=temporary_headers)).status_code == 401, "Password change must revoke old session")
        check((await client.post("/api/auth/login", json={"phone": manager_phone, "password": temporary_password})).status_code == 401, "Temporary password must stop working")
        manager_login = await login(client, manager_phone, MANAGER_PASSWORD, "manager private login")
        manager_headers = {"Authorization": f"Bearer {manager_login['access_token']}"}

        duplicate = await client.post(
            "/api/staff-accounts",
            headers=admin_headers,
            json={"full_name": "Duplicate", "phone": "+998 90 111 11 11", "role": "reception"},
        )
        check(duplicate.status_code == 409, "Normalized duplicate phone must be rejected")
        forbidden = await client.post(
            "/api/staff-accounts",
            headers=manager_headers,
            json={"full_name": "Forbidden Manager", "phone": "+998901111112", "role": "manager"},
        )
        check(forbidden.status_code == 403, "Manager must not create another manager")

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
        check(teacher["account_status"] == "active", "Teacher credentials must activate account")
        check(bool(teacher.get("credentials", {}).get("temporary_password")), "Teacher credentials must be returned")

        teacher_user = await db.users.find_one({"phone_normalized": teacher_phone})
        teacher_reset = await json_ok(
            await client.post(
                f"/api/auth/managed-credentials/{teacher_user['_id']}",
                headers=manager_headers,
            ),
            200,
            "manager resets teacher password",
        )
        check(bool(teacher_reset["credentials"]["temporary_password"]), "Manager must receive reset credentials")

        lead_phone = "+998904444444"
        lead = await json_ok(
            await client.post(
                "/api/leads",
                headers=admin_headers,
                json={
                    "first_name": "ParentManaged",
                    "last_name": "Student",
                    "phone": lead_phone,
                    "parent_name": "QA Parent",
                    "parent_phone": lead_phone,
                    "account_access_mode": "parent_only",
                    "source": "walk_in",
                },
            ),
            200,
            "create parent-managed lead",
        )
        conversion = await json_ok(
            await client.post(f"/api/leads/{lead['id']}/convert", headers=admin_headers),
            200,
            "convert parent-managed lead",
        )
        check(conversion["student_account_status"] == "active", "Student-ID account must not require phone")
        check(conversion["parent_account_status"] == "active", "Parent credentials must be active")
        check(bool(conversion["credentials"]["student"]["temporary_password"]), "Student credentials must be returned")
        check(bool(conversion["credentials"]["parent"]["temporary_password"]), "Parent credentials must be returned")
        student_login = await login(
            client,
            conversion["credentials"]["student"]["login"],
            conversion["credentials"]["student"]["temporary_password"],
            "student-ID temporary login",
        )
        check(student_login["user"]["role"] == "student", "Student-ID login must resolve student only")
        parent_login = await login(
            client,
            conversion["credentials"]["parent"]["login"],
            conversion["credentials"]["parent"]["temporary_password"],
            "parent temporary login",
        )
        check(parent_login["user"]["role"] == "parent", "Parent login must resolve parent only")
        parent_reset = await json_ok(
            await client.post(
                f"/api/students/{conversion['student_db_id']}/parent/managed-credentials",
                headers=manager_headers,
            ),
            200,
            "manager resets parent from student record",
        )
        check(bool(parent_reset["credentials"]["temporary_password"]), "Manager must receive parent reset credentials")
        check(
            (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {parent_login['access_token']}"})).status_code == 401,
            "Parent credential reset must revoke the existing parent session",
        )

        await db.users.update_one(
            {"_id": stored_manager["_id"]},
            {"$set": {
                "telegram_chat_id": 12345,
                "telegram_user_id": 12345,
                "telegram_link_status": "linked",
                "identity_verified_via": "telegram",
            }},
        )
        await migrate_phone_auth_users(db)
        migrated_manager = await db.users.find_one({"_id": stored_manager["_id"]})
        check("telegram_chat_id" not in migrated_manager, "Migration must remove obsolete Telegram identity")
        check(verify_password(MANAGER_PASSWORD, migrated_manager["password_hash"]), "Migration must preserve existing password")
        check(migrated_manager["must_change_password"] is False, "Existing user must not be forced to reset")

        reset = await json_ok(
            await client.post(f"/api/auth/managed-credentials/{created['id']}", headers=admin_headers),
            200,
            "administrator resets manager",
        )
        check(bool(reset["credentials"]["temporary_password"]), "Administrator reset must return credentials")
        check((await client.get("/api/auth/me", headers=manager_headers)).status_code == 401, "Reset must revoke manager session")

        await json_ok(
            await client.patch(f"/api/staff-accounts/{created['id']}/deactivate", headers=admin_headers),
            200,
            "deactivate manager",
        )
        deactivated_login = await client.post(
            "/api/auth/login",
            json={"phone": manager_phone, "password": reset["credentials"]["temporary_password"]},
        )
        check(deactivated_login.status_code == 403, "Deactivated manager must not log in")

    print("Managed credential QA passed: no Telegram dependency, forced private passwords, resets, roles, student IDs, migration, and revocation verified.")


if __name__ == "__main__":
    import asyncio

    asyncio.run(run())
