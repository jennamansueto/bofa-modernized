import { test, expect, summaryCell, loginViaUi, expectLoginError } from '../fixtures/test';
import { ACCTS, USERS, xfr } from '../fixtures/api';
import { API_URL } from '../playwright.config';

const MSG = {
  required: 'Please enter your User ID and Password.',
  invalid: 'The User ID or Password you entered does not match our records. Please try again.',
  locked: 'Your account is temporarily locked after too many unsuccessful sign-in attempts. Please call 800.432.1000.',
  expired: 'For your security, your session has ended due to inactivity. Please log in again.',
};

test.describe('Authentication & session', () => {
  test('AC-01: Successful sign-in creates a fresh session and lands on Transfer Money', async ({ page, api }) => {
    // Case-insensitive, whitespace-trimmed user ID; the password is used verbatim.
    await loginViaUi(page, '  DEMO.USER ', USERS.demo.password);
    await expect(page.getByRole('heading', { name: 'Make a transfer' })).toBeVisible();
    const me = await (await api.me()).json();
    expect(me.userId).toBe('demo.user');
    expect(me.tierCode).toBe('10');
    expect(me.lastLogin).toContain('2026-10-09');

    // A second sign-in on the same client rotates the session id (legacy: JSESSIONID changes).
    const sessionCookie = async () => (await page.context().cookies(API_URL)).find((c) => c.name === 'SESSION')?.value;
    const first = await sessionCookie();
    expect(first).toBeTruthy();
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
    const second = await sessionCookie();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // The password is not trimmed and not case-folded.
    expect((await api.login(USERS.demo.userId, ' Password1')).status()).toBe(401);
    expect((await api.login(USERS.demo.userId, 'password1')).status()).toBe(401);
  });

  test('AC-02: Blank credentials are rejected before any lookup', async ({ page, api2 }) => {
    await page.goto('/');
    await expectLoginError(page, '   ', '', MSG.required);
    await expectLoginError(page, USERS.demo.userId, '   ', MSG.required);

    // No fail-count increment: three blank attempts for sam.chen must not contribute to the 3-strike lockout.
    for (let i = 0; i < 3; i++) {
      const res = await api2.login(USERS.sam.userId, ' ');
      expect(res.status()).toBe(401);
      expect((await res.json()).message).toBe(MSG.required);
    }
    for (let i = 0; i < 2; i++) {
      const res = await api2.login(USERS.sam.userId, 'wrong');
      expect((await res.json()).message).toBe(MSG.invalid);
    }
    await api2.loginOk(USERS.sam.userId, USERS.sam.password);
  });

  test('AC-03: Wrong password or unknown user shows the generic invalid message and increments the counter', async ({ page, api2 }) => {
    await page.goto('/');
    await expectLoginError(page, USERS.sam.userId, 'nope', MSG.invalid);
    await expectLoginError(page, 'nobody.here', 'Password1', MSG.invalid);

    // The counter really moved for sam.chen: two more wrong attempts reach 3 and lock (AC-04), proving the first counted.
    expect((await (await api2.login(USERS.sam.userId, 'nope')).json()).message).toBe(MSG.invalid);
    expect((await (await api2.login(USERS.sam.userId, 'nope')).json()).message).toBe(MSG.locked);
    // Unknown users persist nothing: still just the generic message, status 401.
    const unknown = await api2.login('nobody.here', 'Password1');
    expect(unknown.status()).toBe(401);
    expect((await unknown.json()).code).toBe('LOGIN_INVALID');
  });

  test('AC-04: Third consecutive failure locks the ID immediately and permanently (3-strike lockout)', async ({ page, api2 }) => {
    await page.goto('/');
    await expectLoginError(page, USERS.sam.userId, 'bad1', MSG.invalid);
    await expectLoginError(page, USERS.sam.userId, 'bad2', MSG.invalid);
    // The third failing response itself already reports the lock.
    await expectLoginError(page, USERS.sam.userId, 'bad3', MSG.locked);
    // Later attempts, wrong or CORRECT, stay locked; the lock is persisted and survives a fresh client.
    await expectLoginError(page, USERS.sam.userId, 'bad4', MSG.locked);
    await expectLoginError(page, USERS.sam.userId, USERS.sam.password, MSG.locked);
    const fresh = await api2.login(USERS.sam.userId, USERS.sam.password);
    expect(fresh.status()).toBe(401);
    expect(await fresh.json()).toMatchObject({ ok: false, code: 'LOGIN_LOCKED', message: MSG.locked });
  });

  test('AC-05: A successful sign-in resets the failure counter', async ({ api }) => {
    for (let i = 0; i < 2; i++) expect((await (await api.login(USERS.demo.userId, 'bad')).json()).message).toBe(MSG.invalid);
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
    // Counter is back to 0: two further failures do not lock...
    for (let i = 0; i < 2; i++) expect((await (await api.login(USERS.demo.userId, 'bad')).json()).message).toBe(MSG.invalid);
    // ...and a correct sign-in still succeeds.
    await api.loginOk(USERS.demo.userId, USERS.demo.password);
  });

  test('AC-06: "Save user ID" cookie', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('User ID', { exact: true }).fill('DEMO.USER');
    await page.getByLabel('Password', { exact: true }).fill(USERS.demo.password);
    await page.getByLabel('Save user ID').check();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/transfers$/);

    const cookie = (await page.context().cookies(API_URL)).find((c) => c.name === 'olb_uid');
    expect(cookie, 'olb_uid cookie set').toBeTruthy();
    expect(cookie!.value).toBe('demo.user'); // canonical DB user id, not what was typed
    expect(cookie!.path).toBe('/');
    const maxAgeDays = (cookie!.expires - Date.now() / 1000) / 86400;
    expect(maxAgeDays).toBeGreaterThan(360);
    expect(maxAgeDays).toBeLessThanOrEqual(366);

    // Landing page pre-fills the User ID from the cookie.
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel('User ID', { exact: true })).toHaveValue('demo.user');

    // Signing in with the box unchecked deletes the cookie.
    await expect(page.getByLabel('Save user ID')).not.toBeChecked();
    await page.getByLabel('Password', { exact: true }).fill(USERS.demo.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/transfers$/);
    expect((await page.context().cookies(API_URL)).find((c) => c.name === 'olb_uid')).toBeUndefined();
  });

  test('AC-07: Unauthenticated access to any `/secure/*` URL redirects to sign-in with the "expired" banner', async ({ page, api }) => {
    // Browser: deep link to a secure page without a session → sign-in with the expired banner (never signed in).
    await page.goto('/transfers');
    await expect(page).toHaveURL(/\/\?expired=1$/);
    await expect(page.getByText(MSG.expired)).toBeVisible();
    await page.goto('/transfers/confirmation/XFR260928-000014');
    await expect(page).toHaveURL(/\/\?expired=1$/);
    await expect(page.getByText(MSG.expired)).toBeVisible();

    // API (the SPA equivalent of the 302): JSON 401 with no-cache headers, for GET and for the JSON quote POST.
    for (const res of [await api.accounts(), await api.history(), await api.me(), await api.quote(xfr(ACCTS.checking, ACCTS.savings, '500'))]) {
      expect(res.status()).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, status: 401, code: 'UNAUTHENTICATED' });
      expect(res.headers()['cache-control']).toContain('no-store');
    }
  });

  test('AC-08: Session timeout is 10 minutes of inactivity', async ({ page, api }) => {
    // Server contract: the authenticated session is created with a 10-minute inactivity timeout.
    await page.clock.install({ time: new Date('2026-10-09T16:00:00Z') });
    await loginViaUi(page, USERS.demo.userId, USERS.demo.password);
    const me = await (await api.me()).json();
    expect(me.sessionTimeoutSeconds).toBe(600);
    await expect(summaryCell(page, 'Amount')).toHaveText('$500.00'); // initial quote done: no more activity from the page

    // Browser: after 10 idle minutes the UI warns, then behaves exactly like AC-07.
    await page.clock.fastForward('09:10');
    await expect(page.getByRole('alertdialog', { name: 'Are you still there?' })).toBeVisible();
    await page.clock.runFor('01:00'); // runFor ticks every 1 s interval; fastForward would fire it only once
    await expect(page).toHaveURL(/\/\?expired=1$/);
    await expect(page.getByText(MSG.expired)).toBeVisible();
  });

  test('AC-09: Logout invalidates the session and returns to the public landing page', async ({ page, api }) => {
    await page.goto('/');
    await page.getByLabel('User ID', { exact: true }).fill(USERS.demo.userId);
    await page.getByLabel('Password', { exact: true }).fill(USERS.demo.password);
    await page.getByLabel('Save user ID').check();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/transfers$/);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(new RegExp(`^${page.url().split('/').slice(0, 3).join('/')}/$`)); // landing, no ?expired
    expect(page.url()).not.toContain('expired');
    await expect(page.getByText(MSG.expired)).toHaveCount(0);
    // olb_uid is left untouched by logout; the session cookie is gone.
    const cookies = await page.context().cookies(API_URL);
    expect(cookies.find((c) => c.name === 'olb_uid')?.value).toBe('demo.user');
    expect(cookies.find((c) => c.name === 'SESSION')).toBeUndefined();
    // A following secure request behaves per AC-07.
    expect((await api.me()).status()).toBe(401);
    await page.goto('/transfers');
    await expect(page).toHaveURL(/\/\?expired=1$/);
  });

  test('AC-10: Authenticated pages are never cached', async ({ api }) => {
    const login = await api.login(USERS.demo.userId, USERS.demo.password);
    expect(login.status()).toBe(200);
    const responses = [login, await api.me(), await api.accounts(), await api.history(), await api.quote(xfr(ACCTS.checking, ACCTS.savings, '500'))];
    for (const res of responses) {
      const h = res.headers();
      expect(h['cache-control'], res.url()).toMatch(/no-cache/);
      expect(h['cache-control'], res.url()).toMatch(/no-store/);
      expect(h['pragma'], res.url()).toMatch(/no-cache/i);
      expect(h['expires'], res.url()).toBeDefined();
    }
  });
});
