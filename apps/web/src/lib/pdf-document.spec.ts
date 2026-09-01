import { MAX_PDF_SIZE_BYTES } from '@stocklens/shared';
import { describe, expect, it, vi } from 'vitest';

import { createSyntheticPdf } from '@/test/synthetic-pdf';

import {
  fetchPdfBytes,
  loadPdfDocument,
  PdfDocumentError,
} from './pdf-document';

const presignedUrl =
  'https://storage.example.test/document.pdf?X-Amz-Signature=secret';

describe('PDF document boundary VIEW-AC-013/016', () => {
  it('fetches a PDF once without credentials, redirects, or browser caching', async () => {
    const bytes = validPdfHeader();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(pdfResponse(bytes));

    await expect(
      fetchPdfBytes(presignedUrl, new AbortController().signal, fetchMock),
    ).resolves.toSatisfy(
      (received: Uint8Array) =>
        Array.from(received).join(',') === Array.from(bytes).join(','),
    );

    expect(fetchMock).toHaveBeenCalledWith(presignedUrl, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    [
      'non-PDF content type',
      new Response('%PDF-1.7\nfixture', {
        headers: { 'content-type': 'text/html' },
      }),
      'PDF_INVALID_CONTENT_TYPE',
    ],
    [
      'oversized declaration',
      pdfResponse('%PDF-1.7\nfixture', String(MAX_PDF_SIZE_BYTES + 1)),
      'PDF_SIZE_LIMIT_EXCEEDED',
    ],
    ['invalid file header', pdfResponse('not-a-pdf'), 'PDF_INVALID_HEADER'],
  ])('rejects %s with a sanitized error', async (_label, response, code) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response as Response);

    const error = await fetchPdfBytes(
      presignedUrl,
      new AbortController().signal,
      fetchMock,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PdfDocumentError);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain('secret');
    expect(String(error)).not.toContain('storage.example.test');
  });

  it('loads a tracked real PDF byte fixture and resolves its second page with PDF.js', async () => {
    const loaded = await loadPdfDocument(createSyntheticPdf(3));
    try {
      expect(loaded.document.numPages).toBe(3);
      const page = await loaded.document.getPage(2);
      expect(page.pageNumber).toBe(2);
      page.cleanup();
    } finally {
      await loaded.destroy();
    }
  }, 30_000);
});

function validPdfHeader(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.7\nfixture');
}

function pdfResponse(
  body: string | Uint8Array,
  contentLength = String(
    typeof body === 'string'
      ? new TextEncoder().encode(body).byteLength
      : body.byteLength,
  ),
): Response {
  const responseBody =
    typeof body === 'string' ? body : new TextDecoder().decode(body);
  return new Response(responseBody, {
    headers: {
      'content-length': contentLength,
      'content-type': 'application/pdf',
    },
  });
}
