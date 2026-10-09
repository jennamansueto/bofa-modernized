import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
        refetchOnWindowFocus: false,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
}
