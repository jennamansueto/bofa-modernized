import { useEffect, useRef } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useAccounts, useTransfer } from '@/api/hooks';
import { AccountCardList } from '@/components/ui/AccountCard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { longDate, submittedStamp } from '@/lib/format';
import { MSG, TITLES } from '@/lib/messages';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function ConfirmationPage() {
  useDocumentTitle(TITLES.confirm);
  const { conf } = useParams();
  const transfer = useTransfer(conf);
  const accounts = useAccounts();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (transfer.data) headingRef.current?.focus();
  }, [transfer.data]);

  if (transfer.error) {
    // Legacy TransferConfirmAction: no such transfer → back to Transfer Money.
    if (transfer.error instanceof ApiError && transfer.error.status === 404) return <Navigate to="/transfers" replace />;
    throw transfer.error;
  }
  const t = transfer.data;
  const balances = accounts.data ?? t?.accounts;
  const note = t?.note ?? (t?.typeCode === 'INT' ? MSG.confirmSameDay : MSG.confirmExternal);

  return (
    <>
      <Breadcrumb
        items={[{ label: 'Home', to: '/transfers' }, { label: 'Accounts', to: '/transfers' }, { label: 'Transfer Money', to: '/transfers' }]}
        current="Confirmation"
      />
      <div className="inner two-col">
        <section className="confirm" aria-labelledby="confirm-h">
          {!t ? (
            <div className="skeleton" aria-busy="true" />
          ) : (
            <>
              <h1 id="confirm-h" className="confirm-h" ref={headingRef} tabIndex={-1}>
                <span className="check" aria-hidden="true">&#10003;</span>
                {t.heading ?? MSG.confirmHeading}
              </h1>
              <p className="confnbr">Confirmation number: <b>{t.confirmationNumber}</b></p>
              <table className="summary">
                <caption>Transfer details</caption>
                <tbody>
                  <tr><th scope="row">From</th><td>{t.from}</td></tr>
                  <tr><th scope="row">To</th><td>{t.to}</td></tr>
                  <tr><th scope="row">Amount</th><td>{t.amount}</td></tr>
                  <tr><th scope="row">Fee</th><td>{t.fee}</td></tr>
                  <tr><th scope="row">Transfer type</th><td>{t.type}</td></tr>
                  <tr><th scope="row">Relationship tier</th><td>{t.tier}</td></tr>
                  <tr><th scope="row">Frequency</th><td>{t.frequency}</td></tr>
                  <tr><th scope="row">Status</th><td className={`status-${t.statusCode}`}>{t.status}</td></tr>
                  <tr><th scope="row">{t.statusCode === 'P' ? 'Posted' : 'Delivery date'}</th><td>{longDate(t.postDate)}</td></tr>
                  {t.memo && <tr><th scope="row">Memo</th><td>{t.memo}</td></tr>}
                  <tr className="total"><th scope="row">Total debit</th><td>{t.total}</td></tr>
                </tbody>
              </table>
              <p className="confirm-note">
                {note} Submitted {submittedStamp(t.createdTs)} via Online Banking.
              </p>
              <div className="confirm-actions no-print">
                <Link to="/transfers" className="btn-secondary">Make another transfer</Link>
                <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
              </div>
            </>
          )}
        </section>
        <aside className="col-balances" aria-labelledby="updated-h">
          <h2 id="updated-h" className="balances-h">Updated balances</h2>
          {balances ? <AccountCardList accounts={balances} labelledBy="updated-h" /> : <div className="skeleton" aria-busy="true" />}
        </aside>
      </div>
    </>
  );
}
