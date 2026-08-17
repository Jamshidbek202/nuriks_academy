# Nurik's Academy Operations Platform

<!-- impeccable:product-schema 1 -->

> Source note: this record consolidates requirements explicitly confirmed by the user in this project thread and capabilities verified in the repository on 2026-08-17. It does not introduce new business rules.

## Platform

adaptive

## Users

- Super administrators run the academy, control roles and pricing, and need the complete operational and financial position.
- Managers run day-to-day academic and financial operations with the permissions defined by the backend.
- Reception staff create and convert leads, find students, record cash payments, and follow up on paid, unpaid, upcoming, and overdue accounts without seeing centre-wide revenue, profit, payroll, pricing controls, or sensitive accounting totals.
- Teachers manage their groups, attendance, homework, tests, journals, and see their own accumulating earnings.
- Students and parents follow learning activity, attendance, homework, tests, notifications, and their own payments. Parents receive mandatory financial reminders and configurable academic reminders.
- Support staff manage the support work assigned to them; students control cancellation of their own support bookings.

Most operational work is frequent, time-sensitive, and often performed on a phone during lessons or at reception. Super administrators and managers also use wider desktop views for dense finance and administration work.

## Product Purpose

Nurik's Academy replaces fragmented manual study-centre administration with one role-aware system for student lifecycle, groups and schedules, teaching activity, attendance, communications, and auditable lesson-based finance. Success means staff can complete routine work quickly, the frontend and backend show the same current state, money calculations are traceable, and users never encounter controls they are not authorized to use.

## Positioning

The platform connects scheduled and actually held lessons directly to student accruals and teacher earnings while preserving price history, closures, partial payments, cash reconciliation, and role-specific visibility in one operational record.

## Operating Context

- The academy operates in Uzbekistan and records money in Uzbek sums (UZS).
- The working languages are English, Russian, and Uzbek.
- Staff use the system throughout the working day; teachers often mark attendance from phones during class.
- Groups have an explicit programme, format, price history, schedule, teacher, and students.
- Closures and holidays alter billable scheduled lessons; student absence does not erase a held lesson.
- Finance is being introduced in parallel shadow mode while the academy retains manual records until confidence is established.
- Cash reception, transfer verification, expenses, payroll, overdue follow-up, and month closing are distinct workflows with different authority.

## Capabilities and Constraints

- Preserve all existing backend contracts, calculations, route permissions, test identifiers, navigation destinations, and multilingual behavior during design work.
- Roles include super administrator, manager, reception, teacher, student, parent, and support staff.
- Finance requires exact whole-sum handling, idempotent mutations, live refresh between relevant users, partial-payment allocation, auditability, and explicit unresolved states.
- Reception permissions must remain strictly narrower than manager and super-administrator finance access.
- Attendance opens at the scheduled class start, remains available through the end, and is teacher-controlled.
- The product must remain usable on current mobile browsers, iOS, Android, and desktop web without expensive visual effects or interaction lag.
- Authentication and account delivery use the application's current phone/password and Telegram-related flows; visual work must not alter their security behavior.

## Brand Commitments

- Product name: Nurik's Academy.
- Preserve the academy logo at `frontend/assets/images/logo.png`.
- The public website's black-and-gold identity is a binding family resemblance, not a layout template.
- The operational product must feel serious, direct, trustworthy, and pleasant rather than promotional, playful, ornamental, or like a generic AI-generated SaaS dashboard.
- Brand expression must never weaken scanability, familiar controls, financial clarity, or mobile speed.

## Evidence on Hand

- Existing production interface and workflows under `frontend/app/`.
- Shared theme and components under `frontend/src/constants/` and `frontend/src/components/`.
- Role and finance behavior in `backend/`, `tests/`, `finance_qa/`, and `frontend/e2e/`.
- Public brand website: `https://nuriks-academy.uz/`.
- Manual finance guide and acceptance checklist under `output/pdf/`.
- No fabricated testimonials, performance claims, customer counts, or financial examples may be presented as real data.

## Product Principles

1. Current truth over decorative summaries: every important number and state must have a clear source, timestamp, or drill-down path.
2. Authority is visible: users see only the actions and information their role can actually use.
3. One task, one obvious next action: operational screens prioritize completion and recovery over browsing.
4. Mobile work is first-class: attendance, student lookup, payments, and reception tasks must be comfortable with one hand and variable screen height.
5. Financial trust is earned through traceability, immediate synchronization, explicit pending states, and safe confirmation—not visual confidence alone.

## Accessibility & Inclusion

- Maintain large touch targets, visible keyboard focus, screen-reader labels, semantic control roles, non-color status cues, and reduced-motion compatibility.
- Support English, Russian, and Uzbek strings without clipping or relying on fixed text widths.
- Important errors and permission loss must explain what happened and the safe next step instead of exposing raw network errors.
