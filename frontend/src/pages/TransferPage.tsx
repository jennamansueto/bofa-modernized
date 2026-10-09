import { useOutletContext } from 'react-router-dom';
import type { MeResponse } from '@/api/types';
import { useAccounts, useRecentTransfers } from '@/api/hooks';
import { AccountCardList } from '@/components/ui/AccountCard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { ActivityTable } from '@/features/transfer/ActivityTable';
import { TransferPanel } from '@/features/transfer/TransferPanel';
import { TITLES } from '@/lib/messages';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function TransferPage() {
  useDocumentTitle(TITLES.transfer);
  const me = useOutletContext<MeResponse>();
  const accounts = useAccounts();
  const history = useRecentTransfers();
  if (accounts.error) throw accounts.error;
  if (history.error) throw history.error;

  return (
    <>
      <section className="hero olbhero" aria-labelledby="page-title">
        <div className="inner olbhero-inner">
          <div className="olbhero-copy">
            <p className="kicker">Online Banking · Transfers</p>
            <h1 id="page-title">Transfer Money</h1>
            <p className="olbhero-lead">Move money between your accounts or to someone else — schedule one-time or recurring transfers.</p>
          </div>
          <div className="illus" aria-hidden="true">
            <img src="/images/calendar.png" alt="" width={460} height={300} />
          </div>
        </div>
      </section>
      <Breadcrumb items={[{ label: 'Home', to: '/transfers' }, { label: 'Accounts', to: '/transfers' }]} current="Transfer Money" />
      <div className="inner two-col">
        <section className="col-info" aria-labelledby="intro-h">
          <h2 id="intro-h" className="section-h">It&rsquo;s easy to transfer funds</h2>
          <p className="lead">
            Move money between your Bank of America accounts or to an external account. You can schedule transfers, set up recurring transfers, or make Bank of America payments.
          </p>
          <ul className="dash">
            <li>Transfers between your accounts post the same day.</li>
            <li>Schedule transfers or set up recurring transfers.</li>
            <li>Your savings preferences stay with your account.</li>
          </ul>
          <h3 id="accts-h" className="visually-hidden">Your accounts</h3>
          {accounts.data ? <AccountCardList accounts={accounts.data} labelledBy="accts-h" /> : <div className="skeleton" aria-busy="true" />}
          {history.data && <ActivityTable rows={history.data} />}
        </section>
        <div className="col-task">
          {accounts.data ? <TransferPanel me={me} accounts={accounts.data} /> : <div className="panel skeleton" aria-busy="true" />}
        </div>
      </div>
    </>
  );
}
