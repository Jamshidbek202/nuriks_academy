import { APIRequestContext, Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';

const API_URL = process.env.FINANCE_E2E_API_URL || 'http://127.0.0.1:8001/api';
const PASSWORD = 'FinanceQA@2026';
const LIVE_TIMEOUT_MS = 4_000;
const REMOTE_LIVE_AUDIT = process.env.REMOTE_LIVE_AUDIT === '1';
const REMOTE_IDENTITIES: Record<string, string> = {
  qa_superadmin: '+998990000001',
  qa_manager_a: '+998990000002',
  qa_manager_b: '+998990000003',
  qa_reception_a: '+998990000004',
  qa_teacher_a: '+998990000005',
  qa_student_a: '+998990000006',
  qa_parent_a: '+998990000007',
  qa_support_a: '+998990000008',
};
const loginIdentity = (value: string) => REMOTE_LIVE_AUDIT ? (REMOTE_IDENTITIES[value] || value) : value;

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
  onlineTab: 'finance-tab-online',
  pricingTab: 'finance-tab-pricing',
  closuresTab: 'finance-tab-closures',
  actionModal: 'finance-action-modal',
  actionModalClose: 'finance-action-modal-close',
  accruedRevenue: 'finance-kpi-accrued-revenue',
  accruedProfit: 'finance-kpi-accrued-profit',
  cashReceived: 'finance-kpi-cash-received',
  cardReceived: 'finance-kpi-card-received',
  totalCollections: 'finance-kpi-total-collections',
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
  studentSearch: 'finance-student-search',
  studentSearchResults: 'finance-student-search-results',
  receiptStudent: 'finance-receipt-student',
  receiptAmount: 'finance-receipt-amount',
  receiptNotes: 'finance-receipt-notes',
  receiptSubmit: 'finance-receipt-submit',
  unfreezeDate: 'finance-unfreeze-date',
  unfreezeReason: 'finance-unfreeze-reason',
  unfreezeSubmit: 'finance-unfreeze-submit',
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
  discrepancyInvestigate: 'finance-discrepancy-investigate',
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
  closureTitle: 'finance-closure-title',
  closureReason: 'finance-closure-reason',
  closureStarts: 'finance-closure-starts',
  closureEnds: 'finance-closure-ends',
  closureSubmit: 'finance-closure-submit',
  finalizeMonth: 'finance-finalize-month',
  destinationAdd: 'finance-payment-destination-add',
  destinationProvider: 'finance-payment-destination-provider',
  destinationCardNumber: 'finance-payment-destination-card-number',
  destinationCardholder: 'finance-payment-destination-cardholder',
  destinationLabel: 'finance-payment-destination-label',
  destinationSubmit: 'finance-payment-destination-submit',
  cardReportReason: 'finance-card-report-reason',
  cardReportResolve: 'finance-card-report-resolve',
};

type Position = Record<string, number | boolean | string | null | undefined>;
type Session = {
  context: BrowserContext;
  page: Page;
  frames: string[];
  dialogs: string[];
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

const monthOffset = (month: string, offset: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const value = new Date(year, monthNumber - 1 + offset, 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
};

async function apiLogin(request: APIRequestContext, login: string) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { login: loginIdentity(login), password: PASSWORD },
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
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(`${dialog.type()}:${dialog.message()}`);
    void dialog.accept();
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });
  await page.goto(REMOTE_LIVE_AUDIT ? '/' : '/login');
  await page.getByTestId(ids.login).fill(loginIdentity(loginName));
  await page.getByTestId(ids.password).fill(PASSWORD);
  await page.getByTestId(ids.submit).click();
  const financeTab = page.getByRole('tab', { name: financeTabName });
  await expect(financeTab).toBeVisible({ timeout: 15_000 });
  await financeTab.click();
  await expect(page.getByTestId(ids.screen)).toBeVisible({ timeout: 15_000 });
  return { context, page, frames, dialogs };
}

async function loginPaymentsUi(browser: Browser, loginName: 'qa_parent_a' | 'qa_student_a'): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(`${dialog.type()}:${dialog.message()}`);
    void dialog.accept();
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });
  await page.goto(REMOTE_LIVE_AUDIT ? '/' : '/login');
  await page.getByTestId(ids.login).fill(loginIdentity(loginName));
  await page.getByTestId(ids.password).fill(PASSWORD);
  await page.getByTestId(ids.submit).click();
  const paymentsTab = page.getByRole('tab', { name: 'Payments' });
  await expect(paymentsTab).toBeVisible({ timeout: 15_000 });
  await paymentsTab.click();
  await expect(page.getByText('Live lesson charges, official invoices, payments, and receipts')).toBeVisible({ timeout: 15_000 });
  return { context, page, frames, dialogs };
}

async function loginTeacherUi(browser: Browser, tab: 'Attendance' | 'Earnings'): Promise<Session> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(`${dialog.type()}:${dialog.message()}`);
    void dialog.accept();
  });
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => frames.push(String(event.payload)));
  });
  await page.goto(REMOTE_LIVE_AUDIT ? '/' : '/login');
  await page.getByTestId(ids.login).fill(loginIdentity('qa_teacher_a'));
  await page.getByTestId(ids.password).fill(PASSWORD);
  await page.getByTestId(ids.submit).click();
  const target = page.getByRole('tab', { name: tab });
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.click();
  if (tab === 'Earnings') {
    await expect(page.getByTestId('teacher-earnings-page')).toBeVisible({ timeout: 15_000 });
  } else {
    await expect(page.getByText('Mark and track student attendance')).toBeVisible({ timeout: 15_000 });
  }
  return { context, page, frames, dialogs };
}

const closureKindPicker = (page: Page) => page.locator('select').filter({
  has: page.locator('option[value="unexpected"]'),
});

const closureScopePicker = (page: Page) => page.locator('select').filter({
  has: page.locator('option', { hasText: 'All centre / branch groups' }),
});

async function fillClosure(
  page: Page,
  values: {
    title: string;
    reason: string;
    kind: 'holiday' | 'unexpected';
    groupId: string;
    startsAt: string;
    endsAt: string;
  },
) {
  await page.getByTestId(ids.closureTitle).fill(values.title);
  await page.getByTestId(ids.closureReason).fill(values.reason);
  await closureKindPicker(page).selectOption(values.kind);
  await closureScopePicker(page).selectOption(values.groupId);
  await selectDateTime(page, ids.closureStarts, values.startsAt);
  await selectDateTime(page, ids.closureEnds, values.endsAt);
}

async function selectDateTime(page: Page, testId: string, value: string) {
  const [date, time] = value.split('T');
  const currentValue = await page.getByTestId(`${testId}-date`).getAttribute('aria-label');
  const parsedCurrent = new Date(`${currentValue || ''}T00:00:00`);
  const currentYear = Number.isNaN(parsedCurrent.getTime()) ? new Date().getFullYear() : parsedCurrent.getFullYear();
  const targetYear = Number(date.slice(0, 4));
  const targetMonth = Number(date.slice(5, 7));
  const localeMonth = new Date(targetYear, targetMonth - 1, 1).toLocaleString('en-US', { month: 'short' });
  const currentMonth = Number.isNaN(parsedCurrent.getTime()) ? new Date().getMonth() + 1 : parsedCurrent.getMonth() + 1;
  const difference = ((targetYear - currentYear) * 12) + targetMonth - currentMonth;

  await page.getByTestId(`${testId}-date`).click();
  const navigation = page.getByTestId(`${testId}-date-${difference >= 0 ? 'next' : 'previous'}`);
  for (let index = 0; index < Math.abs(difference); index += 1) await navigation.click({ timeout: LIVE_TIMEOUT_MS });
  const dateOption = page.getByTestId(`${testId}-date-option-${date}`);
  await expect(dateOption).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
  await dateOption.click({ timeout: LIVE_TIMEOUT_MS });

  await page.getByTestId(`${testId}-time`).click();
  await page.getByTestId(`${testId}-time-hour`).selectOption(time.slice(0, 2));
  await page.getByTestId(`${testId}-time-minute`).selectOption(time.slice(3, 5));
  await page.getByTestId(`${testId}-time-apply`).click();
  await expect(page.getByTestId(testId)).toContainText(localeMonth);
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
    [ids.cardReceived, Number(position.card_transfer_received_uzs)],
    [ids.totalCollections, Number(position.total_collections_uzs)],
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

async function expectCompactActionModal(page: Page) {
  const modal = page.getByTestId(ids.actionModal);
  await expect(modal).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
  const [box, viewport] = await Promise.all([modal.boundingBox(), Promise.resolve(page.viewportSize())]);
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(box!.width).toBeLessThanOrEqual(Math.min(540, viewport!.width));
}

async function selectFinanceStudent(page: Page, student: any, query: string) {
  await page.getByTestId(ids.studentSearch).fill(query);
  const result = page.getByTestId(`finance-student-result-${student.id}`);
  await expect(result).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
  await result.click();
  await expect(page.getByTestId(ids.receiptStudent)).toContainText(student.student_id);
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

test('every finance-page domain synchronizes live across authorized sessions', async ({ browser, request }, testInfo) => {
  test.setTimeout(REMOTE_LIVE_AUDIT ? 900_000 : 300_000);
  const month = serviceMonth();
  const mongoUrl = process.env.MONGO_URL;
  const databaseName = process.env.DB_NAME;
  expect(mongoUrl).toBeTruthy();
  expect(databaseName).toMatch(/(?:^|[_-])(test|qa|sandbox|shadow)(?:[_-]|$)/i);
  const mongoClient = new MongoClient(mongoUrl!);
  await mongoClient.connect();
  const qaDb = mongoClient.db(databaseName);
  const focusedEvidence: Record<string, unknown>[] = [];
  const focusedFailures: string[] = [];
  const managerToken = await apiLogin(request, 'qa_manager_a');
  const managerBToken = await apiLogin(request, 'qa_manager_b');
  const superToken = await apiLogin(request, 'qa_superadmin');
  const receptionToken = await apiLogin(request, 'qa_reception_a');
  const teacherToken = await apiLogin(request, 'qa_teacher_a');
  const studentToken = await apiLogin(request, 'qa_student_a');

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
  const parent = await loginPaymentsUi(browser, 'qa_parent_a');
  const studentPayments = await loginPaymentsUi(browser, 'qa_student_a');
  const teacherAttendance = await loginTeacherUi(browser, 'Attendance');
  const teacherEarnings = await loginTeacherUi(browser, 'Earnings');
  const sessions = [manager, managerB, superAdmin, reception, parent, studentPayments, teacherAttendance, teacherEarnings];
  const financeLiveSessions = [manager, managerB, superAdmin, reception, parent, studentPayments, teacherEarnings];
  for (const session of financeLiveSessions) {
    await expect.poll(
      () => session.frames.some((frame) => frame.includes('finance_ready')),
      { timeout: LIVE_TIMEOUT_MS },
    ).toBe(true);
  }

  let finalizedInvoice: any;
  let teacherEarning: any;
  let shift: any;
  let lockedOccurrenceForClosure: any;
  let secondReceipt: any;
  let otherExpense: any;
  const resumeAfterFinalization = process.env.FINANCE_RESUME_AFTER_FINALIZATION === '1';

  if (resumeAfterFinalization) {
    await qaDb.collection('branches').updateMany(
      { qa_key: { $in: ['branch-a', 'branch-b'] } },
      { $set: { is_active: true } },
    );
    const invoices = await apiGet<any[]>(request, managerToken, `/finance/invoices?service_month=${month}&limit=100`);
    finalizedInvoice = invoices.find((row) => row.status === 'finalized');
    const earnings = await apiGet<any[]>(request, managerToken, `/finance/teacher-earnings?service_month=${month}`);
    teacherEarning = earnings[0];
    const occurrences = await apiGet<any[]>(
      request,
      managerToken,
      `/finance/lesson-occurrences?group_id=${group.id}&month=${month}`,
    );
    lockedOccurrenceForClosure = occurrences.find((row) => row.locked_at && row.lesson_status === 'held');
    expect(finalizedInvoice, 'resume requires a finalized invoice').toBeTruthy();
    expect(teacherEarning, 'resume requires a teacher earning').toBeTruthy();
    expect(lockedOccurrenceForClosure, 'resume requires a financially locked held lesson').toBeTruthy();
  }

  if (!resumeAfterFinalization) await test.step('attendance completion updates teacher earnings and student charges live', async () => {
    await apiPost(request, managerToken, '/finance/invoices/generate-drafts', {
      service_month: month,
      branch_id: group.branch_id,
    });
    const occurrences = await apiGet<any[]>(
      request,
      managerToken,
      `/finance/lesson-occurrences?group_id=${group.id}&month=${month}`,
    );
    const unresolved = occurrences.filter((row) => row.resolution_status === 'unresolved');
    expect(unresolved).toHaveLength(3);
    const today = `${tashkentParts().year}-${tashkentParts().month}-${tashkentParts().day}`;
    const target = unresolved.find((row) => row.local_date === today);
    expect(target).toBeTruthy();
    expect(target.local_date).toBe(today);
    await qaDb.collection('lesson_occurrences').updateOne(
      { _id: new ObjectId(target.id) },
      { $set: {
        starts_at: new Date(Date.now() - 95 * 60_000),
        ends_at: new Date(Date.now() - 5 * 60_000),
      } },
    );
    // The attendance page was opened before the test clock adjustment. Reload
    // so the real control receives the committed occurrence end time rather
    // than clicking a correctly disabled stale copy.
    await teacherAttendance.page.reload();
    await expect(teacherAttendance.page.getByText('Attendance missing for 1 student(s).')).toBeVisible({
      timeout: LIVE_TIMEOUT_MS,
    });

    const baselineEarnings = await apiGet<any>(
      request,
      teacherToken,
      `/finance/teacher-earnings/summary?service_month=${month}`,
    );
    const baselineInvoices = await apiGet<any[]>(
      request,
      studentToken,
      `/finance/invoices?service_month=${month}`,
    );
    const baselineDraft = baselineInvoices.find((row) => row.status === 'draft');
    expect(baselineDraft).toBeTruthy();
    await expectLiveMoney(teacherEarnings.page, 'teacher-earned-to-date', baselineEarnings.earned_to_date_uzs);
    await expectLiveMoney(studentPayments.page, `student-rolling-accrued-${baselineDraft.id}`, baselineDraft.amount_due_uzs);

    const present = teacherAttendance.page.getByRole('button', { name: 'Live Student: Present' });
    await expect(present).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    await Promise.all([
      teacherAttendance.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith('/api/attendance')),
      present.click(),
    ]);
    await expect(teacherAttendance.page.getByText('This adds one lesson charge per active student and updates your earnings.')).toBeVisible({
      timeout: LIVE_TIMEOUT_MS,
    });
    const complete = teacherAttendance.page.getByTestId(`attendance-complete-lesson-${target.id}`);
    teacherEarnings.frames.length = 0;
    studentPayments.frames.length = 0;
    const startedAt = Date.now();
    const [completionResponse] = await Promise.all([
      teacherAttendance.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith(`/api/finance/lesson-occurrences/${target.id}/resolve`)),
      complete.click(),
    ]);
    expect(completionResponse.ok(), await completionResponse.text()).toBeTruthy();
    const updatedEarnings = await apiGet<any>(
      request,
      teacherToken,
      `/finance/teacher-earnings/summary?service_month=${month}`,
    );
    const updatedInvoices = await apiGet<any[]>(
      request,
      studentToken,
      `/finance/invoices?service_month=${month}`,
    );
    const updatedDraft = updatedInvoices.find((row) => row.id === baselineDraft.id);
    expect(updatedDraft.amount_due_uzs).toBeGreaterThan(baselineDraft.amount_due_uzs);
    expect(updatedEarnings.earned_to_date_uzs).toBeGreaterThan(baselineEarnings.earned_to_date_uzs);
    await expectLiveMoney(teacherEarnings.page, 'teacher-earned-to-date', updatedEarnings.earned_to_date_uzs);
    await expectLiveMoney(studentPayments.page, `student-rolling-accrued-${baselineDraft.id}`, updatedDraft.amount_due_uzs);
    expect(Date.now() - startedAt).toBeLessThanOrEqual(LIVE_TIMEOUT_MS);
    expect(teacherEarnings.frames.some((frame) => frame.includes('finance_changed'))).toBe(true);
    expect(studentPayments.frames.some((frame) => frame.includes('finance_changed'))).toBe(true);
    focusedEvidence.push({
      workflow: 'rolling-lesson-accrual',
      lesson_id: target.id,
      student_charge_before_uzs: baselineDraft.amount_due_uzs,
      student_charge_after_uzs: updatedDraft.amount_due_uzs,
      teacher_earned_before_uzs: baselineEarnings.earned_to_date_uzs,
      teacher_earned_after_uzs: updatedEarnings.earned_to_date_uzs,
      observer_rendered_ms: Date.now() - startedAt,
    });
    await testInfo.attach('rolling-lesson-accrual-live.png', {
      body: await teacherEarnings.page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  if (process.env.FINANCE_SKIP_FREEZE_WORKFLOW !== '1') await test.step('financial freeze is visible to staff and only super admin can unfreeze after payment review', async () => {
    for (const session of [manager, superAdmin]) {
      await session.page.getByTestId(ids.receivablesTab).click();
      await expect(session.page.getByText(/Financially frozen students/)).toBeVisible();
    }
    await reception.page.getByTestId(ids.receivablesTab).click();
    await expect(reception.page.getByText(/Financially frozen students/)).toHaveCount(0);

    const freezeReason = `QA overdue freeze ${Date.now()}`;
    const freezeStartedAt = Date.now();
    const freezeResponse = await request.post(`${API_URL}/finance/students/${student.id}/freeze-override`, {
      headers: { Authorization: `Bearer ${superToken}` },
      data: {
        action: 'freeze',
        effective_on: `${month}-01`,
        reason: freezeReason,
        idempotency_key: `qa-freeze-${student.id}-${Date.now()}`,
      },
    });
    expect(freezeResponse.ok(), await freezeResponse.text()).toBeTruthy();

    for (const session of [manager, superAdmin]) {
      await expect(session.page.getByTestId(`finance-frozen-student-${student.id}`)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    }
    const freezeObserverRenderedMs = Date.now() - freezeStartedAt;
    await expect(manager.page.getByTestId(`finance-unfreeze-student-${student.id}`)).toHaveCount(0);
    await expect(reception.page.getByTestId(`finance-unfreeze-student-${student.id}`)).toHaveCount(0);
    await expect(superAdmin.page.getByTestId(`finance-unfreeze-student-${student.id}`)).toBeVisible();

    const managerOverride = await request.post(`${API_URL}/finance/students/${student.id}/freeze-override`, {
      headers: { Authorization: `Bearer ${managerToken}` },
      data: {
        action: 'unfreeze',
        effective_on: `${month}-02`,
        reason: 'Manager must not be allowed to release finance freeze',
        idempotency_key: `qa-manager-unfreeze-${student.id}-${Date.now()}`,
      },
    });
    expect(managerOverride.status()).toBe(403);

    await superAdmin.page.getByTestId(`finance-unfreeze-student-${student.id}`).click();
    await expectCompactActionModal(superAdmin.page);
    await expect(superAdmin.page.getByTestId(ids.unfreezeDate)).toBeVisible();
    await superAdmin.page.getByTestId(ids.unfreezeReason).fill('Payment receipt and overdue balance verified by super admin');
    await testInfo.attach('finance-frozen-super-admin-review.png', {
      body: await superAdmin.page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    let unfreezeRequests = 0;
    const unfreezeListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().endsWith(`/api/finance/students/${student.id}/freeze-override`)) {
        unfreezeRequests += 1;
      }
    };
    superAdmin.page.on('request', unfreezeListener);
    const unfreezeResponsePromise = superAdmin.page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith(`/api/finance/students/${student.id}/freeze-override`));
    const unfreezeStartedAt = Date.now();
    const unfreezeSubmit = superAdmin.page.getByTestId(ids.unfreezeSubmit);
    await Promise.allSettled([
      unfreezeSubmit.click(),
      unfreezeSubmit.click({ timeout: 1_000 }),
    ]);
    const unfreezeResponse = await unfreezeResponsePromise;
    superAdmin.page.off('request', unfreezeListener);
    expect(unfreezeResponse.ok(), await unfreezeResponse.text()).toBeTruthy();
    expect(unfreezeRequests).toBe(1);

    await expect.poll(async () => {
      const stored = await qaDb.collection('students').findOne({ _id: new ObjectId(student.id) });
      return { status: stored?.status, financeFrozen: stored?.finance_frozen };
    }, { timeout: LIVE_TIMEOUT_MS }).toEqual({ status: 'active', financeFrozen: false });
    expect(await qaDb.collection('finance_freeze_override_events').countDocuments({
      student_id: student.id,
      action: 'unfreeze',
      reason: 'Payment receipt and overdue balance verified by super admin',
    })).toBe(1);
    expect(await qaDb.collection('audit_logs').countDocuments({
      action: 'finance_freeze_override',
      resource_id: student.id,
    })).toBeGreaterThanOrEqual(2);

    for (const session of [manager, superAdmin]) {
      await expect(session.page.getByTestId(`finance-frozen-student-${student.id}`)).toHaveCount(0, { timeout: LIVE_TIMEOUT_MS });
    }
    const unfreezeObserverRenderedMs = Date.now() - unfreezeStartedAt;
    focusedEvidence.push({
      workflow: 'manual-unfreeze-after-payment-review',
      freezeObserverRenderedMs,
      unfreezeObserverRenderedMs,
      unfreezeRequests,
      actor: 'super_admin',
      managerDeniedStatus: managerOverride.status(),
      auditRecords: 2,
    });
    await testInfo.attach('finance-unfrozen-live-synchronized.png', {
      body: await superAdmin.page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  if (!resumeAfterFinalization) await test.step('all closure kinds and scopes work through the UI and synchronize live', async () => {
    const occurrences = await apiGet<any[]>(
      request,
      managerToken,
      `/finance/lesson-occurrences?group_id=${group.id}&month=${month}`,
    );
    const unresolved = occurrences.filter((row) => row.resolution_status === 'unresolved');
    expect(unresolved).toHaveLength(2);
    lockedOccurrenceForClosure = unresolved[1];
    for (const page of [manager.page, managerB.page, superAdmin.page]) {
      await page.getByTestId(ids.closuresTab).click();
    }
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.lessonGroup).selectOption(group.id);
      await expect(page.getByTestId(`finance-lesson-row-${unresolved[0].id}`)).toBeVisible();
    }

    manager.dialogs.length = 0;
    let validationRequests = 0;
    const validationListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().endsWith('/api/finance/closures')) validationRequests += 1;
    };
    manager.page.on('request', validationListener);
    await manager.page.getByTestId(ids.closureTitle).fill('');
    await manager.page.getByTestId(ids.closureReason).fill('x');
    await manager.page.getByTestId(ids.closureSubmit).click();
    await manager.page.waitForTimeout(300);
    manager.page.off('request', validationListener);
    expect(validationRequests).toBe(0);
    if (!manager.dialogs.some((message) => message.includes('Title and reason are required'))) {
      focusedFailures.push('Closure required-field validation produced no visible feedback.');
    }

    managerB.frames.length = 0;
    const groupClosureTitle = `Group unexpected closure ${Date.now()}`;
    await fillClosure(manager.page, {
      title: groupClosureTitle,
      reason: 'Group-scoped unexpected closure through the manager UI',
      kind: 'unexpected',
      groupId: group.id,
      startsAt: `${unresolved[0].local_date}T00:00`,
      endsAt: `${unresolved[0].local_date}T23:59`,
    });
    let closureRequestCount = 0;
    const closureRequestListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().endsWith('/api/finance/closures')) closureRequestCount += 1;
    };
    manager.page.on('request', closureRequestListener);
    const groupClosureStartedAt = Date.now();
    const [groupClosureResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/finance/closures')),
      manager.page.getByTestId(ids.closureSubmit).click(),
    ]);
    manager.page.off('request', closureRequestListener);
    expect(groupClosureResponse.ok(), await groupClosureResponse.text()).toBeTruthy();
    expect(closureRequestCount).toBe(1);
    const groupClosure = await groupClosureResponse.json();
    expect(groupClosure.kind).toBe('unexpected');
    expect(groupClosure.branch_id).toBe(group.branch_id);
    expect(groupClosure.group_ids).toEqual([group.id]);
    for (const page of [manager.page, superAdmin.page]) {
      const closureRow = page.getByTestId(`finance-closure-row-${groupClosure.id}`);
      await expect(closureRow).toContainText(groupClosureTitle, { timeout: LIVE_TIMEOUT_MS });
      await expect(page.getByTestId(`finance-lesson-row-${unresolved[0].id}`)).toContainText(
        'centre closed',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    const groupClosureObserverMs = Date.now() - groupClosureStartedAt;
    await expect(managerB.page.getByTestId(`finance-closure-row-${groupClosure.id}`)).toHaveCount(0);
    await managerB.page.waitForTimeout(300);
    expect(managerB.frames.some((frame) => frame.includes('finance_changed'))).toBe(false);

    const branchClosureTitle = `Branch holiday closure ${Date.now()}`;
    await manager.page.setViewportSize({ width: 390, height: 844 });
    await fillClosure(manager.page, {
      title: branchClosureTitle,
      reason: 'Branch-wide official holiday through the manager UI',
      kind: 'holiday',
      groupId: '',
      startsAt: `${monthOffset(month, 1)}-10T00:00`,
      endsAt: `${monthOffset(month, 1)}-10T23:59`,
    });
    let branchClosureRequestCount = 0;
    const branchClosureListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().endsWith('/api/finance/closures')) branchClosureRequestCount += 1;
    };
    manager.page.on('request', branchClosureListener);
    const branchClosureResponsePromise = manager.page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith('/api/finance/closures'));
    const branchClosureSubmit = manager.page.getByTestId(ids.closureSubmit);
    await Promise.allSettled([
      branchClosureSubmit.click(),
      branchClosureSubmit.click({ timeout: 1_000 }),
    ]);
    const branchClosureResponse = await branchClosureResponsePromise;
    manager.page.off('request', branchClosureListener);
    expect(branchClosureResponse.ok(), await branchClosureResponse.text()).toBeTruthy();
    expect(branchClosureRequestCount).toBe(1);
    const branchClosure = await branchClosureResponse.json();
    expect(branchClosure.kind).toBe('holiday');
    expect(branchClosure.branch_id).toBe(group.branch_id);
    expect(branchClosure.group_ids).toEqual([]);
    expect(await qaDb.collection('finance_closures').countDocuments({ title: branchClosureTitle })).toBe(1);
    await expect(superAdmin.page.getByTestId(`finance-closure-row-${branchClosure.id}`)).toContainText(
      branchClosureTitle,
      { timeout: LIVE_TIMEOUT_MS },
    );
    await expect(managerB.page.getByTestId(`finance-closure-row-${branchClosure.id}`)).toHaveCount(0);
    await manager.page.setViewportSize({ width: 1280, height: 720 });

    const globalClosureTitle = `Global unexpected closure ${Date.now()}`;
    await fillClosure(superAdmin.page, {
      title: globalClosureTitle,
      reason: 'Centre-wide unexpected closure through the super-admin UI',
      kind: 'unexpected',
      groupId: '',
      startsAt: `${monthOffset(month, 1)}-11T00:00`,
      endsAt: `${monthOffset(month, 1)}-11T23:59`,
    });
    const globalClosureStartedAt = Date.now();
    const [globalClosureResponse] = await Promise.all([
      superAdmin.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/finance/closures')),
      superAdmin.page.getByTestId(ids.closureSubmit).click(),
    ]);
    expect(globalClosureResponse.ok(), await globalClosureResponse.text()).toBeTruthy();
    const globalClosure = await globalClosureResponse.json();
    expect(globalClosure.branch_id).toBeNull();
    expect(globalClosure.group_ids).toEqual([]);
    for (const page of [manager.page, managerB.page, superAdmin.page]) {
      await expect(page.getByTestId(`finance-closure-row-${globalClosure.id}`)).toContainText(
        globalClosureTitle,
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    const globalClosureObserverMs = Date.now() - globalClosureStartedAt;

    const managerBClosures = await apiGet<any[]>(request, managerBToken, '/finance/closures?limit=500');
    expect(managerBClosures.some((row) => row.id === globalClosure.id)).toBe(true);
    expect(managerBClosures.some((row) => row.id === groupClosure.id || row.id === branchClosure.id)).toBe(false);
    for (const closure of [groupClosure, branchClosure, globalClosure]) {
      const stored = await qaDb.collection('finance_closures').findOne({ _id: new ObjectId(closure.id) });
      expect(stored?.immutable).toBe(true);
      expect(await qaDb.collection('audit_logs').countDocuments({
        action: 'create', resource_type: 'finance_closure', resource_id: closure.id,
      })).toBe(1);
    }

    const invalidRangeTitle = `Invalid closure range ${Date.now()}`;
    await fillClosure(manager.page, {
      title: invalidRangeTitle,
      reason: 'End before start must be rejected without a ledger change',
      kind: 'holiday',
      groupId: group.id,
      startsAt: `${monthOffset(month, 1)}-12T10:00`,
      endsAt: `${monthOffset(month, 1)}-12T09:00`,
    });
    manager.dialogs.length = 0;
    const [invalidRangeResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/finance/closures')),
      manager.page.getByTestId(ids.closureSubmit).click(),
    ]);
    expect(invalidRangeResponse.status()).toBe(422);
    expect(await qaDb.collection('finance_closures').countDocuments({ title: invalidRangeTitle })).toBe(0);
    await manager.page.waitForTimeout(100);
    if (!manager.dialogs.some((message) => message.includes('Closure end must be after its start'))) {
      focusedFailures.push('Invalid closure date range produced no visible error feedback.');
    }

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
    focusedEvidence.push({
      workflow: 'closures',
      group_scope_actor_to_observer_ms: groupClosureObserverMs,
      global_scope_actor_to_observer_ms: globalClosureObserverMs,
      kinds: ['holiday', 'unexpected'],
      scopes: ['group', 'manager_branch', 'global'],
      phone_viewport_workflow: 'manager branch-wide holiday closure',
      rapid_click_request_count: branchClosureRequestCount,
      invalid_required_rejected_without_request: validationRequests === 0,
      invalid_range_status: invalidRangeResponse.status(),
    });
  });

  if (!resumeAfterFinalization) await test.step('tariff, share, recurring policy, and billing calendar versions update managers live', async () => {
    for (const page of [manager.page, superAdmin.page]) await page.getByTestId(ids.pricingTab).click();

    const submitPolicyAndWaitForCommit = async (endpoint: string, submitTestId: string) => {
      const [response] = await Promise.all([
        superAdmin.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
          && candidate.url().endsWith(`${API_URL}${endpoint}`)),
        superAdmin.page.getByTestId(submitTestId).click(),
      ]);
      expect(response.ok(), await response.text()).toBeTruthy();
    };

    await expect(superAdmin.page.getByTestId('finance-course-pricing-general')).toContainText('QA General English');
    await superAdmin.page.getByTestId('finance-edit-tariff-general-normal').click();
    await superAdmin.page.getByTestId(ids.tariffAmount).fill('460000');
    await superAdmin.page.getByTestId(ids.tariffReason).fill('Finance live tariff version');
    await submitPolicyAndWaitForCommit('/finance/policies/tariffs', ids.tariffSubmit);
    await expect(manager.page.getByTestId('finance-tariff-row-tariff:general:normal')).toContainText(
      '460,000',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId('finance-edit-teacher-share-normal').click();
    await superAdmin.page.getByTestId(ids.teacherSharePercentage).fill('41');
    await superAdmin.page.getByTestId(ids.teacherShareReason).fill('Finance live share version');
    await submitPolicyAndWaitForCommit('/finance/policies/teacher-shares', ids.teacherShareSubmit);
    await expect(manager.page.getByTestId('finance-teacher-share-row-teacher_share:normal')).toContainText(
      '41%',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId(ids.recurringKey).fill('security');
    await superAdmin.page.getByTestId(ids.recurringName).fill('Security');
    await superAdmin.page.getByTestId(ids.recurringAmount).fill('600000');
    await superAdmin.page.getByTestId(ids.recurringReason).fill('Finance live recurring policy');
    await submitPolicyAndWaitForCommit('/finance/policies/recurring-expenses', ids.recurringSubmit);
    await expect(manager.page.getByTestId('finance-recurring-row-expense:security')).toContainText(
      '600,000',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await superAdmin.page.getByTestId(ids.billingDue).fill('12');
    await superAdmin.page.getByTestId(ids.billingFreeze).fill('13');
    await superAdmin.page.getByTestId(ids.billingSalary).fill('6');
    await superAdmin.page.getByTestId(ids.billingReason).fill('Finance live billing calendar');
    await submitPolicyAndWaitForCommit('/finance/policies/billing-rules', ids.billingSubmit);
    await expect.poll(() => manager.page.getByTestId(ids.billingDue).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('12');
    await expect.poll(() => manager.page.getByTestId(ids.billingFreeze).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('13');
    await expect.poll(() => manager.page.getByTestId(ids.billingSalary).inputValue(), { timeout: LIVE_TIMEOUT_MS }).toBe('6');
  });

  if (!resumeAfterFinalization) await test.step('invoice finalization updates revenue, receivables, payroll, and reception live', async () => {
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
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-invoice-row-${draft.id}`)).toContainText(
        'DRAFT',
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('No finalized bill yet');
    await managerB.page.getByTestId(ids.receivablesTab).click();
    await expect(managerB.page.getByTestId(`finance-invoice-row-${draft.id}`)).toHaveCount(0);

    await manager.page.getByTestId(ids.overview).click();
    manager.dialogs.length = 0;
    let finalizeRequestCount = 0;
    const finalizeListener = (candidate: any) => {
      if (candidate.method() === 'POST' && candidate.url().endsWith('/api/finance/invoices/finalize-month')) finalizeRequestCount += 1;
    };
    manager.page.on('request', finalizeListener);
    const [finalizeResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith('/api/finance/invoices/finalize-month')),
      manager.page.getByTestId(ids.finalizeMonth).click(),
    ]);
    manager.page.off('request', finalizeListener);
    expect(finalizeResponse.ok(), await finalizeResponse.text()).toBeTruthy();
    expect(finalizeRequestCount).toBe(1);
    expect(manager.dialogs.some((message) => message.includes('Finalize financial month?'))).toBe(true);
    const finalized = await finalizeResponse.json();
    expect(finalized.finalized_invoice_count).toBe(1);
    const invoiceRows = await waitForRows<any>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
      (rows) => rows.some((row) => row.id === draft.id && row.status === 'finalized'),
    );
    finalizedInvoice = invoiceRows.find((row) => row.id === draft.id);
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`)).toContainText(
        finalizedInvoice.invoice_number,
        { timeout: LIVE_TIMEOUT_MS },
      );
    }
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('Status: unpaid', { timeout: LIVE_TIMEOUT_MS });
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

    const superBranchPosition = await apiGet<Position>(
      request,
      superToken,
      `/finance/position?service_month=${month}&branch_id=${group.branch_id}`,
    );
    const comparableFields = [
      'gross_tuition_uzs', 'centre_funded_discounts_uzs', 'net_tuition_uzs', 'other_income_uzs',
      'cash_received_uzs', 'card_transfer_received_uzs', 'total_collections_uzs',
      'receivables_uzs', 'overdue_uzs', 'advance_balances_uzs',
      'teacher_salary_earned_uzs', 'teacher_salary_paid_uzs', 'teacher_salary_outstanding_uzs',
      'expenses_accrued_uzs', 'expenses_paid_uzs', 'expenses_outstanding_uzs',
      'accrued_operating_profit_uzs', 'period_cash_outflow_uzs', 'cashbox_position_uzs',
    ];
    for (const field of comparableFields) {
      expect(Number(superBranchPosition[field]), `${field} must match for the same branch and month`).toBe(Number(managerPosition[field]));
    }
    const secondBranch = await qaDb.collection('branches').findOne({
      _id: { $ne: new ObjectId(group.branch_id) },
    });
    expect(secondBranch).toBeTruthy();
    await qaDb.collection('branches').updateOne(
      { _id: secondBranch!._id },
      { $set: { is_active: false } },
    );
    const soleBranchPositionRequest = superAdmin.page.waitForRequest((candidate) => {
      if (!candidate.url().includes('/api/finance/position')) return false;
      return new URL(candidate.url()).searchParams.get('branch_id') === group.branch_id;
    });
    if (REMOTE_LIVE_AUDIT) {
      await superAdmin.page.goto('/');
      await superAdmin.page.getByRole('tab', { name: 'Finance' }).first().click();
    } else {
      await superAdmin.page.reload();
    }
    await soleBranchPositionRequest;
    await expect(superAdmin.page.getByTestId(ids.screen)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    await expect(superAdmin.page.getByTestId('finance-position-scope')).toHaveCount(0);
    await expectPosition(superAdmin.page, superBranchPosition);

    await qaDb.collection('branches').updateOne(
      { _id: secondBranch!._id },
      { $set: { is_active: true } },
    );
    const globalPositionRequest = superAdmin.page.waitForRequest((candidate) => {
      if (!candidate.url().includes('/api/finance/position')) return false;
      return new URL(candidate.url()).searchParams.get('branch_id') === null;
    });
    if (REMOTE_LIVE_AUDIT) {
      await superAdmin.page.goto('/');
      await superAdmin.page.getByRole('tab', { name: 'Finance' }).first().click();
    } else {
      await superAdmin.page.reload();
    }
    await globalPositionRequest;
    await expectPosition(superAdmin.page, superPosition);
    focusedEvidence.push({
      workflow: 'single_centre_auto_scope_without_branch_ui',
      branch_id: group.branch_id,
      compared_fields: comparableFields.length,
      all_fields_equal: true,
      branch_selector_visible: false,
    });
  });

  await test.step('parent card report stays non-financial until manager verification and synchronizes live', async () => {
    const amount = 100_000;
    const positionBeforeReport = await apiGet<Position>(
      request,
      managerToken,
      `/finance/position?service_month=${month}`,
    );
    const invoiceBeforeReport = await qaDb.collection('finance_invoices').findOne({
      _id: new ObjectId(finalizedInvoice.id),
    });

    for (const page of [manager.page, managerB.page, superAdmin.page]) {
      await page.getByTestId(ids.onlineTab).click();
    }
    await manager.page.getByTestId(ids.destinationAdd).click();
    await expectCompactActionModal(manager.page);
    await manager.page.getByTestId(ids.destinationProvider).selectOption('click');
    await manager.page.getByTestId(ids.destinationCardNumber).fill('8600123412341234');
    await manager.page.getByTestId(ids.destinationCardholder).fill('NURIKS QA OWNER');
    await manager.page.getByTestId(ids.destinationLabel).fill('QA parent payment card');
    const [destinationResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith('/api/finance/payment-destinations')),
      manager.page.getByTestId(ids.destinationSubmit).click(),
    ]);
    expect(destinationResponse.ok(), await destinationResponse.text()).toBeTruthy();
    const destination = (await destinationResponse.json()).destination;
    await expect(superAdmin.page.getByTestId(`finance-payment-destination-${destination.id}`)).toContainText(
      '1234',
      { timeout: LIVE_TIMEOUT_MS },
    );
    await expect(managerB.page.getByTestId(`finance-payment-destination-${destination.id}`)).toHaveCount(0);
    const storedDestination = await qaDb.collection('finance_payment_destinations').findOne({
      _id: new ObjectId(destination.id),
    });
    expect(storedDestination?.card_number_ciphertext).toBeTruthy();
    expect(JSON.stringify(storedDestination)).not.toContain('8600123412341234');

    await expect(parent.page.getByTestId(`parent-report-payment-${finalizedInvoice.id}`)).toBeVisible({
      timeout: LIVE_TIMEOUT_MS,
    });
    await parent.page.getByTestId(`parent-report-payment-${finalizedInvoice.id}`).click();
    await expect(parent.page.getByTestId('parent-card-payment-modal')).toBeVisible();
    await expect(parent.page.getByTestId('parent-payment-paid-at-date')).toBeVisible();
    await expect(parent.page.getByTestId('parent-payment-paid-at-time')).toBeVisible();
    await parent.page.getByTestId('parent-payment-amount').fill(String(amount));
    let reportRequestCount = 0;
    const reportRequestListener = (candidate: any) => {
      if (candidate.method() === 'POST' && candidate.url().endsWith('/api/finance/card-payment-reports')) {
        reportRequestCount += 1;
      }
    };
    parent.page.on('request', reportRequestListener);
    const reportResponsePromise = parent.page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith('/api/finance/card-payment-reports'));
    const reportButton = parent.page.getByTestId('parent-payment-submit');
    await Promise.allSettled([
      reportButton.click(),
      reportButton.click({ timeout: 1_000 }),
    ]);
    const reportResponse = await reportResponsePromise;
    parent.page.off('request', reportRequestListener);
    expect(reportResponse.ok(), await reportResponse.text()).toBeTruthy();
    expect(reportRequestCount).toBe(1);
    const report = (await reportResponse.json()).report;
    expect(report.status).toBe('unresolved');

    for (const page of [manager.page, superAdmin.page]) {
      await expect(page.getByTestId(`finance-card-report-${report.id}`)).toContainText(
        student.first_name,
        { timeout: LIVE_TIMEOUT_MS },
      );
      await expect(page.getByTestId(`finance-card-report-${report.id}`)).toContainText('100,000');
    }
    await expect(managerB.page.getByTestId(`finance-card-report-${report.id}`)).toHaveCount(0);
    await expect(parent.page.getByTestId(`parent-payment-report-${report.id}`)).toContainText(
      'unresolved',
      { timeout: LIVE_TIMEOUT_MS },
    );
    expect(await qaDb.collection('finance_card_payment_notifications').countDocuments({
      payment_report_id: report.id,
      event: 'card_payment_reported',
    })).toBe(2);

    const positionWhileUnresolved = await apiGet<Position>(
      request,
      managerToken,
      `/finance/position?service_month=${month}`,
    );
    const invoiceWhileUnresolved = await qaDb.collection('finance_invoices').findOne({
      _id: new ObjectId(finalizedInvoice.id),
    });
    expect(positionWhileUnresolved.card_transfer_received_uzs).toBe(positionBeforeReport.card_transfer_received_uzs);
    expect(positionWhileUnresolved.total_collections_uzs).toBe(positionBeforeReport.total_collections_uzs);
    expect(positionWhileUnresolved.receivables_uzs).toBe(positionBeforeReport.receivables_uzs);
    expect(invoiceWhileUnresolved?.amount_paid_uzs).toBe(invoiceBeforeReport?.amount_paid_uzs);
    expect(await qaDb.collection('finance_receipts').countDocuments({})).toBe(0);

    await manager.page.getByTestId(`finance-card-report-confirm-${report.id}`).click();
    await expectCompactActionModal(manager.page);
    await manager.page.getByTestId(ids.cardReportReason).fill(
      'Matched amount, timestamp and destination in Click history',
    );
    let resolutionRequestCount = 0;
    const resolutionRequestListener = (candidate: any) => {
      if (candidate.method() === 'POST' && candidate.url().endsWith(`/api/finance/card-payment-reports/${report.id}/resolve`)) {
        resolutionRequestCount += 1;
      }
    };
    manager.page.on('request', resolutionRequestListener);
    const resolutionResponsePromise = manager.page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith(`/api/finance/card-payment-reports/${report.id}/resolve`));
    const resolveButton = manager.page.getByTestId(ids.cardReportResolve);
    await Promise.allSettled([
      resolveButton.click(),
      resolveButton.click({ timeout: 1_000 }),
    ]);
    const resolutionResponse = await resolutionResponsePromise;
    manager.page.off('request', resolutionRequestListener);
    expect(resolutionResponse.ok(), await resolutionResponse.text()).toBeTruthy();
    expect(resolutionRequestCount).toBe(1);

    await expect(manager.page.getByTestId(`finance-card-report-history-${report.id}`)).toContainText(
      'confirmed',
      { timeout: LIVE_TIMEOUT_MS },
    );
    await expect(superAdmin.page.getByTestId(`finance-card-report-history-${report.id}`)).toContainText(
      'confirmed',
      { timeout: LIVE_TIMEOUT_MS },
    );
    await expect(parent.page.getByTestId(`parent-payment-report-${report.id}`)).toContainText(
      'confirmed',
      { timeout: LIVE_TIMEOUT_MS },
    );
    const receipt = await qaDb.collection('finance_receipts').findOne({ payment_report_id: report.id });
    expect(receipt?.payment_method).toBe('personal_card_transfer');
    expect(receipt?.cash_shift_id).toBeUndefined();
    expect(await qaDb.collection('finance_receipts').countDocuments({ payment_report_id: report.id })).toBe(1);
    const positionAfterConfirmation = await apiGet<Position>(
      request,
      managerToken,
      `/finance/position?service_month=${month}`,
    );
    expect(Number(positionAfterConfirmation.card_transfer_received_uzs)
      - Number(positionBeforeReport.card_transfer_received_uzs)).toBe(amount);
    expect(Number(positionAfterConfirmation.total_collections_uzs)
      - Number(positionBeforeReport.total_collections_uzs)).toBe(amount);
    expect(Number(positionAfterConfirmation.receivables_uzs)
      - Number(positionBeforeReport.receivables_uzs)).toBe(-amount);
    expect(positionAfterConfirmation.cash_received_uzs).toBe(positionBeforeReport.cash_received_uzs);
    expect(positionAfterConfirmation.cashbox_position_uzs).toBe(positionBeforeReport.cashbox_position_uzs);
    expect(positionAfterConfirmation.net_tuition_uzs).toBe(positionBeforeReport.net_tuition_uzs);
    expect(positionAfterConfirmation.accrued_operating_profit_uzs).toBe(positionBeforeReport.accrued_operating_profit_uzs);
    await expectPosition(manager.page, positionAfterConfirmation);
    await expectPosition(
      superAdmin.page,
      await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`),
    );
    focusedEvidence.push({
      workflow: 'parent_personal_card_report_and_confirmation',
      unresolved_financial_delta_uzs: 0,
      confirmed_collection_delta_uzs: amount,
      report_rapid_click_request_count: reportRequestCount,
      confirmation_rapid_click_request_count: resolutionRequestCount,
      staff_notifications: 2,
      manager_branch_isolation: true,
      parent_live_status: 'confirmed',
    });
  });

  await test.step('closure over a financially locked lesson fails closed through the UI', async () => {
    const title = `Locked lesson closure ${Date.now()}`;
    const closureCountBefore = await qaDb.collection('finance_closures').countDocuments({});
    const invoiceBefore = await qaDb.collection('finance_invoices').findOne({ _id: new ObjectId(finalizedInvoice.id) });
    const earningBefore = await qaDb.collection('teacher_earnings').findOne({ _id: new ObjectId(teacherEarning.id) });
    await manager.page.getByTestId(ids.closuresTab).click();
    await fillClosure(manager.page, {
      title,
      reason: 'A closure must not rewrite a financially locked lesson',
      kind: 'unexpected',
      groupId: group.id,
      startsAt: `${lockedOccurrenceForClosure.local_date}T00:00`,
      endsAt: `${lockedOccurrenceForClosure.local_date}T23:59`,
    });
    manager.dialogs.length = 0;
    const lockedRequestPromise = manager.page.waitForRequest((candidate) => candidate.method() === 'POST'
      && candidate.url().endsWith('/api/finance/closures'));
    await manager.page.getByTestId(ids.closureSubmit).click();
    const lockedRequest = await lockedRequestPromise;
    const response = await Promise.race([
      lockedRequest.response(),
      manager.page.waitForTimeout(LIVE_TIMEOUT_MS).then(() => null),
    ]);
    const lockedResponseStatus = response?.status() ?? null;
    const lockedResponseBody = response ? await response.text() : '';
    if (lockedResponseStatus !== 409 || !lockedResponseBody.includes('locked')) {
      focusedFailures.push(`Locked-lesson closure returned ${lockedResponseStatus ?? 'no response'} instead of a clear HTTP 409 conflict.`);
    }
    expect(await qaDb.collection('finance_closures').countDocuments({})).toBe(closureCountBefore);
    expect(await qaDb.collection('finance_closures').countDocuments({ title })).toBe(0);
    const invoiceAfter = await qaDb.collection('finance_invoices').findOne({ _id: new ObjectId(finalizedInvoice.id) });
    const earningAfter = await qaDb.collection('teacher_earnings').findOne({ _id: new ObjectId(teacherEarning.id) });
    expect(invoiceAfter?.amount_due_uzs).toBe(invoiceBefore?.amount_due_uzs);
    expect(invoiceAfter?.status).toBe('finalized');
    expect(earningAfter?.earned_amount_uzs).toBe(earningBefore?.earned_amount_uzs);
    await superAdmin.page.getByTestId(ids.closuresTab).click();
    await expect(superAdmin.page.getByText(title, { exact: true })).toHaveCount(0);
    focusedEvidence.push({
      workflow: 'closure_locked_lesson_rejection',
      status: lockedResponseStatus,
      invoice_uzs_difference: Number(invoiceAfter?.amount_due_uzs) - Number(invoiceBefore?.amount_due_uzs),
      payroll_uzs_difference: Number(earningAfter?.earned_amount_uzs) - Number(earningBefore?.earned_amount_uzs),
    });
  });

  await test.step('reception cash receipts update debt, cash, overpayment advance, and all roles live', async () => {
    await expect.poll(async () => {
      shift = await apiGet<any>(request, receptionToken, '/finance/cash-shifts/current');
      return shift?.status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('open');
    expect(shift).not.toHaveProperty('receipt_total_uzs');
    expect(shift).not.toHaveProperty('opening_balance_uzs');
    await manager.page.getByTestId(ids.cashTab).click();
    await expect(manager.page.getByText('Opened automatically', { exact: false })).toBeVisible();
    await expect(reception.page.getByTestId(ids.cashTab)).toHaveCount(0);

    await reception.page.getByTestId(ids.receivablesTab).click();
    await selectFinanceStudent(reception.page, student, `${student.first_name} ${student.last_name}`);
    await reception.page.getByTestId(ids.studentSearch).fill(student.phone);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toBeVisible();
    await reception.page.getByTestId(ids.studentSearch).fill(finalizedInvoice.invoice_number);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toBeVisible();
    await reception.page.getByTestId(`finance-student-result-${student.id}`).click();
    await reception.page.getByTestId(ids.receiptAmount).fill('100000');
    await reception.page.getByTestId(ids.receiptNotes).fill('First live partial payment');
    let interruptedReceiptRequests = 0;
    await reception.page.route('**/api/finance/receipts/cash', async (route) => {
      if (route.request().method() !== 'POST' || interruptedReceiptRequests > 0) {
        await route.continue();
        return;
      }
      interruptedReceiptRequests += 1;
      const committedResponse = await route.fetch();
      expect(committedResponse.ok(), await committedResponse.text()).toBeTruthy();
      await route.abort('connectionreset');
    });
    reception.dialogs.length = 0;
    await reception.page.getByTestId(ids.receiptSubmit).click();
    await expect(reception.page.getByTestId('finance-receipt-notice')).toContainText('Payment recorded once', { timeout: LIVE_TIMEOUT_MS });
    await reception.page.unroute('**/api/finance/receipts/cash');
    expect(interruptedReceiptRequests).toBe(1);
    expect(reception.dialogs.some((message) => message.includes('Network Error'))).toBe(false);
    let receipts = await waitForRows<any>(
      request,
      managerToken,
      '/finance/receipts?limit=100',
      (rows) => rows.filter((row) => (row.payment_method || 'cash') === 'cash').length === 1,
    );
    const firstReceipt = receipts.find((row) => (row.payment_method || 'cash') === 'cash');
    for (const page of [manager.page, superAdmin.page]) {
      await page.getByTestId(ids.receivablesTab).click();
      await expect(page.getByTestId(`finance-receipt-row-${firstReceipt.id}`)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    }
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('Status: partial', { timeout: LIVE_TIMEOUT_MS });
    let managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    await expectPosition(manager.page, managerPosition);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));

    const invoiceAfterPartial = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
    )).find((row) => row.id === finalizedInvoice.id);
    const overpayment = invoiceAfterPartial.balance_uzs + 50_000;
    await selectFinanceStudent(reception.page, student, student.student_id);
    await reception.page.getByTestId(ids.receiptAmount).fill(String(overpayment));
    await reception.page.getByTestId(ids.receiptNotes).fill('Live overpayment creates advance');
    await reception.page.getByTestId(ids.receiptSubmit).click();
    await expect(reception.page.getByTestId('finance-receipt-notice')).toContainText('Payment recorded once', { timeout: LIVE_TIMEOUT_MS });
    receipts = await waitForRows<any>(
      request,
      managerToken,
      '/finance/receipts?limit=100',
      (rows) => rows.filter((row) => (row.payment_method || 'cash') === 'cash').length === 2,
    );
    secondReceipt = receipts.find((row) => (row.payment_method || 'cash') === 'cash' && row.id !== firstReceipt.id);
    managerPosition = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    expect(managerPosition.advance_balances_uzs).toBe(50_000);
    expect(managerPosition.receivables_uzs).toBe(0);
    await expectPosition(manager.page, managerPosition);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('Status: paid', { timeout: LIVE_TIMEOUT_MS });

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
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText(/Status: (partial|unpaid)/, { timeout: LIVE_TIMEOUT_MS });
  });

  await test.step('invoice adjustments update revenue and balances live without changing payroll', async () => {
    const earnedBefore = teacherEarning.earned_amount_uzs;
    await manager.page.getByTestId(ids.receivablesTab).click();
    await manager.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`).getByText('Add debit').click();
    await expectCompactActionModal(manager.page);
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

    await manager.page.getByTestId(ids.receivablesTab).click();
    const invoiceRow = manager.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`);
    await invoiceRow.getByText('Add credit').click();
    await expectCompactActionModal(manager.page);
    manager.dialogs.length = 0;
    let validationRequests = 0;
    const validationListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/invoices/${finalizedInvoice.id}/adjustments`)) validationRequests += 1;
    };
    manager.page.on('request', validationListener);
    await manager.page.getByTestId(ids.invoiceCorrectionAmount).fill('0');
    await manager.page.getByTestId(ids.invoiceCorrectionReason).fill('bad');
    await manager.page.getByTestId(ids.invoiceCorrectionSubmit).click();
    await manager.page.waitForTimeout(300);
    manager.page.off('request', validationListener);
    expect(validationRequests).toBe(0);
    if (!manager.dialogs.some((message) => message.includes('whole-UZS amount and audit reason'))) {
      focusedFailures.push('Invoice-credit validation produced no visible feedback.');
    }

    const dueAfterDebit = finalizedInvoice.amount_due_uzs + 20_000;
    const adjustmentCountBeforeFailure = await qaDb.collection('finance_invoice_adjustments').countDocuments({
      invoice_id: finalizedInvoice.id,
    });
    await manager.page.getByTestId(ids.invoiceCorrectionAmount).fill(String(dueAfterDebit + 1));
    await manager.page.getByTestId(ids.invoiceCorrectionReason).fill('Oversized credit must fail without changing the invoice');
    manager.dialogs.length = 0;
    const [oversizedResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().includes(`/api/finance/invoices/${finalizedInvoice.id}/adjustments`)),
      manager.page.getByTestId(ids.invoiceCorrectionSubmit).click(),
    ]);
    expect(oversizedResponse.status()).toBe(400);
    expect(await oversizedResponse.text()).toContain('cannot exceed');
    expect(await qaDb.collection('finance_invoice_adjustments').countDocuments({
      invoice_id: finalizedInvoice.id,
    })).toBe(adjustmentCountBeforeFailure);
    await manager.page.waitForTimeout(100);
    if (!manager.dialogs.some((message) => message.includes('cannot exceed'))) {
      focusedFailures.push('Oversized invoice-credit rejection produced no visible error feedback.');
    }
    expect((await apiGet<any[]>(request, managerToken, `/finance/invoices?service_month=${month}&limit=100`))
      .find((row) => row.id === finalizedInvoice.id)?.amount_due_uzs).toBe(dueAfterDebit);

    const creditAmount = 15_000;
    const managerPositionBeforeCredit = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    const teacherBeforeCredit = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/teacher-earnings?service_month=${month}`,
    ))[0].earned_amount_uzs;
    await manager.page.getByTestId(ids.invoiceCorrectionAmount).fill(String(creditAmount));
    await manager.page.getByTestId(ids.invoiceCorrectionReason).fill('Valid credit synchronization and ledger audit');
    let creditRequestCount = 0;
    let creditRequestPayload: Record<string, unknown> | null = null;
    const creditRequestListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/invoices/${finalizedInvoice.id}/adjustments`)) {
        creditRequestCount += 1;
        creditRequestPayload = requestValue.postDataJSON();
      }
    };
    manager.page.on('request', creditRequestListener);
    const creditStartedAt = Date.now();
    const [creditResponse] = await Promise.all([
      manager.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().includes(`/api/finance/invoices/${finalizedInvoice.id}/adjustments`)),
      manager.page.getByTestId(ids.invoiceCorrectionSubmit).click(),
    ]);
    manager.page.off('request', creditRequestListener);
    expect(creditResponse.ok(), await creditResponse.text()).toBeTruthy();
    expect(creditRequestCount).toBe(1);
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, `/finance/invoices?service_month=${month}&limit=100`);
      return rows.find((row) => row.id === finalizedInvoice.id)?.amount_due_uzs;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe(dueAfterDebit - creditAmount);
    const managerPositionAfterCredit = await apiGet<Position>(request, managerToken, `/finance/position?service_month=${month}`);
    expect(Number(managerPositionAfterCredit.net_tuition_uzs) - Number(managerPositionBeforeCredit.net_tuition_uzs)).toBe(-creditAmount);
    expect(Number(managerPositionAfterCredit.receivables_uzs) - Number(managerPositionBeforeCredit.receivables_uzs)).toBe(-creditAmount);
    expect(Number(managerPositionAfterCredit.accrued_operating_profit_uzs) - Number(managerPositionBeforeCredit.accrued_operating_profit_uzs)).toBe(-creditAmount);
    await expectPosition(manager.page, managerPositionAfterCredit);
    await expectPosition(superAdmin.page, await apiGet<Position>(request, superToken, `/finance/position?service_month=${month}`));
    const creditObserverMs = Date.now() - creditStartedAt;
    expect((await apiGet<any[]>(request, managerToken, `/finance/teacher-earnings?service_month=${month}`))[0].earned_amount_uzs).toBe(teacherBeforeCredit);
    const storedCredit = await qaDb.collection('finance_invoice_adjustments').findOne({
      invoice_id: finalizedInvoice.id,
      kind: 'credit',
      reason: 'Valid credit synchronization and ledger audit',
    });
    expect(storedCredit?.amount_uzs).toBe(creditAmount);
    expect(storedCredit?.immutable).toBe(true);
    expect(storedCredit?.teacher_earnings_affected).toBe(false);
    expect(await qaDb.collection('audit_logs').countDocuments({
      action: 'adjust',
      resource_type: 'finance_invoice',
      resource_id: finalizedInvoice.id,
      'changes.kind': 'credit',
      'changes.amount_uzs': creditAmount,
    })).toBe(1);
    const invoiceBeforeCreditReplay = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
    )).find((row) => row.id === finalizedInvoice.id);
    const creditReplay = await apiPost<any>(
      request,
      managerToken,
      `/finance/invoices/${finalizedInvoice.id}/adjustments`,
      creditRequestPayload!,
    );
    expect(creditReplay.idempotent_replay).toBe(true);
    expect(await qaDb.collection('finance_invoice_adjustments').countDocuments({
      invoice_id: finalizedInvoice.id,
      kind: 'credit',
      reason: 'Valid credit synchronization and ledger audit',
    })).toBe(1);
    const invoiceAfterCreditReplay = (await apiGet<any[]>(
      request,
      managerToken,
      `/finance/invoices?service_month=${month}&limit=100`,
    )).find((row) => row.id === finalizedInvoice.id);
    expect(invoiceAfterCreditReplay.amount_due_uzs).toBe(invoiceBeforeCreditReplay.amount_due_uzs);
    const creditAuditCountAfterRetry = await qaDb.collection('audit_logs').countDocuments({
      action: 'adjust',
      resource_type: 'finance_invoice',
      resource_id: finalizedInvoice.id,
      'changes.kind': 'credit',
      'changes.amount_uzs': creditAmount,
    });
    if (creditAuditCountAfterRetry !== 1) {
      focusedFailures.push(`Invoice-credit idempotent retry created ${creditAuditCountAfterRetry} audit records instead of one.`);
    }

    await reception.page.getByTestId(ids.receivablesTab).click();
    await expect(reception.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`).getByText('Add credit')).toHaveCount(0);
    await managerB.page.getByTestId(ids.receivablesTab).click();
    await expect(managerB.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`)).toHaveCount(0);

    await manager.page.getByTestId(ids.receivablesTab).click();
    await manager.page.setViewportSize({ width: 390, height: 844 });
    await manager.page.getByTestId(`finance-invoice-row-${finalizedInvoice.id}`).getByText('Add credit').click();
    await expectCompactActionModal(manager.page);
    await manager.page.getByTestId(ids.invoiceCorrectionAmount).fill('5000');
    await manager.page.getByTestId(ids.invoiceCorrectionReason).fill('Rapid repeat credit must commit exactly once');
    let rapidRequestCount = 0;
    const rapidListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/invoices/${finalizedInvoice.id}/adjustments`)) rapidRequestCount += 1;
    };
    manager.page.on('request', rapidListener);
    const submitCredit = manager.page.getByTestId(ids.invoiceCorrectionSubmit);
    await Promise.allSettled([
      submitCredit.click(),
      submitCredit.click({ timeout: 1_000 }),
    ]);
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, `/finance/invoices?service_month=${month}&limit=100`);
      return rows.find((row) => row.id === finalizedInvoice.id)?.amount_due_uzs;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe(dueAfterDebit - creditAmount - 5_000);
    manager.page.off('request', rapidListener);
    expect(rapidRequestCount).toBe(1);
    expect(await qaDb.collection('finance_invoice_adjustments').countDocuments({
      invoice_id: finalizedInvoice.id,
      kind: 'credit',
    })).toBe(2);
    await manager.page.setViewportSize({ width: 1280, height: 720 });
    focusedEvidence.push({
      workflow: 'invoice_credit',
      valid_credit_uzs: creditAmount,
      actor_and_observer_reconciled_ms: creditObserverMs,
      validation_requests: validationRequests,
      oversized_status: oversizedResponse.status(),
      rapid_click_request_count: rapidRequestCount,
      phone_viewport_workflow: 'rapid repeat credit correction',
      immutable_adjustment_count_after_retry: 1,
      audit_log_count_after_retry: creditAuditCountAfterRetry,
      payroll_uzs_difference: 0,
    });
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
    await expectCompactActionModal(superAdmin.page);
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
    await expectCompactActionModal(manager.page);
    await manager.page.getByTestId(ids.manualExpenseAmount).fill('300000');
    await manager.page.getByTestId(ids.manualExpenseSubmit).click();
    await expect(superAdmin.page.getByTestId(`finance-expense-row-${tax.id}`)).toContainText(
      '300',
      { timeout: LIVE_TIMEOUT_MS },
    );

    await manager.page.getByTestId(`finance-expense-row-${otherExpense.id}`).getByText('Pay from cashbox').click();
    await expectCompactActionModal(manager.page);
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
    await expectCompactActionModal(manager.page);
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
    {
    const closingShift = await apiGet<any>(request, managerToken, '/finance/cash-shifts/current');
    const expectedAtRollover = Number(closingShift.opening_balance_uzs || 0)
      + Number(closingShift.receipt_total_uzs || 0)
      + Number(closingShift.other_income_total_uzs || 0)
      - Number(closingShift.removal_total_uzs || 0);
    await qaDb.collection('cash_shifts').updateOne(
      { _id: new ObjectId(closingShift.id) },
      { $set: {
        business_date: '2000-01-01',
        idempotency_key: 'qa:cash-day:old-browser-fixture',
      } },
    );
    const receptionNextDayShift = await apiGet<any>(request, receptionToken, '/finance/cash-shifts/current');
    const nextDayShift = await apiGet<any>(request, managerToken, '/finance/cash-shifts/current');
    expect(receptionNextDayShift.id).toBe(nextDayShift.id);
    expect(receptionNextDayShift).not.toHaveProperty('opening_balance_uzs');
    expect(nextDayShift.id).not.toBe(closingShift.id);
    expect(nextDayShift.status).toBe('open');
    expect(nextDayShift.opening_balance_uzs).toBe(expectedAtRollover);

    await expect(reception.page.getByTestId(ids.cashTab)).toHaveCount(0);

    await manager.page.getByTestId(ids.cashTab).click();
    const managerPendingRow = manager.page.getByTestId(`finance-cash-shift-row-${closingShift.id}`);
    await expect(managerPendingRow).toContainText('awaiting count', { timeout: LIVE_TIMEOUT_MS });
    await managerPendingRow.getByText('Confirm end-of-day count').click();
    await manager.page.getByTestId(ids.cashClosingAmount).fill(String(expectedAtRollover - 10_000));
    await manager.page.getByTestId(ids.cashClose).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, '/finance/cash-shifts?limit=100');
      return rows.find((row) => row.id === closingShift.id)?.discrepancy_status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('pending_review');

    await superAdmin.page.getByTestId(ids.cashTab).click();
    const superInvestigationRow = superAdmin.page.getByTestId(`finance-cash-shift-row-${closingShift.id}`);
    await expect(superInvestigationRow).toContainText('pending review', { timeout: LIVE_TIMEOUT_MS });
    await superInvestigationRow.getByText('Review discrepancy').click();
    superAdmin.dialogs.length = 0;
    let validationRequests = 0;
    const validationListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/cash-shifts/${closingShift.id}/discrepancy-review`)) validationRequests += 1;
    };
    superAdmin.page.on('request', validationListener);
    await superAdmin.page.getByTestId(ids.discrepancyReason).fill('bad');
    await superAdmin.page.getByTestId(ids.discrepancyInvestigate).click();
    await superAdmin.page.waitForTimeout(300);
    superAdmin.page.off('request', validationListener);
    expect(validationRequests).toBe(0);

    await superAdmin.page.getByTestId(ids.discrepancyReason).fill('Investigate the ten-thousand UZS physical cash shortage');
    let investigateRequestCount = 0;
    let investigateRequestPayload: Record<string, unknown> | null = null;
    const investigateListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/cash-shifts/${closingShift.id}/discrepancy-review`)) {
        investigateRequestCount += 1;
        investigateRequestPayload = requestValue.postDataJSON();
      }
    };
    superAdmin.page.on('request', investigateListener);
    await Promise.allSettled([
      superAdmin.page.getByTestId(ids.discrepancyInvestigate).click(),
      superAdmin.page.getByTestId(ids.discrepancyInvestigate).click({ timeout: 1_000 }),
    ]);
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, '/finance/cash-shifts?limit=100');
      return rows.find((row) => row.id === closingShift.id)?.discrepancy_status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('investigation_required');
    superAdmin.page.off('request', investigateListener);
    expect(investigateRequestCount).toBe(1);
    expect(investigateRequestPayload).toMatchObject({ accepted: false });
    const replay = await apiPost<any>(
      request,
      superToken,
      `/finance/cash-shifts/${closingShift.id}/discrepancy-review`,
      investigateRequestPayload!,
    );
    expect(replay.idempotent_replay).toBe(true);
    const storedShift = await qaDb.collection('cash_shifts').findOne({ _id: new ObjectId(closingShift.id) });
    expect(storedShift?.expected_closing_balance_uzs).toBe(expectedAtRollover);
    expect(storedShift?.actual_closing_balance_uzs).toBe(expectedAtRollover - 10_000);
    expect(storedShift?.discrepancy_uzs).toBe(-10_000);
    expect(storedShift?.discrepancy_status).toBe('investigation_required');
    focusedEvidence.push({
      workflow: 'automatic_cash_day_and_discrepancy_investigate',
      discrepancy_uzs: -10_000,
      reception_manual_controls: 0,
      rapid_click_request_count: investigateRequestCount,
      immutable_review_count_after_retry: 1,
    });
    shift = nextDayShift;
    return;
    }

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

    await reception.page.getByTestId(ids.cashOpeningAmount).fill('500000');
    await reception.page.getByTestId(ids.cashOpen).click();
    let investigationShift: any;
    await expect.poll(async () => {
      investigationShift = await apiGet<any>(request, receptionToken, '/finance/cash-shifts/current');
      return investigationShift?.status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('open');
    const immutableOpening = investigationShift.opening_balance_uzs;
    await reception.page.getByTestId(ids.cashClosingAmount).fill('490000');
    await reception.page.getByTestId(ids.cashClose).click();
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, superToken, '/finance/cash-shifts?limit=100');
      investigationShift = rows.find((row) => row.id === investigationShift.id);
      return `${investigationShift?.status}:${investigationShift?.discrepancy_status}`;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('closed:pending_review');
    expect(investigationShift.expected_closing_balance_uzs).toBe(500_000);
    expect(investigationShift.actual_closing_balance_uzs).toBe(490_000);
    expect(investigationShift.discrepancy_uzs).toBe(-10_000);

    await manager.page.getByTestId(ids.cashTab).click();
    const managerInvestigationRow = manager.page.getByTestId(`finance-cash-shift-row-${investigationShift.id}`);
    await expect(managerInvestigationRow).toContainText('pending review', { timeout: LIVE_TIMEOUT_MS });
    await expect(managerInvestigationRow.getByText('Review discrepancy')).toHaveCount(0);

    await superAdmin.page.setViewportSize({ width: 390, height: 844 });
    await superAdmin.page.getByTestId(ids.cashTab).click();
    const superInvestigationRow = superAdmin.page.getByTestId(`finance-cash-shift-row-${investigationShift.id}`);
    await expect(superInvestigationRow).toContainText('pending review', { timeout: LIVE_TIMEOUT_MS });
    await superInvestigationRow.getByText('Review discrepancy').click();
    superAdmin.dialogs.length = 0;
    let validationRequests = 0;
    const validationListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/cash-shifts/${investigationShift.id}/discrepancy-review`)) validationRequests += 1;
    };
    superAdmin.page.on('request', validationListener);
    await superAdmin.page.getByTestId(ids.discrepancyReason).fill('bad');
    await superAdmin.page.getByTestId(ids.discrepancyInvestigate).click();
    await superAdmin.page.waitForTimeout(300);
    superAdmin.page.off('request', validationListener);
    expect(validationRequests).toBe(0);
    if (!superAdmin.dialogs.some((message) => message.includes('at least five characters'))) {
      focusedFailures.push('Cash-discrepancy validation produced no visible feedback.');
    }

    await superAdmin.page.getByTestId(ids.discrepancyReason).fill('Investigate the ten-thousand UZS physical cash shortage');
    let investigateRequestCount = 0;
    let investigateRequestPayload: Record<string, unknown> | null = null;
    const investigateListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().includes(`/api/finance/cash-shifts/${investigationShift.id}/discrepancy-review`)) {
        investigateRequestCount += 1;
        investigateRequestPayload = requestValue.postDataJSON();
      }
    };
    superAdmin.page.on('request', investigateListener);
    const investigateStartedAt = Date.now();
    const investigateButton = superAdmin.page.getByTestId(ids.discrepancyInvestigate);
    await Promise.allSettled([
      investigateButton.click(),
      investigateButton.click({ timeout: 1_000 }),
    ]);
    await expect.poll(async () => {
      const rows = await apiGet<any[]>(request, managerToken, '/finance/cash-shifts?limit=100');
      return rows.find((row) => row.id === investigationShift.id)?.discrepancy_status;
    }, { timeout: LIVE_TIMEOUT_MS }).toBe('investigation_required');
    superAdmin.page.off('request', investigateListener);
    expect(investigateRequestCount).toBe(1);
    expect(investigateRequestPayload).toMatchObject({ accepted: false });
    await expect(managerInvestigationRow).toContainText('investigation required', { timeout: LIVE_TIMEOUT_MS });
    const investigateObserverMs = Date.now() - investigateStartedAt;
    await expect(superAdmin.page.getByTestId(`finance-cash-shift-row-${investigationShift.id}`).getByText('Review discrepancy')).toHaveCount(0);
    await expect(reception.page.getByTestId(ids.cashOpen)).toBeVisible({ timeout: LIVE_TIMEOUT_MS });
    await superAdmin.page.setViewportSize({ width: 1280, height: 720 });

    const storedShift = await qaDb.collection('cash_shifts').findOne({ _id: new ObjectId(investigationShift.id) });
    expect(storedShift?.opening_balance_uzs).toBe(immutableOpening);
    expect(storedShift?.expected_closing_balance_uzs).toBe(500_000);
    expect(storedShift?.actual_closing_balance_uzs).toBe(490_000);
    expect(storedShift?.discrepancy_uzs).toBe(-10_000);
    expect(storedShift?.discrepancy_status).toBe('investigation_required');
    expect(await qaDb.collection('cash_discrepancy_reviews').countDocuments({
      cash_shift_id: investigationShift.id,
      accepted: false,
    })).toBe(1);
    expect(await qaDb.collection('cash_discrepancy_reviews').countDocuments({
      cash_shift_id: investigationShift.id,
      accepted: false,
      immutable: true,
    })).toBe(1);
    const auditCountBeforeRetry = await qaDb.collection('audit_logs').countDocuments({
      action: 'review_cash_discrepancy',
      resource_type: 'cash_shift',
      resource_id: investigationShift.id,
      'changes.accepted': false,
    });
    expect(auditCountBeforeRetry).toBe(1);

    const replay = await apiPost<any>(
      request,
      superToken,
      `/finance/cash-shifts/${investigationShift.id}/discrepancy-review`,
      investigateRequestPayload!,
    );
    expect(replay.idempotent_replay).toBe(true);
    expect(await qaDb.collection('cash_discrepancy_reviews').countDocuments({
      cash_shift_id: investigationShift.id,
      accepted: false,
    })).toBe(1);
    const shiftAfterRetry = await qaDb.collection('cash_shifts').findOne({ _id: new ObjectId(investigationShift.id) });
    expect(shiftAfterRetry?.expected_closing_balance_uzs).toBe(storedShift?.expected_closing_balance_uzs);
    expect(shiftAfterRetry?.actual_closing_balance_uzs).toBe(storedShift?.actual_closing_balance_uzs);
    expect(shiftAfterRetry?.discrepancy_uzs).toBe(storedShift?.discrepancy_uzs);
    const discrepancyAuditCountAfterRetry = await qaDb.collection('audit_logs').countDocuments({
      action: 'review_cash_discrepancy',
      resource_type: 'cash_shift',
      resource_id: investigationShift.id,
      'changes.accepted': false,
    });
    if (discrepancyAuditCountAfterRetry !== 1) {
      focusedFailures.push(`Cash-discrepancy idempotent retry created ${discrepancyAuditCountAfterRetry} audit records instead of one.`);
    }
    focusedEvidence.push({
      workflow: 'cash_discrepancy_investigate',
      discrepancy_uzs: -10_000,
      actor_and_observer_reconciled_ms: investigateObserverMs,
      validation_requests: validationRequests,
      rapid_click_request_count: investigateRequestCount,
      phone_viewport_workflow: 'cash discrepancy Investigate decision',
      immutable_review_count_after_retry: 1,
      audit_log_count_after_retry: discrepancyAuditCountAfterRetry,
    });
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
    for (const page of [manager.page, superAdmin.page]) {
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
    await reception.page.getByTestId(ids.studentSearch).fill(student.student_id);
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('Status: advance', { timeout: LIVE_TIMEOUT_MS });
    await expect(reception.page.getByTestId(`finance-student-result-${student.id}`)).toContainText('No debt', { timeout: LIVE_TIMEOUT_MS });
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
  await testInfo.attach('focused-finance-workflow-evidence.json', {
    body: Buffer.from(JSON.stringify({ evidence: focusedEvidence, failures: focusedFailures }, null, 2)),
    contentType: 'application/json',
  });
  await mongoClient.close();
  await Promise.all(sessions.map((session) => session.context.close()));
  expect(focusedFailures, 'Focused finance UI workflow failures').toEqual([]);
});
