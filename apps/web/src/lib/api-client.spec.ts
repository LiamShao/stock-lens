import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from './api-client';

const user = {
  displayName: 'Demo User',
  email: 'demo@example.com',
  id: '957b9739-0c35-4ed5-aef8-34ba366daa3f',
  isDemo: true,
};

const analysisPage = {
  items: [
    {
      companyId: null,
      completedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      failureCode: null,
      failureMessage: null,
      id: '8d445ae8-d886-4ee3-a250-fd56cc10597b',
      status: 'PARSING',
      title: 'テスト分析',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('ApiClient VIEW-AC-014', () => {
  it('keeps the access token in memory and always includes refresh credentials', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'memory-token', expiresIn: 900, user }),
      );
    const storageGet = vi.spyOn(Storage.prototype, 'getItem');
    const storageSet = vi.spyOn(Storage.prototype, 'setItem');
    const client = new ApiClient({
      baseUrl: 'http://api.test/api/',
      fetch: fetchMock,
    });

    await expect(client.refreshSession()).resolves.toMatchObject({ user });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/auth/refresh',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
      }),
    );
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('normalizes login input with the shared schema and does not persist the token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'login-token', expiresIn: 900, user }),
      );
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });

    await client.login({
      email: '  DEMO@EXAMPLE.COM ',
      password: 'correct horse battery staple',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'demo@example.com',
          password: 'correct horse battery staple',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    );
  });

  it('uses one single-flight rotation for concurrent 401 responses and replays each request once', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({
          accessToken: refreshCalls === 1 ? 'old-token' : 'new-token',
          expiresIn: 900,
          user,
        });
      }
      const authorization = new Headers(init?.headers).get('authorization');
      return authorization === 'Bearer new-token'
        ? jsonResponse(analysisPage)
        : errorResponse(401, 'ACCESS_TOKEN_INVALID');
    });
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });
    await client.refreshSession();

    const [first, second] = await Promise.all([
      client.listAnalyses(),
      client.listAnalyses(),
    ]);

    expect(first).toEqual(analysisPage);
    expect(second).toEqual(analysisPage);
    expect(refreshCalls).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/analyses'),
      ),
    ).toHaveLength(4);
  });

  it('clears memory auth when the one replay is also unauthorized', async () => {
    let refreshCalls = 0;
    const states: Array<string | null> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({
          accessToken: refreshCalls === 1 ? 'old-token' : 'new-token',
          expiresIn: 900,
          user,
        });
      }
      return errorResponse(401, 'ACCESS_TOKEN_INVALID');
    });
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });
    client.subscribe((state) => states.push(state?.user.id ?? null));
    await client.refreshSession();

    await expect(client.listAnalyses()).rejects.toMatchObject({
      code: 'ACCESS_TOKEN_INVALID',
      status: 401,
    });

    expect(refreshCalls).toBe(2);
    expect(states.at(-1)).toBeNull();
  });

  it('rejects malformed success payloads without exposing response content', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'raw-secret' }));
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });

    await expect(client.refreshSession()).rejects.toEqual(
      expect.objectContaining({
        code: 'INVALID_API_RESPONSE',
        message: '通信に失敗しました。時間をおいて再度お試しください。',
      }),
    );
  });

  it('VIEW-AC-013 requests an owner-scoped document URL without caching it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'memory-token', expiresIn: 900, user }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          expiresAt: '2026-09-01T00:05:00.000Z',
          url: 'https://storage.example.test/document.pdf?signature=secret',
        }),
      );
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });
    await client.refreshSession();

    await expect(
      client.createDocumentDownloadUrl(
        '8d445ae8-d886-4ee3-a250-fd56cc10597b',
        'a9cf30dc-e359-4460-9c7c-a3ad47f93e20',
      ),
    ).resolves.toMatchObject({ expiresAt: expect.any(String) });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://api.test/api/analyses/8d445ae8-d886-4ee3-a250-fd56cc10597b/documents/a9cf30dc-e359-4460-9c7c-a3ad47f93e20/download-url',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
        method: 'POST',
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse(
    {
      code,
      details: {},
      message: 'sanitized',
      requestId: 'request-id',
    },
    status,
  );
}
