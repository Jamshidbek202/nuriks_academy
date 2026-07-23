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
