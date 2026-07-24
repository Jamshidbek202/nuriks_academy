# Finance Scenario Catalog

## Calendar and pricing

- 28-, 29-, 30-, and 31-day months.
- December-to-January and leap-February boundaries.
- Asia/Tashkent local midnight versus UTC date.
- One to seven schedule days and multiple slots on one weekday.
- Eight through fourteen scheduled lessons, plus unusual but valid counts.
- Mid-month tariff, teacher-share, schedule, teacher, and group-format versions.
- Student joins before, during, and after a lesson on the same date.
- Student leaves or is financially frozen mid-month.

## Attendance and closures

- Student absent: still billable.
- Approved holiday: not student billable.
- Unexpected centre closure: not student billable.
- Closure scoped globally, to a branch, and to selected groups.
- Closure overlap at exact start/end boundaries.
- Closure submitted after finalized invoice lines: fail closed.
- Teacher cancellation, approved exception, substitute, and replacement lesson.
- Unresolved lesson prevents finalization.

## Groups and payroll

- Normal, mini, and individual approved pricing.
- Fifth mini student converts the group to normal.
- Normal falls to four students without becoming mini.
- Individual rejects a second active student.
- Student discount reaches 100% while teacher salary remains based on undiscounted tuition.
- Student pays nothing, partially, fully, late, and in advance; earned salary remains unchanged.
- Teacher salary rounding across multiple students and multiple groups.

## Receipts, debt, and cash

- One payment, many piece payments, exact payment, overpayment, and zero remaining debt.
- Several old debts with equal due dates and deterministic tie-breaking.
- Advance automatically applied to a later invoice.
- Duplicate receipt key, concurrent receipt submissions, and timeout after commit.
- Open shift uniqueness, insufficient physical cash, removal, payout, close, discrepancy, review, and reversal.
- Reconcile every cash event and immutable allocation/reversal chain.

## Expenses and position

- Fixed Rent, Accountant, and Wi-Fi obligations.
- Manual Tax, electricity, and gas amount entry.
- Version change between months and a mid-month policy attempt.
- Other expense, partial payment, full payment, correction, and reversal.
- Other income and reversal.
- Branch expenses plus intentional centre-wide obligations.
- Accrued profit versus cash position with unpaid invoices and unpaid expenses.
- Dashboard totals match API and ledger rows at every phase.

## Roles

- Run each critical path as global super admin, branch-selected super admin, own-branch manager, cross-branch manager, reception, teacher, student, and parent.
- Verify both returned data and whether the underlying service was called.
- Include branchless/global rows and prevent global scope from becoming a cross-branch data leak.

## Reliability and load

- Repeat each idempotent request with the same key.
- Repeat month generation and finalization after a simulated process interruption.
- Reorder students, groups, lessons, payments, and database query results.
- Fail audit logging, notification queueing, and SMS delivery after the financial commit.
- Run staged loads such as 10, 100, and 500 groups across 24 service months.
- Track runtime, peak memory, record counts, unique-index conflicts, retries, and reconciliation differences.

## UI interaction and live synchronization

- Keep super-admin and manager sessions open on the same month while either
  role creates, edits, finalizes, pays, corrects, or reverses a record.
- Seed known branch revenue so a manager cannot incorrectly show zero and a
  global super-admin total cannot incorrectly remain below that branch total.
- Reproduce stale totals in both directions, including admin 10,000,000 versus
  manager 13,000,000 and admin 3,000,000 versus manager 0, when the ledger says
  both views should include the changed branch amount.
- Add and edit an expense and confirm rows, accrued expenses, outstanding
  expenses, profit, and both authorized sessions update without refresh.
- Click Finalize month through the UI. Confirm its dialog, loading state,
  request, completion or explicit readiness error, invoices, revenue, payroll,
  and observer-session updates. A silent no-op is a failure.
- Open expense correction and Pay from cashbox through their actual buttons.
  Confirm the controls are clickable, the cash-shift prerequisites are clear,
  and the outgoing payment, cashbox, outstanding amount, and totals reconcile.
- Exercise every finance-page button in enabled, disabled, success, validation,
  and server-error states. Confirm a second rapid click cannot duplicate money.
- Scan the application for date entry. Require a calendar control for dates and
  a separate time control when time is needed; flag raw combined date-time text
  entry as a usability and correctness risk.
- Run core interactions at desktop and phone widths. Confirm controls remain
  visible, scrollable, tappable, and free of overlays.
- Repeat the two-session stale-state pattern across every server-backed app
  route and every visible create/edit/delete/status control, not Finance alone.
- Measure click feedback, request duration, and observer synchronization; never
  hide stale behavior behind a manual refresh or a long fixed sleep.
