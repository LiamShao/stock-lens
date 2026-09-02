import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/lib/api-client';
import { SessionProvider } from '@/session/session-provider';
import { createAnalysisViewsFixture } from '@/test/analysis-views-fixture';

import { AnalysisDetailScreen } from './analyses/[analysisId]/analysis-detail-screen';
import { AnalysisHistoryScreen } from './analyses/analysis-history-screen';
import { NewAnalysisScreen } from './analyses/new/new-analysis-screen';
import { LoginScreen } from './login/login-screen';
import { RegisterScreen } from './register/register-screen';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const user = {
  displayName: 'Demo User',
  email: 'demo@example.com',
  id: '957b9739-0c35-4ed5-aef8-34ba366daa3f',
  isDemo: true,
};

const analysis = {
  companyId: null,
  completedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  failureCode: null,
  failureMessage: null,
  id: '8d445ae8-d886-4ee3-a250-fd56cc10597b',
  status: 'PARSING',
  title: '任天堂 決算分析',
  updatedAt: '2026-09-01T01:00:00.000Z',
};

describe('VIEW-TASK-008/009 browser shells', () => {
  beforeEach(() => replace.mockReset());

  it('logs in through the shared form contract and routes to owner history', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return errorResponse(401, 'REFRESH_TOKEN_INVALID');
      }
      if (url.endsWith('/auth/login')) {
        expect(init).toEqual(
          expect.objectContaining({ credentials: 'include', method: 'POST' }),
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'demo@example.com',
          password: 'correct horse battery staple',
        });
        return jsonResponse({
          accessToken: 'login-token',
          expiresIn: 900,
          user,
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(fetchMock, <LoginScreen />);

    expect(
      await screen.findByRole('heading', { name: 'ログイン' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: '  DEMO@EXAMPLE.COM ' },
    });
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/analyses'));
  });

  it('INTAKE-AC-001 registers an account, omits a blank display name, and routes to history', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return errorResponse(401, 'REFRESH_TOKEN_INVALID');
      }
      if (url.endsWith('/auth/register')) {
        expect(init).toEqual(
          expect.objectContaining({ credentials: 'include', method: 'POST' }),
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'new@example.com',
          password: 'correct horse battery staple',
        });
        return jsonResponse(
          {
            accessToken: 'register-token',
            expiresIn: 900,
            user: { ...user, email: 'new@example.com', isDemo: false },
          },
          201,
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(fetchMock, <RegisterScreen />);

    expect(
      await screen.findByRole('heading', { name: 'アカウントを作成' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: ' NEW@EXAMPLE.COM ' },
    });
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/analyses'));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('INTAKE-AC-002 creates a title-only draft and routes to its intake flow', async () => {
    const draft = { ...analysis, status: 'DRAFT', title: '任天堂 新規分析' };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (new URL(url).pathname.endsWith('/analyses')) {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer memory-token',
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          companyId: null,
          title: '任天堂 新規分析',
        });
        return jsonResponse(draft, 201);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(fetchMock, <NewAnalysisScreen />);

    expect(
      await screen.findByRole('heading', { name: '新しい分析' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('分析名'), {
      target: { value: '  任天堂 新規分析  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'PDF追加へ進む' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/analyses/${analysis.id}/intake`),
    );
  });

  it('renders owner history and logs out with the refresh cookie', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (new URL(url).pathname.endsWith('/analyses')) {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer memory-token',
        );
        return jsonResponse({ items: [analysis], nextCursor: null });
      }
      if (url.endsWith('/auth/logout')) {
        expect(init).toEqual(
          expect.objectContaining({ credentials: 'include', method: 'POST' }),
        );
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(fetchMock, <AnalysisHistoryScreen />);

    expect(
      await screen.findByRole('heading', { name: analysis.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('PDFを解析中')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('renders the detail metadata shell without fetching incomplete views', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (url.endsWith(`/analyses/${analysis.id}`)) {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer memory-token',
        );
        return jsonResponse(analysis);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(
      fetchMock,
      <AnalysisDetailScreen analysisId={analysis.id} />,
    );

    expect(
      await screen.findByRole('heading', { name: analysis.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '分析を準備しています' }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/views')),
    ).toBe(false);
  });

  it('fetches and renders strict views only after metadata reaches COMPLETED', async () => {
    const completedAnalysis = {
      ...analysis,
      completedAt: '2026-09-01T02:00:00.000Z',
      status: 'COMPLETED',
    };
    const resource = createAnalysisViewsFixture();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (url.endsWith(`/analyses/${analysis.id}`)) {
        return jsonResponse(completedAnalysis);
      }
      if (url.endsWith(`/analyses/${analysis.id}/views`)) {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer memory-token',
        );
        return jsonResponse(resource);
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    renderWithSession(
      fetchMock,
      <AnalysisDetailScreen analysisId={analysis.id} />,
    );

    expect(
      await screen.findByRole('heading', { name: '会社の稼ぎ方' }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith('/views')),
    ).toBe(true);
  });
});

function renderWithSession(fetchMock: typeof fetch, children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
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

function authResponse(): Response {
  return jsonResponse({ accessToken: 'memory-token', expiresIn: 900, user });
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
