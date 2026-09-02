import type {
  DocumentResource,
  PresignedPdfUploadResponse,
} from '@stocklens/shared';
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from './api-client';
import {
  calculatePdfSha256,
  PdfUploadError,
  putPdfObject,
  uploadPdfFile,
  validatePdfFile,
  validatePdfSelectionCount,
} from './pdf-upload';

const analysisId = '8d445ae8-d886-4ee3-a250-fd56cc10597b';
const uploadId = 'd2d9c68a-3e7b-4d80-a085-196ce9b8d745';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe('PDF upload browser boundary INTAKE-AC-003..005', () => {
  it('rejects invalid count, size, extension, MIME, and header before upload', async () => {
    expect(() => validatePdfSelectionCount(0)).toThrow(PdfUploadError);
    expect(() => validatePdfSelectionCount(4)).toThrow(
      'PDFは一度に1〜3件選択してください。',
    );
    await expect(validatePdfFile(pdfFile('', 'empty.pdf'))).rejects.toThrow(
      'PDFは1件20MB以下のファイルを選択してください。',
    );
    await expect(
      validatePdfFile(pdfFile('%PDF-test', 'report.txt')),
    ).rejects.toThrow('PDF形式のファイルを選択してください。');
    await expect(
      validatePdfFile(pdfFile('%PDF-test', 'report.pdf', 'text/plain')),
    ).rejects.toThrow('PDF形式のファイルを選択してください。');
    await expect(
      validatePdfFile(pdfFile('not-pdf', 'report.pdf')),
    ).rejects.toThrow('PDF形式のファイルを選択してください。');
  });

  it('validates a PDF and calculates a lowercase SHA-256 without storage', async () => {
    const file = pdfFile('%PDF-1.7\nfixture', '決算短信.PDF');

    await expect(validatePdfFile(file)).resolves.toBeUndefined();
    await expect(calculatePdfSha256(file)).resolves.toMatch(/^[a-f0-9]{64}$/);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('uses a credential-free one-shot PUT without redirects', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null));
    const file = pdfFile('%PDF-1.7\nfixture', 'report.pdf');
    const upload = presignedUpload('secret-one');

    await putPdfObject(file, upload, undefined, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      upload.url,
      expect.objectContaining({
        body: file,
        cache: 'no-store',
        credentials: 'omit',
        headers: upload.headers,
        method: 'PUT',
        redirect: 'error',
      }),
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('authorization'),
    ).toBe(false);
  });

  it('reissues once after PUT failure and finalizes the same upload session', async () => {
    const file = pdfFile('%PDF-1.7\nfixture', 'report.pdf');
    const document = documentResource();
    const api = {
      finalizeDocumentUpload: vi.fn().mockResolvedValue(document),
      reissueDocumentUploadUrl: vi
        .fn()
        .mockResolvedValue(presignedUpload('secret-two')),
      startDocumentUpload: vi.fn().mockResolvedValue({
        upload: presignedUpload('secret-one'),
        uploadSession: {
          analysisId,
          createdAt: '2026-09-01T00:00:00.000Z',
          documentType: 'EARNINGS_SUMMARY',
          expiresAt: '2026-09-02T00:00:00.000Z',
          id: uploadId,
          mimeType: 'application/pdf',
          originalName: file.name,
          sha256: 'a'.repeat(64),
          sizeBytes: file.size,
          status: 'PENDING',
        },
      }),
    } as unknown as ApiClient;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network details'))
      .mockResolvedValueOnce(new Response(null));
    const steps: string[] = [];

    await expect(
      uploadPdfFile({
        analysisId,
        apiClient: api,
        documentType: 'EARNINGS_SUMMARY',
        fetch: fetchMock,
        file,
        onStep: (step) => steps.push(step),
      }),
    ).resolves.toEqual(document);

    expect(steps).toEqual(['hashing', 'starting', 'uploading', 'finalizing']);
    expect(api.reissueDocumentUploadUrl).toHaveBeenCalledWith(
      analysisId,
      uploadId,
      undefined,
    );
    expect(api.finalizeDocumentUpload).toHaveBeenCalledWith(
      analysisId,
      uploadId,
      undefined,
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('secret-one'),
      expect.stringContaining('secret-two'),
    ]);
  });
});

function pdfFile(
  content: string,
  name: string,
  type = 'application/pdf',
): File {
  return new File([content], name, { type });
}

function presignedUpload(secret: string): PresignedPdfUploadResponse {
  return {
    expiresAt: '2026-09-01T00:05:00.000Z',
    headers: { 'content-type': 'application/pdf' },
    url: `https://storage.example.test/upload?signature=${secret}`,
  };
}

function documentResource(): DocumentResource {
  return {
    analysisId,
    createdAt: '2026-09-01T00:00:00.000Z',
    documentType: 'EARNINGS_SUMMARY',
    id: 'a9cf30dc-e359-4460-9c7c-a3ad47f93e20',
    mimeType: 'application/pdf',
    originalName: 'report.pdf',
    sha256: 'a'.repeat(64),
    sizeBytes: 16,
    updatedAt: '2026-09-01T00:00:00.000Z',
    uploadedAt: '2026-09-01T00:00:00.000Z',
  };
}
