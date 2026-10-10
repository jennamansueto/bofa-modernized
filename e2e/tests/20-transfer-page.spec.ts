import { test, expect, summaryCell, openScheduleOptions } from '../fixtures/test';
import { ACCTS, xfr } from '../fixtures/api';

const CHECKING = 'Advantage Plus Banking - Checking ...1001';
const SAVINGS = 'Advantage Savings ...1002';
const CHASE = 'JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432';

test.describe('Transfer page defaults & content', () => {
  test('AC-11: Transfer Money page initial state', async ({ loggedInPage: page }) => {
    await expect(page.getByLabel('From', { exact: true })).toHaveValue(ACCTS.checking);
    await expect(page.getByLabel('To', { exact: true })).toHaveValue(ACCTS.savings);
    await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('500');
    await expect(page.getByLabel('Relationship tier')).toHaveValue('10');
    await expect(page.getByLabel('Relationship tier').locator('option:checked')).toHaveText('Preferred Rewards Gold');
    await expect(page.getByLabel('Delivery', { exact: true })).toBeHidden(); // neither account is external
    await expect(page.getByLabel('Frequency')).toHaveValue('O');
    await expect(page.getByLabel('Frequency').locator('option:checked')).toHaveText('One time');
    await expect(page.getByLabel('Send on (MM/DD/YYYY)')).toHaveValue('');
    await expect(page.getByLabel('Memo (optional)')).toHaveValue('');

    // From/To list ALL active accounts, including the external one.
    await expect(page.getByLabel('From', { exact: true }).locator('option')).toHaveText([CHECKING, SAVINGS, CHASE]);
    await expect(page.getByLabel('To', { exact: true }).locator('option')).toHaveText([CHECKING, SAVINGS, CHASE]);

    // Balance cards: non-external accounts only, no "Available" line while available == current.
    const cards = page.locator('.acct');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(CHECKING);
    await expect(cards.nth(0)).toContainText(ACCTS.checking);
    await expect(cards.nth(0).locator('.acct-bal')).toHaveText(/\$4,215\.38$/);
    await expect(cards.nth(1)).toContainText(SAVINGS);
    await expect(cards.nth(1).locator('.acct-bal')).toHaveText(/\$12,940\.00$/);
    await expect(page.locator('.acct-avl')).toHaveCount(0);

    // Transfer Summary is pre-priced for the default $500 internal transfer.
    await expect(summaryCell(page, 'From')).toHaveText(CHECKING);
    await expect(summaryCell(page, 'To')).toHaveText(SAVINGS);
    await expect(summaryCell(page, 'Amount')).toHaveText('$500.00');
    await expect(summaryCell(page, 'Fee')).toHaveText('No fee');
    await expect(summaryCell(page, 'Transfer type')).toHaveText('Between your Bank of America accounts');
    await expect(summaryCell(page, 'Relationship tier')).toHaveText('Preferred Rewards Gold');
    await expect(summaryCell(page, 'Delivery date')).toHaveText('Fri, Oct 9, 2026');
    await expect(summaryCell(page, 'Total debit')).toHaveText('$500.00');
  });

  test('AC-12: Recent activity list', async ({ loggedInPage: page, api }) => {
    const rows = page.locator('table.activity tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).getByRole('cell')).toHaveText([
      '10/06/2026', 'XFR261006-000091', CHECKING, CHASE, /Scheduled[\s\S]*10\/09$/, '$500.00',
    ]);
    await expect(rows.nth(1).getByRole('cell')).toHaveText(['10/01/2026', 'XFR261001-000203', SAVINGS, CHECKING, 'Posted', '$1,200.00']);
    await expect(rows.nth(2).getByRole('cell')).toHaveText(['09/28/2026', 'XFR260928-000014', CHECKING, SAVINGS, 'Posted', '$250.00']);

    // Add 8 more transfers (newest last) — the list caps at 10, newest first; a fee shows as a second line.
    for (let i = 1; i <= 7; i++) await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, String(i), { tierCode: '10' }));
    const withFee = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '200', { tierCode: '00', delivery: 'EXN' }));
    await page.reload();
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(0).getByRole('cell').nth(1)).toHaveText(withFee.confirmationNumber);
    await expect(rows.nth(0).getByRole('cell').nth(4)).toHaveText(/Scheduled[\s\S]*10\/13$/);
    await expect(rows.nth(0).getByRole('cell').nth(5)).toContainText('$200.00');
    await expect(rows.nth(0).locator('.fee-note')).toHaveText('+ $3.00 fee');
    await expect(rows.nth(1).getByRole('cell').nth(1)).toHaveText('XFR261009-000007');
    await expect(page.getByText('XFR260928-000014')).toHaveCount(0); // the oldest seeded row fell off the 10-row list
    await expect(page.getByText('XFR261001-000203')).toBeVisible();
  });

  test('AC-13: Form state persists across requests (session-scoped form)', async ({ loggedInPage: page }) => {
    const from = page.getByLabel('From', { exact: true });
    const to = page.getByLabel('To', { exact: true });
    const tier = page.getByLabel('Relationship tier');
    const delivery = page.getByLabel('Delivery', { exact: true });
    const frequency = page.getByLabel('Frequency');
    const amount = page.getByLabel('Amount', { exact: true });
    const memo = page.getByLabel('Memo (optional)');
    const sendOn = page.getByLabel('Send on (MM/DD/YYYY)');

    await openScheduleOptions(page);
    await from.selectOption(ACCTS.savings);
    await to.selectOption(ACCTS.chase);
    await tier.selectOption('00');
    await delivery.selectOption('EXN');
    await frequency.selectOption('W');
    await amount.fill('75');

    // Navigate away (a seeded confirmation page) and back: selections are retained.
    await page.goto('/transfers/confirmation/XFR260928-000014');
    await expect(page.getByRole('heading', { name: 'Your transfer has been submitted' })).toBeVisible();
    await page.getByRole('link', { name: 'Make another transfer' }).click();
    await expect(page).toHaveURL(/\/transfers$/);
    await openScheduleOptions(page);
    await expect(from).toHaveValue(ACCTS.savings);
    await expect(to).toHaveValue(ACCTS.chase);
    await expect(tier).toHaveValue('00');
    await expect(delivery).toHaveValue('EXN');
    await expect(frequency).toHaveValue('W');
    await expect(amount).toHaveValue('75');

    // Failed submit: every entered value is retained.
    await memo.fill('keep me');
    await sendOn.fill('10/08/2026');
    await page.getByRole('button', { name: 'Transfer now' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText('The transfer date cannot be in the past.');
    await expect(page).toHaveURL(/\/transfers$/);
    await expect(from).toHaveValue(ACCTS.savings);
    await expect(to).toHaveValue(ACCTS.chase);
    await expect(tier).toHaveValue('00');
    await expect(delivery).toHaveValue('EXN');
    await expect(frequency).toHaveValue('W');
    await expect(amount).toHaveValue('75');
    await expect(memo).toHaveValue('keep me');
    await expect(sendOn).toHaveValue('10/08/2026');

    // Successful submit: amount, memo and date are cleared; From, To, tier, delivery, frequency are retained.
    await sendOn.fill('');
    await page.getByRole('button', { name: 'Transfer now' }).click();
    await expect(page).toHaveURL(/\/transfers\/confirmation\/XFR261009-000001$/);
    await page.getByRole('link', { name: 'Make another transfer' }).click();
    await openScheduleOptions(page);
    await expect(from).toHaveValue(ACCTS.savings);
    await expect(to).toHaveValue(ACCTS.chase);
    await expect(tier).toHaveValue('00');
    await expect(delivery).toHaveValue('EXN');
    await expect(frequency).toHaveValue('W');
    await expect(amount).toHaveValue('');
    await expect(memo).toHaveValue('');
    await expect(sendOn).toHaveValue('');
  });
});
