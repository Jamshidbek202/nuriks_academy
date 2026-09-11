"""Atomic creation of canonical login identities and role profiles."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument

from auth import generate_student_id
from phone_auth import invited_user_document, phone_required_user_document


async def create_student_account(
    db,
    *,
    data,
    branch_id: Optional[str],
    parent_phone: Optional[str],
    student_contact_phone: Optional[str],
    creator: dict,
    client_ip: Optional[str],
) -> tuple[dict, list[dict]]:
    """Create user/profile/parent links and audit as one MongoDB transaction."""
    invitation_users: list[dict] = []
    async with await db.client.start_session() as session:
        async with session.start_transaction():
            counter = await db.counters.find_one_and_update(
                {"_id": "student_id"},
                {"$inc": {"seq": 1}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
                session=session,
            )
            student_number = generate_student_id(counter["seq"])

            parent_id = None
            existing_parent_user = None
            if parent_phone:
                existing_parent_user = await db.users.find_one(
                    {"phone_normalized": parent_phone}, session=session
                )
                if existing_parent_user and existing_parent_user.get("role") != "parent":
                    raise HTTPException(
                        status_code=409,
                        detail="Parent phone is already used by another account",
                    )
                existing_parent = None
                if existing_parent_user:
                    existing_parent = await db.parents.find_one(
                        {"user_id": str(existing_parent_user["_id"])}, session=session
                    )
                if existing_parent:
                    parent_id = str(existing_parent["_id"])
                else:
                    parent_user = existing_parent_user
                    if not parent_user:
                        parent_user = invited_user_document(
                            phone=parent_phone,
                            full_name=data.parent_name or "Parent",
                            role="parent",
                            email=None,
                            branch_id=branch_id,
                            language_preference=creator.get("language_preference", "ru"),
                            created_by=str(creator["_id"]),
                        )
                        inserted = await db.users.insert_one(parent_user, session=session)
                        parent_user["_id"] = inserted.inserted_id
                    if parent_user.get("account_status") in {"pending_invite", "credentials_required"}:
                        invitation_users.append(parent_user)
                    names = (data.parent_name or "Parent").split()
                    parent_profile = {
                        "user_id": str(parent_user["_id"]),
                        "first_name": names[0],
                        "last_name": names[-1] if len(names) > 1 else "",
                        "phone": parent_phone,
                        "email": None,
                        "student_ids": [],
                        "branch_id": branch_id,
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    }
                    inserted_profile = await db.parents.insert_one(parent_profile, session=session)
                    parent_id = str(inserted_profile.inserted_id)

            auth_phone = student_contact_phone
            if auth_phone:
                duplicate = await db.users.find_one(
                    {"phone_normalized": auth_phone}, session=session
                )
                if duplicate:
                    if duplicate.get("role") == "parent" and auth_phone == parent_phone:
                        auth_phone = None
                    else:
                        raise HTTPException(
                            status_code=409,
                            detail="Student phone is already used by another account",
                        )

            full_name = f"{data.first_name} {data.last_name}"
            user = (
                invited_user_document(
                    phone=auth_phone,
                    full_name=full_name,
                    role="student",
                    email=data.email,
                    branch_id=branch_id,
                    language_preference=creator.get("language_preference", "ru"),
                    created_by=str(creator["_id"]),
                )
                if auth_phone
                else phone_required_user_document(
                    login=student_number.lower(),
                    full_name=full_name,
                    role="student",
                    email=data.email,
                    branch_id=branch_id,
                    language_preference=creator.get("language_preference", "ru"),
                    created_by=str(creator["_id"]),
                )
            )
            inserted_user = await db.users.insert_one(user, session=session)
            user["_id"] = inserted_user.inserted_id
            invitation_users.append(user)

            now = datetime.utcnow()
            student = {
                "student_id": student_number,
                "user_id": str(user["_id"]),
                "parent_id": parent_id,
                "first_name": data.first_name,
                "last_name": data.last_name,
                "date_of_birth": data.date_of_birth,
                "phone": student_contact_phone,
                "email": data.email,
                "photo": data.photo,
                "address": data.address,
                "course_ids": data.courses if data.courses else [],
                "group_ids": [],
                "status": "active",
                "enrollment_date": now,
                "branch_id": branch_id,
                "created_at": now,
                "updated_at": now,
            }
            inserted_student = await db.students.insert_one(student, session=session)
            student["_id"] = inserted_student.inserted_id
            if parent_id:
                await db.parents.update_one(
                    {"_id": ObjectId(parent_id)},
                    {"$addToSet": {"student_ids": str(student["_id"])}},
                    session=session,
                )
            await db.audit_logs.insert_one({
                "user_id": str(creator["_id"]),
                "action": "create",
                "resource_type": "student",
                "resource_id": str(student["_id"]),
                "changes": {"student_id": student_number},
                "ip_address": client_ip,
                "timestamp": now,
            }, session=session)
    return student, invitation_users
