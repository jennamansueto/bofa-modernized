const DASH = '\u2014';

export interface SummaryValues {
  from: string;
  to: string;
  amount: string;
  fee: string;
  type: string;
  tier: string;
  delivery: string;
  total: string;
}

interface Props {
  values: SummaryValues | null;
  stale?: boolean;
}

/** Legacy table.summary (§3.18). Values are the server's pre-formatted display strings. */
export function TransferSummary({ values, stale = false }: Props) {
  const v = (k: keyof SummaryValues) => values?.[k] ?? DASH;
  const rows: [string, keyof SummaryValues][] = [
    ['From', 'from'],
    ['To', 'to'],
    ['Amount', 'amount'],
    ['Fee', 'fee'],
    ['Transfer type', 'type'],
    ['Relationship tier', 'tier'],
    ['Delivery date', 'delivery'],
  ];
  return (
    <>
      <table className={`summary${stale ? ' is-stale' : ''}`} data-testid="transfer-summary">
        <caption>Transfer summary</caption>
        <tbody>
          {rows.map(([label, k]) => (
            <tr key={k}>
              <th scope="row">{label}</th>
              <td>{v(k)}</td>
            </tr>
          ))}
          <tr className="total">
            <th scope="row">Total debit</th>
            <td>{v('total')}</td>
          </tr>
        </tbody>
      </table>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {values ? `Fee ${values.fee}. Total debit ${values.total}. Delivery date ${values.delivery}.` : ''}
      </p>
    </>
  );
}
