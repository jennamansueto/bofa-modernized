import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { olbApi } from '@/api/olb';
import type { QuoteResponse, TransferRequest } from '@/api/types';

export const QUOTE_DEBOUNCE_MS = 250;

export interface QuoteState {
  quote: QuoteResponse | null;
  error: ApiError | null;
  isFetching: boolean;
}

/**
 * Live Transfer Summary (doc 02 §7): re-price 250 ms after the last change, abort superseded requests,
 * keep the previous priced values on a validation error (legacy behaviour), ignore transport errors.
 */
export function useQuote(request: TransferRequest | null): QuoteState {
  const [state, setState] = useState<QuoteState>({ quote: null, error: null, isFetching: false });
  const key = request ? JSON.stringify(request) : '';
  const seq = useRef(0);

  useEffect(() => {
    if (!key) return;
    const body = JSON.parse(key) as TransferRequest;
    const id = ++seq.current;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, isFetching: true }));
      olbApi
        .quote(body, ctrl.signal)
        .then((quote) => {
          if (id === seq.current) setState({ quote, error: null, isFetching: false });
        })
        .catch((err: unknown) => {
          if (id !== seq.current || ctrl.signal.aborted) return;
          if (err instanceof ApiError && err.status === 422) {
            setState((s) => ({ quote: s.quote, error: err, isFetching: false }));
          } else {
            setState((s) => ({ ...s, isFetching: false }));
          }
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  return state;
}
