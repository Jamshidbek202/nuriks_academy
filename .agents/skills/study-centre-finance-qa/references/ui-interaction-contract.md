# UI Interaction and Live Synchronization Contract

## Core rule

Treat a workflow as working only when a user can complete it through the real
interface and every affected screen shows the correct committed result. An API
success, database row, or plausible screenshot alone is insufficient.

## Build the interaction manifest

Before testing, inventory every visible interactive control by route, tab,
role, viewport, and prerequisite state. Include buttons, links, tabs, dialogs,
pickers, menus, date controls, time controls, search, refresh, and submit flows.
Map each control to its request, expected ledger/database effect, audit record,
visible success result, and visible failure result. Report any control that has
no handler, is covered by another layer, cannot receive an ordinary click, or
has no observable result.

At minimum, cover every finance control for:

- draft calculation and month finalization;
- invoice debit/credit correction, reversal, and replacement;
- cash receipt, piece payment, overpayment, advance, and receipt reversal;
- recurring generation, manual recurring amount, Other expense creation,
  expense correction, payment from cashbox, and payment reversal;
- teacher payout and reversal;
- cashbox open, removal, other income, close, discrepancy decision, and
  reversals;
- tariffs, teacher shares, recurring policies, and billing dates;
- lesson generation, resolution, exception approval/rejection, replacement,
  and centre closure.

## Prove every button

Use an ordinary user click or tap. Do not use forced clicks and do not replace a
button test with a direct API call.

For each button:

1. Assert it is visible, unobscured, and enabled only when prerequisites are
   satisfied. Display a specific reason when it is disabled.
2. Click it and require visual acknowledgement within 250 ms: pressed, loading,
   disabled-in-flight, dialog, validation, or navigation state.
3. Assert exactly one intended request is emitted with the correct role, branch,
   month, IDs, whole-UZS amount, date, and idempotency key.
4. Assert success commits exactly once and creates the required immutable and
   audit records. Double-click or retry must not duplicate money.
5. Assert the initiating screen updates and clears loading state.
6. Assert every affected open observer session updates to its own authorized
   projection without refresh, navigation, or relogin.
7. Assert validation, permission, prerequisite, conflict, and server failures
   show a useful message and leave the prior verified snapshot intact. A silent
   no-op or endless spinner is a failure.

Test both mouse and phone-sized touch interaction. Fail controls that are under
an overlay, outside the usable scroll area, too difficult to tap reliably, or
visually enabled while functionally disabled.

## Prevent stale UI data

Open independent browser contexts for super admin, manager A, manager B, and
reception where permitted. Use at least super admin and the affected manager on
every finance mutation.

For each create, edit, state transition, payment, finalization, or reversal:

1. Capture the scoped API and independent ledger totals before the action.
2. Perform the action through one browser session.
3. Wait on state assertions, not a fixed sleep.
4. Require the actor and affected observers to show the new rows, statuses, and
   totals within two seconds under local QA conditions; record P2 if correctness
   arrives only after two seconds and fail the release gate at four seconds.
5. Keep any safety polling interval above the four-second gate so polling cannot
   masquerade as live delivery.
6. Compare every rendered amount to the freshly scoped API and reconcile that
   API to invoices, lines, receipts, allocations, earnings, expenses, income,
   and cash events.
7. Confirm unaffected branches receive no foreign records or values.

Never solve a stale assertion by refreshing the page, changing tabs, reopening
the route, increasing a fixed sleep, or weakening the expected amount.

## Sweep stale state across the application

After the finance gate, apply the same two-session pattern to every server-backed
screen that super admin, manager, reception, or teacher can change. Inventory
the application routes instead of relying on a remembered page list. Include,
where present, leads and conversion, students and memberships, groups and
schedules, attendance, journal, homework, tests, payments, staff, settings,
notifications, and finance.

For each create, edit, delete/archive, conversion, assignment, status change,
and submission control, prove that:

- the real button or field works through ordinary mouse and phone interaction;
- the actor sees the saved result without reopening the page;
- an already-open authorized observer sees the new row, detail, status, count,
  or total without manual refresh;
- an unauthorized role receives neither the data nor an enabled control;
- returning focus, reconnecting, or receiving reordered responses cannot restore
  an older snapshot;
- empty, validation, loading, success, and server-error states remain usable.

Report untested visible controls. Do not summarize a page as passed merely
because one representative button worked.

## Reconcile role totals

Use explicit fixture totals and the same service month in all sessions. Assert
the API response also identifies the intended branch scope.

- Manager A must equal the branch-A ledger projection.
- Manager B must equal the branch-B ledger projection.
- Super-admin global revenue must equal the full ledger projection. With
  non-negative invoice and income fixtures, it cannot be below either included
  branch revenue.
- Super-admin branch-selected revenue must equal that manager branch.
- Accrued revenue means net draft/finalized tuition plus posted other accrued
  income. Do not compare it to legacy analytics or cash collected.
- Expenses, payroll, receivables, advances, profit, cash inflow, outflow, and
  cashbox position must each use their approved accounting definition.

Include explicit stale-data regressions:

- admin 10,000,000 UZS while the included manager branch shows 13,000,000 UZS;
- admin 3,000,000 UZS while the seeded affected manager shows 0 UZS;
- an expense row changes but accrued expense, outstanding expense, profit, or
  the other authorized session remains unchanged;
- a finalized invoice exists but revenue, receivables, payroll, or the other
  session remains on the draft snapshot.

## Finalize-month contract

Test the actual Finalize month button, including its confirmation dialog.

- When lessons are unresolved, require an explicit readiness error and no
  partial invoice or payroll commit.
- When ready, require visible in-flight state, one request, finalized invoices,
  immutable invoice lines, teacher earnings, notification jobs, and updated
  revenue/receivables/payroll in all affected sessions.
- A click that produces no dialog, request, validation message, or state change
  is a P1 release-blocking defect because users cannot close the financial
  month.

## Expense and cashbox contract

Create and edit an expense through the UI, then use the actual Pay from cashbox
button. Test no open shift, insufficient cash, partial payout, full payout,
correction, reversal, and retry.

After every step, reconcile the expense row, accrued amount, paid amount,
outstanding amount, accrued profit, cash outflow, cashbox position, outgoing
payment event, and both super-admin and manager screens. Fail buttons that do
not open their form, cannot be clicked, or complete without updating all
dependent projections.

## Date and time controls

Scan the whole application, not only Finance, whenever running a release UI
audit.

- Provide a calendar or platform date picker for every exact date field.
- Provide a month picker for service-month fields when users choose a month.
- When time is required, provide a separate time picker; do not require users to
  type a combined date-time string.
- Display the chosen date and time unambiguously in Asia/Tashkent.
- Test month/year navigation, leap day, month end, year end, daylight/UTC
  conversion boundaries, minimum/maximum dates, cancel, clear where allowed,
  invalid manual input rejection, keyboard access, and phone touch behavior.
- Flag a raw `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` text field as P2 even if its API
  currently accepts the value.

## Responsiveness and evidence

Run at representative desktop and phone widths. With the current two-user
operating load, record:

- click-to-feedback time;
- mutation response time;
- commit-to-actor-render time;
- commit-to-observer-render time;
- duplicate request count;
- console errors, failed network requests, and unhandled dialogs.

Retain a trace, screenshot, request/response summary, actor/role/branch/month,
before/after UI values, API values, ledger values, and exact timing for every
failure. Do not call the UI gate passed while any visible finance control is
untested or any value needs a manual refresh to become correct.
