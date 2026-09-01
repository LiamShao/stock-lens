'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiClient, ApiClientError } from '@/lib/api-client';
import { SessionProvider } from '@/session/session-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [apiClient] = useState(() => new ApiClient());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) =>
              !(error instanceof ApiClientError && error.status === 401) &&
              failureCount < 1,
            staleTime: 15_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider apiClient={apiClient}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
