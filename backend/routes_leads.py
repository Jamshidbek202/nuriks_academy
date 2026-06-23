"""
Routes for CRM / Lead Management
Phase 4: Lead pipeline, conversion, analytics
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from auth import get_current_user, get_password_hash

router = APIRouter(prefix="/leads", tags=["CRM"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

# Models
class LeadCreate(BaseModel):
    first_name: str
    last_name: str
    phone: str
    age: Optional[int] = None
    parent_name: Optional[str] = None
    interested_course: Optional[str] = None
    source: str
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    parent_name: Optional[str] = None
    interested_course: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    trial_lesson_date: Optional[datetime] = None
    assigned_to: Optional[str] = None

# ==================== CREATE LEAD ====================

@router.post("")
async def create_lead(
    lead_data: LeadCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create a new lead"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get next lead ID
        result = await db.counters.find_one_and_update(
            {"_id": "lead_id"},
            {"$inc": {"seq": 1}},
            return_document=True
        )
        from auth import generate_unique_id
        lead_id = generate_unique_id("LEAD", result["seq"])
        
        lead = {
            "lead_id": lead_id,
            "first_name": lead_data.first_name,
            "last_name": lead_data.last_name,
            "phone": lead_data.phone,
            "age": lead_data.age,
            "parent_name": lead_data.parent_name,
            "interested_course": lead_data.interested_course,
            "source": lead_data.source,
            "status": "new_lead",
            "notes": lead_data.notes,
            "assigned_to": str(current_user["_id"]),
            "trial_lesson_date": None,
            "converted_to_student_id": None,
            "branch_id": lead_data.branch_id or current_user.get("branch_id"),
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
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {}
        
        if status:
            query["status"] = status
        
        if source:
            query["source"] = source
        
        if assigned_to:
            query["assigned_to"] = assigned_to
        
        if branch_id:
            query["branch_id"] = branch_id
        elif current_user["role"] != "super_admin":
            query["branch_id"] = current_user.get("branch_id")
        
        leads = await db.leads.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return [serialize_doc(l) for l in leads]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{lead_id}")
async def get_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get lead by ID"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
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
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        existing = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Build update dict from non-None values
        update_data = {k: v for k, v in lead_data.dict().items() if v is not None}
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

# ==================== CONVERT LEAD TO STUDENT ====================

@router.post("/{lead_id}/convert")
async def convert_lead_to_student(
    lead_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Convert lead to student"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        if lead.get("converted_to_student_id"):
            raise HTTPException(status_code=400, detail="Lead already converted")
        
        # Get next student ID
        result = await db.counters.find_one_and_update(
            {"_id": "student_id"},
            {"$inc": {"seq": 1}},
            return_document=True
        )
        from auth import generate_student_id
        student_id = generate_student_id(result["seq"])
        
        # Create parent if parent_name exists
        parent_id = None
        parent_login = None
        if lead.get("parent_name"):
            # Normalize phone number for login (remove special characters except +)
            parent_phone = lead["phone"].replace(" ", "").replace("-", "")
            parent_login = parent_phone  # Login = phone number directly
            
            # Check if parent already exists
            existing_parent = await db.parents.find_one({"phone": lead["phone"]})
            
            if existing_parent:
                parent_id = str(existing_parent["_id"])
                # Get existing parent login
                existing_parent_user = await db.users.find_one({"_id": ObjectId(existing_parent.get("user_id"))})
                if existing_parent_user:
                    parent_login = existing_parent_user.get("login", parent_login)
            else:
                # Create parent user
                parent_names = lead["parent_name"].split()
                parent_user = {
                    "login": parent_login,  # Login = phone number
                    "password_hash": get_password_hash("Parent@2025"),
                    "email": None,
                    "phone": lead["phone"],
                    "full_name": lead["parent_name"],
                    "role": "parent",
                    "is_active": True,
                    "two_factor_enabled": False,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "branch_id": lead.get("branch_id")
                }
                parent_user_result = await db.users.insert_one(parent_user)
                
                # Create parent profile
                parent_profile = {
                    "user_id": str(parent_user_result.inserted_id),
                    "first_name": parent_names[0],
                    "last_name": parent_names[-1] if len(parent_names) > 1 else "",
                    "phone": lead["phone"],
                    "email": None,
                    "student_ids": [],
                    "created_at": datetime.utcnow()
                }
                parent_result = await db.parents.insert_one(parent_profile)
                parent_id = str(parent_result.inserted_id)
        
        # Create student user
        student_user = {
            "login": student_id.lower(),
            "password_hash": get_password_hash("Student@2025"),
            "email": None,
            "phone": lead.get("phone"),
            "full_name": f"{lead['first_name']} {lead['last_name']}",
            "role": "student",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": lead.get("branch_id")
        }
        student_user_result = await db.users.insert_one(student_user)
        
        # Get interested course ID
        course_ids = []
        if lead.get("interested_course"):
            course = await db.courses.find_one({"name": lead["interested_course"]})
            if course:
                course_ids = [str(course["_id"])]
        
        # Create student profile
        student = {
            "student_id": student_id,
            "user_id": str(student_user_result.inserted_id),
            "parent_id": parent_id,
            "first_name": lead["first_name"],
            "last_name": lead["last_name"],
            "date_of_birth": None,
            "phone": lead.get("phone"),
            "email": None,
            "photo": None,
            "address": None,
            "course_ids": course_ids,
            "group_ids": [],
            "status": "active",
            "enrollment_date": datetime.utcnow(),
            "branch_id": lead.get("branch_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        student_result = await db.students.insert_one(student)
        
        # Update parent's student list
        if parent_id:
            await db.parents.update_one(
                {"_id": ObjectId(parent_id)},
                {"$push": {"student_ids": str(student_result.inserted_id)}}
            )
        
        # Update lead status
        await db.leads.update_one(
            {"_id": ObjectId(lead_id)},
            {
                "$set": {
                    "status": "enrolled",
                    "converted_to_student_id": str(student_result.inserted_id),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        await create_audit_log(
            str(current_user["_id"]),
            "convert_lead",
            "lead",
            lead_id,
            {"student_id": student_id, "student_db_id": str(student_result.inserted_id)},
            request.client.host if request.client else None
        )
        
        return {
            "message": "Lead converted to student successfully",
            "student_id": student_id,
            "student_login": student_id.lower(),
            "student_password": "Student@2025",
            "student_db_id": str(student_result.inserted_id),
            "parent_login": parent_login,
            "parent_password": "Parent@2025" if parent_login else None
        }
        
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
        if branch_id:
            branch_query["branch_id"] = branch_id
        elif current_user["role"] != "super_admin":
            branch_query["branch_id"] = current_user.get("branch_id")
        
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
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
