import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { olbApi, queryKeys } from './olb';
import type { LoginRequest, TransferRequest } from './types';

export function useMe(enabled = true) {
  return useQuery({ queryKey: queryKeys.me, queryFn: olbApi.me, enabled, staleTime: 60_000 });
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: olbApi.accounts });
}

export function useRecentTransfers() {
  return useQuery({ queryKey: queryKeys.history, queryFn: olbApi.history });
}

export function useTransfer(conf: string | undefined) {
  return useQuery({ queryKey: queryKeys.transfer(conf ?? ''), queryFn: () => olbApi.byConfirmation(conf!), enabled: !!conf });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => olbApi.login(body),
    onSuccess: (me) => {
      qc.clear();
      qc.setQueryData(queryKeys.me, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: olbApi.logout, onSettled: () => qc.clear() });
}

export function useSubmitTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TransferRequest) => olbApi.submit(body),
    onSuccess: (t) => {
      qc.setQueryData(queryKeys.transfer(t.confirmationNumber), t);
      if (t.accounts) qc.setQueryData(queryKeys.accounts, t.accounts);
      void qc.invalidateQueries({ queryKey: queryKeys.history });
      void qc.invalidateQueries({ queryKey: queryKeys.accounts });
    },
  });
}
