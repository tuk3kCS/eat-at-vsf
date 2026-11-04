import { defineConfig, devices } from '@playwright/test';

const database = process.env.TEST_DATABASE_URL;
if (!database) throw new Error('Set TEST_DATABASE_URL to a migrated disposable database.');
const origin = 'http://127.0.0.1:5175';
const api = 'http://127.0.0.1:3005';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 720 } } },
  ],
  webServer: [
    { command: 'npm run start', url: api + '/health', env: { DATABASE_URL: database, PORT: '3005', APP_ORIGIN: origin, NODE_ENV: 'test' }, timeout: 30_000 },
    { command: 'npm exec -w @vsf/web -- vite preview --host 127.0.0.1 --port 5175 --strictPort', url: origin,
      env: { API_PROXY_URL: api }, timeout: 30_000 },
  ],
});
