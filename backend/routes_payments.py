"""
Routes for Payment Management
Phase 2: Click, Payme, Cash Payments + Payment Reminders
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from auth import get_current_user

router = APIRouter(prefix="/payments", tags=["Payments"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

async def get_next_payment_id(db):
    from auth import generate_unique_id

    result = await db.counters.find_one_and_update(
        {"_id": "payment_id"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return generate_unique_id("PAY", result["seq"])

# ==================== PAYMENT MODELS ====================

class CashPaymentCreate(BaseModel):
    student_id: str
    amount: float
    payment_type: str = "monthly_fee"
    month: str  # YYYY-MM
    notes: Optional[str] = None

class PaymentResponse(BaseModel):
    id: str
    payment_id: str
    student_id: str
    amount: float
    payment_method: str
    payment_status: str
    payment_type: str
    month: Optional[str] = None
    transaction_id: Optional[str] = None
    transaction_date: Optional[datetime] = None
    received_by: str
    notes: Optional[str] = None
    created_at: datetime

class ClickPaymentInit(BaseModel):
    student_id: str
    amount: float
    payment_type: str = "monthly_fee"
    month: str
    return_url: str

class PaymePaymentInit(BaseModel):
    student_id: str
    amount: float
    payment_type: str = "monthly_fee"
    month: str
    return_url: str

# ==================== CASH PAYMENTS ====================

@router.post("/cash", response_model=PaymentResponse)
async def create_cash_payment(
    payment_data: CashPaymentCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Record cash payment (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        payment_id = await get_next_payment_id(db)
        
        # Create payment record
        payment = {
            "payment_id": payment_id,
            "student_id": payment_data.student_id,
            "amount": payment_data.amount,
            "payment_method": "cash",
            "payment_status": "completed",
            "payment_type": payment_data.payment_type,
            "month": payment_data.month,
            "transaction_id": None,
            "transaction_date": datetime.utcnow(),
            "received_by": str(current_user["_id"]),
            "notes": payment_data.notes,
            "branch_id": current_user.get("branch_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        payment_result = await db.payments.insert_one(payment)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "payment",
            str(payment_result.inserted_id),
            {"student_id": payment_data.student_id, "amount": payment_data.amount, "method": "cash"},
            request.client.host if request.client else None
        )
        
        payment["id"] = str(payment_result.inserted_id)
        return serialize_doc(payment)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CLICK INTEGRATION ====================

@router.post("/click/init")
async def init_click_payment(
    payment_data: ClickPaymentInit,
    current_user: dict = Depends(get_current_user_dep)
):
    """Initialize Click payment"""
    from server import db
    import os
    
    try:
        # Get Click credentials from environment
        click_merchant_id = os.getenv("CLICK_MERCHANT_ID", "demo")
        click_service_id = os.getenv("CLICK_SERVICE_ID", "demo")
        
        payment_id = await get_next_payment_id(db)
        
        # Create pending payment record
        payment = {
            "payment_id": payment_id,
            "student_id": payment_data.student_id,
            "amount": payment_data.amount,
            "payment_method": "click",
            "payment_status": "pending",
            "payment_type": payment_data.payment_type,
            "month": payment_data.month,
            "transaction_id": None,
            "transaction_date": None,
            "received_by": str(current_user["_id"]),
            "notes": "Click payment initiated",
            "branch_id": current_user.get("branch_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        payment_result = await db.payments.insert_one(payment)
        
        # Generate Click payment URL
        click_url = f"https://my.click.uz/services/pay?service_id={click_service_id}&merchant_id={click_merchant_id}&amount={payment_data.amount}&transaction_param={str(payment_result.inserted_id)}&return_url={payment_data.return_url}"
        
        return {
            "payment_id": payment_id,
            "payment_url": click_url,
            "merchant_trans_id": str(payment_result.inserted_id)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/click/callback")
async def click_payment_callback(request: Request):
    """Handle Click payment callback"""
    from server import db, serialize_doc
    import hashlib
    
    try:
        data = await request.json()
        
        # Verify Click signature (simplified - implement full verification in production)
        click_secret_key = os.getenv("CLICK_SECRET_KEY", "")
        
        # Get payment by merchant_trans_id
        payment_id = data.get("merchant_trans_id")
        payment = await db.payments.find_one({"_id": ObjectId(payment_id)})
        
        if not payment:
            return {"error": -5, "error_note": "Payment not found"}
        
        # Update payment based on Click response
        if data.get("error") == 0:
            # Payment successful
            await db.payments.update_one(
                {"_id": ObjectId(payment_id)},
                {
                    "$set": {
                        "payment_status": "completed",
                        "transaction_id": data.get("click_trans_id"),
                        "transaction_date": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return {"error": 0, "error_note": "Success"}
        else:
            # Payment failed
            await db.payments.update_one(
                {"_id": ObjectId(payment_id)},
                {
                    "$set": {
                        "payment_status": "failed",
                        "notes": f"Click error: {data.get('error_note')}",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return {"error": data.get("error"), "error_note": data.get("error_note")}
            
    except Exception as e:
        return {"error": -1, "error_note": str(e)}

# ==================== PAYME INTEGRATION ====================

@router.post("/payme/init")
async def init_payme_payment(
    payment_data: PaymePaymentInit,
    current_user: dict = Depends(get_current_user_dep)
):
    """Initialize Payme payment"""
    from server import db
    import os
    import base64
    
    try:
        # Get Payme credentials
        payme_merchant_id = os.getenv("PAYME_MERCHANT_ID", "demo")
        
        payment_id = await get_next_payment_id(db)
        
        # Create pending payment record
        payment = {
            "payment_id": payment_id,
            "student_id": payment_data.student_id,
            "amount": payment_data.amount,
            "payment_method": "payme",
            "payment_status": "pending",
            "payment_type": payment_data.payment_type,
            "month": payment_data.month,
            "transaction_id": None,
            "transaction_date": None,
            "received_by": str(current_user["_id"]),
            "notes": "Payme payment initiated",
            "branch_id": current_user.get("branch_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        payment_result = await db.payments.insert_one(payment)
        
        # Generate Payme payment URL
        # Amount in tiyins (1 UZS = 100 tiyins)
        amount_tiyins = int(payment_data.amount * 100)
        
        # Create Payme checkout URL
        account = base64.b64encode(f"{{\"order_id\":\"{str(payment_result.inserted_id)}\"}}".encode()).decode()
        payme_url = f"https://checkout.paycom.uz/{payme_merchant_id}?amount={amount_tiyins}&account={account}&return_url={payment_data.return_url}"
        
        return {
            "payment_id": payment_id,
            "payment_url": payme_url,
            "merchant_trans_id": str(payment_result.inserted_id)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/payme/callback")
async def payme_payment_callback(request: Request):
    """Handle Payme payment callback (Merchant API)"""
    from server import db
    
    try:
        data = await request.json()
        method = data.get("method")
        
        if method == "CheckPerformTransaction":
            # Check if transaction can be performed
            account = data.get("params", {}).get("account", {})
            order_id = account.get("order_id")
            
            payment = await db.payments.find_one({"_id": ObjectId(order_id)})
            if not payment:
                return {"error": {"code": -31050, "message": "Order not found"}}
            
            return {"result": {"allow": True}}
        
        elif method == "CreateTransaction":
            # Create transaction
            account = data.get("params", {}).get("account", {})
            order_id = account.get("order_id")
            
            await db.payments.update_one(
                {"_id": ObjectId(order_id)},
                {"$set": {"payment_status": "processing", "updated_at": datetime.utcnow()}}
            )
            
            return {
                "result": {
                    "create_time": int(datetime.utcnow().timestamp() * 1000),
                    "transaction": data.get("params", {}).get("id"),
                    "state": 1
                }
            }
        
        elif method == "PerformTransaction":
            # Perform transaction
            account = data.get("params", {}).get("account", {})
            order_id = account.get("order_id")
            
            await db.payments.update_one(
                {"_id": ObjectId(order_id)},
                {
                    "$set": {
                        "payment_status": "completed",
                        "transaction_id": data.get("params", {}).get("id"),
                        "transaction_date": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            return {
                "result": {
                    "perform_time": int(datetime.utcnow().timestamp() * 1000),
                    "transaction": data.get("params", {}).get("id"),
                    "state": 2
                }
            }
        
        elif method == "CancelTransaction":
            # Cancel transaction
            account = data.get("params", {}).get("account", {})
            order_id = account.get("order_id")
            
            await db.payments.update_one(
                {"_id": ObjectId(order_id)},
                {"$set": {"payment_status": "cancelled", "updated_at": datetime.utcnow()}}
            )
            
            return {
                "result": {
                    "cancel_time": int(datetime.utcnow().timestamp() * 1000),
                    "transaction": data.get("params", {}).get("id"),
                    "state": -1
                }
            }
        
        return {"error": {"code": -32601, "message": "Method not found"}}
        
    except Exception as e:
        return {"error": {"code": -32400, "message": str(e)}}

# ==================== PAYMENT HISTORY ====================

@router.get("/history/student/{student_id}")
async def get_student_payment_history(
    student_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get payment history for a student"""
    from server import db, serialize_doc
    
    try:
        # Check permissions (parent can only see their children's payments)
        if current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or student_id not in parent.get("student_ids", []):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "student":
            student = await db.students.find_one({"_id": ObjectId(student_id)})
            if not student or str(student["user_id"]) != str(current_user["_id"]):
                raise HTTPException(status_code=403, detail="Access denied")
        
        payments = await db.payments.find(
            {"student_id": student_id}
        ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return [serialize_doc(p) for p in payments]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_payment_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    payment_method: Optional[str] = None,
    payment_status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get payment history based on user role."""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["super_admin", "manager", "parent", "student"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        query = {}
        
        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.fromisoformat(start_date),
                "$lte": datetime.fromisoformat(end_date)
            }
        
        if payment_method:
            query["payment_method"] = payment_method
        
        if payment_status:
            query["payment_status"] = payment_status
        
        if current_user["role"] == "manager":
            query["branch_id"] = current_user.get("branch_id")
        elif current_user["role"] == "parent":
            parent = await db.parents.find_one({"user_id": str(current_user["_id"])})
            if not parent or not parent.get("student_ids"):
                return []
            query["student_id"] = {"$in": parent["student_ids"]}
        elif current_user["role"] == "student":
            student = await db.students.find_one({"user_id": str(current_user["_id"])})
            if not student:
                return []
            query["student_id"] = str(student["_id"])
        
        payments = await db.payments.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return [serialize_doc(p) for p in payments]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PAYMENT REMINDERS ====================

@router.get("/unpaid")
async def get_unpaid_students(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get students with unpaid monthly fees"""
    from server import db, serialize_doc
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        # Get current month
        current_month = datetime.utcnow().strftime("%Y-%m")
        
        # Get all active students
        branch_query = {}
        if current_user["role"] != "super_admin":
            branch_query["branch_id"] = current_user.get("branch_id")
        
        students = await db.students.find({**branch_query, "status": "active"}).to_list(1000)
        
        unpaid_students = []
        for student in students:
            # Check if student has payment for current month
            payment = await db.payments.find_one({
                "student_id": str(student["_id"]),
                "month": current_month,
                "payment_status": "completed"
            })
            
            if not payment:
                student_data = serialize_doc(student)
                unpaid_students.append(student_data)
        
        return unpaid_students
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import os
