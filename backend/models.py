from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Literal
from datetime import date, datetime
from enum import Enum
from finance_models import GroupFormat, ProgramCode

# Enums
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    MANAGER = "manager"
    RECEPTION = "reception"
    TEACHER = "teacher"
    SUPPORT = "support"
    PARENT = "parent"
    STUDENT = "student"

class AppLanguage(str, Enum):
    ENGLISH = "en"
    RUSSIAN = "ru"
    UZBEK = "uz"

class StudentStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"
    GRADUATED = "graduated"
    ARCHIVED = "archived"

class LeadStatus(str, Enum):
    NEW_LEAD = "new_lead"
    CONTACTED = "contacted"
    TRIAL_SCHEDULED = "trial_scheduled"
    TRIAL_COMPLETED = "trial_completed"
    NEGOTIATION = "negotiation"
    ENROLLED = "enrolled"
    LOST = "lost"

class LeadSource(str, Enum):
    INSTAGRAM = "instagram"
    TELEGRAM = "telegram"
    FACEBOOK = "facebook"
    TIKTOK = "tiktok"
    REFERRAL = "referral"
    BANNER = "banner"
    WALK_IN = "walk_in"
    WEBSITE = "website"
    OTHER = "other"

class PaymentMethod(str, Enum):
    CASH = "cash"
    CLICK = "click"
    PAYME = "payme"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"

class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"

class GroupStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class TestType(str, Enum):
    MID_TEST = "mid_test"
    END_OF_COURSE = "end_of_course"

class NotificationType(str, Enum):
    LESSON_REMINDER = "lesson_reminder"
    SUPPORT_REMINDER = "support_reminder"
    HOMEWORK = "homework"
    TEST_RESULT = "test_result"
    NEWS = "news"
    PAYMENT_REMINDER = "payment_reminder"
    CANCELLATION = "cancellation"
    RESCHEDULE = "reschedule"

# Models
class UserBase(BaseModel):
    login: str
    email: Optional[str] = None
    phone: Optional[str] = None
    full_name: str
    role: UserRole
    branch_id: Optional[str] = None
    language_preference: AppLanguage = AppLanguage.ENGLISH

class LanguagePreferenceUpdate(BaseModel):
    language: AppLanguage

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    login: str
    password: str

class User(UserBase):
    id: str
    is_active: bool = True
    two_factor_enabled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class TwoFactorSetup(BaseModel):
    secret: str
    qr_code: str

class TwoFactorVerify(BaseModel):
    token: str

class StudentBase(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo: Optional[str] = None
    address: Optional[str] = None
    parent_id: Optional[str] = None
    branch_id: Optional[str] = None

class StudentCreate(StudentBase):
    parent_phone: Optional[str] = None
    parent_name: Optional[str] = None
    courses: Optional[List[str]] = []

class Student(StudentBase):
    id: str
    student_id: str  # NA-000001
    user_id: str
    course_ids: List[str] = []
    group_ids: List[str] = []
    status: StudentStatus = StudentStatus.ACTIVE
    enrollment_date: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    invite_delivery_status: Optional[dict] = None
    telegram_invites: Optional[dict] = None

class ParentBase(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: Optional[str] = None

class Parent(ParentBase):
    id: str
    user_id: str
    student_ids: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TeacherBase(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: Optional[str] = None
    photo: Optional[str] = None
    specialization: List[str] = []
    courses: List[str] = []
    branch_id: Optional[str] = None

class Teacher(TeacherBase):
    id: str
    user_id: str
    group_ids: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CourseBase(BaseModel):
    name: str
    program_code: str
    description: Optional[str] = None
    levels: List[str] = []

class Course(CourseBase):
    id: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GroupSchedule(BaseModel):
    day: str
    start_time: str
    end_time: str
    room: Optional[str] = None

class GroupBase(BaseModel):
    name: str
    course_id: str
    teacher_id: str
    schedule: List[GroupSchedule] = []
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    branch_id: Optional[str] = None
    program_code: Optional[ProgramCode] = None
    group_format: Optional[GroupFormat] = None
    finance_effective_from: Optional[date] = None
    finance_change_reason: Optional[str] = None

class Group(GroupBase):
    id: str
    teacher_name: Optional[str] = None
    student_ids: List[str] = []
    status: GroupStatus = GroupStatus.ACTIVE
    finance_setup_status: str = "pending"
    finance_latest_version: Optional[int] = None
    finance_occurrence_refresh_status: Optional[str] = None
    finance_occurrence_refresh_error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AttendanceBase(BaseModel):
    student_id: str
    group_id: str
    date: datetime
    status: AttendanceStatus
    notes: Optional[str] = None

class Attendance(AttendanceBase):
    id: str
    teacher_id: str
    marked_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class HomeworkBase(BaseModel):
    group_id: str
    title: str
    description: str
    due_date: datetime
    attachments: Optional[List[str]] = []

class HomeworkSubmission(BaseModel):
    student_id: str
    submitted_at: Optional[datetime] = None
    content: Optional[str] = None
    attachments: Optional[List[str]] = []
    grade: Optional[float] = None
    feedback: Optional[str] = None
    graded_at: Optional[datetime] = None

class Homework(HomeworkBase):
    id: str
    teacher_id: str
    assigned_date: datetime = Field(default_factory=datetime.utcnow)
    submissions: List[HomeworkSubmission] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TestResult(BaseModel):
    student_id: str
    score: float
    percentage: float
    notes: Optional[str] = None
    graded_at: Optional[datetime] = None

class TestBase(BaseModel):
    test_type: TestType
    group_id: str
    course_id: str
    title: str
    test_date: datetime
    max_score: float

class Test(TestBase):
    id: str
    teacher_id: str
    results: List[TestResult] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LeadBase(BaseModel):
    first_name: str
    last_name: str
    phone: str
    age: Optional[int] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    account_access_mode: Optional[Literal["student_only", "parent_only", "separate"]] = None
    interested_course: Optional[str] = None
    source: LeadSource
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class Lead(LeadBase):
    id: str
    lead_id: str
    status: LeadStatus = LeadStatus.NEW_LEAD
    assigned_to: Optional[str] = None
    trial_lesson_date: Optional[datetime] = None
    converted_to_student_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentBase(BaseModel):
    student_id: str
    amount: float
    payment_method: PaymentMethod
    payment_type: str
    month: Optional[str] = None  # YYYY-MM
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class Payment(PaymentBase):
    id: str
    payment_id: str
    payment_status: PaymentStatus = PaymentStatus.PENDING
    transaction_id: Optional[str] = None
    transaction_date: Optional[datetime] = None
    received_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CertificateBase(BaseModel):
    student_id: str
    course_id: str
    certificate_type: str

class Certificate(CertificateBase):
    id: str
    certificate_id: str
    issue_date: datetime = Field(default_factory=datetime.utcnow)
    certificate_file: Optional[str] = None
    issued_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class NewsBase(BaseModel):
    title: str
    content: str
    image: Optional[str] = None
    target_audience: List[str] = ["all"]
    branch_id: Optional[str] = None

class News(NewsBase):
    id: str
    author_id: str
    published: bool = False
    published_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SupportBookingBase(BaseModel):
    student_id: str
    support_staff_id: str
    booking_date: datetime
    start_time: str
    duration_minutes: int
    topic: Optional[str] = None

class SupportBooking(SupportBookingBase):
    id: str
    booking_id: str
    end_time: str
    status: str = "scheduled"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SystemSettings(BaseModel):
    academy_name: str = "Nurik's Academy"
    logo: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payment_reminder_date: int = 5
    payment_reminder_time: str = "17:00"
    lesson_reminder_minutes: int = 20
    support_booking_duration: int = 60
    support_working_hours: Dict[str, str] = {"start": "09:00", "end": "18:00"}

class FeatureFlag(BaseModel):
    feature_name: str
    is_enabled: bool

class AuditLog(BaseModel):
    id: str
    user_id: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class Branch(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
