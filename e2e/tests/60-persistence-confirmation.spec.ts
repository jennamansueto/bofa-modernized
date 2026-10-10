import { test, expect, loginViaUi, summaryCell, openScheduleOptions } from '../fixtures/test';
import { ACCTS, USERS, xfr, setClockEastern, resetClock } from '../fixtures/api';
import type { Page } from '@playwright/test';

const confRow = (page: Page, label: string) =>
  page.locator('section.confirm').getByRole('row', { name: new RegExp(`^${label}\\b`) }).getByRole('cell');

test.describe('Persistence & confirmation', () => {
  test('AC-37: Confirmation number `XFRyyMMdd-nnnnnn` with a daily sequence', async ({ api, request }) => {
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
    const first = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10'));
    expect(first.confirmationNumber).toBe('XFR261009-000001');
    expect(first.confirmationNumber).toHaveLength(16);
    const second = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10'));
    expect(second.confirmationNumber).toBe('XFR261009-000002');
    // Rejected submits do not consume a number (sequence is taken after validation).
    expect((await api.submit(xfr(ACCTS.checking, ACCTS.checking, '10'))).status()).toBe(422);
    expect((await api.submit(xfr(ACCTS.checking, ACCTS.savings, '0'))).status()).toBe(422);
    const third = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10'));
    expect(third.confirmationNumber).toBe('XFR261009-000003');
    // A future-dated transfer created today still gets today's prefix.
    const future = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10', { scheduledDate: '10/20/2026' }));
    expect(future.confirmationNumber).toBe('XFR261009-000004');
    // The prefix is the EASTERN date: 11:30 PM ET on 10/09 is already 10/10 in UTC, but still XFR261009.
    await setClockEastern(request, '2026-10-09T23:30');
    expect((await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10'))).confirmationNumber).toBe('XFR261009-000005');
    // Next Eastern day: the sequence restarts at 000001.
    await setClockEastern(request, '2026-10-10T00:30');
    expect((await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10'))).confirmationNumber).toBe('XFR261010-000001');
    await resetClock(request);
    // The seeded history rows did not seed the sequence (first of 10/09 was 000001 even though XFR261006-000091 exists).
    const history = (await (await api.history()).json()) as any[];
    expect(history.map((t) => t.confirmationNumber)).toContain('XFR261006-000091');
  });

  test('AC-38: Stored transfer row and memo handling', async ({ api, page }) => {
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
    const withMemo = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '200', { tierCode: '00', delivery: 'EXN', frequency: 'W', memo: '  Test memo  ' }));
    const stored = await (await api.byConfirmation(withMemo.confirmationNumber)).json();
    expect(stored).toMatchObject({
      confirmationNumber: withMemo.confirmationNumber,
      fromAccountId: ACCTS.checking,
      toAccountId: ACCTS.chase,
      amountCents: 20000,
      feeCents: 300,
      typeCode: 'EXN',
      tierCode: '00', // the SUBMITTED tier, not the customer's stored Gold tier
      frequencyCode: 'W',
      scheduledDate: '2026-10-09',
      postDate: '2026-10-13', // delivery date
      statusCode: 'S',
      memo: 'Test memo', // trimmed
    });
    expect(new Date(stored.createdTs).toISOString()).toBe('2026-10-09T16:00:00.000Z'); // CRT_TS = now (pinned clock)
    // Blank memo is stored as NULL.
    const blank = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10', { memo: '   ' }));
    expect((await (await api.byConfirmation(blank.confirmationNumber)).json()).memo ?? null).toBeNull();
    // Exactly one row per submit, visible in history.
    const history = (await (await api.history()).json()) as any[];
    expect(history.filter((t) => t.confirmationNumber === withMemo.confirmationNumber)).toHaveLength(1);
    expect(history).toHaveLength(5);

    // Confirmation page shows a Memo row only when a memo was saved, HTML-escaped.
    const escaped = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '10', { memo: '<b>Rent</b> & food' }));
    await page.goto(`/transfers/confirmation/${withMemo.confirmationNumber}`);
    await expect(confRow(page, 'Memo')).toHaveText('Test memo');
    await page.goto(`/transfers/confirmation/${escaped.confirmationNumber}`);
    await expect(confRow(page, 'Memo')).toHaveText('<b>Rent</b> & food');
    expect(await page.locator('section.confirm b', { hasText: 'Rent' }).count()).toBe(0);
    await page.goto(`/transfers/confirmation/${blank.confirmationNumber}`);
    await expect(page.getByRole('heading', { name: 'Your transfer has been submitted' })).toBeVisible();
    await expect(confRow(page, 'Memo')).toHaveCount(0);
  });

  test('AC-39: Post-submit redirect and confirmation page', async ({ loggedInPage: page, api, api2 }) => {
    await page.getByLabel('Amount', { exact: true }).fill('1,250.00');
    await openScheduleOptions(page);
    await page.getByLabel('Memo (optional)').fill('October savings');
    await page.getByRole('button', { name: 'Transfer now' }).click();

    // PRG: the browser lands on the confirmation URL (refresh re-reads, it does not resubmit).
    await expect(page).toHaveURL(/\/transfers\/confirmation\/XFR261009-000001$/);
    await expect(page.getByRole('heading', { name: 'Your transfer has been submitted' })).toBeVisible();
    await expect(page.getByText('Confirmation number: XFR261009-000001')).toBeVisible();
    await expect(confRow(page, 'From')).toHaveText('Advantage Plus Banking - Checking ...1001');
    await expect(confRow(page, 'To')).toHaveText('Advantage Savings ...1002');
    await expect(confRow(page, 'Amount')).toHaveText('$1,250.00');
    await expect(confRow(page, 'Fee')).toHaveText('No fee');
    await expect(confRow(page, 'Transfer type')).toHaveText('Between your Bank of America accounts');
    await expect(confRow(page, 'Relationship tier')).toHaveText('Preferred Rewards Gold');
    await expect(confRow(page, 'Frequency')).toHaveText('One time');
    await expect(confRow(page, 'Status')).toHaveText('Posted');
    await expect(confRow(page, 'Posted')).toHaveText('Friday, October 9, 2026');
    await expect(confRow(page, 'Memo')).toHaveText('October savings');
    await expect(confRow(page, 'Total debit')).toHaveText('$1,250.00');
    await expect(page.getByText('Submitted 10/09/2026 12:00 PM EDT via Online Banking.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Updated balances' })).toBeVisible();
    await expect(page.locator('.acct .acct-bal')).toHaveText([/\$2,965\.38$/, /\$14,190\.00$/]);
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Confirmation number: XFR261009-000001')).toBeVisible();
    expect(((await (await api.history()).json()) as any[]).filter((t) => t.confirmationNumber.startsWith('XFR261009'))).toHaveLength(1);

    await page.getByRole('link', { name: 'Make another transfer' }).click();
    await expect(page).toHaveURL(/\/transfers$/);

    // Seeded numbers are viewable by their owner.
    await page.goto('/transfers/confirmation/XFR260928-000014');
    await expect(page.getByText('Confirmation number: XFR260928-000014')).toBeVisible();
    await expect(confRow(page, 'Amount')).toHaveText('$250.00');

    // Unknown number → back to Transfer Money; another customer's number → 404 to the API, back to Transfer Money in the UI.
    await page.goto('/transfers/confirmation/XFR261009-999999');
    await expect(page).toHaveURL(/\/transfers$/);
    await api2.loginOk(USERS.sam.userId, USERS.sam.password);
    const sams = await api2.submitOk(xfr(ACCTS.samChecking, ACCTS.samSavings, '20', { tierCode: '00' }));
    expect((await api.byConfirmation(sams.confirmationNumber)).status()).toBe(404);
    expect((await api2.byConfirmation(sams.confirmationNumber)).status()).toBe(200);
    await page.goto(`/transfers/confirmation/${sams.confirmationNumber}`);
    await expect(page).toHaveURL(/\/transfers$/);
  });

  test('AC-40: Failed submit re-renders the form in place with the error', async ({ loggedInPage: page }) => {
    const amount = page.getByLabel('Amount', { exact: true });
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.chase);
    await page.getByLabel('Relationship tier').selectOption('00');
    await page.getByLabel('Delivery', { exact: true }).selectOption('EXN');
    await openScheduleOptions(page);
    await page.getByLabel('Memo (optional)').fill('too much');
    await amount.fill('3500.01');
    await page.getByRole('button', { name: 'Transfer now' }).click();

    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await expect(alert).toHaveText('This transfer exceeds the per-transfer limit of $3,500.00 for your relationship tier.');
    await expect(page).toHaveURL(/\/transfers$/); // same page, no navigation
    // Form, balance cards and recent activity are all still there with the entered values retained.
    await expect(page.getByRole('heading', { name: 'Make a transfer' })).toBeVisible();
    await expect(amount).toHaveValue('3500.01');
    await expect(page.getByLabel('To', { exact: true })).toHaveValue(ACCTS.chase);
    await expect(page.getByLabel('Relationship tier')).toHaveValue('00');
    await expect(page.getByLabel('Delivery', { exact: true })).toHaveValue('EXN');
    await expect(page.getByLabel('Memo (optional)')).toHaveValue('too much');
    await expect(page.locator('.acct')).toHaveCount(2);
    await expect(page.locator('table.activity tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('transfer-summary')).toBeVisible();
    await expect(page.getByTestId('quote-error')).toHaveText('This transfer exceeds the per-transfer limit of $3,500.00 for your relationship tier.');
    // Nothing was created.
    await expect(page.getByText('XFR261009-')).toHaveCount(0);
    // Correcting the amount clears the error and the submit then goes through.
    await amount.fill('3500.00');
    await expect(page.getByTestId('quote-error')).toHaveText('');
    await page.getByRole('button', { name: 'Transfer now' }).click();
    await expect(page).toHaveURL(/\/transfers\/confirmation\/XFR261009-000001$/);
  });

  test('AC-41: Live Transfer Summary refresh', async ({ loggedInPage: page }) => {
    const quoteErr = page.getByTestId('quote-error');
    await expect(summaryCell(page, 'Amount')).toHaveText('$500.00');

    await page.getByLabel('Amount', { exact: true }).fill('1,250.00');
    await expect(summaryCell(page, 'Amount')).toHaveText('$1,250.00');
    await expect(summaryCell(page, 'Total debit')).toHaveText('$1,250.00');
    await expect(summaryCell(page, 'Delivery date')).toHaveText('Fri, Oct 9, 2026');

    // Selecting the external account shows the Delivery row and re-prices as EXS (3 business days).
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.chase);
    await expect(page.getByLabel('Delivery', { exact: true })).toBeVisible();
    await expect(summaryCell(page, 'To')).toHaveText('JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432');
    await expect(summaryCell(page, 'Transfer type')).toHaveText('3 business days (no fee)');
    await expect(summaryCell(page, 'Delivery date')).toHaveText('Thu, Oct 15, 2026');
    await expect(summaryCell(page, 'Fee')).toHaveText('No fee');

    // Standard tier + next-day delivery: $3.00 fee, total $1,253.00, Tue 10/13 (Columbus Day skipped).
    await page.getByLabel('Relationship tier').selectOption('00');
    await page.getByLabel('Delivery', { exact: true }).selectOption('EXN');
    await expect(summaryCell(page, 'Fee')).toHaveText('$3.00');
    await expect(summaryCell(page, 'Total debit')).toHaveText('$1,253.00');
    await expect(summaryCell(page, 'Transfer type')).toHaveText('Next business day');
    await expect(summaryCell(page, 'Relationship tier')).toHaveText('Standard');
    await expect(summaryCell(page, 'Delivery date')).toHaveText('Tue, Oct 13, 2026');

    // Validation failure → message in the quote error slot; fixing it clears the message.
    await page.getByLabel('From', { exact: true }).selectOption(ACCTS.chase);
    await expect(quoteErr).toHaveText('The From and To accounts must be different.');
    await page.getByLabel('From', { exact: true }).selectOption(ACCTS.checking);
    await expect(quoteErr).toHaveText('');
    await page.getByLabel('Amount', { exact: true }).fill('abc');
    await expect(quoteErr).toHaveText('Please enter a valid dollar amount (for example, 250.00).');
    await page.getByLabel('Amount', { exact: true }).fill('42');
    await expect(quoteErr).toHaveText('');
    await expect(summaryCell(page, 'Amount')).toHaveText('$42.00');
    await expect(summaryCell(page, 'Total debit')).toHaveText('$45.00');
  });

  test('AC-42: Unexpected errors render the branded error page', async ({ page }) => {
    // Public 404.
    await page.goto('/this/page/does/not/exist');
    await expect(page.getByRole('heading', { name: 'We’re sorry, Online Banking is temporarily unavailable.' })).toBeVisible();
    await expect(page.getByText('Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000.')).toBeVisible();
    await expect(page.locator('.err-ref')).toHaveText(/^Error reference: ERR-[0-9A-F]+ · HTTP 404$/);
    await expect(page.getByRole('link', { name: 'Return to sign in' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to sign in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel('User ID', { exact: true })).toBeVisible();

    // Authenticated 404 keeps the same branded page.
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    await page.goto('/transfers/nope');
    await expect(page.getByRole('heading', { name: 'We’re sorry, Online Banking is temporarily unavailable.' })).toBeVisible();
    await expect(page.locator('.err-ref')).toHaveText(/ERR-[0-9A-F]+ · HTTP 404$/);
  });
});
