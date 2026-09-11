"""
Routes for CRM / Lead Management
Phase 4: Lead pipeline, conversion, analytics
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from auth import get_current_user
from phone_auth import (
    OtpDeliveryError, OtpRateLimitError, PhoneValidationError,
    invited_user_document, issue_invitation, normalize_phone,
    phone_required_user_document,
)
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure

router = APIRouter(prefix="/leads", tags=["CRM"])
security = HTTPBearer()
LEAD_OPERATION_ROLES = {"super_admin", "manager", "reception"}

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)


def require_lead_access(current_user: dict, lead: dict):
    """Restrict managers to CRM records belonging to their own branch."""
    if current_user.get("role") not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if (
        current_user.get("role") != "super_admin"
        and lead.get("branch_id") != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Lead belongs to another branch")

# Models
class LeadCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str = Field(..., min_length=5, max_length=30)
    age: Optional[int] = Field(None, ge=1, le=100)
    parent_name: Optional[str] = Field(None, max_length=200)
    parent_phone: Optional[str] = Field(None, min_length=5, max_length=30)
    account_access_mode: Optional[Literal["student_only", "parent_only", "separate"]] = None
    interested_course: Optional[str] = None
    source: Literal["instagram", "telegram", "facebook", "tiktok", "referral", "banner", "walk_in", "website", "other"]
    notes: Optional[str] = Field(None, max_length=5000)
    branch_id: Optional[str] = None
    referred_by_student_id: Optional[str] = None

class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = Field(None, ge=1, le=100)
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    account_access_mode: Optional[Literal["student_only", "parent_only", "separate"]] = None
    interested_course: Optional[str] = None
    source: Optional[Literal["instagram", "telegram", "facebook", "tiktok", "referral", "banner", "walk_in", "website", "other"]] = None
    status: Optional[Literal["new_lead", "contacted", "trial_scheduled", "trial_completed", "negotiation", "enrolled", "lost"]] = None
    notes: Optional[str] = None
    trial_lesson_date: Optional[datetime] = None
    assigned_to: Optional[str] = None
    referred_by_student_id: Optional[str] = None


def lead_access_mode(lead: dict) -> str:
    """Resolve older leads without changing their established account ownership."""
    return lead.get("account_access_mode") or (
        "parent_only" if lead.get("parent_name") else "student_only"
    )


def validate_lead_access_fields(lead: dict) -> tuple[str, str, Optional[str]]:
    """Return the mode and normalized login phones before any account is written."""
    mode = lead_access_mode(lead)
    try:
        contact_phone = normalize_phone(lead["phone"])
    except PhoneValidationError as error:
        raise HTTPException(status_code=400, detail=f"Contact phone: {error}") from error

    if mode in {"parent_only", "separate"} and not lead.get("parent_name"):
        raise HTTPException(
            status_code=400,
            detail="Parent name is required when the parent receives account access",
        )

    parent_phone = None
    if mode == "parent_only":
        raw_parent_phone = lead.get("parent_phone") or lead["phone"]
        try:
            parent_phone = normalize_phone(raw_parent_phone)
        except PhoneValidationError as error:
            raise HTTPException(status_code=400, detail=f"Parent phone: {error}") from error
    elif mode == "separate":
        if not lead.get("parent_phone"):
            raise HTTPException(
                status_code=400,
                detail="Parent phone is required for separate student and parent accounts",
            )
        try:
            parent_phone = normalize_phone(lead["parent_phone"])
        except PhoneValidationError as error:
            raise HTTPException(status_code=400, detail=f"Parent phone: {error}") from error
        if parent_phone == contact_phone:
            raise HTTPException(
                status_code=409,
                detail="Student and parent accounts need different phone numbers",
            )

    return mode, contact_phone, parent_phone

# ==================== CREATE LEAD ====================

@router.post("")
async def create_lead(
    lead_data: LeadCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new lead"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if (
        current_user["role"] != "super_admin"
        and lead_data.branch_id
        and lead_data.branch_id != current_user.get("branch_id")
    ):
        raise HTTPException(status_code=403, detail="Cannot create a lead for another branch")
    
    try:
        target_branch_id = lead_data.branch_id or current_user.get("branch_id")
        if lead_data.referred_by_student_id:
            referrer = None
            if ObjectId.is_valid(lead_data.referred_by_student_id):
                referrer = await db.students.find_one({
                    "_id": ObjectId(lead_data.referred_by_student_id),
                    "status": {"$ne": "archived"},
                })
            if not referrer:
                raise HTTPException(status_code=404, detail="Referring student not found")
            if target_branch_id and referrer.get("branch_id") != target_branch_id:
                raise HTTPException(status_code=409, detail="Referring student belongs to another branch")
        account_access_mode, contact_phone, parent_phone = validate_lead_access_fields(
            lead_data.model_dump()
        )

        # Get next lead ID
        result = await db.counters.find_one_and_update(
            {"_id": "lead_id"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        from auth import generate_unique_id
        lead_id = generate_unique_id("LEAD", result["seq"])
        
        lead = {
            "lead_id": lead_id,
            "first_name": lead_data.first_name,
            "last_name": lead_data.last_name,
            "phone": contact_phone,
            "age": lead_data.age,
            "parent_name": lead_data.parent_name,
            "parent_phone": parent_phone,
            "account_access_mode": account_access_mode,
            "interested_course": lead_data.interested_course,
            "source": lead_data.source,
            "status": "new_lead",
            "notes": lead_data.notes,
            "assigned_to": str(current_user["_id"]),
            "trial_lesson_date": None,
            "converted_to_student_id": None,
            "branch_id": (
                target_branch_id
                if current_user["role"] == "super_admin"
                else current_user.get("branch_id")
            ),
            "referred_by_student_id": lead_data.referred_by_student_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        lead_result = await db.leads.insert_one(lead)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "lead",
            str(lead_result.inserted_id),
            {"lead_id": lead_id, "name": f"{lead_data.first_name} {lead_data.last_name}"},
            request.client.host if request.client else None
        )
        
        lead["id"] = str(lead_result.inserted_id)
        return serialize_doc(lead)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GET LEADS ====================

@router.get("")
async def get_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    branch_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all leads with filters"""
    from server import db, serialize_doc
    
    if current_user["role"] not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {}
        
        if status:
            query["status"] = status
        
        if source:
            query["source"] = source
        
        if assigned_to:
            query["assigned_to"] = assigned_to
        
        if current_user["role"] != "super_admin":
            if branch_id and branch_id != current_user.get("branch_id"):
                raise HTTPException(status_code=403, detail="Cannot view another branch's leads")
            query["branch_id"] = current_user.get("branch_id")
        elif branch_id:
            query["branch_id"] = branch_id
        
        leads = await db.leads.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return [serialize_doc(l) for l in leads]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{lead_id}")
async def get_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get lead by ID"""
    from server import db, serialize_doc
    
    if current_user["role"] not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not ObjectId.is_valid(lead_id):
            raise HTTPException(status_code=404, detail="Lead not found")
        lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        require_lead_access(current_user, lead)
        
        return serialize_doc(lead)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== UPDATE LEAD ====================

@router.put("/{lead_id}")
async def update_lead(
    lead_id: str,
    lead_data: LeadUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update lead"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not ObjectId.is_valid(lead_id):
            raise HTTPException(status_code=404, detail="Lead not found")
        existing = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Lead not found")
        require_lead_access(current_user, existing)
        
        # Build update dict from non-None values
        update_data = {k: v for k, v in lead_data.dict().items() if v is not None}
        if update_data.get("status") == "enrolled" and not existing.get("converted_to_student_id"):
            raise HTTPException(status_code=409, detail="Use Convert to Student before marking a lead enrolled")
        if update_data.get("referred_by_student_id"):
            referrer_id = update_data["referred_by_student_id"]
            referrer = None
            if ObjectId.is_valid(referrer_id):
                referrer = await db.students.find_one({
                    "_id": ObjectId(referrer_id), "status": {"$ne": "archived"}
                })
            if not referrer:
                raise HTTPException(status_code=404, detail="Referring student not found")
            if existing.get("branch_id") and referrer.get("branch_id") != existing.get("branch_id"):
                raise HTTPException(status_code=409, detail="Referring student belongs to another branch")
        update_data["updated_at"] = datetime.utcnow()
        
        await db.leads.update_one(
            {"_id": ObjectId(lead_id)},
            {"$set": update_data}
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "update",
            "lead",
            lead_id,
            update_data,
            request.client.host if request.client else None
        )
        
        updated = await db.leads.find_one({"_id": ObjectId(lead_id)})
        return serialize_doc(updated)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DELETE LEAD ====================

@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Delete an unconverted lead (Manager or Super Admin)."""
    from server import db, create_audit_log

    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        if not ObjectId.is_valid(lead_id):
            raise HTTPException(status_code=404, detail="Lead not found")
        lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        require_lead_access(current_user, lead)

        if lead.get("converted_to_student_id") or lead.get("status") == "enrolled":
            raise HTTPException(
                status_code=409,
                detail="Converted leads cannot be deleted because they are linked to a student record",
            )

        result = await db.leads.delete_one({
            "_id": lead["_id"],
            "converted_to_student_id": None,
        })
        if result.deleted_count != 1:
            raise HTTPException(status_code=409, detail="Lead changed and was not deleted")

        await create_audit_log(
            str(current_user["_id"]),
            "delete",
            "lead",
            lead_id,
            {
                "lead_id": lead.get("lead_id"),
                "name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
            },
            request.client.host if request.client else None,
        )
        return {"message": "Lead deleted successfully", "deleted": True}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CONVERT LEAD TO STUDENT ====================

@router.post("/{lead_id}/convert")
async def convert_lead_to_student(
    lead_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Atomically convert one lead into exactly one canonical student account."""
    from server import db
    
    if current_user["role"] not in LEAD_OPERATION_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not ObjectId.is_valid(lead_id):
            raise HTTPException(status_code=404, detail="Lead not found")

        invitation_users: list[dict] = []
        parent_account_status = None
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                lead = await db.leads.find_one({"_id": ObjectId(lead_id)}, session=session)
                if not lead:
                    raise HTTPException(status_code=404, detail="Lead not found")
                require_lead_access(current_user, lead)
                if lead.get("converted_to_student_id"):
                    raise HTTPException(status_code=409, detail="Lead already converted")

                existing_conversion = await db.students.find_one(
                    {"source_lead_id": lead_id}, session=session
                )
                if existing_conversion:
                    raise HTTPException(status_code=409, detail="Lead already converted")

                student_branch_id = lead.get("branch_id") or current_user.get("branch_id")
                account_access_mode, contact_phone, parent_phone = validate_lead_access_fields(lead)
                student_login_phone = (
                    contact_phone if account_access_mode in {"student_only", "separate"} else None
                )

                course_ids = []
                if lead.get("interested_course"):
                    course = await db.courses.find_one({
                        "name": lead["interested_course"],
                        "is_active": {"$ne": False},
                    }, session=session)
                    if not course:
                        raise HTTPException(
                            status_code=409,
                            detail="The lead's selected course is no longer active. Update the lead before conversion.",
                        )
                    course_ids = [str(course["_id"])]

                existing_parent_user = None
                if parent_phone:
                    existing_parent_user = await db.users.find_one(
                        {"phone_normalized": parent_phone}, session=session
                    )
                    if existing_parent_user and existing_parent_user.get("role") != "parent":
                        raise HTTPException(status_code=409, detail="Parent phone is already used by another account")
                if student_login_phone and await db.users.find_one(
                    {"phone_normalized": student_login_phone}, session=session
                ):
                    raise HTTPException(status_code=409, detail="Student phone is already used by another account")

                counter = await db.counters.find_one_and_update(
                    {"_id": "student_id"},
                    {"$inc": {"seq": 1}},
                    upsert=True,
                    return_document=ReturnDocument.AFTER,
                    session=session,
                )
                from auth import generate_student_id
                student_id = generate_student_id(counter["seq"])

                parent_id = None
                if account_access_mode in {"parent_only", "separate"}:
                    existing_parent = None
                    if existing_parent_user:
                        existing_parent = await db.parents.find_one(
                            {"user_id": str(existing_parent_user["_id"])}, session=session
                        )
                    if existing_parent:
                        parent_id = str(existing_parent["_id"])
                        parent_account_status = existing_parent_user.get("account_status")
                    else:
                        parent_names = lead["parent_name"].split()
                        parent_user = existing_parent_user
                        if not parent_user:
                            parent_user = invited_user_document(
                                phone=parent_phone,
                                full_name=lead["parent_name"],
                                role="parent",
                                email=None,
                                branch_id=student_branch_id,
                                language_preference=current_user.get("language_preference", "ru"),
                                created_by=str(current_user["_id"]),
                            )
                            inserted_parent_user = await db.users.insert_one(parent_user, session=session)
                            parent_user["_id"] = inserted_parent_user.inserted_id
                        if parent_user.get("account_status") in {"pending_invite", "credentials_required"}:
                            invitation_users.append(parent_user)
                        parent_account_status = parent_user.get("account_status")
                        parent_profile = {
                            "user_id": str(parent_user["_id"]),
                            "first_name": parent_names[0],
                            "last_name": parent_names[-1] if len(parent_names) > 1 else "",
                            "phone": parent_phone,
                            "email": None,
                            "student_ids": [],
                            "branch_id": student_branch_id,
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                        }
                        parent_result = await db.parents.insert_one(parent_profile, session=session)
                        parent_id = str(parent_result.inserted_id)

                full_name = f"{lead['first_name']} {lead['last_name']}"
                student_user = (
                    invited_user_document(
                        phone=student_login_phone,
                        full_name=full_name,
                        role="student",
                        email=None,
                        branch_id=student_branch_id,
                        language_preference=current_user.get("language_preference", "ru"),
                        created_by=str(current_user["_id"]),
                    )
                    if student_login_phone
                    else phone_required_user_document(
                        login=student_id.lower(),
                        full_name=full_name,
                        role="student",
                        email=None,
                        branch_id=student_branch_id,
                        language_preference=current_user.get("language_preference", "ru"),
                        created_by=str(current_user["_id"]),
                    )
                )
                student_user_result = await db.users.insert_one(student_user, session=session)
                student_user["_id"] = student_user_result.inserted_id
                invitation_users.append(student_user)

                now = datetime.utcnow()
                student = {
                    "student_id": student_id,
                    "source_lead_id": lead_id,
                    "user_id": str(student_user_result.inserted_id),
                    "parent_id": parent_id,
                    "first_name": lead["first_name"],
                    "last_name": lead["last_name"],
                    "date_of_birth": None,
                    "phone": student_login_phone,
                    "email": None,
                    "photo": None,
                    "address": None,
                    "course_ids": course_ids,
                    "group_ids": [],
                    "status": "active",
                    "enrollment_date": now,
                    "branch_id": student_branch_id,
                    "referred_by_student_id": lead.get("referred_by_student_id"),
                    "created_at": now,
                    "updated_at": now,
                }
                student_result = await db.students.insert_one(student, session=session)
                student_db_id = str(student_result.inserted_id)
                if parent_id:
                    await db.parents.update_one(
                        {"_id": ObjectId(parent_id)},
                        {"$addToSet": {"student_ids": student_db_id}},
                        session=session,
                    )

                lead_update = await db.leads.update_one(
                    {
                        "_id": ObjectId(lead_id),
                        "$or": [
                            {"converted_to_student_id": None},
                            {"converted_to_student_id": {"$exists": False}},
                        ],
                    },
                    {"$set": {
                        "status": "enrolled",
                        "converted_to_student_id": student_db_id,
                        "updated_at": now,
                    }},
                    session=session,
                )
                if lead_update.modified_count != 1:
                    raise DuplicateKeyError("lead conversion raced with another request")
                await db.audit_logs.insert_one({
                    "user_id": str(current_user["_id"]),
                    "action": "convert_lead",
                    "resource_type": "lead",
                    "resource_id": lead_id,
                    "changes": {"student_id": student_id, "student_db_id": student_db_id},
                    "ip_address": request.client.host if request.client else None,
                    "timestamp": now,
                }, session=session)

        invite_status = {}
        credentials = {}
        for invited_user in invitation_users:
            try:
                invitation = await issue_invitation(
                    db,
                    invited_user,
                    actor_id=str(current_user["_id"]),
                    request_ip=request.client.host if request.client else None,
                )
                invite_status[invited_user["role"]] = invitation.delivery_status
                if invitation.credentials:
                    credentials[invited_user["role"]] = invitation.credentials
            except (OtpDeliveryError, OtpRateLimitError):
                invite_status[invited_user["role"]] = "failed"

        return {
            "message": "Lead converted to student successfully",
            "student_id": student_id,
            "student_db_id": student_db_id,
            "invite_delivery_status": invite_status,
            "credentials": credentials,
            "student_account_status": "active" if credentials.get("student") else student_user.get("account_status"),
            "parent_account_status": "active" if credentials.get("parent") else parent_account_status,
            "account_access_mode": account_access_mode,
        }

    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="Lead already converted") from error
    except OperationFailure as error:
        if error.code in {11000, 112, 251}:
            raise HTTPException(status_code=409, detail="Lead conversion conflicted with another request; reload the lead") from error
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CRM ANALYTICS ====================

@router.get("/analytics/dashboard")
async def get_crm_analytics(
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get CRM analytics dashboard"""
    from server import db
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        branch_query = {}
        if current_user["role"] != "super_admin":
            if branch_id and branch_id != current_user.get("branch_id"):
                raise HTTPException(status_code=403, detail="Cannot view another branch's analytics")
            branch_query["branch_id"] = current_user.get("branch_id")
        elif branch_id:
            branch_query["branch_id"] = branch_id
        
        # Total leads
        total_leads = await db.leads.count_documents(branch_query)
        
        # Leads by status
        new_leads = await db.leads.count_documents({**branch_query, "status": "new_lead"})
        contacted = await db.leads.count_documents({**branch_query, "status": "contacted"})
        trial_scheduled = await db.leads.count_documents({**branch_query, "status": "trial_scheduled"})
        trial_completed = await db.leads.count_documents({**branch_query, "status": "trial_completed"})
        negotiation = await db.leads.count_documents({**branch_query, "status": "negotiation"})
        enrolled = await db.leads.count_documents({**branch_query, "status": "enrolled"})
        lost = await db.leads.count_documents({**branch_query, "status": "lost"})
        
        # Conversion rate
        conversion_rate = (enrolled / total_leads * 100) if total_leads > 0 else 0
        
        # Leads by source
        sources = ["instagram", "telegram", "facebook", "tiktok", "referral", "banner", "walk_in", "website", "other"]
        source_performance = {}
        for source in sources:
            count = await db.leads.count_documents({**branch_query, "source": source})
            enrolled_count = await db.leads.count_documents({**branch_query, "source": source, "status": "enrolled"})
            source_performance[source] = {
                "total": count,
                "enrolled": enrolled_count,
                "conversion_rate": (enrolled_count / count * 100) if count > 0 else 0
            }
        
        return {
            "total_leads": total_leads,
            "status_breakdown": {
                "new_leads": new_leads,
                "contacted": contacted,
                "trial_scheduled": trial_scheduled,
                "trial_completed": trial_completed,
                "negotiation": negotiation,
                "enrolled": enrolled,
                "lost": lost
            },
            "conversion_rate": round(conversion_rate, 2),
            "source_performance": source_performance
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
