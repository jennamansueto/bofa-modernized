import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TransferRequest } from '@/api/types';
import { ACCOUNTS, ME, mockFetch, renderWithProviders } from '@/test/utils';
import { TransferPanel } from './TransferPanel';

const SAME = 'The From and To accounts must be different.';
const NSF = 'The amount plus any fee exceeds the available balance in your From account.';

function quoteFor(b: TransferRequest) {
  if (b.fromAccountId === b.toAccountId) return { status: 422, body: { ok: false, status: 422, code: 'XFR_SAMEACCT', message: SAME } };
  const ext = b.toAccountId === 'ACCT-1003';
  const exn = ext && b.delivery === 'EXN' && b.tierCode === '00';
  return {
    status: 200,
    body: {
      ok: true, from: b.fromAccountId, to: b.toAccountId, amount: `$${b.amount}.00`,
      fee: exn ? '$3.00' : 'No fee', total: exn ? `$${Number(b.amount) + 3}.00` : `$${b.amount}.00`,
      type: ext ? (b.delivery === 'EXN' ? 'Next business day' : '3 business days (no fee)') : 'Between your Bank of America accounts',
      tier: ME.tierOptions.find((t) => t.code === b.tierCode)?.label, delivery: ext ? 'Tue, Oct 13, 2026' : 'Fri, Oct 9, 2026',
    },
  };
}

const summaryRow = (label: string) =>
  within(screen.getByRole('table', { name: 'Transfer summary' })).getByRole('rowheader', { name: label }).closest('tr')!;

describe('TransferPanel', () => {
  it('AC-11/AC-41 prices the default draft and re-quotes on change', async () => {
    const fetch = mockFetch({ 'POST /api/secure/transfers/quote': (b) => quoteFor(b as TransferRequest) });
    renderWithProviders(<TransferPanel me={ME} accounts={ACCOUNTS} />);
    expect(screen.getByLabelText('From')).toHaveValue('ACCT-1001');
    expect(screen.getByLabelText('To')).toHaveValue('ACCT-1002');
    expect(screen.getByLabelText('Amount')).toHaveValue('500');
    expect(screen.getByLabelText('Relationship tier')).toHaveValue('10');
    expect(screen.queryByLabelText('Delivery')).not.toBeInTheDocument();
    await waitFor(() => expect(summaryRow('Transfer type')).toHaveTextContent('Between your Bank of America accounts'));

    await userEvent.selectOptions(screen.getByLabelText('To'), 'ACCT-1003');
    await userEvent.selectOptions(screen.getByLabelText('Relationship tier'), '00');
    await userEvent.selectOptions(await screen.findByLabelText('Delivery'), 'EXN');
    await waitFor(() => expect(summaryRow('Fee')).toHaveTextContent('$3.00'));
    expect(summaryRow('Total debit')).toHaveTextContent('$503.00');
    expect(summaryRow('Delivery date')).toHaveTextContent('Tue, Oct 13, 2026');
    // debounced: three quick changes should not produce three extra requests
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('AC-41 shows the server validation message and keeps the stale summary', async () => {
    mockFetch({ 'POST /api/secure/transfers/quote': (b) => quoteFor(b as TransferRequest) });
    renderWithProviders(<TransferPanel me={ME} accounts={ACCOUNTS} />);
    await waitFor(() => expect(summaryRow('Total debit')).toHaveTextContent('$500.00'));
    await userEvent.selectOptions(screen.getByLabelText('To'), 'ACCT-1001');
    await waitFor(() => expect(screen.getByTestId('quote-error')).toHaveTextContent(SAME));
    expect(summaryRow('Total debit')).toHaveTextContent('$500.00');
    expect(screen.getByLabelText('To')).toHaveAttribute('aria-invalid', 'true');
  });

  it('AC-40 renders a failed submit inline as an alert with the exact message', async () => {
    mockFetch({
      'POST /api/secure/transfers/quote': (b) => quoteFor(b as TransferRequest),
      'POST /api/secure/transfers': () => ({ status: 422, body: { ok: false, status: 422, code: 'XFR_NSF', message: NSF } }),
    });
    renderWithProviders(<TransferPanel me={ME} accounts={ACCOUNTS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Transfer now' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(NSF);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Amount')).toHaveValue('500');
  });

  it('AC-39 navigates to the confirmation on success', async () => {
    mockFetch({
      'POST /api/secure/transfers/quote': (b) => quoteFor(b as TransferRequest),
      'POST /api/secure/transfers': () => ({ status: 201, body: { confirmationNumber: 'XFR261009-000001', accounts: ACCOUNTS } }),
    });
    renderWithProviders(<TransferPanel me={ME} accounts={ACCOUNTS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Transfer now' }));
    expect(await screen.findByText('confirmation page')).toBeInTheDocument();
  });
});
