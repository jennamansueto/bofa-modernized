import { test as base, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { OlbApi, USERS, resetClock, resetDatabase } from './api';

type Fixtures = {
  /** Auto fixture: every test starts from the exact V2 seed with the clock pinned to Fri 2026-10-09 12:00 ET. */
  seed: void;
  /** API client sharing the browser context's cookie jar (so UI login == API login). Not logged in by default. */
  api: OlbApi;
  /** Second, cookie-isolated API context for cross-session / cross-customer checks. */
  api2: OlbApi;
  /** demo.user signed in through the real sign-in page, landed on /transfers. */
  loggedInPage: Page;
};

export const test = base.extend<Fixtures>({
  seed: [
    async ({}, use) => {
      const ctx = await pwRequest.newContext();
      await resetClock(ctx);
      await resetDatabase(ctx);
      await ctx.dispose();
      await use();
    },
    { auto: true },
  ],
  api: async ({ context }, use) => {
    await use(new OlbApi(context.request));
  },
  api2: async ({}, use) => {
    const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: API_URL });
    await use(new OlbApi(ctx));
    await ctx.dispose();
  },
  loggedInPage: async ({ page }, use) => {
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    await use(page);
  },
});

export async function loginViaUi(page: Page, userId: string, password: string) {
  await page.goto('/');
  await page.getByLabel('User ID', { exact: true }).fill(userId);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/transfers$/);
  await expect(page.getByRole('heading', { name: 'Make a transfer' })).toBeVisible();
}

/** Submit the sign-in form, wait for the server's answer, and assert the error box shows `expected`. */
export async function expectLoginError(page: Page, userId: string, password: string, expected: string) {
  await page.getByLabel('User ID', { exact: true }).fill(userId);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const blankClientSide = userId.trim() === '' || password.trim() === '';
  const response = blankClientSide ? Promise.resolve() : page.waitForResponse((r) => r.url().endsWith('/api/login'));
  await page.getByRole('button', { name: 'Log in' }).click();
  await response;
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(expected);
  await expect(page).toHaveURL(/\/(\?.*)?$/);
}

/** The Transfer Summary value cell for a row label ("From", "Fee", "Total debit", ...). */
export const summaryCell = (page: Page, label: string) =>
  page.getByTestId('transfer-summary').getByRole('row', { name: new RegExp(`^${label}\\b`) }).getByRole('cell');

/** Expand the collapsed "Schedule options" disclosure (Send on / Frequency / Memo live inside it). */
export async function openScheduleOptions(page: Page) {
  const toggle = page.getByRole('button', { name: 'Schedule options' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByLabel('Memo (optional)')).toBeVisible();
}

export { expect };
