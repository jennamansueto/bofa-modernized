import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the REAL stack from `docker compose up` (nginx :3000 → React build + /api proxy → Spring Boot → Postgres 16).
 * The suite shares one database and one application clock, so it is strictly serial (workers: 1).
 */
export const UI_URL = process.env.E2E_UI_URL ?? 'http://localhost:3000';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  globalSetup: './fixtures/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
    ['json', { outputFile: 'report/results.json' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: UI_URL,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-headed',
      use: { ...devices['Desktop Chrome'], video: 'on', launchOptions: { slowMo: 150 } },
    },
  ],
});
