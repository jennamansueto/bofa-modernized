import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { createQueryClient } from '@/api/queryClient';
import type { AccountResponse, MeResponse } from '@/api/types';

export function renderWithProviders(ui: React.ReactElement, { route = '/', path = '*' } = {}) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/transfers" element={<p>transfers page</p>} />
          <Route path="/transfers/confirmation/:conf" element={<p>confirmation page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (body: unknown) => { status: number; body: unknown };

/** Minimal fetch stub keyed by "METHOD path". */
export function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${String(input)}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unmocked request ${key}`);
    const { status, body } = handler(init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const ME: MeResponse = {
  customerId: 100042,
  userId: 'demo.user',
  firstName: 'Jordan',
  lastName: 'Rivera',
  displayName: 'Jordan Rivera',
  tierCode: '10',
  tierLabel: 'Preferred Rewards Gold',
  tierOptions: [
    { code: '00', label: 'Standard' },
    { code: '10', label: 'Preferred Rewards Gold' },
    { code: '20', label: 'Preferred Rewards Platinum' },
    { code: '30', label: 'Preferred Rewards Platinum Honors' },
  ],
  frequencyOptions: [
    { code: 'O', label: 'One time' },
    { code: 'W', label: 'Weekly' },
    { code: 'M', label: 'Monthly' },
  ],
  deliveryOptions: [
    { code: 'EXS', label: '3 business days (no fee)' },
    { code: 'EXN', label: 'Next business day' },
  ],
  sessionTimeoutSeconds: 600,
};

const acct = (id: string, name: string, cents: number, external = false): AccountResponse => ({
  accountId: id, typeCode: external ? 'EXT' : 'DDA', productName: name, last4: id.slice(-4), displayName: name,
  external, savings: false, seqNo: 1, statusCode: 'A', currentBalanceCents: cents, currentBalance: `$${(cents / 100).toFixed(2)}`,
  availableBalanceCents: cents, availableBalance: `$${(cents / 100).toFixed(2)}`,
});

export const ACCOUNTS: AccountResponse[] = [
  acct('ACCT-1001', 'Advantage Plus Banking - Checking ...1001', 421538),
  acct('ACCT-1002', 'Advantage Savings ...1002', 1294000),
  acct('ACCT-1003', 'JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432', 0, true),
];
