import type { AccountResponse, MeResponse } from '@/api/types';

export interface TransferDraft {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  tierCode: string;
  delivery: string;
  frequency: string;
  scheduledDate: string;
  memo: string;
}

const KEY = 'olb.transferDraft';

/** Legacy TransferForm is session-scoped (AC-13): keep the draft for the browser session. */
export function loadDraft(userId: string): TransferDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; draft: TransferDraft };
    return parsed.userId === userId ? parsed.draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: TransferDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ userId, draft }));
  } catch {
    /* storage unavailable */
  }
}

export function clearDraftStorage() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Defaults mirror TransferViewAction (AC-11): first/second internal account, amount "500", customer's tier, EXS, One time. */
export function defaultDraft(me: MeResponse, accounts: AccountResponse[]): TransferDraft {
  const internal = accounts.filter((a) => !a.external);
  return {
    fromAccountId: internal[0]?.accountId ?? '',
    toAccountId: internal[1]?.accountId ?? '',
    amount: '500',
    tierCode: me.tierCode,
    delivery: 'EXS',
    frequency: 'O',
    scheduledDate: '',
    memo: '',
  };
}

/** After a successful submit legacy clears amount, memo and date but keeps accounts/tier/delivery/frequency. */
export function afterSubmit(d: TransferDraft): TransferDraft {
  return { ...d, amount: '', memo: '', scheduledDate: '' };
}
