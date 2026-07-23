# Approved Financial Contract

## Money and versions

- Store and calculate whole Uzbek sums only. Never accept binary floating-point money.
- Keep prices, teacher shares, billing rules, group finance configuration, and recurring expenses versioned by effective date.
- Apply the version active on each scheduled lesson date.
- Keep finalized invoices and ledger events immutable; correct them with audited adjustments or reversals.

## Approved tuition

| Program | Normal | Mini | Individual |
|---|---:|---:|---:|
| General | 450,000 | 650,000 | 1,200,000 |
| IELTS | 550,000 | 750,000 | 1,400,000 |
| Pre-IELTS | 550,000 | 750,000 | 1,400,000 |

All values are UZS per month before lesson-based proration.

## Lesson billing

- Expand the recorded group schedule into concrete Asia/Tashkent lesson occurrences.
- Use the number of originally scheduled lesson occurrences as the monthly denominator.
- Charge a billable lesson as the price active on that lesson divided by the original denominator.
- Charge a student who misses a lesson.
- Exclude an approved centre holiday or unexpected centre closure from the numerator while keeping the original denominator.
- Apply membership and financial-freeze dates at exact lesson time when timestamps are available.
- Distribute integer rounding deterministically so invoice lines equal the invoice total exactly.
- A mid-month price change must produce old-price lesson lines before the effective date and new-price lines on or after it.

## Groups and teachers

- Normal and mini tuition lines use a 40% teacher share.
- Individual tuition lines use a 50% teacher share.
- Centre-funded discounts do not reduce the teacher earning basis.
- Student non-payment does not reduce earned teacher salary.
- Mini supports at most four active students and converts to normal when the fifth remains enrolled.
- Normal never automatically or manually downgrades to mini merely because only four students remain.
- Individual supports one active student.

## Payments and cash

- Support full and piece-by-piece receipts.
- Allocate a payment to the oldest outstanding invoice first.
- Preserve excess payment as an auditable student advance.
- Require a valid open cash shift for cash receipts and cash outflows.
- Make receipts, allocations, advances, removals, expense payments, salary payouts, adjustments, and reversals idempotent.
- Reconcile opening cash + receipts + other cash income - removals/outflows to the expected closing cash.

## Expenses and financial position

- Approved fixed recurring amounts: Rent 10,500,000 UZS; Accountant 500,000 UZS; Wi-Fi 400,000 UZS.
- Keep Tax, electricity, and gas recurring but require an authorized monthly amount until approved fixed values exist.
- Always support an auditable Other expense with recipient, date, amount, explanation, proof reference, actor, and branch scope.
- Separate accrued income/profit from cash collection. Collections are not profit.
- Reconcile net tuition + other accrued income - earned teacher salary - accrued operating expenses to accrued operating profit.
- Show receivables, overdue balances, advances, outstanding salary, outstanding expenses, cash inflow/outflow, and cashbox position separately.

## Billing controls

- Keep the teacher salary due day configurable; current default is the 5th.
- Keep student due and freeze days configurable.
- In shadow mode, never automatically freeze a student. Produce recommendations only.
- Financial reminders remain mandatory even if optional parent notifications are disabled.
