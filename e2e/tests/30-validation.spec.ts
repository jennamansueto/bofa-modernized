import { test, expect } from '../fixtures/test';
import { ACCTS, USERS, xfr, type OlbApi } from '../fixtures/api';
import { API_URL } from '../playwright.config';
import type { APIResponse } from '@playwright/test';

const MSG = {
  amountRequired: 'Please enter an amount.',
  amountFormat: 'Please enter a valid dollar amount (for example, 250.00).',
  amountMin: 'The transfer amount must be at least $0.01.',
  sameAcct: 'The From and To accounts must be different.',
  accounts: 'Please select valid From and To accounts.',
  extToExt: 'Transfers between two external accounts are not supported.',
  tier: 'Please select a relationship tier.',
  frequency: 'Please select a frequency.',
  dateFormat: 'Please enter the transfer date as MM/DD/YYYY.',
  datePast: 'The transfer date cannot be in the past.',
};

async function error(res: APIResponse): Promise<string> {
  expect(res.status(), await res.text()).toBe(422);
  const body = await res.json();
  expect(body.ok).toBe(false);
  return body.message;
}

async function ok(res: APIResponse): Promise<Record<string, any>> {
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  return body;
}

test.describe('Amount, account, tier, frequency and date validation (quote and submit share one chain)', () => {
  test.beforeEach(async ({ api }) => {
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
  });

  test('AC-14: Amount is required', async ({ api }) => {
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '')))).toBe(MSG.amountRequired);
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '   ')))).toBe(MSG.amountRequired);
    expect(await error(await api.submit(xfr(ACCTS.checking, ACCTS.savings, '')))).toBe(MSG.amountRequired);
  });

  test('AC-15: Amount parsing accepts `$`, thousands separators and up to 2 decimals', async ({ api }) => {
    const cases: [string, number, string][] = [
      ['1,250.00', 125000, '$1,250.00'],
      ['$1,250.5', 125050, '$1,250.50'],
      ['1250.', 125000, '$1,250.00'],
      ['500', 50000, '$500.00'],
      ['4215.38', 421538, '$4,215.38'],
      ['1,2,3', 12300, '$123.00'],
    ];
    for (const [raw, cents, display] of cases) {
      const q = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, raw)));
      expect(q.amountCents, raw).toBe(cents);
      expect(q.amount, raw).toBe(display);
    }
    for (const bad of ['.50', '1.005', 'abc', '1 000', '12345678901234']) {
      expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, bad))), bad).toBe(MSG.amountFormat);
    }
  });

  test('AC-16: Amount must be at least one cent', async ({ api }) => {
    for (const zeroish of ['0', '0.00', '-5']) {
      expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, zeroish))), zeroish).toBe(MSG.amountMin);
    }
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '0.01'))).status()).toBe(200);
  });

  test('AC-17: From and To must differ', async ({ api }) => {
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.checking, '500')))).toBe(MSG.sameAcct);
    // Same external account: this message wins over the EXT→EXT check.
    expect(await error(await api.quote(xfr(ACCTS.chase, ACCTS.chase, '500')))).toBe(MSG.sameAcct);
    expect(await error(await api.submit(xfr(ACCTS.checking, ACCTS.checking, '500')))).toBe(MSG.sameAcct);
  });

  test('AC-18: Both accounts must exist, be active (`STAT_CD=\'A\'`) and belong to the signed-in customer', async ({ api, api2 }) => {
    // Another customer's account (Sam Chen's ACCT-2001).
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.samChecking, '50')))).toBe(MSG.accounts);
    expect(await error(await api.quote(xfr(ACCTS.samChecking, ACCTS.checking, '50')))).toBe(MSG.accounts);
    // Unknown and missing ids.
    expect(await error(await api.quote(xfr(ACCTS.checking, 'ACCT-9999', '50')))).toBe(MSG.accounts);
    expect(await error(await api.quote({ ...xfr(ACCTS.checking, '', '50') }))).toBe(MSG.accounts);
    expect(await error(await api.quote({ ...xfr('', ACCTS.savings, '50') }))).toBe(MSG.accounts);
    // Sam Chen's own accounts are valid for Sam, confirming the rule is ownership, not existence.
    await api2.loginOk(USERS.sam.userId, USERS.sam.password);
    expect((await api2.quote(xfr(ACCTS.samChecking, ACCTS.samSavings, '50'))).status()).toBe(200);
    expect(await error(await api2.quote(xfr(ACCTS.samChecking, ACCTS.checking, '50')))).toBe(MSG.accounts);
    // Only active, owned accounts are offered: exactly the three seeded accounts for demo.user.
    const accounts = (await (await api.accounts()).json()) as any[];
    expect(accounts.map((a) => a.accountId)).toEqual([ACCTS.checking, ACCTS.savings, ACCTS.chase]);
    expect(accounts.every((a) => a.statusCode === 'A')).toBe(true);
  });

  test('AC-19: External-to-external is not supported', async ({ api }) => {
    // Not reachable with the seed (one external account) — doc 01 says "add one to test".
    const fx = await api.ctx.post(`${API_URL}/api/test/fixtures/second-external-account`);
    expect(fx.ok()).toBeTruthy();
    expect(await error(await api.quote(xfr(ACCTS.chase, 'ACCT-1004', '50')))).toBe(MSG.extToExt);
    expect(await error(await api.submit(xfr('ACCT-1004', ACCTS.chase, '50', { delivery: 'EXN' })))).toBe(MSG.extToExt);
    // External → internal is still fine.
    expect((await api.quote(xfr('ACCT-1004', ACCTS.checking, '50'))).status()).toBe(200);
  });

  test('AC-20: Submitted tier overrides the customer\'s stored tier (not cross-checked)', async ({ api }) => {
    // demo.user is stored as Gold (10); submitting Standard (00) prices as Standard: EXN now costs $3.00.
    const gold = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '10', delivery: 'EXN' })));
    expect(gold.fee).toBe('No fee');
    const std = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '00', delivery: 'EXN' })));
    expect(std.fee).toBe('$3.00');
    expect(std.tier).toBe('Standard');

    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '25', { tierCode: '00' }));
    expect(t.tierCode).toBe('00');
    expect(t.tier).toBe('Standard');
    const stored = await (await api.byConfirmation(t.confirmationNumber)).json();
    expect(stored.tierCode).toBe('00');
    expect(stored.tier).toBe('Standard');

    // Only membership in {00,10,20,30} is validated.
    for (const tier of ['20', '30']) expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { tierCode: tier }))).status()).toBe(200);
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { tierCode: '99' })))).toBe(MSG.tier);
    expect(await error(await api.quote({ ...xfr(ACCTS.checking, ACCTS.savings, '25'), tierCode: undefined }))).toBe(MSG.tier);
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { tierCode: '' })))).toBe(MSG.tier);
  });

  test('AC-21: Fee row missing yields the same tier message', async ({ api }) => {
    // Not reachable with the seed — push the (EXN, Standard) fee row's effective date into the future.
    const fx = await api.ctx.post(`${API_URL}/api/test/fixtures/exn-standard-fee-row-not-effective`);
    expect(fx.ok()).toBeTruthy();
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '00', delivery: 'EXN' })))).toBe(MSG.tier);
    // Other (type, tier) rows are untouched.
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '10', delivery: 'EXN' }))).status()).toBe(200);
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '00', delivery: 'EXS' }))).status()).toBe(200);
  });

  test('AC-22: Frequency must be `O`, `W` or `M`; it is stored but never acted upon', async ({ api }) => {
    for (const bad of ['D', 'X', 'o', 'Weekly']) {
      expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { frequency: bad }))), bad).toBe(MSG.frequency);
    }
    const before = ((await (await api.history()).json()) as any[]).length;
    const weekly = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '25', { frequency: 'W', scheduledDate: '10/20/2026' }));
    expect(weekly.frequencyCode).toBe('W');
    expect(weekly.frequency).toBe('Weekly');
    const monthly = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '25', { frequency: 'M' }));
    expect(monthly.frequency).toBe('Monthly');
    // Exactly one row per submit — no recurring instances are generated.
    const after = ((await (await api.history()).json()) as any[]).length;
    expect(after).toBe(before + 2);
  });

  test('AC-23: Scheduled ("Send on") date format and defaulting', async ({ api }) => {
    const blank = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '' })));
    expect(blank.scheduledDate).toBe('2026-10-09'); // today, Eastern calendar date
    const dated = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '10/20/2026' })));
    expect(dated.scheduledDate).toBe('2026-10-20');
    for (const bad of ['10/32/2026', '10/9/26', '13/01/2026', '02/30/2027', 'tomorrow']) {
      expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: bad }))), bad).toBe(MSG.dateFormat);
    }
  });

  test('AC-24: Scheduled date cannot be in the past', async ({ api }) => {
    expect(await error(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '10/08/2026' })))).toBe(MSG.datePast);
    expect(await error(await api.submit(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '01/01/2020' })))).toBe(MSG.datePast);
    // Today itself is allowed; there is no upper bound.
    expect((await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '10/09/2026' }))).status()).toBe(200);
    const far = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '25', { scheduledDate: '10/09/2046' })));
    expect(far.scheduledDate).toBe('2046-10-09');
  });
});
