"""Validated API models for the finance and lesson-accounting domain.

Money is always represented as whole Uzbek sums.  Floats are deliberately not
accepted anywhere in this module because rounding a binary float is not safe
enough for invoices, payroll, or cash records.
"""

from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


ACADEMY_TIMEZONE = "Asia/Tashkent"


class StrictFinanceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProgramCode(str, Enum):
    GENERAL = "general"
    PRE_IELTS = "pre_ielts"
    IELTS = "ielts"


class GroupFormat(str, Enum):
    NORMAL = "normal"
    MINI = "mini"
    INDIVIDUAL = "individual"


class PersonalCardProvider(str, Enum):
    CLICK = "click"
    PAYME = "payme"


class CardPaymentDecision(str, Enum):
    CONFIRM = "confirm"
    REJECT = "reject"


class ClosureKind(str, Enum):
    HOLIDAY = "holiday"
    UNEXPECTED = "unexpected"


class LessonResolution(str, Enum):
    HELD = "held"
    TEACHER_CANCELLED = "teacher_cancelled"
    REPLACEMENT_REQUIRED = "replacement_required"


class ScheduleSlot(StrictFinanceModel):
    day: str = Field(min_length=6, max_length=9)
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    room: Optional[str] = Field(default=None, max_length=100)

    @field_validator("day")
    @classmethod
    def normalize_day(cls, value: str) -> str:
        normalized = value.strip().lower()
        valid = {
            "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday",
        }
        if normalized not in valid:
            raise ValueError("Schedule day must be an English weekday")
        return normalized

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError("Schedule end time must be after start time")
        return self


class GroupFinanceVersionCreate(StrictFinanceModel):
    program_code: ProgramCode
    group_format: GroupFormat
    effective_from: date
    schedule: List[ScheduleSlot] = Field(min_length=1, max_length=14)
    reason: str = Field(min_length=3, max_length=500)


class TariffVersionCreate(StrictFinanceModel):
    program_code: ProgramCode
    group_format: GroupFormat
    monthly_price_uzs: StrictInt = Field(gt=0, le=1_000_000_000)
    effective_from: date
    reason: str = Field(min_length=3, max_length=500)


class TeacherShareVersionCreate(StrictFinanceModel):
    group_format: GroupFormat
    basis_points: StrictInt = Field(ge=0, le=10_000)
    effective_from: date
    reason: str = Field(min_length=3, max_length=500)


class ClosureCreate(StrictFinanceModel):
    title: str = Field(min_length=2, max_length=160)
    reason: str = Field(min_length=3, max_length=500)
    kind: ClosureKind
    starts_at: datetime
    ends_at: datetime
    branch_id: Optional[str] = None
    group_ids: List[str] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_range(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Closure end must be after its start")
        return self


class LessonGenerationRequest(StrictFinanceModel):
    group_id: str = Field(min_length=1, max_length=100)
    month: str = Field(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$")


class LessonResolutionCreate(StrictFinanceModel):
    resolution: LessonResolution
    reason: Optional[str] = Field(default=None, max_length=500)
    substitute_teacher_id: Optional[str] = Field(default=None, max_length=100)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def validate_resolution_details(self):
        if self.resolution != LessonResolution.HELD and not self.reason:
            raise ValueError("A reason is required for a financial exception")
        if self.substitute_teacher_id and self.resolution != LessonResolution.HELD:
            raise ValueError("A substitute teacher can only be attached to a held lesson")
        return self


class LessonExceptionApproval(StrictFinanceModel):
    approved: bool
    reason: str = Field(min_length=3, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class ReplacementLessonCreate(StrictFinanceModel):
    starts_at: datetime
    ends_at: datetime
    teacher_id: Optional[str] = Field(default=None, max_length=100)
    reason: str = Field(min_length=3, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def validate_range(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Replacement lesson end must be after its start")
        return self


class ReceptionSeedCreate(StrictFinanceModel):
    branch_id: Optional[str] = Field(default=None, max_length=100)


class InvoiceDraftGenerationRequest(StrictFinanceModel):
    service_month: str = Field(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$")
    branch_id: Optional[str] = Field(default=None, max_length=100)


class InvoiceMonthFinalizeRequest(InvoiceDraftGenerationRequest):
    idempotency_key: str = Field(min_length=8, max_length=200)


class InvoiceAdjustmentKind(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"


class InvoiceAdjustmentCreate(StrictFinanceModel):
    kind: InvoiceAdjustmentKind
    amount_uzs: StrictInt = Field(gt=0, le=1_000_000_000)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class FinancialReversalCreate(StrictFinanceModel):
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class CashReceiptCreate(StrictFinanceModel):
    student_id: str = Field(min_length=1, max_length=100)
    amount_uzs: StrictInt = Field(gt=0, le=1_000_000_000)
    cash_shift_id: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class PaymentDestinationCreate(StrictFinanceModel):
    provider: PersonalCardProvider
    card_number: str = Field(min_length=16, max_length=23)
    cardholder_name: str = Field(min_length=2, max_length=120)
    label: Optional[str] = Field(default=None, max_length=100)
    branch_id: Optional[str] = Field(default=None, max_length=100)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("card_number")
    @classmethod
    def normalize_card_number(cls, value: str) -> str:
        normalized = "".join(character for character in value if character.isdigit())
        if len(normalized) != 16:
            raise ValueError("Receiving card number must contain exactly 16 digits")
        return normalized

    @field_validator("cardholder_name")
    @classmethod
    def normalize_cardholder_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Cardholder name is required")
        return normalized


class PaymentDestinationUpdate(StrictFinanceModel):
    provider: Optional[PersonalCardProvider] = None
    card_number: Optional[str] = Field(default=None, min_length=16, max_length=23)
    cardholder_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    label: Optional[str] = Field(default=None, max_length=100)
    is_active: Optional[bool] = None
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("card_number")
    @classmethod
    def normalize_optional_card_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = "".join(character for character in value if character.isdigit())
        if len(normalized) != 16:
            raise ValueError("Receiving card number must contain exactly 16 digits")
        return normalized

    @field_validator("cardholder_name")
    @classmethod
    def normalize_optional_cardholder_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Cardholder name is required")
        return normalized


class CardPaymentReportCreate(StrictFinanceModel):
    student_id: str = Field(min_length=1, max_length=100)
    destination_id: str = Field(min_length=1, max_length=100)
    amount_uzs: StrictInt = Field(gt=0, le=1_000_000_000)
    paid_at: datetime
    idempotency_key: str = Field(min_length=8, max_length=200)


class CardPaymentReportResolution(StrictFinanceModel):
    decision: CardPaymentDecision
    reason: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)

    @model_validator(mode="after")
    def require_rejection_reason(self):
        if self.decision == CardPaymentDecision.REJECT:
            if not self.reason or len(self.reason.strip()) < 5:
                raise ValueError("A rejection reason of at least five characters is required")
        return self


class CashShiftOpen(StrictFinanceModel):
    opening_balance_uzs: StrictInt = Field(ge=0, le=10_000_000_000)
    notes: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class CashShiftClose(StrictFinanceModel):
    actual_closing_balance_uzs: StrictInt = Field(ge=0, le=10_000_000_000)
    notes: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class CashRemovalCreate(StrictFinanceModel):
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    purpose: str = Field(min_length=3, max_length=300)
    idempotency_key: str = Field(min_length=8, max_length=200)


class CashDiscrepancyReview(StrictFinanceModel):
    accepted: bool
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class RecurringExpenseVersionCreate(StrictFinanceModel):
    expense_key: str = Field(pattern=r"^[a-z0-9_]{2,60}$")
    name: str = Field(min_length=2, max_length=120)
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    effective_from: date
    classification: str = Field(default="operating_expense", min_length=2, max_length=80)
    reason: str = Field(min_length=3, max_length=500)


class ExpenseObligationGenerationRequest(InvoiceDraftGenerationRequest):
    pass


class OtherExpenseCreate(StrictFinanceModel):
    category: str = Field(default="Other", min_length=2, max_length=120)
    recipient: str = Field(min_length=2, max_length=200)
    expense_date: date
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    explanation: str = Field(min_length=5, max_length=1_000)
    proof_reference: Optional[str] = Field(default=None, max_length=500)
    branch_id: Optional[str] = Field(default=None, max_length=100)
    idempotency_key: str = Field(min_length=8, max_length=200)


class ExpensePaymentCreate(StrictFinanceModel):
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    cash_shift_id: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class ManualExpenseAmountCreate(StrictFinanceModel):
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class ExpenseAmountAdjustmentCreate(StrictFinanceModel):
    amount_uzs: StrictInt = Field(ge=0, le=10_000_000_000)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class TeacherPayoutCreate(StrictFinanceModel):
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    cash_shift_id: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class OtherIncomeCreate(StrictFinanceModel):
    source: str = Field(min_length=2, max_length=200)
    income_date: date
    amount_uzs: StrictInt = Field(gt=0, le=10_000_000_000)
    cash_shift_id: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    branch_id: Optional[str] = Field(default=None, max_length=100)
    idempotency_key: str = Field(min_length=8, max_length=200)


class FinanceOperationMode(str, Enum):
    SHADOW = "shadow"
    LIVE = "live"


class BillingRulesVersionCreate(StrictFinanceModel):
    effective_from: date
    invoice_draft_day: StrictInt = Field(default=1, ge=1, le=28)
    invoice_finalization_day: StrictInt = Field(default=1, ge=1, le=28)
    student_due_day: StrictInt = Field(default=10, ge=1, le=28)
    freeze_day: StrictInt = Field(default=11, ge=1, le=28)
    teacher_salary_due_day: StrictInt = Field(default=5, ge=1, le=28)
    operation_mode: FinanceOperationMode = FinanceOperationMode.SHADOW
    automatic_freeze_enabled: bool = False
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def validate_due_and_freeze_days(self):
        if self.freeze_day <= self.student_due_day:
            raise ValueError("Freeze day must be after the student due day")
        if self.operation_mode == FinanceOperationMode.SHADOW and self.automatic_freeze_enabled:
            raise ValueError("Automatic freeze cannot be enabled in shadow mode")
        return self


class FreezeAction(str, Enum):
    FREEZE = "freeze"
    UNFREEZE = "unfreeze"


class StudentFreezeOverrideCreate(StrictFinanceModel):
    action: FreezeAction
    effective_on: date
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)


class DailyFinanceRunRequest(StrictFinanceModel):
    as_of_date: date
    idempotency_key: str = Field(min_length=8, max_length=200)


class DiscountEntitlementCreate(StrictFinanceModel):
    student_id: str = Field(min_length=1, max_length=100)
    service_month: str = Field(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$")
    basis_points: StrictInt = Field(gt=0, le=10_000)
    reason: str = Field(min_length=5, max_length=500)
    idempotency_key: str = Field(min_length=8, max_length=200)
