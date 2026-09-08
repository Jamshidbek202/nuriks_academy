"""Consistent, retry-safe lifecycle operations for student accounts."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from account_integrity import delete_user_personal_data


class StudentLifecycleConflict(Exception):
    """Raised when linked student/account data is unsafe to change."""


def _user_object_id(student: Dict[str, Any]) -> Optional[ObjectId]:
    user_id = student.get("user_id")
    if not user_id or not ObjectId.is_valid(str(user_id)):
        return None
    return ObjectId(str(user_id))


async def _linked_student_user(db, student: Dict[str, Any]):
    user_object_id = _user_object_id(student)
    if user_object_id is None:
        return None

    user = await db.users.find_one({"_id": user_object_id})
    if user and user.get("role") != "student":
        raise StudentLifecycleConflict(
            "The linked account is not a student account. Repair the user link before continuing."
        )
    return user


async def archive_student_account(
    db,
    student: Dict[str, Any],
    archived_by: str,
) -> Dict[str, Any]:
    """Archive a profile, deactivate its login, and preserve academic history."""
    student_id = str(student["_id"])
    now = datetime.utcnow()
    user = await _linked_student_user(db, student)

    stored_group_ids = {
        str(group_id)
        for group_id in student.get("group_ids", [])
        if ObjectId.is_valid(str(group_id))
    }
    linked_groups = await db.groups.find(
        {"student_ids": student_id}, {"_id": 1}
    ).to_list(1000)
    stored_group_ids.update(str(group["_id"]) for group in linked_groups)

    if student.get("status") != "archived":
        # Deactivate first: a partial failure must never leave an archived
        # profile with a login that can still authenticate.
        if user:
            await db.users.update_one(
                {"_id": user["_id"], "role": "student"},
                {"$set": {
                    "is_active": False,
                    "deactivated_at": now,
                    "deactivated_reason": "student_archived",
                    "updated_at": now,
                }},
            )

        await db.students.update_one(
            {"_id": student["_id"], "status": {"$ne": "archived"}},
            {"$set": {
                "status": "archived",
                "pre_archive_status": student.get("status") or "active",
                "account_was_active_before_archive": bool(user and user.get("is_active", True)),
                "archived_group_ids": sorted(stored_group_ids),
                "group_ids": [],
                "archived_at": now,
                "archived_by": archived_by,
                "updated_at": now,
            }},
        )
    elif user and user.get("is_active", True):
        # Make retries repair legacy/partially archived records as well.
        await db.users.update_one(
            {"_id": user["_id"], "role": "student"},
            {"$set": {
                "is_active": False,
                "deactivated_at": now,
                "deactivated_reason": "student_archived",
                "updated_at": now,
            }},
        )

    # Group membership is operational state, not academic history. Tests,
    # homework, attendance, payments, and journal records remain untouched.
    await db.groups.update_many(
        {"student_ids": student_id},
        {"$pull": {"student_ids": student_id}},
    )

    return {
        "status": "archived",
        "account_active": False,
        "linked_account_found": user is not None,
    }


async def restore_student_account(
    db,
    student: Dict[str, Any],
    restored_by: str,
) -> Dict[str, Any]:
    """Restore an archived profile and its linked login account."""
    if student.get("status") != "archived":
        return {"status": student.get("status", "active"), "already_restored": True}

    user = await _linked_student_user(db, student)
    if not user:
        raise StudentLifecycleConflict(
            "The student has no linked login account. Repair the account link before restoring."
        )

    student_id = str(student["_id"])
    archived_group_ids = [
        str(group_id)
        for group_id in student.get("archived_group_ids", [])
        if ObjectId.is_valid(str(group_id))
    ]
    valid_group_ids: List[str] = []
    if archived_group_ids:
        groups = await db.groups.find(
            {"_id": {"$in": [ObjectId(group_id) for group_id in archived_group_ids]}},
            {"_id": 1},
        ).to_list(1000)
        valid_group_ids = [str(group["_id"]) for group in groups]
        await db.groups.update_many(
            {"_id": {"$in": [ObjectId(group_id) for group_id in valid_group_ids]}},
            {"$addToSet": {"student_ids": student_id}},
        )

    previous_status = student.get("pre_archive_status", "active")
    if previous_status not in {"active", "frozen", "graduated"}:
        previous_status = "active"
    now = datetime.utcnow()

    await db.students.update_one(
        {"_id": student["_id"], "status": "archived"},
        {"$set": {
            "status": previous_status,
            "group_ids": valid_group_ids,
            "restored_at": now,
            "restored_by": restored_by,
            "updated_at": now,
        }},
    )

    should_reactivate = student.get("account_was_active_before_archive", True)
    if should_reactivate:
        await db.users.update_one(
            {"_id": user["_id"], "role": "student"},
            {
                "$set": {"is_active": True, "updated_at": now},
                "$unset": {"deactivated_at": "", "deactivated_reason": ""},
            },
        )

    return {
        "status": previous_status,
        "account_active": bool(should_reactivate),
        "restored_group_count": len(valid_group_ids),
    }


async def permanently_delete_student_account(
    db,
    student: Dict[str, Any],
) -> Dict[str, Any]:
    """Hard-delete a student identity and every student-owned record atomically."""
    student_id = str(student["_id"])
    user_object_id = _user_object_id(student)
    deleted_documents = 0
    parent_deleted = False

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            fresh_student = await db.students.find_one({"_id": student["_id"]}, session=session)
            if not fresh_student:
                return {
                    "deleted": True,
                    "linked_account_deleted": False,
                    "parent_account_deleted": False,
                    "already_deleted": True,
                    "deleted_documents": 0,
                }
            user = None
            if user_object_id:
                user = await db.users.find_one({"_id": user_object_id}, session=session)
                if user and user.get("role") != "student":
                    raise StudentLifecycleConflict(
                        "The linked account is not a student account. Repair the user link before continuing."
                    )
            user_id = str(user["_id"]) if user else None

            invoices = await db.finance_invoices.find(
                {"student_id": student_id}, {"_id": 1}, session=session
            ).to_list(100_000)
            invoice_ids = [str(row["_id"]) for row in invoices]
            receipts = await db.finance_receipts.find(
                {"student_id": student_id}, {"_id": 1, "cash_shift_id": 1, "amount_uzs": 1, "status": 1},
                session=session,
            ).to_list(100_000)
            receipt_ids = [str(row["_id"]) for row in receipts]
            reports = await db.finance_card_payment_reports.find(
                {"student_id": student_id}, {"_id": 1}, session=session
            ).to_list(100_000)
            report_ids = [str(row["_id"]) for row in reports]
            allocations = await db.finance_allocations.find({
                "$or": [
                    {"student_id": student_id},
                    {"invoice_id": {"$in": invoice_ids}},
                    {"source_receipt_id": {"$in": receipt_ids}},
                ],
            }, {"_id": 1}, session=session).to_list(100_000)
            allocation_ids = [str(row["_id"]) for row in allocations]

            await db.groups.update_many(
                {"student_ids": student_id}, {"$pull": {"student_ids": student_id}}, session=session
            )
            await db.parents.update_many(
                {"student_ids": student_id}, {"$pull": {"student_ids": student_id}}, session=session
            )
            await db.tests.update_many(
                {"results.student_id": student_id},
                {"$pull": {"results": {"student_id": student_id}}},
                session=session,
            )
            await db.homework.update_many(
                {"submissions.student_id": student_id},
                {"$pull": {"submissions": {"student_id": student_id}}},
                session=session,
            )
            await db.teacher_journal.update_many(
                {"student_performance.student_id": student_id},
                {"$pull": {"student_performance": {"student_id": student_id}}},
                session=session,
            )

            direct_student_collections = (
                "attendance",
                "attendance_records",
                "test_results",
                "lesson_feedback",
                "payments",
                "certificates",
                "support_bookings",
                "group_memberships",
                "finance_invoices",
                "finance_receipts",
                "finance_credit_lots",
                "finance_invoice_adjustments",
                "finance_freeze_recommendations",
                "student_finance_freeze_periods",
                "finance_freeze_override_events",
                "finance_notification_jobs",
                "finance_card_payment_reports",
            )
            for collection_name in direct_student_collections:
                result = await db[collection_name].delete_many(
                    {"student_id": student_id}, session=session
                )
                deleted_documents += result.deleted_count

            result = await db.finance_discount_entitlements.delete_many({
                "$or": [
                    {"student_id": student_id},
                    {"referred_student_id": student_id},
                ],
            }, session=session)
            deleted_documents += result.deleted_count
            if invoice_ids:
                result = await db.finance_invoice_lines.delete_many(
                    {"invoice_id": {"$in": invoice_ids}}, session=session
                )
                deleted_documents += result.deleted_count
                result = await db.finance_invoice_reversals.delete_many({
                    "$or": [
                        {"invoice_id": {"$in": invoice_ids}},
                        {"replacement_invoice_id": {"$in": invoice_ids}},
                    ],
                }, session=session)
                deleted_documents += result.deleted_count
            if receipt_ids:
                result = await db.finance_receipt_reversals.delete_many(
                    {"receipt_id": {"$in": receipt_ids}}, session=session
                )
                deleted_documents += result.deleted_count
                result = await db.cash_events.delete_many(
                    {"source_id": {"$in": receipt_ids}}, session=session
                )
                deleted_documents += result.deleted_count
                cash_by_shift: Dict[str, int] = {}
                for receipt in receipts:
                    if (
                        receipt.get("cash_shift_id")
                        and receipt.get("status", "posted") == "posted"
                    ):
                        shift_id = str(receipt["cash_shift_id"])
                        cash_by_shift[shift_id] = cash_by_shift.get(shift_id, 0) + int(
                            receipt.get("amount_uzs", 0)
                        )
                for shift_id, removed_amount in cash_by_shift.items():
                    if not ObjectId.is_valid(shift_id) or removed_amount <= 0:
                        continue
                    shift = await db.cash_shifts.find_one(
                        {"_id": ObjectId(shift_id)}, session=session
                    )
                    if not shift:
                        continue
                    increments = {"receipt_total_uzs": -removed_amount}
                    if "expected_closing_balance_uzs" in shift:
                        increments["expected_closing_balance_uzs"] = -removed_amount
                    if "discrepancy_uzs" in shift:
                        increments["discrepancy_uzs"] = removed_amount
                    await db.cash_shifts.update_one(
                        {"_id": shift["_id"]}, {"$inc": increments}, session=session
                    )
            if allocation_ids:
                result = await db.finance_allocation_reversals.delete_many(
                    {"allocation_id": {"$in": allocation_ids}}, session=session
                )
                deleted_documents += result.deleted_count
            result = await db.finance_allocations.delete_many({
                "$or": [
                    {"student_id": student_id},
                    {"invoice_id": {"$in": invoice_ids}},
                    {"source_receipt_id": {"$in": receipt_ids}},
                ],
            }, session=session)
            deleted_documents += result.deleted_count
            if report_ids:
                result = await db.finance_card_payment_resolutions.delete_many(
                    {"payment_report_id": {"$in": report_ids}}, session=session
                )
                deleted_documents += result.deleted_count
                result = await db.finance_card_payment_notifications.delete_many(
                    {"payment_report_id": {"$in": report_ids}}, session=session
                )
                deleted_documents += result.deleted_count

            # Remove the converted CRM record as part of a no-trace deletion.
            lead_query = {"converted_to_student_id": student_id}
            if fresh_student.get("source_lead_id") and ObjectId.is_valid(fresh_student["source_lead_id"]):
                lead_query = {"$or": [
                    lead_query,
                    {"_id": ObjectId(fresh_student["source_lead_id"])},
                ]}
            result = await db.leads.delete_many(lead_query, session=session)
            deleted_documents += result.deleted_count

            if user_id:
                personal = await delete_user_personal_data(db, user_id, session=session)
                deleted_documents += personal["personal_documents_deleted"]

            # Student-owned audit and notification rows must also disappear for
            # legacy profiles that have already lost their user link.
            result = await db.audit_logs.delete_many({
                "$or": [
                    {"resource_id": student_id},
                    {"changes.student_db_id": student_id},
                    {"changes.student_id": fresh_student.get("student_id")},
                ],
            }, session=session)
            deleted_documents += result.deleted_count
            result = await db.notifications.delete_many({
                "$or": [
                    {"student_id": student_id},
                    {"data.student_id": student_id},
                    {"data.student_db_id": student_id},
                ],
            }, session=session)
            deleted_documents += result.deleted_count

            # Remove a parent identity only when this was their final child.
            parent_id = fresh_student.get("parent_id")
            if parent_id and ObjectId.is_valid(str(parent_id)):
                parent = await db.parents.find_one({"_id": ObjectId(str(parent_id))}, session=session)
                if parent and not parent.get("student_ids"):
                    parent_user_id = str(parent.get("user_id") or "")
                    if ObjectId.is_valid(parent_user_id):
                        parent_personal = await delete_user_personal_data(
                            db, parent_user_id, session=session
                        )
                        deleted_documents += parent_personal["personal_documents_deleted"]
                        parent_user_result = await db.users.delete_one(
                            {"_id": ObjectId(parent_user_id), "role": "parent"}, session=session
                        )
                        deleted_documents += parent_user_result.deleted_count
                    parent_result = await db.parents.delete_one(
                        {"_id": parent["_id"]}, session=session
                    )
                    deleted_documents += parent_result.deleted_count
                    parent_deleted = parent_result.deleted_count == 1

            student_result = await db.students.delete_one(
                {"_id": fresh_student["_id"]}, session=session
            )
            if student_result.deleted_count != 1:
                raise StudentLifecycleConflict(
                    "The student changed; permanent deletion was cancelled."
                )
            deleted_documents += 1
            account_deleted = False
            if user:
                user_result = await db.users.delete_one(
                    {"_id": user["_id"], "role": "student"}, session=session
                )
                account_deleted = user_result.deleted_count == 1
                deleted_documents += user_result.deleted_count

    return {
        "deleted": True,
        "linked_account_deleted": account_deleted,
        "parent_account_deleted": parent_deleted,
        "deleted_documents": deleted_documents,
    }


async def reconcile_archived_student_accounts(db) -> Dict[str, int]:
    """Deactivate linked accounts for legacy archived students; safe to rerun."""
    archived_students = await db.students.find(
        {"status": "archived"}, {"user_id": 1}
    ).to_list(100000)
    user_ids = {
        ObjectId(str(student["user_id"]))
        for student in archived_students
        if student.get("user_id") and ObjectId.is_valid(str(student["user_id"]))
    }
    if not user_ids:
        return {"archived_students": len(archived_students), "accounts_deactivated": 0}

    now = datetime.utcnow()
    result = await db.users.update_many(
        {
            "_id": {"$in": list(user_ids)},
            "role": "student",
            "is_active": {"$ne": False},
        },
        {"$set": {
            "is_active": False,
            "deactivated_at": now,
            "deactivated_reason": "student_archived",
            "updated_at": now,
        }},
    )
    return {
        "archived_students": len(archived_students),
        "accounts_deactivated": result.modified_count,
    }
