import { test, expect, loginViaUi, expectLoginError, summaryCell } from '../fixtures/test';
import { ACCTS, USERS } from '../fixtures/api';
import type { Page } from '@playwright/test';

/**
 * Headline demo flows, driven entirely through the browser. Titles carry the AC they illustrate so the report
 * still reads like doc 01; these are the scripts to run with `npm run test:demo` for a recording.
 */
const confRow = (page: Page, label: string) =>
  page.locator('section.confirm').getByRole('row', { name: new RegExp(`^${label}\\b`) }).getByRole('cell');

test.describe('Headline demo flows', () => {
  test('AC-31: Internal same-day transfer posts immediately', async ({ page }) => {
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    await expect(page.locator('.acct .acct-bal')).toHaveText([/\$4,215\.38$/, /\$12,940\.00$/]);

    await page.getByLabel('Amount', { exact: true }).fill('1,250.00');
    await expect(summaryCell(page, 'Amount')).toHaveText('$1,250.00');
    await expect(summaryCell(page, 'Fee')).toHaveText('No fee');
    await page.getByRole('button', { name: 'Transfer now' }).click();

    await expect(page).toHaveURL(/\/transfers\/confirmation\/XFR261009-000001$/);
    await expect(page.getByText('Confirmation number: XFR261009-000001')).toBeVisible();
    await expect(confRow(page, 'Amount')).toHaveText('$1,250.00');
    await expect(confRow(page, 'Status')).toHaveText('Posted');
    await expect(confRow(page, 'Posted')).toHaveText('Friday, October 9, 2026');
    await expect(page.locator('.acct .acct-bal')).toHaveText([/\$2,965\.38$/, /\$14,190\.00$/]);

    await page.getByRole('link', { name: 'Make another transfer' }).click();
    await expect(page.locator('table.activity tbody tr').first()).toContainText('XFR261009-000001');
  });

  test('AC-33: External transfer delivery dates: EXS +3 / EXN +1 business days', async ({ page }) => {
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.chase);
    await page.getByLabel('Relationship tier').selectOption('00');
    await page.getByLabel('Delivery', { exact: true }).selectOption('EXN');
    await page.getByLabel('Amount', { exact: true }).fill('1,250.00');

    // Standard tier, next business day: $3.00 fee, skips Sat/Sun and Columbus Day (Mon 10/12).
    await expect(summaryCell(page, 'Fee')).toHaveText('$3.00');
    await expect(summaryCell(page, 'Total debit')).toHaveText('$1,253.00');
    await expect(summaryCell(page, 'Delivery date')).toHaveText('Tue, Oct 13, 2026');

    await page.getByRole('button', { name: 'Transfer now' }).click();
    await expect(page).toHaveURL(/\/transfers\/confirmation\/XFR261009-000001$/);
    await expect(confRow(page, 'Fee')).toHaveText('$3.00');
    await expect(confRow(page, 'Transfer type')).toHaveText('Next business day');
    await expect(confRow(page, 'Status')).toHaveText('Scheduled');
    await expect(confRow(page, 'Delivery date')).toHaveText('Tuesday, October 13, 2026');
    await expect(confRow(page, 'Total debit')).toHaveText('$1,253.00');
    // Hold on the From account: current unchanged, available reduced by $1,253.00.
    const checking = page.locator('.acct').filter({ hasText: 'ACCT-1001' });
    await expect(checking.locator('.acct-bal')).toHaveText(/\$4,215\.38$/);
    await expect(checking.locator('.acct-avl')).toHaveText('Available $2,962.38');
  });

  test('AC-17: From and To must differ', async ({ page }) => {
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.checking);
    await expect(page.getByTestId('quote-error')).toHaveText('The From and To accounts must be different.');
    await page.getByRole('button', { name: 'Transfer now' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText('The From and To accounts must be different.');
    await expect(page).toHaveURL(/\/transfers$/);
  });

  test('AC-04: Third consecutive failure locks the ID immediately and permanently (3-strike lockout)', async ({ page }) => {
    await page.goto('/');
    await expectLoginError(page, USERS.sam.userId, 'wrong-1', 'The User ID or Password you entered does not match our records. Please try again.');
    await expectLoginError(page, USERS.sam.userId, 'wrong-2', 'The User ID or Password you entered does not match our records. Please try again.');
    await expectLoginError(page, USERS.sam.userId, 'wrong-3', 'Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000.');
    // Even the correct password is now refused.
    await expectLoginError(page, USERS.sam.userId, USERS.sam.password, 'Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000.');
  });
});
