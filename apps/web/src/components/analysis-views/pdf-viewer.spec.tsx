import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecurePdfViewer } from './pdf-viewer';

const pdfMocks = vi.hoisted(() => ({
  destroy: vi.fn(async () => undefined),
  getPage: vi.fn(),
  loadPdfDocument: vi.fn(),
  pageCleanup: vi.fn(),
  render: vi.fn(),
}));

vi.mock('@/lib/pdf-document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf-document')>();
  return { ...actual, loadPdfDocument: pdfMocks.loadPdfDocument };
});

describe('SecurePdfViewer VIEW-AC-013/016', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.render.mockReturnValue({
      cancel: vi.fn(),
      promise: Promise.resolve(),
    });
    pdfMocks.getPage.mockImplementation(async (pageNumber: number) => ({
      cleanup: pdfMocks.pageCleanup,
      getViewport: () => ({ height: 1260, width: 890 }),
      pageNumber,
      render: pdfMocks.render,
    }));
    pdfMocks.loadPdfDocument.mockResolvedValue({
      destroy: pdfMocks.destroy,
      document: { getPage: pdfMocks.getPage, numPages: 15 },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('%PDF-1.7\nfixture', {
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
    );
  });

  it('opens the exact evidence page and navigates through canvas-only pages', async () => {
    const url =
      'https://storage.example.test/document.pdf?X-Amz-Signature=secret';
    const requestDownload = vi.fn(async () => ({
      expiresAt: '2026-09-01T00:05:00.000Z',
      url,
    }));
    render(
      <SecurePdfViewer initialPage={12} requestDownload={requestDownload} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: '12ページをPDFで開く' }),
    );

    expect(
      await screen.findByRole('img', { name: 'PDF 12ページ' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(pdfMocks.getPage).toHaveBeenCalledWith(12));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      }),
    );
    expect(document.body.innerHTML).not.toContain('X-Amz-Signature');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '次のページ' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
    expect(
      await screen.findByRole('img', { name: 'PDF 13ページ' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(pdfMocks.getPage).toHaveBeenCalledWith(13));
  });

  it('aborts an unfinished presign request when the viewer unmounts', () => {
    let requestSignal: AbortSignal | undefined;
    const requestDownload = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>(() => {
          requestSignal = signal;
        }),
    );
    const view = render(
      <SecurePdfViewer initialPage={2} requestDownload={requestDownload} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '2ページをPDFで開く' }));

    expect(requestSignal?.aborted).toBe(false);
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });
});
