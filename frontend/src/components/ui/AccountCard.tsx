import type { AccountResponse } from '@/api/types';

export function AccountCard({ account }: { account: AccountResponse }) {
  const showAvailable = account.availableBalanceCents !== account.currentBalanceCents;
  return (
    <li className="acct">
      <div className="acct-main">
        <div className="acct-nm">{account.displayName}</div>
        <div className="acct-id">{account.accountId}</div>
      </div>
      <div className="acct-bal-wrap">
        <div className="acct-bal"><span className="visually-hidden">Current balance </span>{account.currentBalance}</div>
        {showAvailable && <div className="acct-avl">Available {account.availableBalance}</div>}
      </div>
    </li>
  );
}

export function AccountCardList({ accounts, labelledBy }: { accounts: AccountResponse[]; labelledBy?: string }) {
  return (
    <ul className="acct-list" aria-labelledby={labelledBy}>
      {accounts.filter((a) => !a.external).map((a) => <AccountCard key={a.accountId} account={a} />)}
    </ul>
  );
}
