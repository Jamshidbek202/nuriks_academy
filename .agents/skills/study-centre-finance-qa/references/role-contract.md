# Finance Role Contract

## Super admin

Require global and branch-selected read access. Require super-admin-only authority for:

- seeding default finance configuration and reception accounts;
- creating tariff, teacher-share, recurring-expense, and billing-rule versions;
- granting exceptional discounts;
- correcting an already entered expense obligation amount;
- reversing and replacing a finalized invoice;
- reversing cash receipts, outgoing payments, and other income;
- reviewing cash discrepancies;
- manually unfreezing a student.

Every mutation must create an audit record and retain immutable prior events.

## Manager

Allow operational finance work for the manager's assigned branch:

- view pricing and finance policy history;
- manage group schedules, closures, lesson resolution, and readiness;
- generate and finalize branch invoices;
- view branch invoices, receipts, debt, payroll, expenses, other income, freezes, and financial position;
- open and close authorized cash shifts;
- record cash receipts, expenses, expense payments, salary payouts, and other income;
- run daily controls and create allowed invoice adjustments.

Force missing branch parameters to the manager's branch. Reject an explicitly different branch with 403 before calling a money service. Permit centre-wide global obligations only where the approved accounting model intentionally uses `branch_id = null`.

Managers must not perform super-admin-only policy changes, irreversible reversals, expense corrections, cash discrepancy approval, or manual unfreeze.

## Required regression pattern

For every critical endpoint test:

1. super admin with global scope succeeds;
2. super admin selecting branch B succeeds;
3. manager A without branch is forced to branch A;
4. manager A requesting branch A succeeds;
5. manager A requesting branch B receives 403;
6. the blocked service mock is not awaited;
7. reception/teacher/student/parent receive the intended read-only view or 403;
8. returned rows contain no foreign-branch student, invoice, receipt, salary, expense, cash, or reminder record.

The static audit in `finance_qa/role_audit.py` protects the current route contract. Direct route tests in `tests/test_finance_qa_harness.py` protect critical runtime behavior. Add both static and runtime coverage when introducing a finance endpoint.
