# Finance QA suite

This suite never uses the application's configured production database. Every
run creates a uniquely named disposable database, requires `test`, `qa`,
`sandbox`, or `shadow` in its name, and deletes it when the run finishes.

## Run locally

Install the backend and frontend dependencies, then run:

```bash
scripts/run_full_finance_qa.sh
```

After Chromium has been installed once, the faster repeat command is:

```bash
scripts/run_full_finance_qa.sh --skip-browser-install
```

Docker is used when available. Otherwise `mongodb-memory-server` starts a real
local MongoDB replica set so transactions and change streams are still tested.

## What the release gate covers

- deterministic billing/date scenarios plus 5,000 seeded stress cases;
- all backend tests and finance role/branch guards;
- real MongoDB transactions, change streams, idempotency, partial payments,
  advance balances, invoice finalization, teacher earnings, and corrections;
- four independent browser sessions logged in as two branch managers, a
  superadmin, and reception;
- branch-scoped WebSocket delivery, including proof that the other branch does
  not receive finance invalidations;
- closures and lesson resolutions refreshing the lesson calendar;
- tariff, teacher-share, recurring-expense, and billing-calendar versions;
- invoice drafts, finalization, debit adjustments, reversal/replacement,
  revenue, receivables, and teacher earnings;
- partial and overpayments, advance balances, receipt reversals, and reception
  payment views;
- other and recurring expenses, manual recurring amounts, corrections,
  payments, and payment reversals;
- teacher payouts and reversals, other income and reversals, authorized cash
  removal, cash closing, discrepancies, and discrepancy review;
- exact UI reconciliation against current API financial-position values after
  every mutation, with payroll immutability checks where required;
- TypeScript, lint, and the production web build.

The browser assertions allow four seconds, while the safety reconciliation
poll runs every ten seconds. Therefore the live test cannot pass by silently
falling back to polling.

Sanitized JSON and Playwright evidence are written under `test_reports/` and
are ignored by Git. The GitHub Actions workflow runs the same gate on finance
changes and uploads the evidence even when a stage fails.
