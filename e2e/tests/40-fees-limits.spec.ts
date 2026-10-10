import { test, expect } from '../fixtures/test';
import { ACCTS, USERS, xfr } from '../fixtures/api';
import type { APIResponse } from '@playwright/test';

const MSG = {
  perTxn: (lim: string) => `This transfer exceeds the per-transfer limit of ${lim} for your relationship tier.`,
  // Legacy rendered the doubled apostrophe `Today''s` (Struts double-escaping, invalid JSON); the modern API deliberately renders it correctly.
  daily: (lim: string, used: string) => `This transfer would exceed your daily external transfer limit of ${lim}. Today's external transfers total ${used}.`,
  balance: 'The amount plus any fee exceeds the available balance in your From account.',
  regD: 'You have reached the limit of 6 transfers from your savings account this statement cycle (Regulation D).',
};

async function error(res: APIResponse): Promise<string> {
  expect(res.status(), await res.text()).toBe(422);
  return (await res.json()).message;
}
async function ok(res: APIResponse): Promise<Record<string, any>> {
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test.describe('Type derivation, fees, limits, balance and Regulation D', () => {
  test.beforeEach(async ({ api }) => {
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
  });

  test('AC-25: Transfer type derivation', async ({ api, page }) => {
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '100', { delivery: 'EXN' })))).typeCode).toBe('INT'); // delivery ignored
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' })))).typeCode).toBe('EXN');
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXS' })))).typeCode).toBe('EXS');
    // Inbound external is external too.
    expect((await ok(await api.quote(xfr(ACCTS.chase, ACCTS.checking, '100', { delivery: 'EXN' })))).typeCode).toBe('EXN');
    // Anything that is not exactly "EXN" (absent, garbage) is EXS.
    const absent = await ok(await api.quote({ ...xfr(ACCTS.checking, ACCTS.chase, '100'), delivery: undefined }));
    expect(absent.typeCode).toBe('EXS');
    const garbage = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'XYZ' })));
    expect(garbage.typeCode).toBe('EXS');
    expect(garbage.type).toBe('3 business days (no fee)');

    // UI: the Delivery row is only shown when an external account is selected.
    await page.goto('/transfers');
    await expect(page.getByRole('heading', { name: 'Make a transfer' })).toBeVisible();
    await expect(page.getByLabel('Delivery', { exact: true })).toBeHidden();
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.chase);
    await expect(page.getByLabel('Delivery', { exact: true })).toBeVisible();
    await page.getByLabel('To', { exact: true }).selectOption(ACCTS.savings);
    await expect(page.getByLabel('Delivery', { exact: true })).toBeHidden();
  });

  test('AC-26: Fee by (type, tier)', async ({ api }) => {
    const fee = async (from: string, to: string, tier: string, delivery: string, amount = '1,250.00') =>
      ok(await api.quote(xfr(from, to, amount, { tierCode: tier, delivery })));
    // Gold (demo.user's stored tier) external → no fee either way.
    expect((await fee(ACCTS.checking, ACCTS.chase, '10', 'EXS')).fee).toBe('No fee');
    expect((await fee(ACCTS.checking, ACCTS.chase, '10', 'EXN')).fee).toBe('No fee');
    // Standard EXS → no fee; Standard EXN → $3.00 and total = amount + $3.00.
    expect((await fee(ACCTS.checking, ACCTS.chase, '00', 'EXS')).fee).toBe('No fee');
    const exn = await fee(ACCTS.checking, ACCTS.chase, '00', 'EXN');
    expect(exn.fee).toBe('$3.00');
    expect(exn.feeCents).toBe(300);
    expect(exn.total).toBe('$1,253.00');
    expect(exn.totalCents).toBe(125300);
    // All internal → no fee, for every tier.
    for (const tier of ['00', '10', '20', '30']) {
      const q = await fee(ACCTS.checking, ACCTS.savings, tier, 'EXN');
      expect(q.fee, tier).toBe('No fee');
      expect(q.total, tier).toBe('$1,250.00');
    }
  });

  test('AC-27: Per-transaction limit', async ({ api }) => {
    // Standard EXN: $3,500.00 per transaction — equal is allowed, one cent over is not.
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3500.01', { tierCode: '00', delivery: 'EXN' })))).toBe(MSG.perTxn('$3,500.00'));
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3500.00', { tierCode: '00', delivery: 'EXN' }))).status()).toBe(200);
    // Gold inbound external $50,000 → Gold EXS limit $5,000.00 (balance of the external account is irrelevant).
    expect(await error(await api.quote(xfr(ACCTS.chase, ACCTS.checking, '50000', { tierCode: '10', delivery: 'EXS' })))).toBe(MSG.perTxn('$5,000.00'));
    // Internal limit is the hard-coded $99,999.99 regardless of tier (even Platinum Honors).
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '100000', { tierCode: '30' })))).toBe(MSG.perTxn('$99,999.99'));
    // Per-transaction is checked BEFORE balance: an amount over both limit and balance reports the limit.
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '9000', { tierCode: '10', delivery: 'EXN' })))).toBe(MSG.perTxn('$5,000.00'));
  });

  test('AC-28: Daily external limit (same-day only, counts both directions)', async ({ api }) => {
    // Standard tier, today: $200 EXN out + $300 EXS in = $500 used (fees excluded, inbound counts).
    await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '200', { tierCode: '00', delivery: 'EXN' }));
    await api.submitOk(xfr(ACCTS.chase, ACCTS.checking, '300', { tierCode: '00', delivery: 'EXS' }));
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3100', { tierCode: '00', delivery: 'EXS' }))))
      .toBe(MSG.daily('$3,500.00', '$500.00'));
    expect(await error(await api.submit(xfr(ACCTS.checking, ACCTS.chase, '3100', { tierCode: '00', delivery: 'EXS' }))))
      .toBe(MSG.daily('$3,500.00', '$500.00'));
    // Exactly reaching the limit is allowed ($500 + $3,000 = $3,500).
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3000', { tierCode: '00', delivery: 'EXS' }))).status()).toBe(200);
    // A future-dated external transfer skips the daily check entirely.
    const future = await ok(await api.quote(xfr(ACCTS.savings, ACCTS.chase, '3100', { tierCode: '00', delivery: 'EXS', scheduledDate: '10/14/2026' })));
    expect(future.scheduledDate).toBe('2026-10-14');
    // The seeded XFR261006-000091 (scheduled 10/06) does not count today: a fresh client sees only today's $500.
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3000.01', { tierCode: '00', delivery: 'EXS' }))))
      .toBe(MSG.daily('$3,500.00', '$500.00'));
  });

  test('AC-29: Amount plus fee must not exceed the From account\'s available balance (internal From only)', async ({ api }) => {
    // Equal to the available balance is allowed; one cent more is not.
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '4215.38'))).status()).toBe(200);
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '4215.39')))).toBe(MSG.balance);
    // The fee counts: bring checking down to $3,215.38, then Standard EXN $3,213.00 + $3.00 = $3,216.00 > $3,215.38.
    await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '1000'));
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3213.00', { tierCode: '00', delivery: 'EXN' })))).toBe(MSG.balance);
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.chase, '3212.38', { tierCode: '00', delivery: 'EXN' }))).status()).toBe(200);
    // Uses AVAILABLE balance: an earlier same-day external hold ($200 + $3.00) reduces capacity to $3,012.38.
    await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '200', { tierCode: '00', delivery: 'EXN' }));
    const accts = await api.accountsById();
    expect(accts[ACCTS.checking].currentBalanceCents).toBe(321538);
    expect(accts[ACCTS.checking].availableBalanceCents).toBe(301238);
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '3012.39')))).toBe(MSG.balance);
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '3012.38'))).status()).toBe(200);
    // From an external account the check is skipped (its balance is unknown / $0).
    expect((await api.quote(xfr(ACCTS.chase, ACCTS.checking, '1000', { tierCode: '10', delivery: 'EXS' }))).status()).toBe(200);
  });

  test('AC-30: Regulation D: max 6 outbound transfers per calendar month from a savings account', async ({ api }) => {
    // Seeded: ACCT-1002 already has 1 outbound in Oct 2026 (XFR261001-000203). 1 future-dated + 4 same-day = 6.
    await api.submitOk(xfr(ACCTS.savings, ACCTS.checking, '10', { scheduledDate: '10/20/2026' }));
    for (let i = 0; i < 4; i++) await api.submitOk(xfr(ACCTS.savings, ACCTS.checking, '10'));
    expect(await error(await api.quote(xfr(ACCTS.savings, ACCTS.checking, '10')))).toBe(MSG.regD);
    expect(await error(await api.submit(xfr(ACCTS.savings, ACCTS.chase, '10', { delivery: 'EXN' })))).toBe(MSG.regD);
    // Inbound transfers TO savings do not count, and other From accounts are unaffected.
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '10'))).status()).toBe(200);
    // The month is that of the SCHEDULED date: November has 0, so 11/02/2026 succeeds.
    const nov = await api.submitOk(xfr(ACCTS.savings, ACCTS.checking, '10', { scheduledDate: '11/02/2026' }));
    expect(nov.scheduledDate).toBe('2026-11-02');
    expect(nov.statusCode).toBe('S');
  });
});
