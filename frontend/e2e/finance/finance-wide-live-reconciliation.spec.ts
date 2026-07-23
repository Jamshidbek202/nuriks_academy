import { APIRequestContext, Browser, BrowserContext, expect, Page, test } from '@playwright/test';

const API_URL = 'http://127.0.0.1:8001/api';
const PASSWORD = 'FinanceQA@2026';
const LIVE_TIMEOUT_MS = 4_000;

const ids = {
  login: 'login-email-input',
  password: 'login-password-input',
  submit: 'login-submit-button',
  screen: 'finance-screen',
  overview: 'finance-tab-overview',
  receivablesTab: 'finance-tab-receivables',
  expensesTab: 'finance-tab-expenses',
  payrollTab: 'finance-tab-payroll',
  cashTab: 'finance-tab-cash',
  pricingTab: 'finance-tab-pricing',
  closuresTab: 'finance-tab-closures',
  accruedRevenue: 'finance-kpi-accrued-revenue',
  accruedProfit: 'finance-kpi-accrued-profit',
  cashReceived: 'finance-kpi-cash-received',
  cashboxPosition: 'finance-kpi-cashbox-position',
  receivables: 'finance-kpi-receivables',
  overdue: 'finance-kpi-overdue',
  grossTuition: 'finance-gross-tuition',
  netTuition: 'finance-net-tuition',
  otherIncomeTotal: 'finance-other-income-total',
  salaryEarned: 'finance-salary-earned',
  salaryOutstanding: 'finance-salary-outstanding',
  expensesAccrued: 'finance-expenses-accrued',
  expensesOutstanding: 'finance-expenses-outstanding',
  cashOutflow: 'finance-cash-outflow',
  advances: 'finance-advance-balances',
  receiptStudent: 'finance-receipt-student',
  receiptAmount: 'finance-receipt-amount',
  receiptNotes: 'finance-receipt-notes',
  receiptSubmit: 'finance-receipt-submit',
  invoiceCorrectionAmount: 'finance-invoice-correction-amount',
  invoiceCorrectionReason: 'finance-invoice-correction-reason',
  invoiceCorrectionSubmit: 'finance-invoice-correction-submit',
  invoiceReversalReason: 'finance-invoice-reversal-reason',
  invoiceReversalSubmit: 'finance-invoice-reversal-submit',
  receiptReversalReason: 'finance-receipt-reversal-reason',
  receiptReversalSubmit: 'finance-receipt-reversal-submit',
  generateRecurring: 'finance-generate-recurring',
  expenseTotal: 'finance-expenses-accrued',
  recipient: 'finance-other-expense-recipient',
  amount: 'finance-other-expense-amount',
  explanation: 'finance-other-expense-explanation',
  record: 'finance-other-expense-submit',
  correctionAmount: 'finance-expense-correction-amount',
  correctionReason: 'finance-expense-correction-reason',
  correctionSubmit: 'finance-expense-correction-submit',
  manualExpenseAmount: 'finance-manual-expense-amount',
  manualExpenseSubmit: 'finance-manual-expense-submit',
  outgoingAmount: 'finance-outgoing-amount',
  outgoingSubmit: 'finance-outgoing-submit',
  cashOpeningAmount: 'finance-cash-opening-amount',
  cashOpen: 'finance-cash-open',
  cashClosingAmount: 'finance-cash-closing-amount',
  cashClose: 'finance-cash-close',
  cashExpectedKpi: 'finance-cash-expected-kpi',
  otherIncomeSource: 'finance-other-income-source',
  otherIncomeAmount: 'finance-other-income-amount',
  otherIncomeNotes: 'finance-other-income-notes',
  otherIncomeSubmit: 'finance-other-income-submit',
  cashRemovalAmount: 'finance-cash-removal-amount',
  cashRemovalPurpose: 'finance-cash-removal-purpose',
  cashRemovalSubmit: 'finance-cash-removal-submit',
  discrepancyReason: 'finance-discrepancy-reason',
  discrepancyAccept: 'finance-discrepancy-accept',
  cashReversalReason: 'finance-cash-reversal-reason',
  cashReversalSubmit: 'finance-cash-reversal-submit',
  tariffAmount: 'finance-tariff-amount',
  tariffReason: 'finance-tariff-reason',
  tariffSubmit: 'finance-tariff-submit',
  teacherSharePercentage: 'finance-teacher-share-percentage',
  teacherShareReason: 'finance-teacher-share-reason',
  teacherShareSubmit: 'finance-teacher-share-submit',
  recurringKey: 'finance-recurring-key',
  recurringName: 'finance-recurring-name',
  recurringAmount: 'finance-recurring-amount',
  recurringReason: 'finance-recurring-reason',
  recurringSubmit: 'finance-recurring-submit',
  billingDue: 'finance-billing-due',
  billingFreeze: 'finance-billing-freeze',
  billingSalary: 'finance-billing-salary',
  billingReason: 'finance-billing-reason',
  billingSubmit: 'finance-billing-submit',
  lessonGroup: 'finance-lesson-group',
};

type Position = Record<string, number | boolean | string | null | undefined>;
type Session = {
  context: BrowserContext;
  page: Page;
  frames: string[];
};

const parseUzs = (text: string | null) => {
  const normalized = String(text || '').replace(/[^\d-]/g, '');
  if (!normalized || normalized === '-') throw new Error(`Cannot parse UZS from: ${text}`);
  return Number(normalized);
};

const tashkentParts = () => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]),
);

const serviceMonth = () => {
  const value = tashkentParts();
  return `${value.year}-${value.month}`;
};

async function apiLogin(request: APIRequestContext, login: string) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { login, password: PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function apiGet<T>(request: APIRequestContext, token: string, path: string): Promise<T> {
  const response = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function apiPost<T>(
  request: APIRequestContext,
  token: string,
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const response = await request.post(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function loginUi(browser: Browser, loginName: string, financeTabName = 'Finance'): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  page.on('dialog', (dialog) => void dialog.accept());
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });
  await page.goto('/login');
  await page.getByTestId(ids.login).fill(loginName);
  await page.getByTestId(ids.password).fill(PASSWORD);
  await page.getByTestId(ids.submit).click();
  const financeTab = page.getByRole('tab', { name: financeTabName });
  await expect(financeTab).toBeVisible({ timeout: 15_000 });
  await financeTab.click();
  await expect(page.getByTestId(ids.screen)).toBeVisible({ timeout: 15_000 });
  return { context, page, frames };
}

async function expectLiveMoney(page: Page, testId: string, expected: number) {
  await expect.poll(
    async () => parseUzs(await page.getByTestId(testId).textContent()),
    { timeout: LIVE_TIMEOUT_MS },
  ).toBe(expected);
}

async function expectPosition(page: Page, position: Position) {
  await page.getByTestId(ids.overview).click();
  const expected = new Map<string, number>([
    [ids.accruedRevenue, Number(position.net_tuition_uzs) + Number(position.other_income_uzs)],
    [ids.accruedProfit, Number(position.accrued_operating_profit_uzs)],
    [ids.cashReceived, Number(position.cash_received_uzs)],
    [ids.cashboxPosition, Number(position.cashbox_position_uzs)],
    [ids.receivables, Number(position.receivables_uzs)],
    [ids.overdue, Number(position.overdue_uzs)],
    [ids.grossTuition, Number(position.gross_tuition_uzs)],
    [ids.netTuition, Number(position.net_tuition_uzs)],
    [ids.otherIncomeTotal, Number(position.other_income_uzs)],
    [ids.salaryEarned, Number(position.teacher_salary_earned_uzs)],
    [ids.salaryOutstanding, Number(position.teacher_salary_outstanding_uzs)],
    [ids.expensesAccrued, Number(position.expenses_accrued_uzs)],
    [ids.expensesOutstanding, Number(position.expenses_outstanding_uzs)],
    [ids.cashOutflow, Number(position.period_cash_outflow_uzs)],
    [ids.advances, Number(position.advance_balances_uzs)],
  ]);
  for (const [testId, value] of expected) await expectLiveMoney(page, testId, value);
}

async function waitForRows<T extends { id: string }>(
  request: APIRequestContext,
  token: string,
  path: string,
  predicate: (rows: T[]) => boolean,
) {
  let rows: T[] = [];
  await expect.poll(async () => {
    rows = await apiGet<T[]>(request, token, path);
    return predicate(rows);
  }, { timeout: LIVE_TIMEOUT_MS }).toBe(true);
  return rows;
}

test('every finance-page domain synchronizes live across authorized sessions', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const month = serviceMonth();
  const managerToken = await apiLogin(request, 'qa_manager_a');
  const managerBToken = await apiLogin(request, 'qa_manager_b');
  const superToken = await apiLogin(request, 'qa_superadmin');
  const receptionToken = await apiLogin(request, 'qa_reception_a');

  const groups = await apiGet<any[]>(request, managerToken, '/groups?limit=1000');
  const students = await apiGet<any[]>(request, managerToken, '/students?limit=1000');
  const group = groups.find((row) => row.name === 'QA Live Finance Group');
  const student = students.find((row) => row.student_id === 'QA-LIVE-001');
  expect(group).toBeTruthy();
  expect(student).toBeTruthy();

  const manager = await loginUi(browser, 'qa_manager_a');
  const managerB = await loginUi(browser, 'qa_manager_b');
  const superAdmin = await loginUi(browser, 'qa_superadmin');
  const reception = await loginUi(browser, 'qa_reception_a', 'Payments');
  const sessions = [manager, managerB, superAdmin, reception];
  for (const session of sessions) {
    await expect.poll(
      () => session.frames.some((frame) => frame.includes('finance_ready')),
      { timeout: LIVE_TIMEOUT_MS },
    ).toBe(true);
  }

  let finalizedInvoice: any;
  let teacherEarning: any;
  let shift: any;
  let secondReceipt: any;
  let otherExpense: any;

  await test.step('closures and lesson resolution update both finance calendars live', async () => {
    const occurrences = await apiGet<any[]>(
      request,
      managerToken,
      `/finance/lesson-occurrences?group_id=${group.id}&month=${month}`,
    );
    const unresolved = occurrences.filter((row) => row.resolution_status === 'unresolved');
    expect(unresolved).toHaveLength(2);
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.closuresTab).click();
      await page.getByTestId(ids.lessonGroup).selectOption(group.id);
      await expect(page.getByTestId(`finance-lesson-row-${unresolved[0].id}`)).toBeVisible();
    }

    managerB.frames.length = 0;
    const closureTitle = `Live closure ${Date.now()}`;
    const closure = await apiPost<any>(request, managerToken, '/finance/closures', {
      title: closureTitle,
      reason: 'Finance-wide live UI closure test',
      kind: 'unexpected',
      starts_at: `${unresolved[0].local_date}T00:00`,
      ends_at: `${unresolved[0].local_date}T23:59`,
      branch_id: null,
      group_ids: [group.id],
    });
    for (const page of [manager.page, superAdmin.page]) {
      const closureRow = page.getByTestId(`finance-closure-row-${closure.id}`);
      await expect(closureRow).toContainText(closureTitle, { timeout: LIVE_TIMEOUT_MS });
      await expect(page.getByTestId(`finance-lesson-row-${unresolved[0].id}`)).toContainText(
        'centre closed',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    await managerB.page.waitForTimeout(750);
    expect(managerB.frames.some((frame) => frame.includes('finance_changed'))).toBe(false);

    await apiPost(request, managerToken, `/finance/lesson-occurrences/${unresolved[1].id}/resolve`, {
      resolution: 'held',
      reason: null,
      substitute_teacher_id: null,
      idempotency_key: `qa:browser:resolve:${unresolved[1].id}`,
    });
    for (const page of [manager.page, superAdmin.page]) {
      await expect(page.getByTestId(`finance-lesson-row-${unresolved[1].id}`)).toContainText(
        'resolved',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
  });

  await test.step('tariff, share, recurring policy, and billing calendar versions update managers live', async () => {
    for (const page of [manager.page, superAdmin.page]) await page.getByTestId(ids.pricingTab).click();

    await superAdmin.page.getByTestId(ids.tariffAmount).fill('460000');
    await superAdmin.page.getByTestId(ids.tariffReason).fill('Finance live tariff version');
    await superAdmin.page.getByTestId(ids.tariffSubmit).click();
    await expect(manager.page.getByTestId('finance-tariff-row-tariff:general:normal')).toContainText(
      '460,000',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId(ids.teacherSharePercentage).fill('41');
    await superAdmin.page.getByTestId(ids.teacherShareReason).fill('Finance live share version');
    await superAdmin.page.getByTestId(ids.teacherShareSubmit).click();
    await expect(manager.page.getByTestId('finance-teacher-share-row-teacher_share:normal')).toContainText(
      '41%',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId(ids.recurringKey).fill('security');
    await superAdmin.page.getByTestId(ids.recurringName).fill('Security');
    await superAdmin.page.getByTestId(ids.recurringAmount).fill('600000');
    await superAdmin.page.getByTestId(ids.recurringReason).fill('Finance live recurring policy');
    await superAdmin.page.getByTestId(ids.recurringSubmit).click();
    await expect(manager.page.getByTestId('finance-recurring-row-expense:security')).toContainText(
      '600,000',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId(ids.billingDue).fill('12');
    await superAdmin.page.getByTestId(ids.billingFreeze).fill('13');
    await superAdmin.page.getByTestId(ids.billingSalary).fill('6');
    await superAdmin.page.getByTestId(ids.billingReason).fill('Finance live billing calendar');
    await superAdmin.page.getByTestId(ids.billingSubmit).click();
    await expect.poll(() => manager.page.getByTestId(ids.billingDue).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('12');
    await expect.poll(() => manager.page.getByTestId(ids.billingFreeze).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('13');
    await expect.poll(() => manager.page.getByTestId(ids.billingSalary).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('6');
  });

  await test.step('invoice finalization updates revenue, receivables, payroll, and reception live', async () => {
    const drafts = await apiPost<any>(request, managerToken, '/finance/invoices/generate-drafts', {
      service_month: month,
      branch_id: null,
    });
    expect(drafts.invoice_count).toBe(1);
    expect(drafts.not_ready_count).toBe(0);
    const draftRows = await waitForRows<any>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
      (rows) => rows.some((row) => row.student_id === student.id && row.status === 'draft'),
    );
    const draft = draftRows.find((row) => row.student_id === student.id && row.status === 'draft');
    for (const page of [manager.page, superAdmin.page, reception.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-invoice-row-${draft.id}`)).toContainText(
        'DRAFT',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    await managerB.page.getByTestId(ids.receivablesTab).click();
    await expect(managerB.page.getByTestId(`finance-invoice-row-${draft.id}`)).toHaveCount(0);

    const finalized = await apiPost<any>(request, managerToken, '/finance/invoices/finalize-month', {
      service_month: month,
      branch_id: null,
      idempotency_key: `qa:browser:finalize:${month}`,
    });
    expect(finalized.finalized_invoice_count).toBe(1);
    const invoiceRows = await waitForRows<any>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
      (rows) => rows.some((row) => row.id === draft.id && row.status === 'finalized'),
    );
    finalizedInvoice = invoiceRows.find((row) => row.id === draft.id);
    for (const page of [manager.page, superAdmin.page, reception.page]) {
      await expect(page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`)).toContainText(
        finalizedInvoice.invoice_number,
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    const earnings = await apiGet<any[]>(
      request,
      managerToken,
      `/finance/teacher-earnings?service_month=${month}`,
    );
    teacherEarning = earnings[0];
    expect(teacherEarning.earned_amount_uzs).toBeGreaterThan(0);
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.payrollTab).click();
      await expect(page.getByTestId(`finance-payroll-row-${teacherEarning.id}`)).toContainText(
        String(teacherEarning.earned_amount_uzs).slice(0, 2),
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    const managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    const superPosition = await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`);
    expect(Number(managerPosition.gross_tuition_uzs)).toBe(finalized.amount_due_uzs);
    await expectPosition(manager.page, managerPosition);
    await expectPosition(superAdmin.page, superPosition);
  });

  await test.step('reception cash receipts update debt, cash, overpayment advance, and all roles live', async () => {
    await reception.page.getByTestId(ids.cashTab).click();
    await reception.page.getByTestId(ids.cashOpeningAmount).fill('20000000');
    await reception.page.getByTestId(ids.cashOpen).click();
    await expect.poll(async () => {
      shift = await apiGet<any>(request, receptionToken, '/finance/cash-shifts/current');
      return shift?.status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('open');
    await manager.page.getByTestId(ids.cashTab).click();
    await expectLiveMoney(manager.page, 'finance-cash-opening-kpi', 20_000_000);

    await reception.page.getByTestId(ids.receivablesTab).click();
    await reception.page.getByTestId(ids.receiptStudent).selectOption(student.id);
    await reception.page.getByTestId(ids.receiptAmount).fill('100000');
    await reception.page.getByTestId(ids.receiptNotes).fill('First live partial payment');
    await reception.page.getByTestId(ids.receiptSubmit).click();
    let receipts = await waitForRows<any>(
      request,
      receptionToken,
      '/finance/receipts?limit=100',
      (rows) => rows.length === 1,
    );
    const firstReceipt = receipts[0];
    for (const page of [manager.page, superAdmin.page, reception.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-receipt-row-${firstReceipt.id}`)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    }
    let managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    await expectPosition(manager.page, managerPosition);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));

    const invoiceAfterPartial = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
    )).find((row) => row.id === finalizedInvoice.id);
    const overpayment = invoiceAfterPartial.balance_uzs + 50_000;
    await reception.page.getByTestId(ids.receiptStudent).selectOption(student.id);
    await reception.page.getByTestId(ids.receiptAmount).fill(String(overpayment));
    await reception.page.getByTestId(ids.receiptNotes).fill('Live overpayment creates advance');
    await reception.page.getByTestId(ids.receiptSubmit).click();
    receipts = await waitForRows<any>(
      request,
      receptionToken,
      '/finance/receipts?limit=100',
      (rows) => rows.length === 2,
    );
    secondReceipt = receipts.find((row) => row.id !== firstReceipt.id);
    managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    expect(managerPosition.advance_balances_uzs).toBe(50_000);
    expect(managerPosition.receivables_uzs).toBe(0);
    await expectPosition(manager.page, managerPosition);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));

    await superAdmin.page.getByTestId(ids.receivablesTab).click();
    const receiptRow = superAdmin.page.getByTestId(`finance-receipt-row-${secondReceipt.id}`);
    await receiptRow.getByText('Reverse receipt').click();
    await superAdmin.page.getByTestId(ids.receiptReversalReason).fill('Reverse overpayment for live synchronization audit');
    await superAdmin.page.getByTestId(ids.receiptReversalSubmit).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, superToken, '/finance/receipts?limit=100');
      return rows.find((row) => row.id === secondReceipt.id)?.status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('reversed');
    managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    expect(managerPosition.advance_balances_uzs).toBe(0);
    await expectPosition(manager.page, managerPosition);
    await reception.page.getByTestId(ids.receivablesTab).click();
    await expect(reception.page.getByTestId(`finance-receipt-row-${secondReceipt.id}`)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
  });

  await test.step('invoice adjustments update revenue and balances live without changing payroll', async () => {
    const earnedBefore = teacherEarning.earned_amount_uzs;
    await manager.page.getByTestId(ids.receivablesTab).click();
    await manager.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`).getByText('Add debit').click();
    await manager.page.getByTestId(ids.invoiceCorrectionAmount).fill('20000');
    await manager.page.getByTestId(ids.invoiceCorrectionReason).fill('Live debit synchronization correction');
    await manager.page.getByTestId(ids.invoiceCorrectionSubmit).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, `/finance/invoices?service_month=${month}&limit=100`);
      return rows.find((row) => row.id === finalizedInvoice.id)?.amount_due_uzs;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe(finalizedInvoice.amount_due_uzs + 20_000);
    const position = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    await expectPosition(manager.page, position);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
    const earnings = await apiGet<any[]>(request, managerToken, `/finance/teacher-earnings?service_month=${month}`);
    expect(earnings[0].earned_amount_uzs).toBe(earnedBefore);
  });

  await test.step('expense creation, recurring obligations, manual amounts, corrections, payouts, and reversals stay live', async () => {
    const recipient = `Finance live supplier ${Date.now()}`;
    await manager.page.getByTestId(ids.expensesTab).click();
    await manager.page.getByTestId(ids.recipient).fill(recipient);
    await manager.page.getByTestId(ids.amount).fill('250000');
    await manager.page.getByTestId(ids.explanation).fill('Finance-wide manager expense synchronization');
    await manager.page.getByTestId(ids.record).click();
    let expenses = await waitForRows<any>(
      request,
      managerToken,
      `/finance/expenses?service_month=${month}&limit=200`,
      (rows) => rows.some((row) => row.recipient === recipient),
    );
    otherExpense = expenses.find((row) => row.recipient === recipient);
    await superAdmin.page.getByTestId(ids.expensesTab).click();
    await expect(superAdmin.page.getByTestId(`finance-expense-row-${otherExpense.id}`)).toContainText(
      recipient,
      { timeout: LIVE_TIMEOUT_MS },
    );

    const superExpenseRow = superAdmin.page.getByTestId(`finance-expense-row-${otherExpense.id}`);
    await superExpenseRow.getByText('Correct accrued amount').click();
    await superAdmin.page.getByTestId(ids.correctionAmount).fill('325000');
    await superAdmin.page.getByTestId(ids.correctionReason).fill('Authorized live expense correction');
    await superAdmin.page.getByTestId(ids.correctionSubmit).click();
    await expect(manager.page.getByTestId(`finance-expense-row-${otherExpense.id}`)).toContainText(
      '325',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await manager.page.getByTestId(ids.generateRecurring).click();
    expenses = await waitForRows<any>(
      request,
      managerToken,
      `/finance/expenses?service_month=${month}&limit=200`,
      (rows) => rows.some((row) => row.category === 'Rent') && rows.some((row) => row.category === 'Tax'),
    );
    const tax = expenses.find((row) => row.category === 'Tax');
    await expect(superAdmin.page.getByText('Rent', { exact: true }).first()).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    await manager.page.getByTestId(`finance-expense-row-${tax.id}`).getByText("Enter this month's actual amount").click();
    await manager.page.getByTestId(ids.manualExpenseAmount).fill('300000');
    await manager.page.getByTestId(ids.manualExpenseSubmit).click();
    await expect(superAdmin.page.getByTestId(`finance-expense-row-${tax.id}`)).toContainText(
      '300',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await manager.page.getByTestId(`finance-expense-row-${otherExpense.id}`).getByText('Pay from cashbox').click();
    await manager.page.getByTestId(ids.outgoingAmount).fill('100000');
    await manager.page.getByTestId(ids.outgoingSubmit).click();
    let outgoing = await waitForRows<any>(
      request,
      superToken,
      '/finance/outgoing-payments?limit=200',
      (rows) => rows.some((row) => row.payment_kind === 'expense' && row.source_id === otherExpense.id && row.status === 'posted'),
    );
    const expensePayment = outgoing.find((row) => row.payment_kind === 'expense' && row.source_id === otherExpense.id);
    let position = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    await expectPosition(manager.page, position);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));

    await superAdmin.page.getByTestId(ids.cashTab).click();
    await superAdmin.page.getByTestId(`finance-outgoing-row-expense-${expensePayment.id}`).getByText('Reverse payout').click();
    await superAdmin.page.getByTestId(ids.cashReversalReason).fill('Reverse expense payout for live synchronization audit');
    await superAdmin.page.getByTestId(ids.cashReversalSubmit).click();
    outgoing = await waitForRows<any>(
      request,
      superToken,
      '/finance/outgoing-payments?limit=200',
      (rows) => rows.some((row) => row.id === expensePayment.id && row.status === 'reversed'),
    );
    expect(outgoing.find((row) => row.id === expensePayment.id)?.status).toBe('reversed');
    position = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    await expectPosition(manager.page, position);
  });

  await test.step('teacher payouts and reversals update payroll, cash outflow, and cashbox live', async () => {
    await manager.page.getByTestId(ids.payrollTab).click();
    await manager.page.getByTestId(`finance-payroll-row-${teacherEarning.id}`).getByText('Pay from cashbox').click();
    await manager.page.getByTestId(ids.outgoingAmount).fill('50000');
    await manager.page.getByTestId(ids.outgoingSubmit).click();
    const outgoing = await waitForRows<any>(
      request,
      superToken,
      '/finance/outgoing-payments?limit=200',
      (rows) => rows.some((row) => row.payment_kind === 'teacher' && row.source_id === teacherEarning.id && row.status === 'posted'),
    );
    const payout = outgoing.find((row) => row.payment_kind === 'teacher' && row.source_id === teacherEarning.id);
    await expectPosition(manager.page, await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`));
    await superAdmin.page.getByTestId(ids.cashTab).click();
    await superAdmin.page.getByTestId(`finance-outgoing-row-teacher-${payout.id}`).getByText('Reverse payout').click();
    await superAdmin.page.getByTestId(ids.cashReversalReason).fill('Reverse payroll payout for live synchronization audit');
    await superAdmin.page.getByTestId(ids.cashReversalSubmit).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, superToken, '/finance/outgoing-payments?limit=200');
      return rows.find((row) => row.id === payout.id)?.status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('reversed');
    await expectPosition(manager.page, await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`));
  });

  await test.step('other income, reversal, and authorized removal update revenue and cash live', async () => {
    const source = `Live income ${Date.now()}`;
    await manager.page.getByTestId(ids.cashTab).click();
    await manager.page.getByTestId(ids.otherIncomeSource).fill(source);
    await manager.page.getByTestId(ids.otherIncomeAmount).fill('75000');
    await manager.page.getByTestId(ids.otherIncomeNotes).fill('Finance-wide live other income');
    await manager.page.getByTestId(ids.otherIncomeSubmit).click();
    const incomeRows = await waitForRows<any>(
      request,
      managerToken,
      `/finance/other-income?service_month=${month}&limit=100`,
      (rows) => rows.some((row) => row.source === source),
    );
    const income = incomeRows.find((row) => row.source === source);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
    await superAdmin.page.getByTestId(ids.cashTab).click();
    await superAdmin.page.getByTestId(`finance-other-income-row-${income.id}`).getByText('Reverse other income').click();
    await superAdmin.page.getByTestId(ids.cashReversalReason).fill('Reverse other income for live synchronization audit');
    await superAdmin.page.getByTestId(ids.cashReversalSubmit).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, `/finance/other-income?service_month=${month}&limit=100`);
      return rows.some((row) => row.id === income.id);
    }, { timeout: LIVE_TIMEOUT_MS }).toBe(false);
    await expectPosition(manager.page, await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`));

    await manager.page.getByTestId(ids.cashTab).click();
    await manager.page.getByTestId(ids.cashRemovalAmount).fill('25000');
    await manager.page.getByTestId(ids.cashRemovalPurpose).fill('Live QA bank deposit');
    await manager.page.getByTestId(ids.cashRemovalSubmit).click();
    await expect.poll(async () => {
      const events = await apiGet<any[]>(request, managerToken, '/finance/cash-events?limit=200');
      return events.some((row) => row.purpose === 'Live QA bank deposit');
    }, { timeout: LIVE_TIMEOUT_MS }).toBe(true);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
  });

  await test.step('cash close and discrepancy review synchronize operator and administrators live', async () => {
    await reception.page.getByTestId(ids.cashTab).click();
    const expectedCash = parseUzs(await reception.page.getByTestId(ids.cashExpectedKpi).textContent());
    await reception.page.getByTestId(ids.cashClosingAmount).fill(String(expectedCash - 10_000));
    await reception.page.getByTestId(ids.cashClose).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, superToken, '/finance/cash-shifts?limit=100');
      shift = rows.find((row) => row.id === shift.id);
      return `${shift?.status}:${shift?.discrepancy_status}`;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('closed:pending_review');
    await superAdmin.page.getByTestId(ids.cashTab).click();
    const shiftRow = superAdmin.page.getByTestId(`finance-cash-shift-row-${shift.id}`);
    await expect(shiftRow).toContainText('pending review', { timeout: LIVE_TIMEOUT_MS });
    await shiftRow.getByText('Review discrepancy').click();
    await superAdmin.page.getByTestId(ids.discrepancyReason).fill('Count verified during finance live synchronization audit');
    await superAdmin.page.getByTestId(ids.discrepancyAccept).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, '/finance/cash-shifts?limit=100');
      return rows.find((row) => row.id === shift.id)?.discrepancy_status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('accepted');
    await manager.page.getByTestId(ids.cashTab).click();
    await expect(manager.page.getByTestId(`finance-cash-shift-row-${shift.id}`)).toContainText(
      'accepted',
      { timeout: LIVE_TIMEOUT_MS },
    );
    await expect(reception.page.getByTestId(ids.cashOpen)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
  });

  await test.step('invoice reversal and replacement update all ledgers while earned payroll remains immutable', async () => {
    const earnedBefore = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/teacher-earnings?service_month=${month}`,
    ))[0].earned_amount_uzs;
    await superAdmin.page.getByTestId(ids.receivablesTab).click();
    await superAdmin.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`).getByText('Reverse').click();
    await superAdmin.page.getByTestId(ids.invoiceReversalReason).fill('Reverse finalized invoice for complete live synchronization audit');
    await superAdmin.page.getByTestId(ids.invoiceReversalSubmit).click();
    const invoices = await waitForRows<any>(
      request,
      superToken,
      `/finance/invoices?service_month=${month}&limit=100`,
      (rows) => rows.some((row) => row.id === finalizedInvoice.id && row.status === 'reversed')
        && rows.some((row) => row.replaces_invoice_id === finalizedInvoice.id && row.status === 'draft'),
    );
    const replacement = invoices.find((row) => row.replaces_invoice_id === finalizedInvoice.id);
    for (const page of [manager.page, superAdmin.page, reception.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`)).toContainText(
        'reversed',
        { timeout: LIVE_TIMEOUT_MS },
      );
      await expect(page.getByTestId(`finance-invoice-row-${replacement.id}`)).toContainText(
        'DRAFT',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    const earnedAfter = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/teacher-earnings?service_month=${month}`,
    ))[0].earned_amount_uzs;
    expect(earnedAfter).toBe(earnedBefore);
    await expectPosition(manager.page, await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`));
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
  });

  // Every assertion above completes before the 10-second reconciliation poll,
  // proving the finance_changed WebSocket invalidation drove the UI refresh.
  expect(await apiGet<Position>(request, managerBToken, `/finance/position?service_month=${month}`)).toBeTruthy();
  await Promise.all(sessions.map((session) => session.context.close()));
});
