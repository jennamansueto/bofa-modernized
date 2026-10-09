import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useSubmitTransfer } from '@/api/hooks';
import type { AccountResponse, MeResponse, TransferRequest } from '@/api/types';
import { AlertBox } from '@/components/ui/AlertBox';
import { fieldForCode, type TransferField } from '@/lib/messages';
import { afterSubmit, defaultDraft, loadDraft, saveDraft, type TransferDraft } from './draft';
import { TransferSummary } from './TransferSummary';
import { useQuote } from './useQuote';

interface Props {
  me: MeResponse;
  accounts: AccountResponse[];
}

function toRequest(d: TransferDraft): TransferRequest {
  return {
    fromAccountId: d.fromAccountId,
    toAccountId: d.toAccountId,
    amount: d.amount,
    tierCode: d.tierCode,
    delivery: d.delivery,
    frequency: d.frequency,
    ...(d.scheduledDate ? { scheduledDate: d.scheduledDate } : {}),
    ...(d.memo ? { memo: d.memo } : {}),
  };
}

export function TransferPanel({ me, accounts }: Props) {
  const [draft, setDraft] = useState<TransferDraft>(() => loadDraft(me.userId) ?? defaultDraft(me, accounts));
  const [schedOpen, setSchedOpen] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const submit = useSubmitTransfer();
  const uid = useId();
  const quoteErrId = `${uid}-quoteErr`;
  const submitErrId = `${uid}-submitErr`;

  useEffect(() => saveDraft(me.userId, draft), [me.userId, draft]);

  const request = useMemo(() => toRequest(draft), [draft]);
  const { quote, error: quoteError } = useQuote(request);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.accountId, a])), [accounts]);
  const isExternal = !!byId.get(draft.fromAccountId)?.external || !!byId.get(draft.toAccountId)?.external;

  const quoteField = fieldForCode(quoteError?.code);
  const submitField = fieldForCode(submitError?.code);
  const invalid = (f: TransferField) => quoteField === f || submitField === f;
  const describedBy = (f: TransferField, ...extra: string[]) => {
    const ids = [...extra];
    if (submitField === f) ids.push(submitErrId);
    if (quoteField === f) ids.push(quoteErrId);
    return ids.length ? ids.join(' ') : undefined;
  };

  useEffect(() => {
    if (submitField === 'scheduledDate' || submitField === 'frequency') setSchedOpen(true);
  }, [submitField]);

  const set = (field: keyof TransferDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return;
    submit.mutate(request, {
      onSuccess: (t) => {
        setSubmitError(null);
        const next = afterSubmit(draft);
        saveDraft(me.userId, next);
        navigate(`/transfers/confirmation/${encodeURIComponent(t.confirmationNumber)}`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.isUnauthorized) return;
        if (err instanceof ApiError && err.status < 500) {
          setSubmitError(err);
          requestAnimationFrame(() => alertRef.current?.focus());
        } else {
          throw err;
        }
      },
    });
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>Make a transfer</h2>
      <p className="sub">Choose the accounts and amount, then select Transfer now.</p>
      <AlertBox ref={alertRef} id={submitErrId} messages={submitError ? [submitError.message] : []} />
      <form onSubmit={onSubmit} noValidate aria-describedby={submitError ? submitErrId : undefined}>
        <div className="fld">
          <label htmlFor="fromAcctId">From</label>
          <select id="fromAcctId" name="fromAcctId" className="sel" value={draft.fromAccountId} onChange={set('fromAccountId')}
            aria-invalid={invalid('fromAccountId') || undefined} aria-describedby={describedBy('fromAccountId')}>
            {accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.displayName}</option>)}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="toAcctId">To</label>
          <select id="toAcctId" name="toAcctId" className="sel" value={draft.toAccountId} onChange={set('toAccountId')}
            aria-invalid={invalid('toAccountId') || undefined} aria-describedby={describedBy('toAccountId')}>
            {accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.displayName}</option>)}
          </select>
        </div>
        <div className="field-row">
          <div className="fld">
            <label htmlFor="amount">Amount</label>
            <input id="amount" name="amount" className="txt" type="text" inputMode="decimal" autoComplete="off" maxLength={16}
              value={draft.amount} onChange={set('amount')}
              aria-invalid={invalid('amount') || undefined} aria-describedby={describedBy('amount')} />
          </div>
          <div className="fld">
            <label htmlFor="tierCode">Relationship tier</label>
            <select id="tierCode" name="tierCode" className="sel" value={draft.tierCode} onChange={set('tierCode')}
              aria-invalid={invalid('tierCode') || undefined} aria-describedby={describedBy('tierCode')}>
              {me.tierOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {isExternal && (
          <div className="fld" id="deliveryRow">
            <label htmlFor="delivery">Delivery</label>
            <select id="delivery" name="delivery" className="sel" value={draft.delivery} onChange={set('delivery')}>
              {me.deliveryOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div className="schedlink">
          <button type="button" className="link-btn" aria-expanded={schedOpen} aria-controls="schedOpts" onClick={() => setSchedOpen((o) => !o)}>
            Schedule options
            <span className={`disclosure-icon${schedOpen ? ' open' : ''}`} aria-hidden="true" />
          </button>
        </div>
        <div id="schedOpts" className="sched" hidden={!schedOpen}>
          <div className="field-row">
            <div className="fld">
              <label htmlFor="scheduledDate">Send on (MM/DD/YYYY)</label>
              <input id="scheduledDate" name="scheduledDate" className="txt" type="text" inputMode="numeric" autoComplete="off"
                maxLength={10} placeholder="MM/DD/YYYY" value={draft.scheduledDate} onChange={set('scheduledDate')}
                aria-invalid={invalid('scheduledDate') || undefined} aria-describedby={describedBy('scheduledDate')} />
            </div>
            <div className="fld">
              <label htmlFor="frequency">Frequency</label>
              <select id="frequency" name="frequency" className="sel" value={draft.frequency} onChange={set('frequency')}
                aria-invalid={invalid('frequency') || undefined} aria-describedby={describedBy('frequency')}>
                {me.frequencyOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="fld">
            <label htmlFor="memo">Memo (optional)</label>
            <input id="memo" name="memo" className="txt" type="text" autoComplete="off" maxLength={60} value={draft.memo} onChange={set('memo')} />
          </div>
        </div>
        <button type="submit" className="btn-primary" aria-busy={submit.isPending || undefined} disabled={submit.isPending}>
          {submit.isPending ? 'Submitting\u2026' : 'Transfer now'}
        </button>
        <p id={quoteErrId} className="quote-err" aria-live="polite" data-testid="quote-error">
          {quoteError?.message ?? ''}
        </p>
      </form>
      <p className="note">Your transfer is submitted as soon as you select Transfer now.</p>
      <TransferSummary values={quote} stale={!!quoteError} />
    </section>
  );
}
