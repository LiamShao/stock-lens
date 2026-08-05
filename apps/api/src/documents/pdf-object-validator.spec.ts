import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  CLAIMED_SHA256_METADATA_KEY,
  MAX_PDF_SIZE_BYTES,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@stocklens/object-storage';

import {
  PdfObjectValidator,
  type ValidatePdfObjectInput,
} from './pdf-object-validator';

const objectKey = 'owners/owner/analyses/analysis/uploads/upload/file.pdf';
const validBody = Buffer.from('%PDF-1.7\ntrusted test body', 'utf8');
const validSha256 = sha256(validBody);
const validInput: ValidatePdfObjectInput = {
  expectedSha256: validSha256,
  expectedSizeBytes: validBody.length,
  objectKey,
};

describe('PdfObjectValidator (PDF-TASK-007)', () => {
  const objectStorage: jest.Mocked<
    Pick<ObjectStorage, 'getObjectStream' | 'headObject'>
  > = {
    getObjectStream: jest.fn(),
    headObject: jest.fn(),
  };
  let validator: PdfObjectValidator;

  beforeEach(() => {
    jest.resetAllMocks();
    objectStorage.headObject.mockResolvedValue(metadata());
    objectStorage.getObjectStream.mockResolvedValue(
      Readable.from([
        validBody.subarray(0, 2),
        validBody.subarray(2, 5),
        validBody.subarray(5),
      ]),
    );
    validator = new PdfObjectValidator(
      objectStorage as unknown as ObjectStorage,
    );
  });

  it('PDF-FR-007 calculates trusted size and SHA-256 across stream chunks', async () => {
    await expect(validator.validate(validInput)).resolves.toEqual({
      kind: 'valid',
      sha256: validSha256,
      sizeBytes: validBody.length,
    });
    expect(objectStorage.headObject).toHaveBeenCalledWith(objectKey);
    expect(objectStorage.getObjectStream).toHaveBeenCalledWith(objectKey);
  });

  it.each([
    [
      'content type',
      metadata({ contentType: 'application/octet-stream' }),
      'CONTENT_TYPE_MISMATCH',
    ],
    [
      'missing content length',
      metadata({ contentLength: null }),
      'SIZE_MISMATCH',
    ],
    [
      'declared content length',
      metadata({ contentLength: validBody.length + 1 }),
      'SIZE_MISMATCH',
    ],
    [
      'claimed SHA metadata',
      metadata({ metadata: {} }),
      'SHA256_METADATA_MISMATCH',
    ],
  ] as const)(
    'rejects mismatched %s before reading the body',
    async (_name, storedMetadata, reason) => {
      objectStorage.headObject.mockResolvedValue(storedMetadata);

      await expect(validator.validate(validInput)).resolves.toEqual({
        kind: 'invalid',
        reason,
      });
      expect(objectStorage.getObjectStream).not.toHaveBeenCalled();
    },
  );

  it('PDF-SEC-003 rejects a non-PDF header without reading the full stream', async () => {
    const stream = Readable.from([
      Buffer.from('NOT-PDF'),
      Buffer.alloc(1024 * 1024, 1),
    ]);
    const destroy = jest.spyOn(stream, 'destroy');
    objectStorage.getObjectStream.mockResolvedValue(stream);

    await expect(validator.validate(validInput)).resolves.toEqual({
      kind: 'invalid',
      reason: 'INVALID_PDF_HEADER',
    });
    expect(destroy).toHaveBeenCalled();
  });

  it('rejects a streamed size that differs from trusted upload input', async () => {
    const body = Buffer.concat([validBody, Buffer.from('extra')]);
    objectStorage.getObjectStream.mockResolvedValue(Readable.from([body]));

    await expect(validator.validate(validInput)).resolves.toEqual({
      kind: 'invalid',
      reason: 'SIZE_MISMATCH',
    });
  });

  it('rejects a streamed SHA-256 that differs from trusted upload input', async () => {
    const changedBody = Buffer.from('%PDF-1.7\nchanged test body', 'utf8');
    objectStorage.headObject.mockResolvedValue(
      metadata({
        contentLength: changedBody.length,
        metadata: { [CLAIMED_SHA256_METADATA_KEY]: validSha256 },
      }),
    );
    objectStorage.getObjectStream.mockResolvedValue(
      Readable.from([changedBody]),
    );

    await expect(
      validator.validate({
        ...validInput,
        expectedSizeBytes: changedBody.length,
      }),
    ).resolves.toEqual({ kind: 'invalid', reason: 'SHA256_MISMATCH' });
  });

  it('stops after the maximum allowed bytes', async () => {
    const body = Buffer.concat([
      Buffer.from('%PDF-', 'ascii'),
      Buffer.alloc(MAX_PDF_SIZE_BYTES - 4, 1),
    ]);
    objectStorage.headObject.mockResolvedValue(
      metadata({
        contentLength: MAX_PDF_SIZE_BYTES,
        metadata: {
          [CLAIMED_SHA256_METADATA_KEY]: 'a'.repeat(64),
        },
      }),
    );
    const stream = Readable.from([body]);
    const destroy = jest.spyOn(stream, 'destroy');
    objectStorage.getObjectStream.mockResolvedValue(stream);

    await expect(
      validator.validate({
        expectedSha256: 'a'.repeat(64),
        expectedSizeBytes: MAX_PDF_SIZE_BYTES,
        objectKey,
      }),
    ).resolves.toEqual({ kind: 'invalid', reason: 'FILE_TOO_LARGE' });
    expect(destroy).toHaveBeenCalled();
  });

  it.each([
    ['missing object', null, undefined, 'OBJECT_NOT_FOUND'],
    [
      'head failure',
      undefined,
      new Error('provider head detail'),
      'OBJECT_READ_FAILED',
    ],
  ] as const)(
    'maps %s to a retryable sanitized storage failure',
    async (_name, headResult, headError, reason) => {
      if (headError) {
        objectStorage.headObject.mockRejectedValue(headError);
      } else {
        objectStorage.headObject.mockResolvedValue(headResult);
      }

      await expect(validator.validate(validInput)).resolves.toEqual({
        kind: 'storage-failure',
        reason,
      });
    },
  );

  it('maps stream failures without returning provider details', async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error('provider stream detail'));
      },
    });
    objectStorage.getObjectStream.mockResolvedValue(stream);

    await expect(validator.validate(validInput)).resolves.toEqual({
      kind: 'storage-failure',
      reason: 'OBJECT_READ_FAILED',
    });
  });
});

function metadata(
  overrides: Partial<StoredObjectMetadata> = {},
): StoredObjectMetadata {
  return {
    checksumSha256: null,
    contentLength: validBody.length,
    contentType: 'application/pdf',
    eTag: null,
    lastModified: null,
    metadata: { [CLAIMED_SHA256_METADATA_KEY]: validSha256 },
    ...overrides,
  };
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
