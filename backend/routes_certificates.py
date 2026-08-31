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
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
import io
import base64
import os

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

def generate_certificate_pdf(
    student_name: str,
    course_name: str,
    issue_date: str,
    certificate_id: str,
    certificate_type: str = "completion",
):
    """Generate the printable Nurik's Academy certificate."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=landscape(A4))
    width, height = landscape(A4)

    gold = colors.HexColor("#D5B662")
    gold_dark = colors.HexColor("#9A7D34")
    charcoal = colors.HexColor("#11130F")
    ivory = colors.HexColor("#F5F0E6")
    muted = colors.HexColor("#686A64")

    c.setFillColor(ivory)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColor(charcoal)
    c.roundRect(0.35 * inch, 0.35 * inch, width - 0.7 * inch, height - 0.7 * inch, 18, fill=1, stroke=0)
    c.setStrokeColor(gold)
    c.setLineWidth(1.5)
    c.roundRect(0.55 * inch, 0.55 * inch, width - 1.1 * inch, height - 1.1 * inch, 14, fill=0, stroke=1)

    # Quiet architectural accents keep the page branded without ornamental clutter.
    c.setFillColor(gold_dark)
    c.setFillAlpha(0.18)
    c.circle(width - 0.85 * inch, height - 0.85 * inch, 1.15 * inch, fill=1, stroke=0)
    c.circle(0.7 * inch, 0.65 * inch, 0.75 * inch, fill=1, stroke=0)
    c.setFillAlpha(1)

    logo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "assets", "images", "logo.png"))
    if os.path.exists(logo_path):
        c.drawImage(ImageReader(logo_path), 0.8 * inch, height - 1.55 * inch, 0.72 * inch, 0.72 * inch, mask="auto", preserveAspectRatio=True)

    c.setFillColor(ivory)
    c.setFont("Helvetica-Bold", 23)
    c.drawString(1.65 * inch, height - 1.16 * inch, "NURIK'S ACADEMY")
    c.setFillColor(gold)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(1.66 * inch, height - 1.39 * inch, "ACADEMIC ACHIEVEMENT RECORD")

    title = "CERTIFICATE OF EXCELLENCE" if certificate_type == "excellence" else "CERTIFICATE OF COMPLETION"
    c.setFillColor(gold)
    c.setFont("Helvetica-Bold", 27)
    c.drawCentredString(width / 2, height - 2.05 * inch, title)
    c.setFillColor(colors.HexColor("#BFC1BA"))
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 2.42 * inch, "Presented to")

    def centred_fit(text: str, y: float, maximum_size: int, minimum_size: int, maximum_width: float, color):
        size = maximum_size
        while size > minimum_size and c.stringWidth(text, "Helvetica-Bold", size) > maximum_width:
            size -= 1
        c.setFillColor(color)
        c.setFont("Helvetica-Bold", size)
        c.drawCentredString(width / 2, y, text)

    centred_fit(student_name, height - 3.18 * inch, 38, 22, width - 2.2 * inch, ivory)
    c.setStrokeColor(gold_dark)
    c.setLineWidth(0.8)
    c.line(1.55 * inch, height - 3.45 * inch, width - 1.55 * inch, height - 3.45 * inch)

    c.setFillColor(colors.HexColor("#BFC1BA"))
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 3.92 * inch, "for successfully completing")
    centred_fit(course_name, height - 4.55 * inch, 27, 17, width - 2.4 * inch, gold)

    c.setFillColor(colors.HexColor("#BFC1BA"))
    c.setFont("Helvetica", 9)
    c.drawString(0.9 * inch, 1.12 * inch, "ISSUED")
    c.setFillColor(ivory)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(0.9 * inch, 0.88 * inch, issue_date)

    c.setFillColor(colors.HexColor("#BFC1BA"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(width / 2, 1.12 * inch, "CERTIFICATE ID")
    c.setFillColor(ivory)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(width / 2, 0.88 * inch, certificate_id)

    c.setStrokeColor(gold)
    c.line(width - 2.55 * inch, 1.14 * inch, width - 0.9 * inch, 1.14 * inch)
    c.setFillColor(colors.HexColor("#BFC1BA"))
    c.setFont("Helvetica", 9)
    c.drawCentredString(width - 1.72 * inch, 0.88 * inch, "DIRECTOR · NURIK'S ACADEMY")
    
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
        
        pdf_bytes = generate_certificate_pdf(
            student_name,
            course_name,
            issue_date,
            certificate_id,
            cert_data.certificate_type,
        )
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
