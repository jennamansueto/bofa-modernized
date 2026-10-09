// Verbatim legacy strings (docs/02-ui-spec.md §5). Server messages are always rendered as returned.
export const MSG = {
  sessionExpired: 'For your security, your session has ended due to inactivity. Please log in again.',
  confirmHeading: 'Your transfer has been submitted',
  confirmSameDay: 'Transfers between your Bank of America accounts post the same day.',
  confirmExternal: 'External transfers are sent via ACH and will arrive on the delivery date shown.',
  errorHeading: 'We\u2019re sorry, Online Banking is temporarily unavailable.',
  errorLead: 'Please try again in a few minutes. If you continue to see this message, call us at 800.432.1000.',
} as const;

export const TITLES = {
  landing: 'Bank of America - Banking, Credit Cards, Loans and Merrill Investing',
  transfer: 'Transfer Money - Bank of America Online Banking',
  confirm: 'Transfer Confirmation - Bank of America Online Banking',
  error: 'We\u2019re sorry - Bank of America Online Banking',
} as const;

export type TransferField = 'fromAccountId' | 'toAccountId' | 'amount' | 'tierCode' | 'frequency' | 'scheduledDate';

/** Which field an API validation code concerns, so it can be marked aria-invalid (doc 02 §12.7). */
export function fieldForCode(code: string | undefined): TransferField | undefined {
  switch (code) {
    case 'XFR_AMOUNT_REQUIRED':
    case 'XFR_AMOUNT_INVALID':
    case 'XFR_AMOUNT_MIN':
    case 'XFR_PERTXN':
    case 'XFR_DAILY':
    case 'XFR_NSF':
      return 'amount';
    case 'XFR_ACCT_INVALID':
    case 'XFR_REGD':
      return 'fromAccountId';
    case 'XFR_SAMEACCT':
    case 'XFR_EXT2EXT':
      return 'toAccountId';
    case 'XFR_TIER_INVALID':
      return 'tierCode';
    case 'XFR_FREQUENCY_INVALID':
      return 'frequency';
    case 'XFR_DATE_INVALID':
    case 'XFR_DATE_PAST':
      return 'scheduledDate';
    default:
      return undefined;
  }
}
