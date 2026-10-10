import { test, expect } from '../fixtures/test';
import { ACCTS, USERS, xfr, setClockEastern, resetClock } from '../fixtures/api';
import type { APIResponse } from '@playwright/test';

async function ok(res: APIResponse): Promise<Record<string, any>> {
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test.describe('Dating & delivery', () => {
  test.beforeEach(async ({ api }) => {
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
  });

  test('AC-31: Internal same-day transfer posts immediately', async ({ api, page }) => {
    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '1,250.00', { tierCode: '10' }));
    expect(t.statusCode).toBe('P');
    expect(t.status).toBe('Posted');
    expect(t.scheduledDate).toBe('2026-10-09');
    expect(t.postDate).toBe('2026-10-09');
    const a = await api.accountsById();
    expect([a[ACCTS.checking].currentBalanceCents, a[ACCTS.checking].availableBalanceCents]).toEqual([296538, 296538]);
    expect([a[ACCTS.savings].currentBalanceCents, a[ACCTS.savings].availableBalanceCents]).toEqual([1419000, 1419000]);

    // Confirmation page (same session via shared cookies).
    await page.goto(`/transfers/confirmation/${t.confirmationNumber}`);
    const confirm = page.locator('section.confirm');
    await expect(confirm.getByRole('row', { name: /^Status\b/ }).getByRole('cell')).toHaveText('Posted');
    await expect(confirm.getByRole('row', { name: /^Posted\b/ }).getByRole('cell')).toHaveText('Friday, October 9, 2026');
    await expect(page.getByText('Transfers between your Bank of America accounts post the same day.')).toBeVisible();
    await expect(page.locator('.acct .acct-bal')).toHaveText([/\$2,965\.38$/, /\$14,190\.00$/]);
  });

  test('AC-32: Future-dated internal transfer is scheduled, no balance movement', async ({ api }) => {
    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '1,250.00', { scheduledDate: '10/20/2026' }));
    expect(t.statusCode).toBe('S');
    expect(t.status).toBe('Scheduled');
    expect(t.scheduledDate).toBe('2026-10-20');
    expect(t.postDate).toBe('2026-10-20');
    const a = await api.accountsById();
    expect([a[ACCTS.checking].currentBalanceCents, a[ACCTS.checking].availableBalanceCents]).toEqual([421538, 421538]);
    expect([a[ACCTS.savings].currentBalanceCents, a[ACCTS.savings].availableBalanceCents]).toEqual([1294000, 1294000]);
    // Internal delivery is the scheduled date itself: a Saturday is not rolled forward.
    const sat = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '10', { scheduledDate: '10/10/2026' })));
    expect(sat.deliveryDate).toBe('2026-10-10');
    expect(sat.delivery).toBe('Sat, Oct 10, 2026');
  });

  test('AC-33: External transfer delivery dates: EXS +3 / EXN +1 business days', async ({ api }) => {
    // Fri 10/09 before 8 PM ET, blank date: EXN skips Sat, Sun and Columbus Day (Mon 10/12) → Tue 10/13.
    const exn = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' })));
    expect(exn.scheduledDate).toBe('2026-10-09');
    expect(exn.deliveryDate).toBe('2026-10-13');
    expect(exn.delivery).toBe('Tue, Oct 13, 2026');
    const exs = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXS' })));
    expect(exs.deliveryDate).toBe('2026-10-15');
    expect(exs.delivery).toBe('Thu, Oct 15, 2026');
    // Stored: SCHED_DT = request date, POST_DT = delivery date.
    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' }));
    expect(t.scheduledDate).toBe('2026-10-09');
    expect(t.postDate).toBe('2026-10-13');
    // Thanksgiving: EXN dated Wed 11/25 → Fri 11/27; EXS dated Wed 10/14 → Mon 10/19.
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN', scheduledDate: '11/25/2026' })))).deliveryDate).toBe('2026-11-27');
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXS', scheduledDate: '10/14/2026' })))).deliveryDate).toBe('2026-10-19');
  });

  test('AC-34: Future-dated external on a non-business day rolls the start forward first', async ({ api }) => {
    const exn = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN', scheduledDate: '10/10/2026' })));
    expect(exn.deliveryDate).toBe('2026-10-14');
    expect(exn.delivery).toBe('Wed, Oct 14, 2026');
    const exs = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXS', scheduledDate: '10/10/2026' })));
    expect(exs.deliveryDate).toBe('2026-10-16');
    expect(exs.delivery).toBe('Fri, Oct 16, 2026');
  });

  test('AC-35: 8 PM ET cutoff moves the effective start date for same-day external requests', async ({ api, request }) => {
    // 7:59 PM ET — still before the cutoff.
    await setClockEastern(request, '2026-10-09T19:59');
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' })))).deliveryDate).toBe('2026-10-13');
    // 8:00 PM ET — start moves to Sat 10/10, rolls to Tue 10/13; EXN → Wed 10/14, EXS → Fri 10/16.
    await setClockEastern(request, '2026-10-09T20:00');
    const exn = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' })));
    expect(exn.scheduledDate).toBe('2026-10-09');
    expect(exn.deliveryDate).toBe('2026-10-14');
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXS' })))).deliveryDate).toBe('2026-10-16');
    // Submitted after the cutoff: stored the same way.
    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN' }));
    expect(t.postDate).toBe('2026-10-14');
    // Not applied to future-dated requests, and never to internal transfers.
    expect((await ok(await api.quote(xfr(ACCTS.checking, ACCTS.chase, '100', { delivery: 'EXN', scheduledDate: '10/14/2026' })))).deliveryDate).toBe('2026-10-15');
    const int = await ok(await api.quote(xfr(ACCTS.checking, ACCTS.savings, '100')));
    expect(int.deliveryDate).toBe('2026-10-09');
    await resetClock(request);
  });

  test('AC-36: External transfers are always scheduled with an available-balance hold on the internal From account', async ({ api, page }) => {
    await api.submitOk(xfr(ACCTS.checking, ACCTS.savings, '1,250.00', { tierCode: '10' }));
    const t = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '200', { tierCode: '00', delivery: 'EXN' }));
    expect(t.statusCode).toBe('S');
    expect(t.status).toBe('Scheduled');
    let a = await api.accountsById();
    expect(a[ACCTS.checking].currentBalanceCents).toBe(296538); // unchanged by the external
    expect(a[ACCTS.checking].availableBalanceCents).toBe(276238); // held: $200 + $3.00
    // A future-dated external is scheduled with the hold too (never posted).
    const future = await api.submitOk(xfr(ACCTS.checking, ACCTS.chase, '100', { tierCode: '10', delivery: 'EXS', scheduledDate: '10/20/2026' }));
    expect(future.statusCode).toBe('S');
    a = await api.accountsById();
    expect(a[ACCTS.checking].availableBalanceCents).toBe(266238);
    // Inbound (From external): no balance change anywhere.
    const inbound = await api.submitOk(xfr(ACCTS.chase, ACCTS.savings, '100', { tierCode: '10', delivery: 'EXS' }));
    expect(inbound.statusCode).toBe('S');
    a = await api.accountsById();
    expect([a[ACCTS.savings].currentBalanceCents, a[ACCTS.savings].availableBalanceCents]).toEqual([1419000, 1419000]);
    expect([a[ACCTS.chase].currentBalanceCents, a[ACCTS.chase].availableBalanceCents]).toEqual([0, 0]);

    // UI: the checking card gains an "Available" line; confirmation footer carries the ACH note.
    await page.goto(`/transfers/confirmation/${t.confirmationNumber}`);
    await expect(page.getByText('External transfers are sent via ACH and will arrive on the delivery date shown.')).toBeVisible();
    await page.goto('/transfers');
    const checkingCard = page.locator('.acct').filter({ hasText: 'ACCT-1001' });
    await expect(checkingCard.locator('.acct-bal')).toHaveText(/\$2,965\.38$/);
    await expect(checkingCard.locator('.acct-avl')).toHaveText('Available $2,662.38');
  });
});
