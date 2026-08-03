import { APIRequestContext, Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { MongoClient, ObjectId } from 'mongodb';

const API_URL = process.env.APP_E2E_API_URL || 'http://127.0.0.1:8002/api';
const PASSWORD = 'FinanceQA@2026';
const TELEGRAM_WEBHOOK_SECRET = 'nuriks-finance-qa-webhook-secret';
const REMOTE_LIVE_AUDIT = process.env.REMOTE_LIVE_AUDIT === '1';

async function latestMockCode(phone: string, purpose: 'invite' | 'password_reset') {
  const mongoUrl = process.env.MONGO_URL;
  const databaseName = process.env.DB_NAME;
  if (!mongoUrl || !databaseName) throw new Error('Disposable MongoDB environment is required');
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const challenge = await client.db(databaseName).collection('auth_challenges').findOne(
      { phone_normalized: phone, purpose, invalidated_at: null },
      { sort: { created_at: -1 } },
    );
    if (!challenge?.test_code) throw new Error(`Missing mock ${purpose} code for ${phone}`);
    return String(challenge.test_code);
  } finally {
    await client.close();
  }
}

async function rawMongoRecord(collection: string, id: string) {
  const mongoUrl = process.env.MONGO_URL;
  const databaseName = process.env.DB_NAME;
  if (!mongoUrl || !databaseName) throw new Error('Disposable MongoDB environment is required');
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    return await client.db(databaseName).collection(collection).findOne({ _id: new ObjectId(id) });
  } finally {
    await client.close();
  }
}

async function connectMockTelegram(request: APIRequestContext, phone: string) {
  const mongoUrl = process.env.MONGO_URL;
  const databaseName = process.env.DB_NAME;
  if (!mongoUrl || !databaseName) throw new Error('Disposable MongoDB environment is required');
  const client = new MongoClient(mongoUrl);
  let testToken: string | undefined;
  try {
    await client.connect();
    const database = client.db(databaseName);
    const user = await database.collection('users').findOne({ phone_normalized: phone });
    if (!user) throw new Error(`Missing Telegram invitation user for ${phone}`);
    const link = await database.collection('telegram_links').findOne(
      { user_id: String(user._id), used_at: null, revoked_at: null },
      { sort: { created_at: -1 } },
    );
    testToken = link?.test_token;
  } finally {
    await client.close();
  }
  if (!testToken) throw new Error(`Missing mock Telegram link for ${phone}`);
  const telegramId = Number(phone.replace(/\D/g, '').slice(-12));
  const response = await request.post(`${API_URL}/telegram/webhook`, {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': TELEGRAM_WEBHOOK_SECRET },
    data: {
      update_id: telegramId,
      message: {
        message_id: telegramId,
        text: `/start connect_${testToken}`,
        from: { id: telegramId, first_name: 'QA', username: `qa_${telegramId}` },
        chat: { id: telegramId, type: 'private' },
      },
    },
  });
  expect(response.ok(), `connect mock Telegram for ${phone}: ${await response.text()}`).toBeTruthy();
}

async function activateInvitedAccount(request: APIRequestContext, phone: string, password: string) {
  await connectMockTelegram(request, phone);
  const code = await latestMockCode(phone, 'invite');
  await expectApiOk(await request.post(`${API_URL}/auth/invitations/accept`, {
    data: { phone, code, password },
  }), `activate ${phone}`);
}

type RoleKey = 'super_admin' | 'manager' | 'reception' | 'teacher' | 'student' | 'parent' | 'support';
type Session = {
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
  pageErrors: string[];
  serverErrors: string[];
  dialogs: string[];
};

const roleLogins: Record<RoleKey, string> = REMOTE_LIVE_AUDIT ? {
  super_admin: '+998990000001',
  manager: '+998990000002',
  reception: '+998990000004',
  teacher: '+998990000005',
  student: '+998990000006',
  parent: '+998990000007',
  support: '+998990000008',
} : {
  super_admin: 'qa_superadmin',
  manager: 'qa_manager_a',
  reception: 'qa_reception_a',
  teacher: 'qa_teacher_a',
  student: 'qa_student_a',
  parent: 'qa_parent_a',
  support: 'qa_support_a',
};

const roleTabs: Record<RoleKey, { name: string; path: RegExp }[]> = {
  super_admin: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Students', path: /\/students/ },
    { name: 'Finance', path: /\/finance/ },
    { name: 'Chats', path: /\/chats/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  manager: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Students', path: /\/students/ },
    { name: 'Finance', path: /\/finance/ },
    { name: 'Leads', path: /\/leads/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  reception: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Leads', path: /\/leads/ },
    { name: 'Payments', path: /\/finance/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  teacher: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Groups', path: /\/groups/ },
    { name: 'Attendance', path: /\/attendance/ },
    { name: 'Homework', path: /\/homework/ },
    { name: 'Tests', path: /\/tests/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  student: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Groups', path: /\/groups/ },
    { name: 'Chats', path: /\/chats/ },
    { name: 'Homework', path: /\/homework/ },
    { name: 'Tests', path: /\/tests/ },
    { name: 'Grades', path: /\/progress/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  parent: [
    { name: 'Home', path: /\/(?:$|\?)/ },
    { name: 'Groups', path: /\/groups/ },
    { name: 'Progress', path: /\/progress/ },
    { name: 'Homework', path: /\/homework/ },
    { name: 'Tests', path: /\/tests/ },
    { name: 'Payments', path: /\/payments/ },
    { name: 'Profile', path: /\/profile/ },
  ],
  support: [
    { name: 'Bookings', path: /\/(?:$|\?)/ },
    { name: 'Chats', path: /\/chats/ },
    { name: 'Profile', path: /\/profile/ },
  ],
};

function monitor(page: Page, session: Omit<Session, 'context' | 'page'>) {
  page.on('console', (message) => {
    if (message.type() === 'error') session.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => session.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      session.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on('dialog', (dialog) => {
    session.dialogs.push(`${dialog.type()}:${dialog.message()}`);
    void dialog.accept();
  });
}

async function loginUi(browser: Browser, role: RoleKey, mobile = false): Promise<Session> {
  const context = await browser.newContext(mobile ? {
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  } : {});
  const page = await context.newPage();
  const observed = { consoleErrors: [] as string[], pageErrors: [] as string[], serverErrors: [] as string[], dialogs: [] as string[] };
  monitor(page, observed);
  await page.goto(REMOTE_LIVE_AUDIT ? '/' : '/login');
  await page.getByTestId('login-email-input').fill(roleLogins[role]);
  await page.getByTestId('login-password-input').fill(PASSWORD);
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByRole('tab', { name: roleTabs[role][0].name }).first()).toBeVisible({ timeout: 15_000 });
  return { context, page, ...observed };
}

async function assertHealthy(session: Session, label: string) {
  await session.page.waitForTimeout(250);
  const visibleText = (await session.page.locator('body').innerText()).trim();
  expect(visibleText.length, `${label} rendered an empty page`).toBeGreaterThan(10);
  expect(visibleText, `${label} rendered an error boundary`).not.toMatch(/Something went wrong|Application error|Internal Server Error/i);
  expect(session.pageErrors, `${label} page errors`).toEqual([]);
  expect(session.serverErrors, `${label} API 5xx responses`).toEqual([]);
}

async function assertPhoneGeometry(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    bodyHeight: document.body.getBoundingClientRect().height,
  }));
  expect(geometry.documentWidth, `${label} causes document-level horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bodyHeight, `${label} did not render usable content`).toBeGreaterThan(80);
}

async function apiLogin(request: APIRequestContext, role: RoleKey) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { login: roleLogins[role], password: PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function apiLoginAs(request: APIRequestContext, login: string) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { login, password: PASSWORD },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function apiLoginWithPassword(request: APIRequestContext, login: string, password: string) {
  const response = await request.post(`${API_URL}/auth/login`, { data: { login, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).access_token as string;
}

async function apiCall(
  request: APIRequestContext,
  token: string,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  data?: Record<string, unknown>,
) {
  return request.fetch(`${API_URL}${path}`, {
    method: method.toUpperCase(),
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

async function expectApiOk(response: Awaited<ReturnType<typeof apiCall>>, label: string) {
  expect(response.ok(), `${label}: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<any>;
}

const localDate = (offsetDays = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const value = new Date(Date.UTC(number('year'), number('month') - 1, number('day')));
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
};

const academyDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const academyWeekday = () => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tashkent', weekday: 'long',
}).format(new Date()).toLowerCase();

for (const viewport of ['desktop', 'phone'] as const) {
  test(`all role navigation renders and remains usable on ${viewport}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    for (const role of Object.keys(roleTabs) as RoleKey[]) {
      const session = await loginUi(browser, role, viewport === 'phone');
      try {
        for (const tab of roleTabs[role]) {
          const locator = session.page.getByRole('tab', { name: tab.name }).first();
          await expect(locator, `${role} is missing the ${tab.name} tab`).toBeVisible();
          await locator.click();
          await expect(session.page).toHaveURL(tab.path);
          await assertHealthy(session, `${role}/${tab.name}/${viewport}`);
          if (viewport === 'phone') await assertPhoneGeometry(session.page, `${role}/${tab.name}`);
        }
        await testInfo.attach(`${viewport}-${role}`, {
          body: await session.page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        expect(session.consoleErrors, `${role}/${viewport} console errors`).toEqual([]);
      } finally {
        await session.context.close();
      }
    }
  });
}

test('every super-admin dashboard tool opens a working view', async ({ browser }, testInfo) => {
  const session = await loginUi(browser, 'super_admin');
  const tools = [
    ['Teachers', /\/teachers/],
    ['Staff Accounts', /\/staff-management/],
    ['Groups', /\/groups/],
    ['Leads / CRM', /\/leads/],
    ['Courses', /\/courses/],
    ['Settings', /\/settings/],
    ['Feature Flags', /\/feature-flags/],
    ['Analytics', /\/analytics/],
    ['News', /\/news/],
    ['Certificates', /\/certificates/],
    ['Audit Logs', /\/audit-logs/],
    ['Backups', /\/backups/],
  ] as const;
  try {
    for (const [name, path] of tools) {
      await session.page.getByRole('tab', { name: 'Home' }).first().click();
      const tool = session.page.getByText(name, { exact: true }).last();
      await expect(tool, `Dashboard tool ${name} is not clickable`).toBeVisible();
      await tool.click();
      await expect(session.page).toHaveURL(path);
      await assertHealthy(session, `super_admin/${name}`);
      await testInfo.attach(`admin-tool-${name.replace(/\W+/g, '-').toLowerCase()}`, {
        body: await session.page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
    expect(session.consoleErrors, 'Admin tool console errors').toEqual([]);
  } finally {
    await session.context.close();
  }
});

test('course catalog CRUD, permissions, safeguards, and live UI synchronization work end to end', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const superToken = await apiLogin(request, 'super_admin');
  const managerToken = await apiLogin(request, 'manager');
  const actor = await loginUi(browser, 'super_admin');
  const observer = await loginUi(browser, 'super_admin');
  const manager = await loginUi(browser, 'manager');
  const suffix = Date.now().toString().slice(-7);
  const name = `QA Pre-IELTS ${suffix}`;
  const updatedName = `QA Pre-IELTS Updated ${suffix}`;
  try {
    for (const session of [actor, observer]) {
      await session.page.getByTestId('admin-tool-courses').click();
      await expect(session.page).toHaveURL(/\/courses/);
      await expect(session.page.getByText('Manage the academic catalog used by leads, students, and groups', { exact: true })).toBeVisible();
    }
    await manager.page.getByTestId('admin-tool-groups').click();
    await manager.page.getByTestId('groups-add-button').click();
    await expect(manager.page.getByTestId('group-course-picker')).toBeVisible();

    await actor.page.getByTestId('courses-add-button').click();
    await actor.page.getByTestId('course-name-input').fill(name);
    await actor.page.getByTestId('course-program-picker').selectOption('pre_ielts');
    await actor.page.getByTestId('course-description-input').fill('QA course catalog lifecycle');
    await actor.page.getByTestId('course-levels-input').fill('Foundation, Intermediate, Foundation');
    const createResponsePromise = actor.page.waitForResponse((response) => (
      response.url() === `${API_URL}/courses` && response.request().method() === 'POST'
    ));
    await actor.page.getByTestId('course-save-button').click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok(), `create course: ${await createResponse.text()}`).toBeTruthy();
    const created = await createResponse.json();
    expect(created.program_code).toBe('pre_ielts');
    expect(created.levels).toEqual(['Foundation', 'Intermediate']);
    await expect(actor.page.getByTestId(`course-card-${created.id}`)).toBeVisible({ timeout: 8_000 });
    await expect(observer.page.getByTestId(`course-card-${created.id}`)).toBeVisible({ timeout: 8_000 });
    await expect(manager.page.getByTestId('group-course-picker').locator(`option[value="${created.id}"]`)).toHaveText(name, { timeout: 8_000 });

    const forbiddenCreate = await apiCall(request, managerToken, 'post', '/courses', {
      name: `Forbidden ${suffix}`,
      program_code: 'general',
      description: null,
      levels: [],
    });
    expect(forbiddenCreate.status()).toBe(403);
    const forbiddenInactiveList = await apiCall(request, managerToken, 'get', '/courses?include_inactive=true');
    expect(forbiddenInactiveList.status()).toBe(403);
    const teachers = await expectApiOk(await apiCall(request, superToken, 'get', '/teachers'), 'load teacher for course mismatch guard');
    const liveTeacher = teachers.find((teacher: any) => teacher.first_name === 'Live');
    expect(liveTeacher).toBeTruthy();
    const mismatchedGroup = await apiCall(request, superToken, 'post', '/groups', {
      name: `Mismatched Course Group ${suffix}`,
      course_id: created.id,
      teacher_id: liveTeacher.id,
      schedule: [{ day: 'Monday', start_time: '09:00', end_time: '10:30', room: 'QA' }],
      status: 'active',
      program_code: 'general',
      group_format: 'normal',
      finance_effective_from: localDate(),
      finance_change_reason: 'Must be rejected before billing setup',
    });
    expect(mismatchedGroup.status()).toBe(409);

    await actor.page.getByTestId(`course-edit-${created.id}`).click();
    await actor.page.getByTestId('course-name-input').fill(updatedName);
    await actor.page.getByTestId('course-description-input').fill('Updated live in every admin session');
    await actor.page.getByTestId('course-levels-input').fill('Foundation, Advanced');
    const updateResponsePromise = actor.page.waitForResponse((response) => (
      response.url() === `${API_URL}/courses/${created.id}` && response.request().method() === 'PUT'
    ));
    await actor.page.getByTestId('course-save-button').click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.ok(), `update course: ${await updateResponse.text()}`).toBeTruthy();
    await expect(observer.page.getByTestId(`course-card-${created.id}`).getByText(updatedName, { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(observer.page.getByTestId(`course-card-${created.id}`).getByText('Levels: Foundation, Advanced', { exact: true })).toBeVisible();
    await expect(manager.page.getByTestId('group-course-picker').locator(`option[value="${created.id}"]`)).toHaveText(updatedName, { timeout: 8_000 });

    await actor.page.getByRole('tab', { name: 'Home' }).first().click();
    await actor.page.getByText('Leads / CRM', { exact: true }).last().click();
    await actor.page.getByTestId('leads-add-button').click();
    await expect(actor.page.getByTestId('lead-course-picker').locator(`option[value="${updatedName}"]`)).toHaveCount(1, { timeout: 8_000 });
    await actor.page.getByTestId('lead-create-close').click();

    await actor.page.getByRole('tab', { name: 'Home' }).first().click();
    await actor.page.getByTestId('admin-tool-courses').click();
    const archiveResponsePromise = actor.page.waitForResponse((response) => (
      response.url() === `${API_URL}/courses/${created.id}/archive` && response.request().method() === 'PATCH'
    ));
    await actor.page.getByTestId(`course-archive-${created.id}`).click();
    const archiveResponse = await archiveResponsePromise;
    expect(archiveResponse.ok(), `archive course: ${await archiveResponse.text()}`).toBeTruthy();
    await expect(observer.page.getByTestId(`course-card-${created.id}`).getByText('Archived', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(manager.page.getByTestId('group-course-picker').locator(`option[value="${created.id}"]`)).toHaveCount(0, { timeout: 8_000 });
    const activeCourses = await expectApiOk(await apiCall(request, superToken, 'get', '/courses'), 'load active courses after archive');
    expect(activeCourses.some((course: any) => course.id === created.id)).toBeFalsy();

    const reactivateResponsePromise = actor.page.waitForResponse((response) => (
      response.url() === `${API_URL}/courses/${created.id}/reactivate` && response.request().method() === 'PATCH'
    ));
    await actor.page.getByTestId(`course-reactivate-${created.id}`).click();
    const reactivateResponse = await reactivateResponsePromise;
    expect(reactivateResponse.ok(), `reactivate course: ${await reactivateResponse.text()}`).toBeTruthy();
    await expect(observer.page.getByTestId(`course-card-${created.id}`).getByText('Active', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(manager.page.getByTestId('group-course-picker').locator(`option[value="${created.id}"]`)).toHaveText(updatedName, { timeout: 8_000 });

    const existingCourses = await expectApiOk(await apiCall(request, superToken, 'get', '/courses'), 'load protected course');
    const protectedCourse = existingCourses.find((course: any) => course.name === 'QA General English');
    expect(protectedCourse).toBeTruthy();
    const programChange = await apiCall(request, superToken, 'put', `/courses/${protectedCourse.id}`, {
      name: protectedCourse.name,
      program_code: 'ielts',
      description: protectedCourse.description || null,
      levels: protectedCourse.levels || [],
    });
    expect(programChange.status()).toBe(409);
    const protectedArchive = await apiCall(request, superToken, 'patch', `/courses/${protectedCourse.id}/archive`);
    expect(protectedArchive.status()).toBe(409);

    const auditLogs = await expectApiOk(
      await apiCall(request, superToken, 'get', '/admin/audit-logs?entity_type=course&limit=100'),
      'load course audit trail',
    );
    const actions = auditLogs
      .filter((row: any) => row.resource_id === created.id)
      .map((row: any) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'update', 'archive', 'reactivate']));
    await assertHealthy(actor, 'course catalog actor');
    await assertHealthy(observer, 'course catalog observer');
    await assertHealthy(manager, 'course catalog manager observer');
  } finally {
    await Promise.allSettled([actor.context.close(), observer.context.close(), manager.context.close()]);
  }
});

test('every worker supports reversible deactivation and guarded permanent deletion with reusable identity', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const superToken = await apiLogin(request, 'super_admin');
  const session = await loginUi(browser, 'super_admin');
  const suffix = Date.now().toString().slice(-7);
  try {
    await session.page.getByText('Teachers', { exact: true }).last().click();
    await session.page.getByTestId('teachers-add-button').click();
    await session.page.getByPlaceholder('Enter first name').fill('UI');
    await session.page.getByPlaceholder('Enter last name').fill(`Teacher${suffix}`);
    await session.page.getByPlaceholder('+998901234567').fill(`+99895${suffix}`);
    await session.page.getByPlaceholder('teacher@nuriksacademy.uz').fill(`ui-teacher-${suffix}@qa.invalid`);
    const teacherCreateResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/teachers` && response.request().method() === 'POST'
    ));
    await session.page.getByTestId('teacher-save-button').click();
    const createdTeacher = await teacherCreateResponse;
    expect(createdTeacher.ok(), `create teacher: ${await createdTeacher.text()}`).toBeTruthy();
    const createdTeacherBody = await createdTeacher.json();
    await expect(session.page.getByTestId('telegram-invite-close')).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId('telegram-invite-close').click();
    await expect(session.page.getByTestId(`teacher-card-${createdTeacherBody.id}`)).toBeVisible({ timeout: 8_000 });
    const teachers = await expectApiOk(await apiCall(request, superToken, 'get', '/teachers'), 'load UI-created teacher');
    const teacher = teachers.find((row: any) => row.last_name === `Teacher${suffix}`);
    expect(teacher).toBeTruthy();
    expect(teacher.id).toBe(createdTeacherBody.id);

    await activateInvitedAccount(request, `+99895${suffix}`, 'UiTeacher@2026!');

    await session.page.getByTestId(`teacher-card-${teacher.id}`).click();
    await session.page.getByTestId('teacher-edit-button').click();
    await session.page.getByPlaceholder('Enter first name').fill('Updated');
    await session.page.getByTestId('teacher-save-button').click();
    await expect(session.page.getByTestId(`teacher-card-${teacher.id}`).getByText(`Updated Teacher${suffix}`, { exact: true })).toBeVisible({ timeout: 8_000 });

    await session.page.getByTestId(`teacher-card-${teacher.id}`).click();
    const teacherResetResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/teachers/${teacher.id}/reset-password`
      && response.request().method() === 'POST'
    ));
    await session.page.getByTestId('teacher-reset-password-button').click();
    const teacherReset = await teacherResetResponse;
    expect(teacherReset.ok(), `send teacher reset: ${await teacherReset.text()}`).toBeTruthy();
    expect(await latestMockCode(`+99895${suffix}`, 'password_reset')).toMatch(/^\d{6}$/);
    await session.page.getByTestId(`teacher-card-${teacher.id}`).click();
    await session.page.getByTestId('teacher-deactivate-button').click();
    await expect(session.page.getByTestId(`teacher-card-${teacher.id}`).getByText('Deactivated', { exact: true })).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId(`teacher-card-${teacher.id}`).click();
    await session.page.getByTestId('teacher-reactivate-button').click();
    await expect(session.page.getByTestId(`teacher-card-${teacher.id}`).getByText('Active', { exact: true })).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId(`teacher-card-${teacher.id}`).click();
    const teacherDeleteResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/teachers/${teacher.id}`
      && response.request().method() === 'DELETE'
    ));
    await session.page.getByTestId('teacher-delete-button').click();
    const deletedTeacher = await teacherDeleteResponse;
    expect(deletedTeacher.ok(), `delete activated teacher: ${await deletedTeacher.text()}`).toBeTruthy();
    expect((await deletedTeacher.json()).deletion_mode).toBe('history_tombstone');
    await expect(session.page.getByTestId(`teacher-card-${teacher.id}`)).toHaveCount(0);
    const teacherTombstone = await rawMongoRecord('teachers', teacher.id);
    const teacherUserTombstone = await rawMongoRecord('users', teacher.user_id);
    expect(teacherTombstone?.is_deleted).toBe(true);
    expect(teacherUserTombstone?.is_deleted).toBe(true);
    expect(teacherUserTombstone).not.toHaveProperty('phone_normalized');
    const retiredTeacherLogin = await request.post(`${API_URL}/auth/login`, {
      data: { login: `+99895${suffix}`, password: 'UiTeacher@2026!' },
    });
    expect(retiredTeacherLogin.status()).toBe(401);
    const reusedTeacher = await expectApiOk(
      await apiCall(request, superToken, 'post', '/teachers', {
        first_name: 'Reused',
        last_name: `Teacher${suffix}`,
        phone: `+99895${suffix}`,
        email: `reused-teacher-${suffix}@qa.invalid`,
        specialization: ['QA'],
        courses: [],
      }),
      'reuse deleted teacher phone',
    );
    expect((await expectApiOk(
      await apiCall(request, superToken, 'delete', `/teachers/${reusedTeacher.id}`),
      'remove reused unactivated teacher',
    )).deletion_mode).toBe('hard_delete');

    await session.page.getByRole('tab', { name: 'Home' }).first().click();
    await session.page.getByText('Staff Accounts', { exact: true }).last().click();
    await session.page.getByTestId('staff-account-add-button').click();
    await session.page.getByTestId('staff-first-name-input').fill('UI');
    await session.page.getByTestId('staff-last-name-input').fill(`Manager${suffix}`);
    await session.page.getByTestId('staff-phone-input').fill(`+99897${suffix}`);
    const managerCreateResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/staff-accounts` && response.request().method() === 'POST'
    ));
    await session.page.getByTestId('staff-account-save-button').click();
    const createdManager = await managerCreateResponse;
    expect(createdManager.ok(), `create manager: ${await createdManager.text()}`).toBeTruthy();
    const createdManagerBody = await createdManager.json();
    await expect(session.page.getByTestId('telegram-invite-close')).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId('telegram-invite-close').click();
    await expect(session.page.getByTestId(`staff-account-card-${createdManagerBody.id}`)).toBeVisible({ timeout: 8_000 });
    const staffAccounts = await expectApiOk(await apiCall(request, superToken, 'get', '/staff-accounts'), 'load UI-created manager');
    const managerAccount = staffAccounts.find((row: any) => row.full_name === `UI Manager${suffix}`);
    expect(managerAccount?.role).toBe('manager');
    expect(managerAccount.id).toBe(createdManagerBody.id);
    await expect(session.page.getByTestId(`staff-account-card-${managerAccount.id}`).getByText('Invitation pending', { exact: true })).toBeVisible({ timeout: 8_000 });
    await activateInvitedAccount(request, `+99897${suffix}`, 'UiManager@2026!');
    await expect(session.page.getByTestId(`staff-account-card-${managerAccount.id}`).getByText('Active', { exact: true })).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId(`staff-account-card-${managerAccount.id}`).click();
    const managerDeleteResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/staff-accounts/${managerAccount.id}`
      && response.request().method() === 'DELETE'
    ));
    await session.page.getByTestId('staff-delete-button').click();
    const deletedManager = await managerDeleteResponse;
    expect(deletedManager.ok(), `delete activated manager: ${await deletedManager.text()}`).toBeTruthy();
    expect((await deletedManager.json()).deletion_mode).toBe('history_tombstone');
    await expect(session.page.getByTestId(`staff-account-card-${managerAccount.id}`)).toHaveCount(0);
    const managerTombstone = await rawMongoRecord('users', managerAccount.id);
    expect(managerTombstone?.is_deleted).toBe(true);
    expect(managerTombstone).not.toHaveProperty('phone_normalized');
    const reusedManager = await expectApiOk(
      await apiCall(request, superToken, 'post', '/staff-accounts', {
        full_name: `Reused Manager${suffix}`,
        phone: `+99897${suffix}`,
        role: 'manager',
        language_preference: 'en',
      }),
      'reuse deleted manager phone',
    );
    expect((await expectApiOk(
      await apiCall(request, superToken, 'delete', `/staff-accounts/${reusedManager.id}`),
      'remove reused unactivated manager',
    )).deletion_mode).toBe('hard_delete');

    await session.page.getByTestId('staff-support-tab').click();
    await session.page.getByTestId('support-staff-add-button').click();
    await session.page.getByTestId('staff-first-name-input').fill('UI');
    await session.page.getByTestId('staff-last-name-input').fill(`Support${suffix}`);
    await session.page.getByTestId('staff-phone-input').fill(`+99896${suffix}`);
    const supportCreateResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/support-staff` && response.request().method() === 'POST'
    ));
    await session.page.getByTestId('support-staff-save-button').click();
    const createdSupport = await supportCreateResponse;
    expect(createdSupport.ok(), `create support staff: ${await createdSupport.text()}`).toBeTruthy();
    const createdSupportBody = await createdSupport.json();
    await expect(session.page.getByTestId('telegram-invite-close')).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId('telegram-invite-close').click();
    await expect(session.page.getByTestId(`support-staff-card-${createdSupportBody.id}`)).toBeVisible({ timeout: 8_000 });
    const supportRows = await expectApiOk(
      await apiCall(request, superToken, 'get', '/support-staff?include_inactive=true'),
      'load UI-created support staff',
    );
    const support = supportRows.find((row: any) => row.last_name === `Support${suffix}`);
    expect(support).toBeTruthy();
    expect(support.id).toBe(createdSupportBody.id);

    await activateInvitedAccount(request, `+99896${suffix}`, 'UiSupport@2026!');

    await session.page.getByTestId(`support-staff-card-${support.id}`).click();
    const supportResetResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/support-staff/${support.id}/reset-password`
      && response.request().method() === 'POST'
    ));
    await session.page.getByTestId('support-staff-reset-password-button').click();
    const supportReset = await supportResetResponse;
    expect(supportReset.ok(), `send support reset: ${await supportReset.text()}`).toBeTruthy();
    expect(await latestMockCode(`+99896${suffix}`, 'password_reset')).toMatch(/^\d{6}$/);
    await session.page.getByTestId(`support-staff-card-${support.id}`).click();
    await session.page.getByTestId('support-staff-deactivate-button').click();
    await expect(session.page.getByTestId(`support-staff-card-${support.id}`).getByText('Deactivated', { exact: true })).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId(`support-staff-card-${support.id}`).click();
    await session.page.getByTestId('support-staff-reactivate-button').click();
    await expect(session.page.getByTestId(`support-staff-card-${support.id}`).getByText('Active', { exact: true })).toBeVisible({ timeout: 8_000 });
    await session.page.getByTestId(`support-staff-card-${support.id}`).click();
    const supportDeleteResponse = session.page.waitForResponse((response) => (
      response.url() === `${API_URL}/support-staff/${support.id}`
      && response.request().method() === 'DELETE'
    ));
    await session.page.getByTestId('support-staff-delete-button').click();
    const deletedSupport = await supportDeleteResponse;
    expect(deletedSupport.ok(), `delete activated support worker: ${await deletedSupport.text()}`).toBeTruthy();
    expect((await deletedSupport.json()).deletion_mode).toBe('history_tombstone');
    await expect(session.page.getByTestId(`support-staff-card-${support.id}`)).toHaveCount(0);
    const supportTombstone = await rawMongoRecord('support_staff', support.id);
    const supportUserTombstone = await rawMongoRecord('users', support.user_id);
    expect(supportTombstone?.is_deleted).toBe(true);
    expect(supportUserTombstone?.is_deleted).toBe(true);
    expect(supportUserTombstone).not.toHaveProperty('phone_normalized');
    const reusedSupport = await expectApiOk(
      await apiCall(request, superToken, 'post', '/support-staff', {
        first_name: 'Reused',
        last_name: `Support${suffix}`,
        phone: `+99896${suffix}`,
        email: `reused-support-${suffix}@qa.invalid`,
        available_hours: {},
      }),
      'reuse deleted support phone',
    );
    expect((await expectApiOk(
      await apiCall(request, superToken, 'delete', `/support-staff/${reusedSupport.id}`),
      'remove reused unactivated support worker',
    )).deletion_mode).toBe('hard_delete');
    await assertHealthy(session, 'management UI lifecycles');
  } finally {
    await session.context.close();
  }
});

test('invited manager creates and recovers a password through the phone-auth UI', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const superToken = await apiLogin(request, 'super_admin');
  const suffix = Date.now().toString().slice(-7);
  const phone = `+99893${suffix}`;
  const firstPassword = 'InvitedManager@2026!';
  const resetPassword = 'RecoveredManager@2027!';
  const created = await expectApiOk(
    await apiCall(request, superToken, 'post', '/staff-accounts', {
      full_name: `Invited Manager ${suffix}`,
      phone,
      role: 'manager',
      language_preference: 'en',
    }),
    'create invited manager for phone UI',
  );
  expect(created.account_status).toBe('pending_invite');
  expect(created.invite_delivery_status).toBe('link_ready');
  expect(created.telegram_invite_url).toContain('https://t.me/nuriksacademy_bot?start=connect_');
  await connectMockTelegram(request, phone);
  const inviteCode = await latestMockCode(phone, 'invite');

  const activationContext = await browser.newContext();
  const activationPage = await activationContext.newPage();
  const activationObserved = { consoleErrors: [] as string[], pageErrors: [] as string[], serverErrors: [] as string[], dialogs: [] as string[] };
  monitor(activationPage, activationObserved);
  try {
    await activationPage.goto('/activate-account');
    await activationPage.getByTestId('activate-phone-input').fill(phone);
    await activationPage.getByTestId('activate-code-input').fill(inviteCode);
    await activationPage.getByTestId('activate-password-input').fill(firstPassword);
    await activationPage.getByTestId('activate-password-confirm-input').fill(firstPassword);
    const activationResponse = activationPage.waitForResponse((response) => (
      response.url() === `${API_URL}/auth/invitations/accept`
      && response.request().method() === 'POST'
    ));
    await activationPage.getByTestId('activate-submit-button').click();
    expect((await activationResponse).ok()).toBeTruthy();
    await expect(activationPage).toHaveURL(/\/login/);
    await activationPage.getByTestId('login-email-input').fill(phone);
    await activationPage.getByTestId('login-password-input').fill(firstPassword);
    await activationPage.getByTestId('login-submit-button').click();
    await expect(activationPage.getByRole('tab', { name: 'Home' }).first()).toBeVisible({ timeout: 15_000 });
    expect(activationObserved.pageErrors).toEqual([]);
    expect(activationObserved.serverErrors).toEqual([]);
  } finally {
    await activationContext.close();
  }

  const recoveryContext = await browser.newContext();
  const recoveryPage = await recoveryContext.newPage();
  const recoveryObserved = { consoleErrors: [] as string[], pageErrors: [] as string[], serverErrors: [] as string[], dialogs: [] as string[] };
  monitor(recoveryPage, recoveryObserved);
  try {
    await recoveryPage.goto('/forgot-password');
    await recoveryPage.getByTestId('password-reset-phone-input').fill(phone);
    const requestResponse = recoveryPage.waitForResponse((response) => (
      response.url() === `${API_URL}/auth/password-reset/request`
      && response.request().method() === 'POST'
    ));
    await recoveryPage.getByTestId('password-reset-request-button').click();
    expect((await requestResponse).ok()).toBeTruthy();
    const resetCode = await latestMockCode(phone, 'password_reset');
    await recoveryPage.getByTestId('password-reset-code-input').fill(resetCode);
    await recoveryPage.getByTestId('password-reset-password-input').fill(resetPassword);
    await recoveryPage.getByTestId('password-reset-password-confirm-input').fill(resetPassword);
    const confirmResponse = recoveryPage.waitForResponse((response) => (
      response.url() === `${API_URL}/auth/password-reset/confirm`
      && response.request().method() === 'POST'
    ));
    await recoveryPage.getByTestId('password-reset-confirm-button').click();
    expect((await confirmResponse).ok()).toBeTruthy();
    await expect(recoveryPage).toHaveURL(/\/login/);
    await recoveryPage.getByTestId('login-email-input').fill(phone);
    await recoveryPage.getByTestId('login-password-input').fill(resetPassword);
    await recoveryPage.getByTestId('login-submit-button').click();
    await expect(recoveryPage.getByRole('tab', { name: 'Home' }).first()).toBeVisible({ timeout: 15_000 });

    await expectApiOk(
      await apiCall(request, superToken, 'patch', `/staff-accounts/${created.id}/deactivate`),
      'deactivate signed-in manager',
    );
    const leadsTab = recoveryPage.getByRole('tab', { name: 'Leads' }).first();
    if (await leadsTab.isVisible()) await leadsTab.click();
    await expect(recoveryPage).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(recoveryPage.getByTestId('session-ended-notice')).toContainText('access has ended');
    expect(recoveryObserved.pageErrors).toEqual([]);
    expect(recoveryObserved.serverErrors).toEqual([]);
  } finally {
    await recoveryContext.close();
  }

  const oldPasswordLogin = await request.post(`${API_URL}/auth/login`, {
    data: { phone, password: firstPassword },
  });
  expect(oldPasswordLogin.status()).toBe(401);
});

test('group UI creates exact billing schedule, manages membership, edits, and protects financial history', async ({ browser, request }, testInfo) => {
  test.setTimeout(120_000);
  const superToken = await apiLogin(request, 'super_admin');
  const teachers = await expectApiOk(await apiCall(request, superToken, 'get', '/teachers'), 'load group teachers');
  const courses = await expectApiOk(await apiCall(request, superToken, 'get', '/courses'), 'load group courses');
  const students = await expectApiOk(await apiCall(request, superToken, 'get', '/students'), 'load group students');
  const teacher = teachers.find((row: any) => row.first_name === 'Live');
  const course = courses.find((row: any) => row.name === 'QA General English');
  const student = students.find((row: any) => row.student_id === 'QA-LIVE-001');
  expect(teacher).toBeTruthy();
  expect(course).toBeTruthy();
  expect(student).toBeTruthy();
  const session = await loginUi(browser, 'super_admin');
  const suffix = Date.now().toString().slice(-6);
  const name = `UI Group ${suffix}`;
  const updatedName = `Updated Group ${suffix}`;
  try {
    await session.page.getByText('Groups', { exact: true }).last().click();
    await session.page.getByTestId('groups-add-button').click();
    await expect(session.page.getByText('Create New Group', { exact: true })).toBeVisible();
    await session.page.getByPlaceholder('e.g., IELTS Morning A').fill(name);
    await session.page.getByTestId('group-course-picker').selectOption(course.id);
    await session.page.getByTestId('group-teacher-picker').selectOption(teacher.id);
    await expect(session.page.getByTestId('group-program-picker')).toHaveCount(0);
    await expect(session.page.getByTestId('group-derived-program')).toHaveText('General English');
    await session.page.getByTestId('group-format-picker').selectOption('normal');
    await expect(session.page.getByText(/450[,.\s]000 UZS/)).toBeVisible();
    await expect(session.page.getByText('40%', { exact: true })).toBeVisible();
    await session.page.getByTestId('group-schedule-day-picker').selectOption('Thursday');
    await session.page.getByPlaceholder('09:00').fill('17:00');
    await session.page.getByPlaceholder('10:30').fill('18:30');
    await session.page.getByPlaceholder('Room 101').fill('QA Room');
    await session.page.getByTestId('group-add-schedule-button').click();
    let createRequestCount = 0;
    const createRequestListener = (requestValue: any) => {
      if (requestValue.method() === 'POST' && requestValue.url().endsWith('/api/groups')) createRequestCount += 1;
    };
    session.page.on('request', createRequestListener);
    const createResponsePromise = session.page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith('/api/groups'));
    const saveButton = session.page.getByTestId('group-save-button');
    const createStartedAt = Date.now();
    await Promise.allSettled([
      saveButton.click(),
      saveButton.click({ timeout: 1_000 }),
    ]);
    const createResponse = await createResponsePromise;
    session.page.off('request', createRequestListener);
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    expect(createRequestCount).toBe(1);
    await expect(session.page.getByText('Create New Group', { exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(session.page.getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 });
    const createRenderedMs = Date.now() - createStartedAt;
    await testInfo.attach('group-created-modal-closed.png', {
      body: await session.page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('group-create-evidence.json', {
      body: Buffer.from(JSON.stringify({ createRequestCount, createRenderedMs, modalClosed: true }, null, 2)),
      contentType: 'application/json',
    });
    const groups = await expectApiOk(await apiCall(request, superToken, 'get', '/groups'), 'load created group');
    const group = groups.find((row: any) => row.name === name);
    expect(group).toBeTruthy();
    expect(group.program_code).toBe('general');
    expect(group.group_format).toBe('normal');
    expect(group.schedule).toEqual([{ day: 'Thursday', start_time: '17:00', end_time: '18:30', room: 'QA Room' }]);

    await session.page.getByTestId(`group-card-${group.id}`).click();
    const groupDetailsModal = session.page.getByTestId('group-details-modal');
    await expect(groupDetailsModal.getByText('Group Details', { exact: true })).toBeVisible();
    await expect(groupDetailsModal.getByText(name, { exact: true })).toBeVisible();
    await session.page.getByTestId('group-add-student-button').click();
    await session.page.getByPlaceholder('Search by name or student ID...').fill('QA-LIVE-001');
    await session.page.getByTestId(`group-select-student-${student.id}`).click();
    await expect.poll(async () => {
      const rows = await expectApiOk(await apiCall(request, superToken, 'get', '/groups'), 'poll group membership add');
      return rows.find((row: any) => row.id === group.id)?.student_ids.includes(student.id);
    }, { timeout: 8_000 }).toBe(true);
    await session.page.getByTestId('group-add-student-close').click();
    await expect(session.page.getByText('Live Student', { exact: true })).toBeVisible();
    await session.page.getByTestId(`group-remove-student-${student.id}`).click();
    await expect.poll(async () => {
      const rows = await expectApiOk(await apiCall(request, superToken, 'get', '/groups'), 'poll group membership remove');
      return rows.find((row: any) => row.id === group.id)?.student_ids.includes(student.id);
    }, { timeout: 8_000 }).toBe(false);

    await session.page.getByTestId('group-edit-button').click();
    const miniOption = session.page.getByTestId('group-format-picker').locator('option[value="mini"]');
    await expect(miniOption).toBeDisabled();
    await session.page.getByPlaceholder('e.g., IELTS Morning A').fill(updatedName);
    await session.page.getByTestId('group-save-button').click();
    await expect(session.page.getByText('Edit Group', { exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(session.page.getByText(updatedName, { exact: true })).toBeVisible({ timeout: 10_000 });
    const [deleteResponse] = await Promise.all([
      session.page.waitForResponse((response) => response.url().includes(`/api/groups/${group.id}`) && response.request().method() === 'DELETE'),
      session.page.getByRole('button', { name: `Delete group ${updatedName}` }).click(),
    ]);
    expect(deleteResponse.status()).toBe(409);
    await expect(session.page.getByTestId(`group-card-${group.id}`).getByText(updatedName, { exact: true })).toBeVisible({ timeout: 10_000 });
    const groupsAfterDelete = await expectApiOk(await apiCall(request, superToken, 'get', '/groups'), 'load groups after delete');
    expect(groupsAfterDelete.some((row: any) => row.id === group.id)).toBeTruthy();
    await assertHealthy(session, 'group UI lifecycle');
  } finally {
    await session.context.close();
  }
});

test('API roles, linked profiles, and principal read models agree', async ({ request }) => {
  const tokens = Object.fromEntries(await Promise.all(
    (Object.keys(roleLogins) as RoleKey[]).map(async (role) => [role, await apiLogin(request, role)]),
  )) as Record<RoleKey, string>;

  const allowedChecks: [RoleKey, string][] = [
    ['super_admin', '/dashboard'],
    ['manager', '/dashboard'],
    ['teacher', '/teachers/me'],
    ['teacher', '/groups'],
    ['teacher', '/students'],
    ['student', '/groups'],
    ['parent', '/students'],
    ['parent', '/payments/history'],
    ['support', '/support-bookings'],
    ['reception', '/finance/reception/call-list'],
    ['manager', '/admin/settings'],
  ];
  for (const [role, path] of allowedChecks) {
    const response = await apiCall(request, tokens[role], 'get', path);
    expect(response.status(), `${role} cannot read ${path}: ${await response.text()}`).toBeLessThan(400);
  }

  const forbiddenChecks: [RoleKey, string][] = [
    ['student', '/admin/settings'],
    ['parent', '/admin/settings'],
    ['teacher', '/admin/settings'],
    ['student', '/dashboard'],
    ['parent', '/dashboard'],
    ['teacher', '/dashboard'],
    ['reception', '/dashboard'],
    ['support', '/dashboard'],
    ['reception', '/groups'],
    ['support', '/groups'],
    ['support', '/finance/position?service_month=2026-07'],
    ['student', '/finance/position?service_month=2026-07'],
    ['reception', '/finance/policies'],
  ];
  for (const [role, path] of forbiddenChecks) {
    const response = await apiCall(request, tokens[role], 'get', path);
    expect(response.status(), `${role} unexpectedly accessed ${path}`).toBe(403);
  }

  const month = academyDate().slice(0, 7);
  for (const role of ['super_admin', 'manager'] as const) {
    const analytics = await expectApiOk(
      await apiCall(request, tokens[role], 'get', '/admin/analytics'),
      `${role} analytics`,
    );
    const dashboard = await expectApiOk(
      await apiCall(request, tokens[role], 'get', '/dashboard'),
      `${role} dashboard`,
    );
    const position = await expectApiOk(
      await apiCall(request, tokens[role], 'get', `/finance/position?service_month=${month}`),
      `${role} finance position`,
    );
    expect(analytics.students.total).toBe(dashboard.students.total);
    expect(analytics.revenue.monthly).toBe(position.cash_received_uzs);
  }
});

test('management lifecycles work and managers cannot cross branch boundaries', async ({ request }) => {
  test.setTimeout(120_000);
  const superToken = await apiLogin(request, 'super_admin');
  const managerAToken = await apiLogin(request, 'manager');
  const managerBToken = await apiLoginAs(request, 'qa_manager_b');
  const managerBUser = await expectApiOk(await apiCall(request, managerBToken, 'get', '/auth/me'), 'load branch B identity');
  const branchBId = managerBUser.branch_id;
  expect(branchBId).toBeTruthy();
  const suffix = Date.now().toString().slice(-7);

  const teacherPayload = {
    first_name: 'Branch', last_name: `Teacher${suffix}`, phone: `+99892${suffix}`,
    email: `teacher-${suffix}@qa.invalid`, specialization: ['QA'], courses: [], branch_id: branchBId,
  };
  const teacher = await expectApiOk(
    await apiCall(request, superToken, 'post', '/teachers', teacherPayload),
    'super admin creates branch B teacher',
  );
  const studentPayload = {
    first_name: 'Branch', last_name: `Student${suffix}`, phone: `+99893${suffix}`,
    email: `student-${suffix}@qa.invalid`, address: 'Disposable QA', courses: [], branch_id: branchBId,
  };
  const student = await expectApiOk(
    await apiCall(request, superToken, 'post', '/students', studentPayload),
    'super admin creates branch B student',
  );
  const supportPayload = {
    first_name: 'Branch', last_name: `Support${suffix}`, phone: `+99894${suffix}`,
    email: `support-${suffix}@qa.invalid`, available_hours: { start: '09:00', end: '18:00' }, branch_id: branchBId,
  };
  const support = await expectApiOk(
    await apiCall(request, superToken, 'post', '/support-staff', supportPayload),
    'super admin creates branch B support staff',
  );
  await activateInvitedAccount(request, teacherPayload.phone, 'BranchTeacher@2026!');
  await activateInvitedAccount(request, studentPayload.phone, 'BranchStudent@2026!');
  await activateInvitedAccount(request, supportPayload.phone, 'BranchSupport@2026!');

  const courses = await expectApiOk(await apiCall(request, superToken, 'get', '/courses'), 'load courses');
  const branchBGroupPayload = {
    name: `Branch B Group ${suffix}`,
    course_id: courses[0].id,
    teacher_id: teacher.id,
    schedule: [{ day: academyWeekday(), start_time: '15:00', end_time: '16:00', room: 'B-QA' }],
    start_date: `${localDate()}T00:00:00`,
    end_date: null,
    branch_id: branchBId,
    program_code: 'general',
    group_format: 'normal',
    finance_effective_from: localDate(),
    finance_change_reason: 'Branch authorization QA',
  };
  const branchBGroup = await expectApiOk(
    await apiCall(request, managerBToken, 'post', '/groups', branchBGroupPayload),
    'branch B manager creates group',
  );
  await expectApiOk(
    await apiCall(request, managerBToken, 'post', `/groups/${branchBGroup.id}/students/${student.id}`),
    'branch B manager enrolls student',
  );
  const branchBHomework = await expectApiOk(await apiCall(request, managerBToken, 'post', '/homework', {
    group_id: branchBGroup.id,
    title: `Branch B homework ${suffix}`,
    description: 'Disposable branch authorization exercise',
    due_date: `${localDate(14)}T12:00:00`,
    attachments: [],
  }), 'branch B manager creates homework');
  const branchBTest = await expectApiOk(await apiCall(request, managerBToken, 'post', '/tests', {
    test_type: 'mid_test',
    group_id: branchBGroup.id,
    course_id: courses[0].id,
    title: `Branch B test ${suffix}`,
    test_date: `${localDate(7)}T12:00:00`,
    max_score: 100,
  }), 'branch B manager creates test');
  const branchBCertificate = await expectApiOk(await apiCall(request, managerBToken, 'post', '/certificates', {
    student_id: student.id,
    course_id: courses[0].id,
    certificate_type: 'completion',
  }), 'branch B manager creates certificate');

  const branchBStudentToken = await apiLoginWithPassword(request, studentPayload.phone, 'BranchStudent@2026!');
  const branchBBooking = await expectApiOk(await apiCall(request, branchBStudentToken, 'post', '/support-bookings', {
    support_staff_id: support.id,
    booking_date: academyDate(),
    start_time: '13:00',
    duration_minutes: 40,
    topic: `Branch isolation ${suffix}`,
  }), 'create branch B support booking');

  expect((await apiCall(request, managerBToken, 'delete', `/teachers/${teacher.id}`)).status()).toBe(403);
  expect((await apiCall(request, managerBToken, 'delete', `/support-staff/${support.id}`)).status()).toBe(403);
  const assignedTeacherDeletion = await apiCall(request, superToken, 'delete', `/teachers/${teacher.id}`);
  const assignedTeacherDeletionBody = await assignedTeacherDeletion.text();
  expect(assignedTeacherDeletion.status(), assignedTeacherDeletionBody).toBe(409);
  expect(assignedTeacherDeletionBody).toContain('Reassign or close');
  const bookedSupportDeletion = await apiCall(request, superToken, 'delete', `/support-staff/${support.id}`);
  const bookedSupportDeletionBody = await bookedSupportDeletion.text();
  expect(bookedSupportDeletion.status(), bookedSupportDeletionBody).toBe(409);
  expect(bookedSupportDeletionBody).toContain('Reassign or cancel');

  for (const [label, response] of [
    ['student list override', await apiCall(request, managerAToken, 'get', `/students?branch_id=${branchBId}`)],
    ['teacher list override', await apiCall(request, managerAToken, 'get', `/teachers?branch_id=${branchBId}`)],
    ['support list override', await apiCall(request, managerAToken, 'get', `/support-staff?branch_id=${branchBId}`)],
    ['group list override', await apiCall(request, managerAToken, 'get', `/groups?branch_id=${branchBId}`)],
    ['student direct read', await apiCall(request, managerAToken, 'get', `/students/${student.id}`)],
    ['teacher direct read', await apiCall(request, managerAToken, 'get', `/teachers/${teacher.id}`)],
    ['teacher status', await apiCall(request, managerAToken, 'get', `/teachers/${teacher.id}/status`)],
    ['support direct read', await apiCall(request, managerAToken, 'get', `/support-staff/${support.id}`)],
    ['student update', await apiCall(request, managerAToken, 'put', `/students/${student.id}`, studentPayload)],
    ['teacher update', await apiCall(request, managerAToken, 'put', `/teachers/${teacher.id}`, teacherPayload)],
    ['support update', await apiCall(request, managerAToken, 'put', `/support-staff/${support.id}`, supportPayload)],
    ['teacher deactivate', await apiCall(request, managerAToken, 'patch', `/teachers/${teacher.id}/deactivate`)],
    ['support deactivate', await apiCall(request, managerAToken, 'patch', `/support-staff/${support.id}/deactivate`)],
    ['teacher permanent delete', await apiCall(request, managerAToken, 'delete', `/teachers/${teacher.id}`)],
    ['support permanent delete', await apiCall(request, managerAToken, 'delete', `/support-staff/${support.id}`)],
    ['student archive', await apiCall(request, managerAToken, 'delete', `/students/${student.id}`)],
    ['support booking confirm', await apiCall(request, managerAToken, 'put', `/support-bookings/${branchBBooking.id}/confirm`)],
    ['homework group read', await apiCall(request, managerAToken, 'get', `/homework/group/${branchBGroup.id}`)],
    ['test group read', await apiCall(request, managerAToken, 'get', `/tests/group/${branchBGroup.id}`)],
    ['attendance group read', await apiCall(request, managerAToken, 'get', `/attendance/group/${branchBGroup.id}`)],
    ['student homework read', await apiCall(request, managerAToken, 'get', `/homework/student/${student.id}`)],
    ['student test read', await apiCall(request, managerAToken, 'get', `/tests/student/${student.id}`)],
    ['student progress read', await apiCall(request, managerAToken, 'get', `/tests/progress/${student.id}`)],
    ['student attendance read', await apiCall(request, managerAToken, 'get', `/attendance/student/${student.id}`)],
    ['certificate list read', await apiCall(request, managerAToken, 'get', `/certificates/student/${student.id}`)],
    ['certificate download', await apiCall(request, managerAToken, 'get', `/certificates/download/${branchBCertificate.id}`)],
    ['homework create', await apiCall(request, managerAToken, 'post', '/homework', {
      group_id: branchBGroup.id, title: 'Forbidden', description: 'Forbidden', due_date: `${localDate(14)}T12:00:00`, attachments: [],
    })],
    ['test create', await apiCall(request, managerAToken, 'post', '/tests', {
      test_type: 'mid_test', group_id: branchBGroup.id, course_id: courses[0].id, title: 'Forbidden', test_date: `${localDate(7)}T12:00:00`, max_score: 100,
    })],
    ['homework delete', await apiCall(request, managerAToken, 'delete', `/homework/${branchBHomework.id}`)],
    ['test delete', await apiCall(request, managerAToken, 'delete', `/tests/${branchBTest.id}`)],
    ['certificate create', await apiCall(request, managerAToken, 'post', '/certificates', {
      student_id: student.id, course_id: courses[0].id, certificate_type: 'completion',
    })],
  ] as const) {
    expect(response.status(), `${label} crossed branches: ${await response.text()}`).toBe(403);
  }

  const managerBTeachers = await expectApiOk(await apiCall(request, managerBToken, 'get', '/teachers'), 'branch B teachers');
  const managerBStudents = await expectApiOk(await apiCall(request, managerBToken, 'get', '/students'), 'branch B students');
  const managerBSupport = await expectApiOk(await apiCall(request, managerBToken, 'get', '/support-staff'), 'branch B support staff');
  expect(managerBTeachers.some((row: any) => row.id === teacher.id)).toBeTruthy();
  expect(managerBStudents.some((row: any) => row.id === student.id)).toBeTruthy();
  expect(managerBSupport.some((row: any) => row.id === support.id)).toBeTruthy();
  const managerABookings = await expectApiOk(await apiCall(request, managerAToken, 'get', '/support-bookings'), 'branch A bookings');
  const managerBBookings = await expectApiOk(await apiCall(request, managerBToken, 'get', '/support-bookings'), 'branch B bookings');
  expect(managerABookings.some((row: any) => row.id === branchBBooking.id)).toBeFalsy();
  expect(managerBBookings.some((row: any) => row.id === branchBBooking.id)).toBeTruthy();
  const managerBDashboard = await expectApiOk(await apiCall(request, managerBToken, 'get', '/dashboard'), 'branch B dashboard');
  expect(managerBDashboard.today.support_bookings).toBeGreaterThanOrEqual(1);

  const updatedTeacherPayload = { ...teacherPayload, first_name: 'Updated' };
  const updatedTeacher = await expectApiOk(
    await apiCall(request, managerBToken, 'put', `/teachers/${teacher.id}`, updatedTeacherPayload),
    'update own-branch teacher',
  );
  expect(updatedTeacher.first_name).toBe('Updated');
  // An idempotent save must still succeed; matched data is not a missing record.
  await expectApiOk(
    await apiCall(request, managerBToken, 'put', `/teachers/${teacher.id}`, updatedTeacherPayload),
    'repeat identical teacher update',
  );
  await expectApiOk(await apiCall(request, managerBToken, 'patch', `/teachers/${teacher.id}/deactivate`), 'deactivate teacher');
  let status = await expectApiOk(await apiCall(request, managerBToken, 'get', `/teachers/${teacher.id}/status`), 'teacher inactive status');
  expect(status.is_active).toBe(false);
  await expectApiOk(await apiCall(request, managerBToken, 'patch', `/teachers/${teacher.id}/reactivate`), 'reactivate teacher');
  status = await expectApiOk(await apiCall(request, managerBToken, 'get', `/teachers/${teacher.id}/status`), 'teacher active status');
  expect(status.is_active).toBe(true);
  const reset = await expectApiOk(await apiCall(request, managerBToken, 'post', `/teachers/${teacher.id}/reset-password`), 'reset teacher password');
  expect(reset.purpose).toBe('password_reset');
  expect(reset).not.toHaveProperty('new_password');

  const updatedSupport = await expectApiOk(
    await apiCall(request, managerBToken, 'put', `/support-staff/${support.id}`, { ...supportPayload, first_name: 'Updated' }),
    'update own-branch support staff',
  );
  expect(updatedSupport.first_name).toBe('Updated');
  await expectApiOk(await apiCall(request, managerBToken, 'patch', `/support-staff/${support.id}/deactivate`), 'deactivate support');
  await expectApiOk(await apiCall(request, managerBToken, 'patch', `/support-staff/${support.id}/reactivate`), 'reactivate support');
  const supportReset = await expectApiOk(await apiCall(request, managerBToken, 'post', `/support-staff/${support.id}/reset-password`), 'reset support password');
  expect(supportReset.purpose).toBe('password_reset');
  expect(supportReset).not.toHaveProperty('new_password');

  await expectApiOk(await apiCall(request, managerBToken, 'put', `/students/${student.id}`, { ...studentPayload, first_name: 'Updated' }), 'update own-branch student');
  await expectApiOk(await apiCall(request, managerBToken, 'delete', `/students/${student.id}`), 'archive own-branch student');
  const archivedRows = await expectApiOk(await apiCall(request, managerBToken, 'get', '/students?status=archived'), 'load archived students');
  expect(archivedRows.some((row: any) => row.id === student.id)).toBeTruthy();
  await expectApiOk(await apiCall(request, managerBToken, 'patch', `/students/${student.id}/restore`), 'restore own-branch student');
  const restored = await expectApiOk(await apiCall(request, managerBToken, 'get', `/students/${student.id}`), 'read restored student');
  expect(restored.status).toBe('active');
});

test('lead detail, status, conversion, and student list synchronize across active staff sessions', async ({ browser, request }) => {
  const reception = await loginUi(browser, 'reception');
  const manager = await loginUi(browser, 'manager');
  const receptionToken = await apiLogin(request, 'reception');
  const unique = Date.now().toString().slice(-7);
  try {
    await reception.page.getByRole('tab', { name: 'Leads' }).first().click();
    await manager.page.getByRole('tab', { name: 'Leads' }).first().click();
    await reception.page.getByTestId('leads-add-button').click();
    await expect(reception.page.getByText('Add New Lead', { exact: true })).toBeVisible();
    await reception.page.getByPlaceholder('Enter first name').fill(`Live${unique}`);
    await reception.page.getByPlaceholder('Enter last name').fill('Prospect');
    await reception.page.getByTestId('lead-access-parent_only').click();
    await reception.page.getByTestId('lead-primary-phone').fill(`+99891${unique}`);
    await reception.page.getByTestId('lead-parent-name').fill('QA Parent Contact');
    await reception.page.getByText('Create Lead', { exact: true }).click();
    await expect(reception.page.getByText(`Live${unique} Prospect`, { exact: true })).toBeVisible();
    await expect(manager.page.getByText(`Live${unique} Prospect`, { exact: true })).toBeVisible({ timeout: 5_000 });
    const leads = await expectApiOk(await apiCall(request, receptionToken, 'get', '/leads'), 'load created lead');
    const lead = leads.find((row: any) => row.first_name === `Live${unique}`);
    expect(lead).toBeTruthy();

    await reception.page.getByTestId(`lead-card-${lead.id}`).click();
    await expect(reception.page.getByTestId('lead-detail-modal')).toBeVisible();
    await reception.page.getByTestId('lead-status-picker').selectOption('contacted');
    await expect.poll(async () => {
      const row = await expectApiOk(await apiCall(request, receptionToken, 'get', `/leads/${lead.id}`), 'poll lead status');
      return row.status;
    }, { timeout: 6_000 }).toBe('contacted');
    await reception.page.getByTestId(`lead-detail-convert-${lead.id}`).click();
    await expect(reception.page.getByText('Convert Lead to Student', { exact: true })).toBeVisible();
    const conversionResponsePromise = reception.page.waitForResponse((response) => (
      response.url().endsWith(`/api/leads/${lead.id}/convert`) && response.request().method() === 'POST'
    ));
    await reception.page.getByTestId('lead-convert-confirm').click();
    const conversionResponse = await conversionResponsePromise;
    const conversion = await conversionResponse.json();
    expect(conversion.account_access_mode).toBe('parent_only');
    expect(conversion.student_account_status).toBe('phone_required');
    expect(conversion.telegram_invites.parent?.telegram_invite_url).toBeTruthy();
    expect(conversion.telegram_invites.student).toBeUndefined();
    await expect(reception.page.getByText('Lead Converted Successfully!', { exact: true })).toBeVisible({ timeout: 8_000 });
    await reception.page.getByTestId('lead-conversion-done').click();
    await manager.page.getByRole('tab', { name: 'Students' }).first().click();
    const convertedLead = await expectApiOk(await apiCall(request, receptionToken, 'get', `/leads/${lead.id}`), 'load converted lead');
    expect(convertedLead.status).toBe('enrolled');
    expect(convertedLead.converted_to_student_id).toBeTruthy();
    await expect(
      manager.page
        .getByTestId(`student-card-${convertedLead.converted_to_student_id}`)
        .getByText(`Live${unique} Prospect`, { exact: true }),
    ).toBeVisible({ timeout: 8_000 });
    await assertHealthy(reception, 'reception lead creation');
    await assertHealthy(manager, 'manager live converted student observer');
  } finally {
    await reception.context.close();
    await manager.context.close();
  }
});

test('student and parent access creates distinct accounts and rejects a shared login phone', async ({ request }) => {
  const token = await apiLogin(request, 'reception');
  const unique = Date.now().toString().slice(-7);
  const studentPhone = `+99890${unique}`;
  const parentPhone = `+99893${unique}`;
  const leadResponse = await apiCall(request, token, 'post', '/leads', {
    first_name: `Separate${unique}`,
    last_name: 'Student',
    phone: studentPhone,
    parent_name: 'Separate Parent',
    parent_phone: parentPhone,
    account_access_mode: 'separate',
    interested_course: 'QA General English',
    source: 'walk_in',
    notes: 'Separate account ownership regression',
  });
  const lead = await expectApiOk(leadResponse, 'create separate-access lead');
  expect(lead.phone).toBe(studentPhone);
  expect(lead.parent_phone).toBe(parentPhone);
  expect(lead.account_access_mode).toBe('separate');

  const conversion = await expectApiOk(
    await apiCall(request, token, 'post', `/leads/${lead.id}/convert`),
    'convert separate-access lead',
  );
  expect(conversion.account_access_mode).toBe('separate');
  expect(conversion.student_account_status).toBe('pending_invite');
  expect(conversion.parent_account_status).toBe('pending_invite');
  expect(conversion.telegram_invites.student?.telegram_invite_url).toBeTruthy();
  expect(conversion.telegram_invites.parent?.telegram_invite_url).toBeTruthy();

  const student = await rawMongoRecord('students', conversion.student_db_id);
  const parent = await rawMongoRecord('parents', student!.parent_id);
  expect(student!.user_id).not.toBe(parent!.user_id);
  const studentUser = await rawMongoRecord('users', student!.user_id);
  const parentUser = await rawMongoRecord('users', parent!.user_id);
  expect(studentUser!.role).toBe('student');
  expect(parentUser!.role).toBe('parent');
  expect(studentUser!.phone_normalized).toBe(studentPhone);
  expect(parentUser!.phone_normalized).toBe(parentPhone);

  const sharedPhoneResponse = await apiCall(request, token, 'post', '/leads', {
    first_name: `Shared${unique}`,
    last_name: 'Rejected',
    phone: studentPhone.replace('90', '94'),
    parent_name: 'Shared Parent',
    parent_phone: studentPhone.replace('90', '94'),
    account_access_mode: 'separate',
    source: 'walk_in',
  });
  expect(sharedPhoneResponse.status()).toBe(409);
  expect(await sharedPhoneResponse.text()).toContain('different phone numbers');
});

test('chat messages synchronize live in both directions and read state reconciles', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const superToken = await apiLogin(request, 'super_admin');
  const studentToken = await apiLogin(request, 'student');
  const studentIdentity = await expectApiOk(await apiCall(request, studentToken, 'get', '/auth/me'), 'load chat student');
  const admin = await loginUi(browser, 'super_admin');
  const student = await loginUi(browser, 'student');
  try {
    await admin.page.getByRole('tab', { name: 'Chats' }).first().click();
    await student.page.getByRole('tab', { name: 'Chats' }).first().click();
    const conversation = await expectApiOk(await apiCall(request, superToken, 'post', '/chat/conversations', {
      participant_id: studentIdentity.id,
    }), 'create admin/student conversation');
    await expect(admin.page.getByTestId(`chat-conversation-${conversation.id}`)).toBeVisible({ timeout: 6_000 });
    await expect(student.page.getByTestId(`chat-conversation-${conversation.id}`)).toBeVisible({ timeout: 6_000 });
    await admin.page.getByTestId(`chat-conversation-${conversation.id}`).click();
    await student.page.getByTestId(`chat-conversation-${conversation.id}`).click();
    await expect(admin.page).toHaveURL(new RegExp(`/chat/${conversation.id}`));
    await expect(student.page).toHaveURL(new RegExp(`/chat/${conversation.id}`));

    const adminMessage = `Admin live message ${Date.now().toString().slice(-6)}`;
    await admin.page.getByTestId('chat-message-input').fill(adminMessage);
    await admin.page.getByTestId('chat-send-button').click();
    await expect(admin.page.getByText(adminMessage, { exact: true })).toBeVisible();
    await expect(student.page.getByText(adminMessage, { exact: true })).toBeVisible({ timeout: 6_000 });

    const studentReply = `Student live reply ${Date.now().toString().slice(-6)}`;
    await student.page.getByTestId('chat-message-input').fill(studentReply);
    await student.page.getByTestId('chat-send-button').click();
    await expect(student.page.getByText(studentReply, { exact: true })).toBeVisible();
    await expect(admin.page.getByText(studentReply, { exact: true })).toBeVisible({ timeout: 6_000 });

    const messages = await expectApiOk(
      await apiCall(request, studentToken, 'get', `/chat/conversations/${conversation.id}/messages`),
      'load synchronized chat history',
    );
    expect(messages.filter((row: any) => [adminMessage, studentReply].includes(row.content))).toHaveLength(2);
    await assertHealthy(admin, 'admin chat');
    await assertHealthy(student, 'student chat');
  } finally {
    await admin.context.close();
    await student.context.close();
  }
});

test('settings rows open, save, and refresh in another super-admin session', async ({ browser }) => {
  const actor = await loginUi(browser, 'super_admin');
  const observer = await loginUi(browser, 'super_admin');
  const academyName = `Nurik QA ${Date.now().toString().slice(-6)}`;
  try {
    for (const session of [actor, observer]) {
      await session.page.getByRole('tab', { name: 'Home' }).first().click();
      await session.page.getByText('Settings', { exact: true }).last().click();
      await expect(session.page).toHaveURL(/\/settings/);
    }
    for (const label of [
      'Academy Name', 'Email', 'Phone', 'Address', 'Start Time', 'End Time',
      'Prefix', 'Currency',
    ]) {
      await actor.page.getByRole('button', { name: `Edit ${label}` }).click();
      await expect(actor.page.getByText(`Edit ${label}`, { exact: true })).toBeVisible();
      await actor.page.getByRole('button', { name: 'Close setting editor' }).click();
    }
    await actor.page.getByText('Academy Name', { exact: true }).click();
    await expect(actor.page.getByText('Edit Academy Name', { exact: true })).toBeVisible();
    const editInput = actor.page.locator('input').last();
    await editInput.fill(academyName);
    await actor.page.getByText('Save', { exact: true }).last().click();
    await expect(actor.page.getByText(academyName, { exact: true })).toBeVisible();
    await expect(observer.page.getByText(academyName, { exact: true })).toBeVisible({ timeout: 7_000 });
    await expect(actor.page.getByText('Branch Management', { exact: true })).toHaveCount(0);
    await expect(actor.page.getByText('Add Branch', { exact: true })).toHaveCount(0);
    await expect(actor.page.getByText('Click and Payme receiving cards are managed in Finance, under Online payments.')).toBeVisible();
    await expect(actor.page.getByText('Click Merchant ID', { exact: true })).toHaveCount(0);
    await expect(actor.page.getByText('Payme Merchant ID', { exact: true })).toHaveCount(0);
    await assertHealthy(actor, 'settings actor');
    await assertHealthy(observer, 'settings observer');
  } finally {
    await actor.context.close();
    await observer.context.close();
  }
});

test('language preference changes the app immediately and persists after reload', async ({ browser }) => {
  test.setTimeout(60_000);
  const session = await loginUi(browser, 'manager');
  try {
    await session.page.getByRole('tab', { name: 'Profile' }).first().click();
    await session.page.getByTestId('profile-language-button').click();
    await session.page.getByTestId('profile-language-option-ru').click();
    await expect(session.page.getByRole('tab', { name: 'Профиль' }).first()).toBeVisible();
    if (REMOTE_LIVE_AUDIT) await session.page.goto('/');
    else await session.page.reload();
    await expect(session.page.getByRole('tab', { name: 'Профиль' }).first()).toBeVisible();
    if (REMOTE_LIVE_AUDIT) {
      await session.page.getByRole('tab', { name: 'Профиль' }).first().click();
    }
    await session.page.getByTestId('profile-language-button').click();
    await session.page.getByTestId('profile-language-option-uz').click();
    await expect(session.page.getByRole('tab', { name: 'Profil' }).first()).toBeVisible();
    await session.page.getByTestId('profile-language-button').click();
    await session.page.getByTestId('profile-language-option-en').click();
    await expect(session.page.getByRole('tab', { name: 'Profile' }).first()).toBeVisible();
    await assertHealthy(session, 'language preference');
  } finally {
    await session.context.close();
  }
});

test('profile notification, help-chat, and logout controls persist their intended effects', async ({ browser, request }) => {
  const session = await loginUi(browser, 'student');
  const token = await apiLogin(request, 'student');
  try {
    await session.page.getByRole('tab', { name: 'Profile' }).click();
    await session.page.getByTestId('profile-notifications-button').click();
    await expect(session.page.getByText('student settings')).toBeVisible();

    const paymentSwitch = session.page.getByRole('switch', { name: 'Payment Reminders' });
    const homeworkSwitch = session.page.getByRole('switch', { name: 'Homework' });
    await expect(paymentSwitch).toBeDisabled();
    const preferencesBefore = await expectApiOk(
      await apiCall(request, token, 'get', '/notifications/preferences'),
      'load notification preferences',
    );
    await homeworkSwitch.click();
    const [saveResponse] = await Promise.all([
      session.page.waitForResponse((response) => response.request().method() === 'PUT'
        && response.url().endsWith('/api/notifications/preferences')),
      session.page.getByTestId('profile-notifications-save').click(),
    ]);
    expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
    const preferencesAfter = await expectApiOk(
      await apiCall(request, token, 'get', '/notifications/preferences'),
      'reload notification preferences',
    );
    expect(preferencesAfter.homework_notifications).toBe(!preferencesBefore.homework_notifications);
    expect(preferencesAfter.payment_reminders).toBe(true);

    // Financial notices remain mandatory even if a client submits false.
    const forcedPreferences = { ...preferencesAfter, payment_reminders: false };
    await expectApiOk(
      await apiCall(request, token, 'put', '/notifications/preferences', forcedPreferences),
      'attempt to disable mandatory payment reminders',
    );
    const mandatoryPreferences = await expectApiOk(
      await apiCall(request, token, 'get', '/notifications/preferences'),
      'reload mandatory payment preference',
    );
    expect(mandatoryPreferences.payment_reminders).toBe(true);

    await session.page.getByTestId('profile-notifications-close').click();
    await session.page.getByTestId('profile-help-button').click();
    const [chatResponse] = await Promise.all([
      session.page.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().endsWith('/api/chat/conversations/admin')),
      session.page.getByTestId('profile-help-chat').click(),
    ]);
    expect(chatResponse.ok(), await chatResponse.text()).toBeTruthy();
    await expect(session.page).toHaveURL(/\/chat\//);

    await session.page.getByTestId('chat-back-button').click();
    await session.page.getByRole('tab', { name: 'Profile' }).click();
    await session.page.getByTestId('profile-logout-button').click();
    await session.page.getByTestId('profile-logout-cancel').click();
    await expect(session.page.getByTestId('profile-logout-button')).toBeVisible();
    await session.page.getByTestId('profile-logout-button').click();
    await session.page.getByTestId('profile-logout-confirm').click();
    await expect(session.page).toHaveURL(/\/login/);
  } finally {
    await session.context.close();
  }
});

test('teacher create controls save journal, homework, and tests and update student UI live', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const teacherToken = await apiLogin(request, 'teacher');
  const groups = await expectApiOk(await apiCall(request, teacherToken, 'get', '/groups'), 'load groups for UI creation');
  const group = groups.find((row: any) => row.name === 'QA Live Finance Group');
  expect(group).toBeTruthy();
  const teacher = await loginUi(browser, 'teacher');
  const student = await loginUi(browser, 'student');
  const suffix = Date.now().toString().slice(-6);
  const homeworkTitle = `UI Homework ${suffix}`;
  const testTitle = `UI Test ${suffix}`;
  const journalTopic = `UI Journal ${suffix}`;
  try {
    await teacher.page.getByRole('tab', { name: 'Homework' }).first().click();
    await student.page.getByRole('tab', { name: 'Homework' }).first().click();
    await teacher.page.getByTestId('homework-add-button').click();
    await expect(teacher.page.getByText('Create Homework', { exact: true }).first()).toBeVisible();
    await teacher.page.getByPlaceholder('Homework title').fill(homeworkTitle);
    await teacher.page.getByPlaceholder('Homework instructions').fill('Created through the real teacher interface');
    await teacher.page.getByTestId('homework-due-date').click();
    await teacher.page.getByTestId(`homework-due-date-option-${localDate(7)}`).click();
    await teacher.page.getByTestId('homework-create-button').click();
    await expect(teacher.page.getByText(homeworkTitle, { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(student.page.getByText(homeworkTitle, { exact: true })).toBeVisible({ timeout: 8_000 });
    const homeworkRows = await expectApiOk(
      await apiCall(request, teacherToken, 'get', `/homework/group/${group.id}`),
      'load UI-created homework',
    );
    const createdHomework = homeworkRows.find((row: any) => row.title === homeworkTitle);
    expect(createdHomework).toBeTruthy();

    await teacher.page.getByRole('tab', { name: 'Tests' }).first().click();
    await student.page.getByRole('tab', { name: 'Tests' }).first().click();
    await teacher.page.getByTestId('tests-add-button').click();
    await expect(teacher.page.getByText('Create Test', { exact: true }).first()).toBeVisible();
    await teacher.page.getByPlaceholder('e.g., Unit 5 Test').fill(testTitle);
    await teacher.page.getByPlaceholder('100').fill('80');
    await teacher.page.getByTestId('tests-create-button').click();
    await expect(teacher.page.getByText(testTitle, { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(student.page.getByText(testTitle, { exact: true })).toBeVisible({ timeout: 8_000 });

    if (REMOTE_LIVE_AUDIT) {
      await teacher.page.getByRole('tab', { name: 'Home' }).first().click();
      await teacher.page.getByText('Journal', { exact: true }).click();
    } else {
      await teacher.page.goto('/journal');
    }
    await expect(teacher.page.getByText('Teacher Journal', { exact: true })).toBeVisible();
    await teacher.page.getByTestId('journal-add-button').click();
    await expect(teacher.page.getByText('New Journal Entry', { exact: true })).toBeVisible();
    await teacher.page.getByTestId('journal-lesson-date').click();
    await teacher.page.getByTestId(`journal-lesson-date-option-${localDate(-1)}`).click();
    await teacher.page.getByTestId('journal-lesson-number').fill(String((Number(suffix) % 9000) + 1));
    await teacher.page.getByPlaceholder('Enter lesson topic').fill(journalTopic);
    await teacher.page.getByPlaceholder('What was taught today').fill('Created through the real journal form');
    await teacher.page.getByPlaceholder('Homework for next class').fill('Review UI QA notes');
    await teacher.page.getByTestId('journal-save-button').click();
    await expect(teacher.page.getByText(journalTopic, { exact: true })).toBeVisible({ timeout: 8_000 });

    const journalRows = await expectApiOk(
      await apiCall(request, teacherToken, 'get', `/journal/group/${group.id}`),
      'load UI-created journal entry',
    );
    expect(journalRows.some((row: any) => row.topic === journalTopic)).toBeTruthy();

    // Exercise the real deletion button and leave the shared fixture isolated
    // for the progress-rate workflow that follows this test.
    await teacher.page.getByRole('tab', { name: 'Homework' }).first().click();
    await teacher.page.getByTestId(`homework-card-${createdHomework.id}`).click();
    const [deleteResponse] = await Promise.all([
      teacher.page.waitForResponse((response) => response.request().method() === 'DELETE'
        && response.url().endsWith(`/api/homework/${createdHomework.id}`)),
      teacher.page.getByTestId('homework-delete-button').click(),
    ]);
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
    await expect(teacher.page.getByText(homeworkTitle, { exact: true })).toHaveCount(0);
    await student.page.getByRole('tab', { name: 'Homework' }).first().click();
    await expect(student.page.getByText(homeworkTitle, { exact: true })).toHaveCount(0, { timeout: 8_000 });
    await assertHealthy(teacher, 'teacher UI creation');
    await assertHealthy(student, 'student live academic UI');
  } finally {
    await teacher.context.close();
    await student.context.close();
  }
});

test('teacher can mark attendance comfortably on a phone and the backend updates immediately', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const teacherToken = await apiLogin(request, 'teacher');
  const groups = await expectApiOk(await apiCall(request, teacherToken, 'get', '/groups'), 'load attendance group');
  const students = await expectApiOk(await apiCall(request, teacherToken, 'get', '/students'), 'load attendance student');
  const group = groups.find((row: any) => row.name === 'QA Live Finance Group');
  const student = students.find((row: any) => row.student_id === 'QA-LIVE-001');
  expect(group).toBeTruthy();
  expect(student).toBeTruthy();
  const session = await loginUi(browser, 'teacher', true);
  try {
    await session.page.getByRole('tab', { name: 'Attendance' }).first().click();
    const present = session.page.getByRole('button', { name: 'Live Student: Present' });
    await expect(present).toBeVisible({ timeout: 8_000 });
    await present.scrollIntoViewIfNeeded();
    const box = await present.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await present.click();
    await expect.poll(async () => {
      const rows = await expectApiOk(
        await apiCall(request, teacherToken, 'get', `/attendance/group/${group.id}?start_date=${localDate()}T00:00:00&end_date=${localDate()}T23:59:59`),
        'poll phone attendance',
      );
      return rows.find((row: any) => row.student_id === student.id)?.status;
    }, { timeout: 8_000 }).toBe('present');
    await assertPhoneGeometry(session.page, 'teacher attendance controls');
    await assertHealthy(session, 'teacher phone attendance');
  } finally {
    await session.context.close();
  }
});

test('academic records propagate live from teacher actions to student and parent views', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const teacherToken = await apiLogin(request, 'teacher');
  const studentToken = await apiLogin(request, 'student');
  const parentToken = await apiLogin(request, 'parent');
  const superToken = await apiLogin(request, 'super_admin');
  const groups = await expectApiOk(await apiCall(request, teacherToken, 'get', '/groups'), 'load teacher groups');
  const students = await expectApiOk(await apiCall(request, teacherToken, 'get', '/students'), 'load teacher students');
  const group = groups.find((row: any) => row.name === 'QA Live Finance Group');
  const student = students.find((row: any) => row.student_id === 'QA-LIVE-001');
  expect(group).toBeTruthy();
  expect(student).toBeTruthy();

  const teacher = await loginUi(browser, 'teacher');
  const studentUi = await loginUi(browser, 'student');
  const parent = await loginUi(browser, 'parent');
  const suffix = Date.now().toString().slice(-6);
  const homeworkTitle = `QA Homework ${suffix}`;
  const testTitle = `QA Mid Test ${suffix}`;
  const journalTopic = `QA Journal ${suffix}`;
  try {
    await studentUi.page.getByRole('tab', { name: 'Homework' }).first().click();
    await parent.page.getByRole('tab', { name: 'Homework' }).first().click();
    const homework = await expectApiOk(await apiCall(request, teacherToken, 'post', '/homework', {
      group_id: group.id,
      title: homeworkTitle,
      description: 'Disposable whole-app synchronization assignment',
      due_date: `${localDate(7)}T12:00:00`,
      attachments: [],
    }), 'create homework');
    await expect(studentUi.page.getByText(homeworkTitle, { exact: true })).toBeVisible({ timeout: 7_000 });
    await expect(parent.page.getByText(homeworkTitle, { exact: true })).toBeVisible({ timeout: 7_000 });

    const disabledSubmission = await apiCall(request, studentToken, 'post', '/homework/submit', {
      homework_id: homework.id,
      content: 'Completed in the disposable QA database',
      attachments: [],
    });
    expect(disabledSubmission.status(), 'disabled homework submission must be enforced').toBe(403);
    await expectApiOk(await apiCall(request, superToken, 'put', '/admin/feature-flags', {
      homework_submission: true,
    }), 'enable homework submissions');
    await expectApiOk(await apiCall(request, studentToken, 'post', '/homework/submit', {
      homework_id: homework.id,
      content: 'Completed in the disposable QA database',
      attachments: [],
    }), 'submit homework after enabling feature');
    await expectApiOk(await apiCall(request, teacherToken, 'post', '/homework/grade', {
      homework_id: homework.id,
      student_id: student.id,
      grade: 91,
      feedback: 'Strong QA submission',
    }), 'grade homework');

    await studentUi.page.getByRole('tab', { name: 'Tests' }).first().click();
    await parent.page.getByRole('tab', { name: 'Tests' }).first().click();
    const createdTest = await expectApiOk(await apiCall(request, teacherToken, 'post', '/tests', {
      test_type: 'mid_test',
      group_id: group.id,
      course_id: group.course_id,
      title: testTitle,
      test_date: `${localDate(1)}T12:00:00`,
      max_score: 100,
    }), 'create test');
    await expect(studentUi.page.getByText(testTitle, { exact: true })).toBeVisible({ timeout: 7_000 });
    await expect(parent.page.getByText(testTitle, { exact: true })).toBeVisible({ timeout: 7_000 });
    await expectApiOk(await apiCall(request, teacherToken, 'post', '/tests/grade', {
      test_id: createdTest.id,
      student_id: student.id,
      score: 88,
      notes: 'Whole-app QA score',
    }), 'grade test');

    if (REMOTE_LIVE_AUDIT) {
      await teacher.page.getByRole('tab', { name: 'Home' }).first().click();
      await teacher.page.getByText('Journal', { exact: true }).click();
    } else {
      await teacher.page.goto('/journal');
    }
    await expect(teacher.page.getByText('Teacher Journal', { exact: true })).toBeVisible();
    await expectApiOk(await apiCall(request, teacherToken, 'post', '/journal', {
      group_id: group.id,
      lesson_date: `${localDate()}T12:00:00`,
      lesson_number: (Number(suffix) % 9000) + 1,
      topic: journalTopic,
      materials_covered: 'Whole-app deterministic QA material',
      homework_assigned: 'Review the tested workflow',
      student_performance: [{ student_id: student.id, participation: 5, notes: 'Verified' }],
    }), 'create journal entry');
    await expect(teacher.page.getByText(journalTopic, { exact: true })).toBeVisible({ timeout: 7_000 });

    if (REMOTE_LIVE_AUDIT) {
      await studentUi.page.getByRole('tab', { name: 'Home' }).first().click();
      await studentUi.page.getByText('Attendance', { exact: true }).last().click();
    } else {
      await studentUi.page.goto('/attendance');
    }
    await expect(studentUi.page.getByText('Attendance', { exact: true }).first()).toBeVisible();
    await expectApiOk(await apiCall(request, teacherToken, 'post', '/attendance', {
      student_id: student.id,
      group_id: group.id,
      date: `${localDate()}T12:00:00`,
      status: 'absent',
      notes: 'Disposable synchronization check',
    }), 'mark attendance');
    await expect(studentUi.page.getByText('absent', { exact: true })).toBeVisible({ timeout: 7_000 });

    const progress = await expectApiOk(
      await apiCall(request, studentToken, 'get', `/tests/progress/${student.id}`),
      'load combined progress',
    );
    expect(progress.tests.mid_test_average).toBe(88);
    expect(progress.homework.completion_rate).toBe(100);
    expect(progress.lesson_grades.some((row: any) => row.topic === journalTopic && row.grade === 5)).toBeTruthy();

    const studentNotifications = await expectApiOk(
      await apiCall(request, studentToken, 'get', '/notifications?limit=100'),
      'load student notifications',
    );
    const parentNotifications = await expectApiOk(
      await apiCall(request, parentToken, 'get', '/notifications?limit=100'),
      'load parent notifications',
    );
    expect(studentNotifications.some((row: any) => `${row.title} ${row.message}`.includes(testTitle))).toBeTruthy();
    expect(parentNotifications.some((row: any) => `${row.title} ${row.message}`.includes(testTitle))).toBeTruthy();
    await assertHealthy(teacher, 'teacher academic observer');
    await assertHealthy(studentUi, 'student academic observer');
    await assertHealthy(parent, 'parent academic observer');
  } finally {
    await teacher.context.close();
    await studentUi.context.close();
    await parent.context.close();
  }
});

test('issued certificates propagate live to student and parent and download as authorized PDFs', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const superToken = await apiLogin(request, 'super_admin');
  const studentToken = await apiLogin(request, 'student');
  const parentToken = await apiLogin(request, 'parent');
  const receptionToken = await apiLogin(request, 'reception');
  const students = await expectApiOk(
    await apiCall(request, superToken, 'get', '/students'),
    'load certificate students',
  );
  const student = students.find((row: any) => row.student_id === 'QA-LIVE-001');
  expect(student, 'certificate fixture student is missing').toBeTruthy();
  expect(student.course_ids?.length, 'certificate fixture course is missing').toBeGreaterThan(0);

  const admin = await loginUi(browser, 'super_admin');
  const studentSession = await loginUi(browser, 'student');
  const parentSession = await loginUi(browser, 'parent');
  try {
    await admin.page.getByText('Certificates', { exact: true }).last().click();
    await studentSession.page.getByText('Certificates', { exact: true }).last().click();
    await parentSession.page.getByText('Certificates', { exact: true }).last().click();

    await admin.page.getByTestId('certificate-add-button').click();
    await admin.page.getByTestId('certificate-student-picker').selectOption(student.id);
    await admin.page.getByTestId('certificate-course-picker').selectOption(student.course_ids[0]);
    const [createResponse] = await Promise.all([
      admin.page.waitForResponse((response) => response.url().endsWith('/api/certificates') && response.request().method() === 'POST'),
      admin.page.getByTestId('certificate-issue-button').click(),
    ]);
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const certificate = await createResponse.json();

    for (const [label, session] of [
      ['admin', admin],
      ['student', studentSession],
      ['parent', parentSession],
    ] as const) {
      await expect(session.page.getByTestId(`certificate-card-${certificate.id}`), `${label} did not receive the certificate`).toBeVisible({ timeout: 8_000 });
      await expect(session.page.getByText(certificate.certificate_id, { exact: true })).toBeVisible();
      await assertHealthy(session, `${label} certificate propagation`);
    }

    for (const [role, token] of [['student', studentToken], ['parent', parentToken]] as const) {
      const download = await apiCall(request, token, 'get', `/certificates/download/${certificate.id}`);
      expect(download.ok(), `${role} cannot download own certificate: ${await download.text()}`).toBeTruthy();
      expect(download.headers()['content-type']).toContain('application/pdf');
      expect((await download.body()).subarray(0, 4).toString()).toBe('%PDF');
    }
    const forbidden = await apiCall(request, receptionToken, 'get', `/certificates/download/${certificate.id}`);
    expect(forbidden.status(), 'reception unexpectedly downloaded an academic certificate').toBe(403);
  } finally {
    await admin.context.close();
    await studentSession.context.close();
    await parentSession.context.close();
  }
});

test('backup and export controls create real downloadable, integrity-checked files', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const superToken = await apiLogin(request, 'super_admin');
  const managerToken = await apiLogin(request, 'manager');
  const session = await loginUi(browser, 'super_admin');
  try {
    await session.page.getByText('Backups', { exact: true }).last().click();
    const [createResponse, browserDownload] = await Promise.all([
      session.page.waitForResponse((response) => response.url().endsWith('/api/admin/backups') && response.request().method() === 'POST'),
      session.page.waitForEvent('download'),
      session.page.getByTestId('backup-create-button').click(),
    ]);
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const backup = await createResponse.json();
    expect(backup.downloadable).toBe(true);
    expect(browserDownload.suggestedFilename()).toMatch(/^nuriks-academy-backup-.*\.json\.gz$/);
    await expect(session.page.getByTestId(`backup-history-${backup.id}`)).toBeVisible({ timeout: 8_000 });

    const backupFile = await apiCall(request, superToken, 'get', `/admin/backups/${backup.id}/download`);
    expect(backupFile.ok(), await backupFile.text()).toBeTruthy();
    const compressed = await backupFile.body();
    expect(Array.from(compressed.subarray(0, 2))).toEqual([0x1f, 0x8b]);
    expect(createHash('sha256').update(compressed).digest('hex')).toBe(backup.sha256);
    const snapshot = JSON.parse(gunzipSync(compressed).toString('utf-8'));
    expect(snapshot.format).toBe('nuriks-academy-backup');
    expect(snapshot.version).toBe(1);
    expect(snapshot.collections.students.length).toBeGreaterThan(0);
    expect(snapshot.collections.users.length).toBeGreaterThan(0);

    const [csvResponse, csvDownload] = await Promise.all([
      session.page.waitForResponse((response) => response.url().includes('/api/admin/export/csv?collection=students')),
      session.page.waitForEvent('download'),
      session.page.getByTestId('backup-export-students-csv').click(),
    ]);
    expect(csvResponse.ok(), await csvResponse.text()).toBeTruthy();
    expect(csvResponse.headers()['content-type']).toContain('text/csv');
    expect(csvDownload.suggestedFilename()).toMatch(/^students-.*\.csv$/);
    expect((await csvResponse.body()).toString('utf-8')).toContain('student_id');

    const [pdfResponse, pdfDownload] = await Promise.all([
      session.page.waitForResponse((response) => response.url().includes('/api/admin/export/pdf?collection=payments')),
      session.page.waitForEvent('download'),
      session.page.getByTestId('backup-export-payments-pdf').click(),
    ]);
    expect(pdfResponse.ok(), await pdfResponse.text()).toBeTruthy();
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
    expect(pdfDownload.suggestedFilename()).toMatch(/^payments-.*\.pdf$/);
    expect((await pdfResponse.body()).subarray(0, 4).toString()).toBe('%PDF');

    for (const [label, response] of [
      ['backup history', await apiCall(request, managerToken, 'get', '/admin/backups')],
      ['backup snapshot', await apiCall(request, managerToken, 'get', `/admin/backups/${backup.id}/download`)],
      ['student export', await apiCall(request, managerToken, 'get', '/admin/export/csv?collection=students')],
    ] as const) {
      expect(response.status(), `manager unexpectedly accessed ${label}`).toBe(403);
    }
    await assertHealthy(session, 'backup and exports');
  } finally {
    await session.context.close();
  }
});

test('support booking can be received, accepted, and reflected live', async ({ browser, request }) => {
  test.setTimeout(75_000);
  const studentToken = await apiLogin(request, 'student');
  const supportToken = await apiLogin(request, 'support');
  const supportRows = await expectApiOk(await apiCall(request, studentToken, 'get', '/support'), 'load support staff');
  const supportProfile = supportRows.find((row: any) => row.first_name === 'Live');
  expect(supportProfile).toBeTruthy();
  const student = await loginUi(browser, 'student');
  const support = await loginUi(browser, 'support');
  const topic = `QA booking ${Date.now().toString().slice(-6)}`;
  try {
    await support.page.getByText('Pending', { exact: true }).last().click();
    const booking = await expectApiOk(await apiCall(request, studentToken, 'post', '/support-bookings', {
      support_staff_id: supportProfile.id,
      booking_date: localDate(),
      start_time: '16:00',
      duration_minutes: 40,
      topic,
      notes: 'Disposable live booking check',
    }), 'create support booking');
    await expect(support.page.getByText(topic, { exact: true })).toBeVisible({ timeout: 6_000 });
    await expect(student.page.getByText('Upcoming Support Sessions', { exact: true })).toBeVisible({ timeout: 6_000 });
    await support.page.getByText('Accept', { exact: true }).click();
    await expect.poll(async () => {
      const rows = await expectApiOk(await apiCall(request, supportToken, 'get', '/support-bookings'), 'poll support bookings');
      return rows.find((row: any) => row.id === booking.id)?.status;
    }, { timeout: 7_000 }).toBe('confirmed');
    await expect(student.page.getByText('confirmed', { exact: true })).toBeVisible({ timeout: 6_000 });
    await assertHealthy(student, 'student booking observer');
    await assertHealthy(support, 'support booking actor');
  } finally {
    await student.context.close();
    await support.context.close();
  }
});

test('news and feature-flag mutations synchronize between active admin sessions', async ({ browser }) => {
  test.setTimeout(75_000);
  const actor = await loginUi(browser, 'super_admin');
  const observer = await loginUi(browser, 'super_admin');
  const title = `QA Announcement ${Date.now().toString().slice(-6)}`;
  try {
    for (const session of [actor, observer]) {
      await session.page.getByRole('tab', { name: 'Home' }).first().click();
      await session.page.getByText('News', { exact: true }).last().click();
    }
    await actor.page.getByTestId('news-add-button').click();
    await actor.page.getByPlaceholder('Enter news title').fill(title);
    await actor.page.getByPlaceholder('Enter news content').fill('Whole-app live synchronization announcement');
    await actor.page.getByText('Create News', { exact: true }).last().click();
    await expect(actor.page.getByText(title, { exact: true })).toBeVisible();
    await expect(observer.page.getByText(title, { exact: true })).toBeVisible({ timeout: 6_000 });

    for (const session of [actor, observer]) {
      await session.page.getByRole('tab', { name: 'Home' }).first().click();
      await session.page.getByText('Feature Flags', { exact: true }).last().click();
    }
    const actorSwitch = actor.page.getByTestId('feature-flag-chat_system');
    const observerSwitch = observer.page.getByTestId('feature-flag-chat_system');
    const actorCheckbox = actorSwitch.locator('input[type="checkbox"]');
    const observerCheckbox = observerSwitch.locator('input[type="checkbox"]');
    await expect(actorCheckbox).not.toBeChecked();
    await actorCheckbox.click();
    await expect(actorCheckbox).toBeChecked();
    await expect(observerCheckbox).toBeChecked({ timeout: 6_000 });
    await assertHealthy(actor, 'admin live actor');
    await assertHealthy(observer, 'admin live observer');
  } finally {
    await actor.context.close();
    await observer.context.close();
  }
});
