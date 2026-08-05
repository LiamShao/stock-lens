import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import {
  CLAIMED_SHA256_METADATA_KEY,
  MAX_PDF_SIZE_BYTES,
  PDF_CONTENT_TYPE,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@stocklens/object-storage';

import { OBJECT_STORAGE } from './object-storage.module';

const PDF_HEADER = Buffer.from('%PDF-', 'ascii');

export type InvalidPdfObjectReason =
  | 'CONTENT_TYPE_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'INVALID_PDF_HEADER'
  | 'SHA256_METADATA_MISMATCH'
  | 'SHA256_MISMATCH'
  | 'SIZE_MISMATCH';

export type PdfObjectStorageFailureReason =
  'OBJECT_NOT_FOUND' | 'OBJECT_READ_FAILED';

export type PdfObjectValidationResult =
  | {
      kind: 'invalid';
      reason: InvalidPdfObjectReason;
    }
  | {
      kind: 'storage-failure';
      reason: PdfObjectStorageFailureReason;
    }
  | {
      kind: 'valid';
      sha256: string;
      sizeBytes: number;
    };

export interface ValidatePdfObjectInput {
  expectedSha256: string;
  expectedSizeBytes: number;
  objectKey: string;
}

@Injectable()
export class PdfObjectValidator {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
  ) {}

  async validate(
    input: ValidatePdfObjectInput,
  ): Promise<PdfObjectValidationResult> {
    let metadata: StoredObjectMetadata | null;
    try {
      metadata = await this.objectStorage.headObject(input.objectKey);
    } catch {
      return { kind: 'storage-failure', reason: 'OBJECT_READ_FAILED' };
    }
    if (metadata === null) {
      return { kind: 'storage-failure', reason: 'OBJECT_NOT_FOUND' };
    }

    const metadataFailure = validateMetadata(metadata, input);
    if (metadataFailure !== null) {
      return { kind: 'invalid', reason: metadataFailure };
    }

    try {
      const stream = await this.objectStorage.getObjectStream(input.objectKey);
      return await validateStream(stream, input);
    } catch {
      return { kind: 'storage-failure', reason: 'OBJECT_READ_FAILED' };
    }
  }
}

function validateMetadata(
  metadata: StoredObjectMetadata,
  input: ValidatePdfObjectInput,
): InvalidPdfObjectReason | null {
  if (metadata.contentType !== PDF_CONTENT_TYPE) {
    return 'CONTENT_TYPE_MISMATCH';
  }
  if (metadata.contentLength !== input.expectedSizeBytes) {
    return 'SIZE_MISMATCH';
  }
  if (metadata.metadata[CLAIMED_SHA256_METADATA_KEY] !== input.expectedSha256) {
    return 'SHA256_METADATA_MISMATCH';
  }
  return null;
}

async function validateStream(
  stream: Readable,
  input: ValidatePdfObjectInput,
): Promise<PdfObjectValidationResult> {
  const hash = createHash('sha256');
  let header = Buffer.alloc(0);
  let sizeBytes = 0;

  try {
    for await (const rawChunk of stream) {
      const chunk = toBuffer(rawChunk);
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_PDF_SIZE_BYTES) {
        destroyStream(stream);
        return { kind: 'invalid', reason: 'FILE_TOO_LARGE' };
      }

      hash.update(chunk);
      if (header.length < PDF_HEADER.length) {
        const remaining = PDF_HEADER.length - header.length;
        header = Buffer.concat([header, chunk.subarray(0, remaining)]);
        if (header.length === PDF_HEADER.length && !header.equals(PDF_HEADER)) {
          destroyStream(stream);
          return { kind: 'invalid', reason: 'INVALID_PDF_HEADER' };
        }
      }
    }
  } catch {
    return { kind: 'storage-failure', reason: 'OBJECT_READ_FAILED' };
  }

  if (header.length !== PDF_HEADER.length || !header.equals(PDF_HEADER)) {
    return { kind: 'invalid', reason: 'INVALID_PDF_HEADER' };
  }
  if (sizeBytes !== input.expectedSizeBytes) {
    return { kind: 'invalid', reason: 'SIZE_MISMATCH' };
  }

  const sha256 = hash.digest('hex');
  if (sha256 !== input.expectedSha256) {
    return { kind: 'invalid', reason: 'SHA256_MISMATCH' };
  }
  return { kind: 'valid', sha256, sizeBytes };
}

function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array || typeof chunk === 'string') {
    return Buffer.from(chunk);
  }
  throw new Error('Object stream returned an unsupported chunk.');
}

function destroyStream(stream: Readable): void {
  stream.destroy();
}
