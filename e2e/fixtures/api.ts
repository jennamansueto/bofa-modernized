import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { API_URL } from '../playwright.config';

/** Friday 2026-10-09 12:00 ET — the reference "today" used throughout docs/01-acceptance-criteria.md. */
export const REFERENCE_NOW_ISO = '2026-10-09T16:00:00Z';

export const USERS = {
  demo: { userId: 'demo.user', password: 'Password1', customerId: 'CUST-0001', name: 'Alex Morgan' },
  sam: { userId: 'sam.chen', password: 'Password1', customerId: 'CUST-0002', name: 'Sam Chen' },
} as const;

export const ACCTS = {
  checking: 'ACCT-1001',
  savings: 'ACCT-1002',
  chase: 'ACCT-1003',
  samChecking: 'ACCT-2001',
  samSavings: 'ACCT-2002',
} as const;

export interface TransferBody {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  tierCode?: string;
  delivery?: string;
  scheduledDate?: string;
  frequency?: string;
  memo?: string;
}

/** Build the standard legacy-shaped transfer request (frequency ONCE, delivery NEXT_DAY, tier Standard by default). */
export function xfr(from: string, to: string, amount: string, extra: Partial<TransferBody> = {}): TransferBody {
  return {
    fromAccountId: from,
    toAccountId: to,
    amount,
    tierCode: '00',
    delivery: 'NEXT_DAY',
    frequency: 'O',
    scheduledDate: '',
    memo: '',
    ...extra,
  };
}

/** Test-support clock: pin "now" to an ET local date-time, e.g. setClockEastern(api, '2026-10-09T20:00'). */
export async function setClockEastern(api: APIRequestContext, etLocal: string) {
  // Reference period is EDT (UTC-4) for Oct/early Nov 2026; Nov 2 2026+ is EST (UTC-5).
  const offset = etLocal >= '2026-11-01T02:00' ? '-05:00' : '-04:00';
  const res = await api.post(`${API_URL}/api/test/clock`, { data: { now: new Date(etLocal + offset).toISOString() } });
  expect(res.ok(), 'clock fix').toBeTruthy();
}

export async function resetClock(api: APIRequestContext) {
  const res = await api.post(`${API_URL}/api/test/clock`, { data: { now: REFERENCE_NOW_ISO } });
  expect(res.ok(), 'clock reset').toBeTruthy();
}

export async function resetDatabase(api: APIRequestContext) {
  const res = await api.post(`${API_URL}/api/test/reset`);
  expect(res.ok(), 'database reset').toBeTruthy();
}

/** Thin cookie-aware client over Playwright's request fixture: login, CSRF, and the /api/secure endpoints. */
export class OlbApi {
  constructor(readonly ctx: APIRequestContext, readonly base: string = API_URL) {}

  login(userId: string, password: string, saveUserId = false): Promise<APIResponse> {
    return this.ctx.post(`${this.base}/api/login`, { data: { userId, password, saveUserId } });
  }

  async loginOk(userId: string, password: string): Promise<Record<string, unknown>> {
    const res = await this.login(userId, password);
    expect(res.status(), `login ${userId}`).toBe(200);
    return res.json();
  }

  logout(): Promise<APIResponse> {
    return this.ctx.post(`${this.base}/api/logout`);
  }

  async csrfToken(): Promise<string> {
    const res = await this.ctx.get(`${this.base}/api/csrf`);
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  async secureHeaders(): Promise<Record<string, string>> {
    return { 'X-XSRF-TOKEN': await this.csrfToken() };
  }

  me() { return this.ctx.get(`${this.base}/api/secure/me`); }
  accounts() { return this.ctx.get(`${this.base}/api/secure/accounts`); }
  history() { return this.ctx.get(`${this.base}/api/secure/transfers`); }
  byConfirmation(conf: string) { return this.ctx.get(`${this.base}/api/secure/transfers/${conf}`); }

  async quote(body: TransferBody): Promise<APIResponse> {
    return this.ctx.post(`${this.base}/api/secure/transfers/quote`, { data: body, headers: await this.secureHeaders() });
  }

  async submit(body: TransferBody): Promise<APIResponse> {
    return this.ctx.post(`${this.base}/api/secure/transfers`, { data: body, headers: await this.secureHeaders() });
  }

  async submitOk(body: TransferBody): Promise<Record<string, any>> {
    const res = await this.submit(body);
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
  }

  async accountsById(): Promise<Record<string, any>> {
    const res = await this.accounts();
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as any[];
    return Object.fromEntries(list.map((a) => [a.accountId, a]));
  }
}
