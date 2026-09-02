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

  it('INTAKE-AC-001 registers, normalizes input, and applies the memory session', async () => {
    const states: Array<string | null> = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'register-token', expiresIn: 900, user }),
      );
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });
    client.subscribe((state) => states.push(state?.user.id ?? null));

    await client.registerUser({
      displayName: '  Demo User  ',
      email: '  DEMO@EXAMPLE.COM ',
      password: 'correct horse battery staple',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/auth/register',
      expect.objectContaining({
        body: JSON.stringify({
          displayName: 'Demo User',
          email: 'demo@example.com',
          password: 'correct horse battery staple',
        }),
        credentials: 'include',
        method: 'POST',
      }),
    );
    expect(states).toEqual([user.id]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('INTAKE-FR-002..009 uses strict authenticated write and document contracts', async () => {
    const analysisId = '8d445ae8-d886-4ee3-a250-fd56cc10597b';
    const uploadId = 'd2d9c68a-3e7b-4d80-a085-196ce9b8d745';
    const documentId = 'a9cf30dc-e359-4460-9c7c-a3ad47f93e20';
    const analysis = {
      ...analysisPage.items[0],
      id: analysisId,
      status: 'DRAFT',
      title: '決算分析',
    };
    const upload = {
      expiresAt: '2026-09-01T00:05:00.000Z',
      headers: { 'content-type': 'application/pdf' },
      url: 'https://storage.example.test/upload?signature=secret',
    };
    const uploadSession = {
      analysisId,
      createdAt: '2026-09-01T00:00:00.000Z',
      documentType: 'EARNINGS_SUMMARY',
      expiresAt: '2026-09-02T00:00:00.000Z',
      id: uploadId,
      mimeType: 'application/pdf',
      originalName: '決算短信.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 128,
      status: 'PENDING',
    };
    const document = {
      analysisId,
      createdAt: '2026-09-01T00:00:00.000Z',
      documentType: 'EARNINGS_SUMMARY',
      id: documentId,
      mimeType: 'application/pdf',
      originalName: '決算短信.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 128,
      updatedAt: '2026-09-01T00:00:00.000Z',
      uploadedAt: '2026-09-01T00:00:00.000Z',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'memory-token', expiresIn: 900, user }),
      )
      .mockResolvedValueOnce(jsonResponse(analysis, 201))
      .mockResolvedValueOnce(jsonResponse({ upload, uploadSession }, 201))
      .mockResolvedValueOnce(jsonResponse(upload))
      .mockResolvedValueOnce(jsonResponse(document))
      .mockResolvedValueOnce(jsonResponse({ items: [document] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            acceptedAt: '2026-09-01T00:00:01.000Z',
            analysisId,
            executionId: '776ca16d-7bf0-4c18-85db-d357025f20ce',
            status: 'PARSING',
          },
          202,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new ApiClient({
      baseUrl: 'http://api.test/api',
      fetch: fetchMock,
    });
    await client.refreshSession();

    await expect(
      client.createAnalysis({ companyId: null, title: ' 決算分析 ' }),
    ).resolves.toMatchObject({ id: analysisId, title: '決算分析' });
    await client.startDocumentUpload(analysisId, {
      documentType: 'EARNINGS_SUMMARY',
      mimeType: 'application/pdf',
      originalName: '決算短信.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 128,
    });
    await client.reissueDocumentUploadUrl(analysisId, uploadId);
    await client.finalizeDocumentUpload(analysisId, uploadId);
    await expect(client.listDocuments(analysisId)).resolves.toMatchObject({
      items: [{ id: documentId }],
    });
    await client.deleteDocument(analysisId, documentId);
    await client.processAnalysis(analysisId);
    await client.deleteAnalysis(analysisId);

    expect(
      fetchMock.mock.calls
        .slice(1)
        .map(([input, init]) => [
          String(input),
          init?.method,
          new Headers(init?.headers).get('authorization'),
        ]),
    ).toEqual([
      ['http://api.test/api/analyses', 'POST', 'Bearer memory-token'],
      [
        `http://api.test/api/analyses/${analysisId}/document-uploads`,
        'POST',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}/document-uploads/${uploadId}/presign`,
        'POST',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}/document-uploads/${uploadId}/finalize`,
        'POST',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}/documents`,
        'GET',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}/documents/${documentId}`,
        'DELETE',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}/process`,
        'POST',
        'Bearer memory-token',
      ],
      [
        `http://api.test/api/analyses/${analysisId}`,
        'DELETE',
        'Bearer memory-token',
      ],
    ]);
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
