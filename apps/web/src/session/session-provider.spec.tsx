import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/lib/api-client';

import { SessionProvider, useSession } from './session-provider';

const user = {
  displayName: 'Demo User',
  email: 'demo@example.com',
  id: '957b9739-0c35-4ed5-aef8-34ba366daa3f',
  isDemo: true,
};

describe('SessionProvider VIEW-AC-014', () => {
  it('recovers a browser reload from the HttpOnly refresh cookie', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'rotated-token', expiresIn: 900, user }),
      );

    renderWithSession(fetchMock, <SessionProbe />);

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('authenticated')).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/auth/refresh',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('becomes unauthenticated and clears protected query data after refresh failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401, 'REFRESH_TOKEN_INVALID'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['private'], { token: 'must-clear' });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider
          apiClient={
            new ApiClient({ baseUrl: 'http://api.test/api', fetch: fetchMock })
          }
        >
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('unauthenticated')).toBeInTheDocument();
    await waitFor(() =>
      expect(queryClient.getQueryData(['private'])).toBeUndefined(),
    );
  });
});

function SessionProbe() {
  const session = useSession();
  return (
    <div>
      <span>{session.status}</span>
      <span>{session.user?.email}</span>
    </div>
  );
}

function renderWithSession(fetchMock: typeof fetch, children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider
        apiClient={
          new ApiClient({ baseUrl: 'http://api.test/api', fetch: fetchMock })
        }
      >
        {children}
      </SessionProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse(
    { code, details: {}, message: 'sanitized', requestId: 'request-id' },
    status,
  );
}
