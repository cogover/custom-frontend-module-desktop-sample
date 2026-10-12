import { defineConfig, devices } from '@playwright/test';

/**
 * Bộ test:
 *  - local:     app build sẵn qua `vite preview` của ../app, mock API bằng route.
 */

// runId dùng chung mọi worker: đặt một lần ở tiến trình chính, worker kế thừa qua env.
if (!process.env.E2E_RUN_ID) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  process.env.E2E_RUN_ID = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

// localhost (không ép 127.0.0.1): vite preview mặc định bind localhost (::1 trên macOS) → dùng lại được server đang chạy.
const LOCAL_URL = (process.env.E2E_LOCAL_URL ?? 'http://localhost:4317').replace(/\/$/, '');
const LOCAL_PORT = new URL(LOCAL_URL).port || '4317';
const PREVIEW_CMD =
  process.env.E2E_PREVIEW_CMD ??
  // script preview của app đã có --port 4317 --strictPort.
  (LOCAL_PORT === '4317' ? 'npm --prefix ../app run preview' : `npm --prefix ../app run preview -- --port ${LOCAL_PORT} --strictPort`);

// Chỉ khởi động vite preview khi có chạy bộ local.
const argv = process.argv.join(' ');
const projectArgs = [...argv.matchAll(/--project[= ]([\w-]+)/g)].map((m) => m[1]);
const runsLocal = projectArgs.length === 0 || projectArgs.includes('local');
const startWebServer = runsLocal && !process.env.E2E_NO_WEBSERVER && !process.argv.includes('--list');

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    // trace + screenshot chỉ khi fail; không video
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
  },
  webServer: startWebServer
    ? {
        command: PREVIEW_CMD,
        url: LOCAL_URL + '/',
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
  projects: [
    {
      name: 'local',
      testDir: './tests/local',
      fullyParallel: true,
      use: { ...devices['Desktop Chrome'], baseURL: LOCAL_URL, viewport: { width: 1440, height: 900 } },
    },
  ],
});
