import { apiFetch, postJson } from './client';
import type { AccountResponse, LoginRequest, MeResponse, QuoteResponse, TransferRequest, TransferResponse } from './types';

export const olbApi = {
  login: (body: LoginRequest) => postJson<MeResponse>('/api/login', body),
  logout: () => apiFetch<void>('/api/logout', { method: 'POST' }),
  me: () => apiFetch<MeResponse>('/api/secure/me'),
  accounts: () => apiFetch<AccountResponse[]>('/api/secure/accounts'),
  history: () => apiFetch<TransferResponse[]>('/api/secure/transfers'),
  byConfirmation: (conf: string) => apiFetch<TransferResponse>(`/api/secure/transfers/${encodeURIComponent(conf)}`),
  quote: (body: TransferRequest, signal?: AbortSignal) =>
    apiFetch<QuoteResponse>('/api/secure/transfers/quote', { method: 'POST', body: JSON.stringify(body), signal }),
  submit: (body: TransferRequest) => postJson<TransferResponse>('/api/secure/transfers', body),
};

export const queryKeys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  history: ['history'] as const,
  transfer: (conf: string) => ['transfer', conf] as const,
  quote: (body: TransferRequest) => ['quote', body] as const,
};
