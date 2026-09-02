import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const databaseName = process.env.DB_NAME || '';
if (process.env.RUN_APP_E2E === '1' && !/(?:^|[_-])(test|qa|sandbox|shadow)(?:[_-]|$)/i.test(databaseName)) {
  throw new Error('Whole-app E2E refuses to run without a disposable DB_NAME');
}

const repositoryRoot = path.resolve(__dirname, '..');
const pythonExecutable = process.env.FINANCE_QA_PYTHON || '../.venv/bin/python';

export default defineConfig({
  testDir: './e2e/app',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 7_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: '../test_reports/app-playwright', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:8082',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'app-api',
      cwd: path.join(repositoryRoot, 'backend'),
      command: `${pythonExecutable} -m uvicorn server:app --host 127.0.0.1 --port 8002`,
      url: 'http://127.0.0.1:8002/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: 'app_qa',
        DISABLE_SCHEDULER: '1',
        PYTHONPATH: path.join(repositoryRoot, 'backend'),
      },
    },
    {
      name: 'app-web',
      cwd: path.join(repositoryRoot, 'frontend'),
      command: 'npx expo start --web --port 8082 --clear',
      url: 'http://127.0.0.1:8082/login',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        EXPO_PUBLIC_BACKEND_URL: 'http://127.0.0.1:8002',
        CI: '1',
      },
    },
  ],
});
