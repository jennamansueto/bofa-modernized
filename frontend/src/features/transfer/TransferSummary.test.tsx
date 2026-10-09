import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransferSummary } from './TransferSummary';

const VALUES = {
  from: 'Advantage Plus Banking - Checking ...1001',
  to: 'JPMorgan Chase Bank, N.A. - Chase Total Checking ...4432',
  amount: '$500.00',
  fee: '$3.00',
  type: 'Next business day',
  tier: 'Standard',
  delivery: 'Tue, Oct 13, 2026',
  total: '$503.00',
};

describe('TransferSummary', () => {
  it('AC-41 renders every summary row with the server display strings', () => {
    render(<TransferSummary values={VALUES} />);
    const table = screen.getByRole('table', { name: 'Transfer summary' });
    const row = (label: string) => within(table).getByRole('rowheader', { name: label }).closest('tr')!;
    expect(row('Fee')).toHaveTextContent('$3.00');
    expect(row('Transfer type')).toHaveTextContent('Next business day');
    expect(row('Delivery date')).toHaveTextContent('Tue, Oct 13, 2026');
    expect(row('Total debit')).toHaveTextContent('$503.00');
  });

  it('shows em-dash placeholders before the first quote', () => {
    render(<TransferSummary values={null} />);
    expect(screen.getAllByRole('cell').every((c) => c.textContent === '\u2014')).toBe(true);
  });

  it('marks stale values without clearing them', () => {
    render(<TransferSummary values={VALUES} stale />);
    expect(screen.getByTestId('transfer-summary')).toHaveClass('is-stale');
    expect(screen.getByText('$503.00')).toBeInTheDocument();
  });
});
