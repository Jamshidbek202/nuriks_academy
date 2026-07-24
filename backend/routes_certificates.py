"""
Routes for Certificate Management
Phase 3: PDF Certificate Generation
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from auth import get_current_user
from academic_access import require_student_academic_read_access
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph
import io
import base64

router = APIRouter(prefix="/certificates", tags=["Certificates"])
security = HTTPBearer()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    return await get_current_user(credentials, db)

class CertificateCreate(BaseModel):
    student_id: str
    course_id: str
    certificate_type: str

# ==================== GENERATE CERTIFICATE ====================

def generate_certificate_pdf(student_name: str, course_name: str, issue_date: str, certificate_id: str):
    """Generate a beautiful PDF certificate"""
    
    buffer = io.BytesIO()
    
    # Create PDF in landscape
    c = canvas.Canvas(buffer, pagesize=landscape(letter))
    width, height = landscape(letter)
    
    # Set colors - Nurik's Academy branding
    gold_color = colors.Color(0.831, 0.604, 0.184)  # #D49A2F
    marble_dark = colors.Color(0.172, 0.172, 0.180)  # #2C2C2E
    
    # Draw border
    c.setStrokeColor(gold_color)
    c.setLineWidth(4)
    c.rect(0.5*inch, 0.5*inch, width-inch, height-inch)
    
    # Inner border
    c.setLineWidth(2)
    c.rect(0.6*inch, 0.6*inch, width-1.2*inch, height-1.2*inch)
    
    # Header - Nurik's Academy
    c.setFillColor(gold_color)
    c.setFont("Helvetica-Bold", 48)
    c.drawCentredString(width/2, height - 1.5*inch, "Nurik's Academy")
    
    # Subtitle
    c.setFillColor(marble_dark)
    c.setFont("Helvetica", 16)
    c.drawCentredString(width/2, height - 2*inch, "Excellence in Education")
    
    # Certificate title
    c.setFillColor(gold_color)
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(width/2, height - 2.8*inch, "CERTIFICATE OF COMPLETION")
    
    # Awarded to text
    c.setFillColor(marble_dark)
    c.setFont("Helvetica", 18)
    c.drawCentredString(width/2, height - 3.5*inch, "This certificate is proudly presented to")
    
    # Student name
    c.setFillColor(gold_color)
    c.setFont("Helvetica-Bold", 42)
    c.drawCentredString(width/2, height - 4.3*inch, student_name)
    
    # Course completion text
    c.setFillColor(marble_dark)
    c.setFont("Helvetica", 18)
    c.drawCentredString(width/2, height - 5*inch, "for successfully completing the")
    
    # Course name
    c.setFillColor(gold_color)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(width/2, height - 5.6*inch, course_name)
    
    # Issue date
    c.setFillColor(marble_dark)
    c.setFont("Helvetica", 14)
    c.drawCentredString(width/2, height - 6.3*inch, f"Date of Issue: {issue_date}")
    
    # Certificate ID
    c.setFont("Helvetica", 10)
    c.drawCentredString(width/2, 0.8*inch, f"Certificate ID: {certificate_id}")
    
    # Signature line
    c.setLineWidth(1)
    c.setStrokeColor(marble_dark)
    c.line(width/2 - 2*inch, 1.8*inch, width/2 + 2*inch, 1.8*inch)
    
    c.setFont("Helvetica", 12)
    c.drawCentredString(width/2, 1.5*inch, "Director, Nurik's Academy")
    
    c.save()
    buffer.seek(0)
    return buffer.getvalue()

# ==================== CREATE CERTIFICATE ====================

@router.post("")
async def create_certificate(
    cert_data: CertificateCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create and generate certificate (Manager or Super Admin only)"""
    from server import db, serialize_doc, create_audit_log
    
    if current_user["role"] not in ["super_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    try:
        if not ObjectId.is_valid(cert_data.student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        if not ObjectId.is_valid(cert_data.course_id):
            raise HTTPException(status_code=400, detail="Invalid course ID")
        # Get student info
        student = await db.students.find_one({
            "_id": ObjectId(cert_data.student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        if (
            current_user["role"] == "manager"
            and student.get("branch_id") != current_user.get("branch_id")
        ):
            raise HTTPException(status_code=403, detail="Student belongs to another branch")
        
        # Get course info
        course = await db.courses.find_one({"_id": ObjectId(cert_data.course_id)})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        enrolled_course_ids = set(student.get("course_ids", []))
        student_group_ids = [
            ObjectId(group_id)
            for group_id in student.get("group_ids", [])
            if ObjectId.is_valid(group_id)
        ]
        enrolled_group = await db.groups.find_one({
            "$and": [
                {"course_id": cert_data.course_id},
                {"$or": [
                    {"student_ids": cert_data.student_id},
                    {"_id": {"$in": student_group_ids}},
                ]},
            ]
        })
        if cert_data.course_id not in enrolled_course_ids and not enrolled_group:
            raise HTTPException(
                status_code=409,
                detail="A certificate can only be issued for a student's enrolled course",
            )
        
        # Get next certificate ID
        result = await db.counters.find_one_and_update(
            {"_id": "certificate_id"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=True
        )
        from auth import generate_unique_id
        certificate_id = generate_unique_id("CERT", result["seq"])
        
        # Generate PDF
        student_name = f"{student['first_name']} {student['last_name']}"
        course_name = course["name"]
        issue_date = datetime.utcnow().strftime("%B %d, %Y")
        
        pdf_bytes = generate_certificate_pdf(student_name, course_name, issue_date, certificate_id)
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        # Save certificate record
        certificate = {
            "certificate_id": certificate_id,
            "student_id": cert_data.student_id,
            "course_id": cert_data.course_id,
            "certificate_type": cert_data.certificate_type,
            "issue_date": datetime.utcnow(),
            "certificate_file": pdf_base64,
            "issued_by": str(current_user["_id"]),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        cert_result = await db.certificates.insert_one(certificate)
        
        await create_audit_log(
            str(current_user["_id"]),
            "create",
            "certificate",
            str(cert_result.inserted_id),
            {"student_id": cert_data.student_id, "certificate_id": certificate_id},
            request.client.host if request.client else None
        )
        
        certificate["id"] = str(cert_result.inserted_id)
        return serialize_doc(certificate)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== GET CERTIFICATES ====================

@router.get("/student/{student_id}")
async def get_student_certificates(
    student_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get certificates for a student"""
    from server import db, serialize_doc
    
    try:
        if not ObjectId.is_valid(student_id):
            raise HTTPException(status_code=400, detail="Invalid student ID")
        student = await db.students.find_one({
            "_id": ObjectId(student_id),
            "status": {"$ne": "archived"}
        })
        if not student:
            return []
        await require_student_academic_read_access(db, current_user, student)
        
        certificates = await db.certificates.find(
            {"student_id": student_id}
        ).sort("issue_date", -1).to_list(100)
        
        return [serialize_doc(c) for c in certificates]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DOWNLOAD CERTIFICATE ====================

@router.get("/download/{certificate_id}")
async def download_certificate(
    certificate_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Download certificate PDF"""
    from server import db
    
    try:
        certificate = await db.certificates.find_one({"_id": ObjectId(certificate_id)})
        if not certificate:
            raise HTTPException(status_code=404, detail="Certificate not found")

        certificate_student = await db.students.find_one({
            "_id": ObjectId(certificate["student_id"]),
            "status": {"$ne": "archived"}
        })
        if not certificate_student:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        await require_student_academic_read_access(db, current_user, certificate_student)
        
        # Decode PDF from base64
        pdf_bytes = base64.b64decode(certificate["certificate_file"])
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=certificate_{certificate['certificate_id']}.pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
