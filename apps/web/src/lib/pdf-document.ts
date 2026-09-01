import { MAX_PDF_SIZE_BYTES } from '@stocklens/shared';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

export type PdfDocumentErrorCode =
  | 'PDF_DOWNLOAD_FAILED'
  | 'PDF_INVALID_CONTENT_TYPE'
  | 'PDF_INVALID_HEADER'
  | 'PDF_SIZE_LIMIT_EXCEEDED'
  | 'PDF_PARSE_FAILED';

export class PdfDocumentError extends Error {
  constructor(readonly code: PdfDocumentErrorCode) {
    super('PDFを表示できませんでした。時間をおいて再度お試しください。');
    this.name = 'PdfDocumentError';
  }
}

export interface LoadedPdfDocument {
  destroy(): Promise<void>;
  document: PDFDocumentProxy;
}

export async function fetchPdfBytes(
  url: string,
  signal: AbortSignal,
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PdfDocumentError('PDF_DOWNLOAD_FAILED');
  }

  if (!response.ok) throw new PdfDocumentError('PDF_DOWNLOAD_FAILED');

  const contentType = response.headers.get('content-type');
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/pdf'
  ) {
    throw new PdfDocumentError('PDF_INVALID_CONTENT_TYPE');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < PDF_HEADER.length ||
      declaredBytes > MAX_PDF_SIZE_BYTES
    ) {
      throw new PdfDocumentError('PDF_SIZE_LIMIT_EXCEEDED');
    }
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PdfDocumentError('PDF_DOWNLOAD_FAILED');
  }
  if (buffer.byteLength > MAX_PDF_SIZE_BYTES) {
    throw new PdfDocumentError('PDF_SIZE_LIMIT_EXCEEDED');
  }

  const bytes = new Uint8Array(buffer);
  if (
    bytes.byteLength < PDF_HEADER.length ||
    PDF_HEADER.some((value, index) => bytes[index] !== value)
  ) {
    throw new PdfDocumentError('PDF_INVALID_HEADER');
  }
  return bytes;
}

export async function loadPdfDocument(
  data: Uint8Array,
): Promise<LoadedPdfDocument> {
  let loadingTask: ReturnType<
    (typeof import('pdfjs-dist'))['getDocument']
  > | null = null;
  try {
    const pdfjs =
      process.env.NODE_ENV === 'test'
        ? await import('pdfjs-dist/legacy/build/pdf.mjs')
        : await import('pdfjs-dist');
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
    }
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      disableAutoFetch: true,
      disableStream: true,
      enableXfa: false,
      stopAtErrors: true,
      useWorkerFetch: false,
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    return {
      destroy: () => loadingTask?.destroy() ?? Promise.resolve(),
      document,
    };
  } catch {
    if (loadingTask) await loadingTask.destroy();
    throw new PdfDocumentError('PDF_PARSE_FAILED');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
