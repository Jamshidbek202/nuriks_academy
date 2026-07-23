---
name: study-centre-finance-qa
description: Deterministically audit and stress-test Nurik's Academy finance behavior, lesson-based billing, month and date transitions, payments, payroll, expenses, cash reconciliation, financial dashboards, idempotency, and finance permissions. Use when testing finance changes, running pre-release or shadow-mode checks, reproducing a money defect, generating month scenarios, validating super-admin authority, validating manager branch isolation, or investigating mismatches between API, database, and UI financial values.
---

# Study Centre Finance QA

Run finance checks as an evidence-producing audit. Never infer correctness from a plausible-looking dashboard.

## Safety boundary

- Operate without a database by default using the deterministic harness.
- Use a database only when its configured name clearly contains `test`, `qa`, `sandbox`, or `shadow`.
- Abort before any database mutation when the environment cannot be proven non-production.
- Keep operation mode `shadow`; stub SMS and payment providers.
- Never wipe, seed, or alter production data.
- Do not edit application code during an audit-only request.
- Do not change expectations or weaken assertions to obtain a pass.
- Represent every amount as a whole UZS integer. Reject floats.

## Load the contracts

Read the following references before selecting scenarios:

- [financial-contract.md](references/financial-contract.md) for accounting invariants and approved values.
- [role-contract.md](references/role-contract.md) for super-admin and manager rules.
- [scenario-catalog.md](references/scenario-catalog.md) for date, failure, concurrency, and load coverage.

When source code and a reference disagree, report the disagreement as a finding. Do not silently treat current behavior as the approved rule.

## Run the deterministic gate

From the repository root run:

```bash
PYTHONPYCACHEPREFIX=/tmp/nuriks_finance_qa PYTHONPATH=backend \
  .venv/bin/python .agents/skills/study-centre-finance-qa/scripts/run_finance_qa.py \
  --stress 5000 --seed 202608
```

Also run the finance and role tests:

```bash
PYTHONPYCACHEPREFIX=/tmp/nuriks_finance_qa PYTHONPATH=backend \
  .venv/bin/python -m unittest tests.test_finance_domain tests.test_finance_qa_harness -v
```

Require both commands to exit zero. Record the seed, scenario count, generated case count, assertion count, and route-access audit counts.

## Add or reproduce a case

1. Copy a JSON scenario from `finance_qa/scenarios/`.
2. Give the scenario a stable name and explicit `service_month`.
3. State schedules, price versions, membership dates, closures, absences, discounts, teacher share, prior debts, piece payments, expenses, and other income.
4. Add explicit expected business totals for fixed regression cases.
5. Run only that scenario first with `--scenario path/to/case.json`.
6. Run the complete deterministic and stress gates afterward.

Keep the production calculation and the independent oracle separate. Never call the production function to manufacture the expected value.

## Run database/API integration checks

Only after proving the database is disposable:

1. Create a unique database for the campaign.
2. Fix the academy clock or pass explicit `as_of_date` values in Asia/Tashkent.
3. Seed two branches, one super admin, one manager per branch, teachers, students, parents, schedules, price versions, closures, and recurring expense policies.
4. Execute operations through real APIs or canonical services.
5. Snapshot invoices, invoice lines, allocations, credits, teacher earnings, obligations, cash events, audit records, and notification jobs after every phase.
6. Retry every idempotent operation with the same key and confirm no new money record appears.
7. Submit concurrent duplicates and confirm one posting wins or the entire operation fails closed.
8. Compare database, API, and dashboard totals to the independent oracle.
9. Drop only the unique campaign database after retaining the sanitized report.

Do not mark database coverage complete when MongoDB transaction behavior, indexes, or concurrent writes were replaced with simplistic mocks.

## Check roles explicitly

For every finance campaign, run the same critical workflows as:

- super admin with global scope;
- super admin selecting branch A or B;
- manager of branch A without a branch parameter;
- manager of branch A explicitly requesting branch A;
- manager of branch A attempting branch B;
- reception, teacher, student, and parent where denial or read-only visibility is expected.

Require cross-branch manager attempts to return 403 without calling the underlying money service. Require super-admin-only policy, correction, reversal, and manual-unfreeze operations to reject managers.

## Stress and failure campaign

- Use a recorded deterministic seed.
- Cover 28-, 29-, 30-, and 31-day months and month/year boundaries.
- Generate at least 5,000 domain cases for a pre-release gate.
- Add database load in increasing stages instead of starting with the maximum.
- Inject timeouts after database commits, repeated requests, interrupted month finalization, failed notification delivery, and reordered inputs.
- Reconcile after every stage; stop immediately on a non-zero difference or duplicate immutable record.

## Report findings

For every failure provide:

- severity (`P0` corruption/cross-branch/lost or duplicated money; `P1` incorrect invoice, cash, payroll, allocation, or profit; `P2` stale/misleading UI or recoverable workflow; `P3` non-financial usability);
- scenario, seed, simulated date, timezone, actor role, and branch;
- exact setup and command or API request;
- expected, actual, and UZS difference;
- relevant immutable record and audit IDs;
- smallest deterministic reproduction;
- whether retrying changes the outcome.

Say `passed` only when all commands exit zero, all reconciliation differences equal zero, role checks pass, and repeated runs with the same seed are identical.

## Fix workflow

When the user also requests fixes, preserve the failing case first. Implement the smallest correction, run the case, the full finance suite, the seeded campaign, backend tests, frontend type checks, lint, and production build. Report any coverage that still requires a real transactional test database.
