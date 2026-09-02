import {
  MAX_PDF_SIZE_BYTES,
  type DocumentResource,
  type DocumentType,
  type PresignedPdfUploadResponse,
} from '@stocklens/shared';

import type { ApiClient } from './api-client';

const PDF_HEADER = '%PDF-';
const MAX_UPLOAD_FILES = 3;

export type PdfUploadStep = 'hashing' | 'starting' | 'uploading' | 'finalizing';

export class PdfUploadError extends Error {
  constructor(readonly code: string) {
    super(toPdfUploadErrorMessage(code));
    this.name = 'PdfUploadError';
  }
}

export function validatePdfSelectionCount(fileCount: number): void {
  if (fileCount < 1 || fileCount > MAX_UPLOAD_FILES) {
    throw new PdfUploadError('PDF_FILE_COUNT_INVALID');
  }
}

export async function validatePdfFile(file: File): Promise<void> {
  if (file.size < 1 || file.size > MAX_PDF_SIZE_BYTES) {
    throw new PdfUploadError('PDF_FILE_SIZE_INVALID');
  }
  if (!/\.pdf$/i.test(file.name)) {
    throw new PdfUploadError('PDF_FILE_EXTENSION_INVALID');
  }
  if (file.type !== 'application/pdf') {
    throw new PdfUploadError('PDF_FILE_MIME_INVALID');
  }

  const header = new TextDecoder('ascii').decode(
    await readBlobBytes(file.slice(0, PDF_HEADER.length)),
  );
  if (header !== PDF_HEADER) {
    throw new PdfUploadError('PDF_FILE_HEADER_INVALID');
  }
}

export async function calculatePdfSha256(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new Uint8Array(await readBlobBytes(file)),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    throw new PdfUploadError('PDF_HASH_FAILED');
  }
}

export async function putPdfObject(
  file: File,
  upload: PresignedPdfUploadResponse,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  let response: Response;
  try {
    const request: RequestInit = {
      body: file,
      cache: 'no-store',
      credentials: 'omit',
      headers: upload.headers,
      method: 'PUT',
      redirect: 'error',
    };
    if (signal) request.signal = signal;
    response = await fetchImplementation(upload.url, request);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PdfUploadError('PDF_UPLOAD_FAILED');
  }
  if (!response.ok) throw new PdfUploadError('PDF_UPLOAD_FAILED');
}

export async function uploadPdfFile(input: {
  analysisId: string;
  apiClient: ApiClient;
  documentType: DocumentType;
  file: File;
  fetch?: typeof fetch;
  onStep?: (step: PdfUploadStep) => void;
  signal?: AbortSignal;
}): Promise<DocumentResource> {
  await validatePdfFile(input.file);
  input.onStep?.('hashing');
  const sha256 = await calculatePdfSha256(input.file);
  input.onStep?.('starting');
  const started = await input.apiClient.startDocumentUpload(
    input.analysisId,
    {
      documentType: input.documentType,
      mimeType: 'application/pdf',
      originalName: input.file.name,
      sha256,
      sizeBytes: input.file.size,
    },
    input.signal,
  );

  input.onStep?.('uploading');
  try {
    await putPdfObject(input.file, started.upload, input.signal, input.fetch);
  } catch (error) {
    if (isAbortError(error)) throw error;
    const reissued = await input.apiClient.reissueDocumentUploadUrl(
      input.analysisId,
      started.uploadSession.id,
      input.signal,
    );
    await putPdfObject(input.file, reissued, input.signal, input.fetch);
  }

  input.onStep?.('finalizing');
  return input.apiClient.finalizeDocumentUpload(
    input.analysisId,
    started.uploadSession.id,
    input.signal,
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new PdfUploadError('PDF_FILE_READ_FAILED'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new PdfUploadError('PDF_FILE_READ_FAILED'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function toPdfUploadErrorMessage(code: string): string {
  switch (code) {
    case 'PDF_FILE_COUNT_INVALID':
      return 'PDFは一度に1〜3件選択してください。';
    case 'PDF_FILE_SIZE_INVALID':
      return 'PDFは1件20MB以下のファイルを選択してください。';
    case 'PDF_FILE_EXTENSION_INVALID':
    case 'PDF_FILE_MIME_INVALID':
    case 'PDF_FILE_HEADER_INVALID':
      return 'PDF形式のファイルを選択してください。';
    case 'PDF_HASH_FAILED':
      return 'PDFを確認できませんでした。もう一度選択してください。';
    default:
      return 'PDFをアップロードできませんでした。時間をおいて再度お試しください。';
  }
}
