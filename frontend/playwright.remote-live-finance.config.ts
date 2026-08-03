import { defineConfig, devices } from '@playwright/test';

if (process.env.REMOTE_LIVE_AUDIT_ACK !== 'nurik_academy_qa') {
  throw new Error('Remote live audit requires exact acknowledgement of nurik_academy_qa');
}

export default defineConfig({
  testDir: './e2e/finance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '../test_reports/remote-live-finance-playwright', open: 'never' }],
  ],
  use: {
    baseURL: 'https://nuriks-academy-web.onrender.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
