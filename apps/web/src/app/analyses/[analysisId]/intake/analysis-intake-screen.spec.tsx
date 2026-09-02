import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/lib/api-client';
import { SessionProvider } from '@/session/session-provider';

import { AnalysisIntakeScreen } from './analysis-intake-screen';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const analysisId = '8d445ae8-d886-4ee3-a250-fd56cc10597b';
const uploadId = 'd2d9c68a-3e7b-4d80-a085-196ce9b8d745';
const documentId = 'a9cf30dc-e359-4460-9c7c-a3ad47f93e20';
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
  id: analysisId,
  status: 'DRAFT',
  title: '任天堂 決算分析',
  updatedAt: '2026-09-01T01:00:00.000Z',
};
const documentResource = {
  analysisId,
  createdAt: '2026-09-01T00:00:00.000Z',
  documentType: 'EARNINGS_SUMMARY',
  id: documentId,
  mimeType: 'application/pdf',
  originalName: '決算短信.pdf',
  sha256: 'a'.repeat(64),
  sizeBytes: 20,
  updatedAt: '2026-09-01T00:00:00.000Z',
  uploadedAt: '2026-09-01T00:00:00.000Z',
};

describe('AnalysisIntakeScreen INTAKE-AC-003..011/014', () => {
  beforeEach(() => {
    replace.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads a valid PDF with no credentials and starts processing only after explicit click', async () => {
    let documents: (typeof documentResource)[] = [];
    let processCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (url.endsWith(`/analyses/${analysisId}`) && method === 'GET') {
        return jsonResponse(
          documents.length ? { ...analysis, status: 'UPLOADED' } : analysis,
        );
      }
      if (
        url.endsWith(`/analyses/${analysisId}/documents`) &&
        method === 'GET'
      ) {
        return jsonResponse({ items: documents });
      }
      if (url.endsWith(`/analyses/${analysisId}/document-uploads`)) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          mimeType: 'application/pdf',
          originalName: '決算短信.pdf',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        return jsonResponse(
          {
            upload: presignedUpload(),
            uploadSession: {
              analysisId,
              createdAt: '2026-09-01T00:00:00.000Z',
              documentType: body.documentType,
              expiresAt: '2026-09-02T00:00:00.000Z',
              id: uploadId,
              mimeType: 'application/pdf',
              originalName: body.originalName,
              sha256: body.sha256,
              sizeBytes: body.sizeBytes,
              status: 'PENDING',
            },
          },
          201,
        );
      }
      if (url.startsWith('https://storage.example.test/upload')) {
        expect(init).toEqual(
          expect.objectContaining({
            cache: 'no-store',
            credentials: 'omit',
            method: 'PUT',
            redirect: 'error',
          }),
        );
        expect(new Headers(init?.headers).has('authorization')).toBe(false);
        return new Response(null);
      }
      if (url.endsWith(`/document-uploads/${uploadId}/finalize`)) {
        documents = [documentResource];
        return jsonResponse(documentResource);
      }
      if (url.endsWith(`/analyses/${analysisId}/process`)) {
        processCalls += 1;
        return jsonResponse(
          {
            acceptedAt: '2026-09-01T00:02:00.000Z',
            analysisId,
            executionId: '776ca16d-7bf0-4c18-85db-d357025f20ce',
            status: 'PARSING',
          },
          202,
        );
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithSession(
      fetchMock,
      <AnalysisIntakeScreen analysisId={analysisId} />,
    );

    expect(
      await screen.findByRole('heading', { name: 'PDFを追加して分析を開始' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'このPDFで分析を開始' }),
    ).toBeDisabled();
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [pdfFile()] },
    });

    fireEvent.click(
      await screen.findByRole('button', {
        name: '選択したPDF 1件をアップロード',
      }),
    );

    const startButton = screen.getByRole('button', {
      name: 'このPDFで分析を開始',
    });
    await waitFor(() => expect(startButton).toBeEnabled());
    expect(processCalls).toBe(0);
    fireEvent.click(startButton);

    await waitFor(() => expect(processCalls).toBe(1));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/analyses/${analysisId}`),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('rejects four files before creating an upload session', async () => {
    const fetchMock = baseFetch([]);
    const { container } = renderWithSession(
      fetchMock,
      <AnalysisIntakeScreen analysisId={analysisId} />,
    );
    await screen.findByRole('heading', { name: 'PDFファイル' });
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [
          pdfFile('1.pdf'),
          pdfFile('2.pdf'),
          pdfFile('3.pdf'),
          pdfFile('4.pdf'),
        ],
      },
    });

    expect(
      await screen.findByRole('alert', {
        name: '',
      }),
    ).toHaveTextContent('PDFは一度に1〜3件選択してください。');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/document-uploads'),
      ),
    ).toBe(false);
  });

  it('keeps a parallel success while exposing only the failed file for retry or removal', async () => {
    let documents: (typeof documentResource)[] = [];
    const successfulDocument = {
      ...documentResource,
      originalName: 'success.pdf',
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (url.endsWith(`/analyses/${analysisId}`) && method === 'GET') {
        return jsonResponse(
          documents.length ? { ...analysis, status: 'UPLOADED' } : analysis,
        );
      }
      if (
        url.endsWith(`/analyses/${analysisId}/documents`) &&
        method === 'GET'
      ) {
        return jsonResponse({ items: documents });
      }
      if (url.endsWith(`/analyses/${analysisId}/document-uploads`)) {
        const body = JSON.parse(String(init?.body));
        if (body.originalName === 'failed.pdf') {
          return errorResponse(503, 'DOCUMENT_UPLOAD_UNAVAILABLE');
        }
        return jsonResponse(
          {
            upload: presignedUpload(),
            uploadSession: {
              analysisId,
              createdAt: '2026-09-01T00:00:00.000Z',
              documentType: body.documentType,
              expiresAt: '2026-09-02T00:00:00.000Z',
              id: uploadId,
              mimeType: 'application/pdf',
              originalName: body.originalName,
              sha256: body.sha256,
              sizeBytes: body.sizeBytes,
              status: 'PENDING',
            },
          },
          201,
        );
      }
      if (url.startsWith('https://storage.example.test/upload')) {
        return new Response(null);
      }
      if (url.endsWith(`/document-uploads/${uploadId}/finalize`)) {
        documents = [successfulDocument];
        return jsonResponse(successfulDocument);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderWithSession(
      fetchMock,
      <AnalysisIntakeScreen analysisId={analysisId} />,
    );
    await screen.findByRole('heading', { name: 'PDFファイル' });
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [pdfFile('success.pdf'), pdfFile('failed.pdf')] },
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: '選択したPDF 2件をアップロード',
      }),
    );

    expect(await screen.findByText('success.pdf')).toBeInTheDocument();
    expect(
      await screen.findByText(
        '通信に失敗しました。時間をおいて再度お試しください。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'このPDFで分析を開始' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: '選択したPDF 1件をアップロード',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '選択解除' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'このPDFで分析を開始' }),
      ).toBeEnabled(),
    );
  });

  it('restores finalized documents, deletes explicitly, and deletes the draft after confirmation', async () => {
    let documents = [documentResource];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return authResponse();
      if (url.endsWith(`/analyses/${analysisId}`) && method === 'GET') {
        return jsonResponse({ ...analysis, status: 'UPLOADED' });
      }
      if (
        url.endsWith(`/analyses/${analysisId}/documents`) &&
        method === 'GET'
      ) {
        return jsonResponse({ items: documents });
      }
      if (url.endsWith(`/documents/${documentId}`) && method === 'DELETE') {
        documents = [];
        return new Response(null, { status: 204 });
      }
      if (url.endsWith(`/analyses/${analysisId}`) && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    renderWithSession(
      fetchMock,
      <AnalysisIntakeScreen analysisId={analysisId} />,
    );

    expect(await screen.findByText('決算短信.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDFを削除' }));
    await waitFor(() =>
      expect(screen.getByText('まだPDFはありません。')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'この分析を削除' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/analyses'));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

function renderWithSession(fetchMock: typeof fetch, children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
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

function baseFetch(documents: (typeof documentResource)[]) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/refresh')) return authResponse();
    if (url.endsWith(`/analyses/${analysisId}`)) return jsonResponse(analysis);
    if (url.endsWith(`/analyses/${analysisId}/documents`)) {
      return jsonResponse({ items: documents });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

function pdfFile(name = '決算短信.pdf'): File {
  return new File(['%PDF-1.7\nfixture-data'], name, {
    type: 'application/pdf',
  });
}

function presignedUpload() {
  return {
    expiresAt: '2026-09-01T00:05:00.000Z',
    headers: { 'content-type': 'application/pdf' },
    url: 'https://storage.example.test/upload?signature=secret',
  };
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
