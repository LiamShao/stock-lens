import type { Readable } from 'node:stream';

export const PDF_CONTENT_TYPE = 'application/pdf';
export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;
export const CLAIMED_SHA256_METADATA_KEY = 'stocklens-sha256';

export interface PresignPdfUploadInput {
  contentLength: number;
  objectKey: string;
  sha256: string;
}

export interface PresignPdfDownloadInput {
  objectKey: string;
}

export interface PresignedUpload {
  expiresAt: Date;
  headers: Readonly<Record<string, string>>;
  url: string;
}

export interface PresignedDownload {
  expiresAt: Date;
  url: string;
}

export interface StoredObjectMetadata {
  checksumSha256: string | null;
  contentLength: number | null;
  contentType: string | null;
  eTag: string | null;
  lastModified: Date | null;
  metadata: Readonly<Record<string, string>>;
}

export interface ObjectStorage {
  createPresignedPdfDownload(
    input: PresignPdfDownloadInput,
  ): Promise<PresignedDownload>;
  createPresignedPdfUpload(
    input: PresignPdfUploadInput,
  ): Promise<PresignedUpload>;
  deleteObject(objectKey: string): Promise<void>;
  getObjectStream(objectKey: string): Promise<Readable>;
  headObject(objectKey: string): Promise<StoredObjectMetadata | null>;
}
