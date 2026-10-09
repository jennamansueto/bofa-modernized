import type { TransferResponse } from '@/api/types';
import { monthDay, shortDate } from '@/lib/format';

export function ActivityTable({ rows }: { rows: TransferResponse[] }) {
  return (
    <table className="activity">
      <caption>Recent transfers</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Confirmation</th>
          <th scope="col">From</th>
          <th scope="col">To</th>
          <th scope="col">Status</th>
          <th scope="col" className="amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.confirmationNumber}>
            <td data-label="Date">{shortDate(t.scheduledDate)}</td>
            <td data-label="Confirmation" className="conf">{t.confirmationNumber}</td>
            <td data-label="From">{t.from}</td>
            <td data-label="To">{t.to}</td>
            <td data-label="Status" className={`status-${t.statusCode}`}>
              <span>
                {t.status}
                {t.statusCode === 'S' && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="visually-hidden">, expected </span>
                    {monthDay(t.postDate)}
                  </>
                )}
              </span>
            </td>
            <td data-label="Amount" className="amt">
              <span>
                {t.amount}
                {t.feeCents > 0 && <span className="fee-note">+ {t.fee} fee</span>}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
