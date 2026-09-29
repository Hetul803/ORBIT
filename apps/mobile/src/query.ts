import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1_000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});
