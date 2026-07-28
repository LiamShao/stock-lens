import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import type { ObjectStorageConfig } from './config';
import { MAX_PDF_SIZE_BYTES, PDF_CONTENT_TYPE } from './object-storage';
import { S3ObjectStorageAdapter } from './s3-object-storage';

const config: ObjectStorageConfig = {
  bucket: 'stocklens-dev',
  credentials: {
    accessKeyId: 'stocklens',
    secretAccessKey: 'secret',
  },
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  presignExpiresInSeconds: 300,
  region: 'ap-northeast-1',
};

const validInput = {
  contentLength: 1024,
  objectKey: 'owners/owner/analyses/analysis/uploads/upload/random.pdf',
  sha256: 'a'.repeat(64),
};

describe('S3ObjectStorageAdapter.createPresignedPdfUpload', () => {
  it('returns a five-minute URL with the constrained upload headers', async () => {
    const now = new Date('2026-07-28T00:00:00.000Z');
    const adapter = new S3ObjectStorageAdapter(config, { now: () => now });

    const result = await adapter.createPresignedPdfUpload(validInput);
    const url = new URL(result.url);

    expect(url.host).toBe('localhost:9000');
    expect(url.pathname).toContain('/stocklens-dev/');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-length',
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'x-amz-meta-stocklens-sha256',
    );
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(result).toMatchObject({
      expiresAt: new Date('2026-07-28T00:05:00.000Z'),
      headers: {
        'content-length': '1024',
        'content-type': PDF_CONTENT_TYPE,
        'x-amz-meta-stocklens-sha256': validInput.sha256,
      },
    });
    expect(result.url).not.toContain('secret');
  });

  it('rejects size and digest values outside the PDF contract', async () => {
    const adapter = new S3ObjectStorageAdapter(config);

    await expect(
      adapter.createPresignedPdfUpload({
        ...validInput,
        contentLength: MAX_PDF_SIZE_BYTES + 1,
      }),
    ).rejects.toThrow(
      `contentLength must be an integer between 1 and ${MAX_PDF_SIZE_BYTES}.`,
    );
    await expect(
      adapter.createPresignedPdfUpload({
        ...validInput,
        sha256: 'A'.repeat(64),
      }),
    ).rejects.toThrow('sha256 must be a lowercase hexadecimal SHA-256 value.');
  });

  it('rejects direct configuration that exceeds the approved expiry', () => {
    expect(
      () =>
        new S3ObjectStorageAdapter({
          ...config,
          presignExpiresInSeconds: 301,
        }),
    ).toThrow('Presign expiry must be an integer between 1 and 300.');
  });
});

describe('S3ObjectStorageAdapter object operations', () => {
  it('maps head metadata and treats missing objects as null', async () => {
    const sentCommands: unknown[] = [];
    let callCount = 0;
    const client = {
      send: (command: unknown) => {
        sentCommands.push(command);
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({
            ChecksumSHA256: 'checksum',
            ContentLength: 1024,
            ContentType: PDF_CONTENT_TYPE,
            ETag: '"etag"',
            LastModified: new Date('2026-07-28T00:00:00.000Z'),
            Metadata: { 'stocklens-sha256': validInput.sha256 },
          });
        }
        return Promise.reject(
          Object.assign(new Error('Object not found.'), {
            $metadata: { httpStatusCode: 404 },
            name: 'NotFound',
          }),
        );
      },
    } as unknown as S3Client;
    const adapter = new S3ObjectStorageAdapter(config, { client });

    await expect(adapter.headObject(validInput.objectKey)).resolves.toEqual({
      checksumSha256: 'checksum',
      contentLength: 1024,
      contentType: PDF_CONTENT_TYPE,
      eTag: '"etag"',
      lastModified: new Date('2026-07-28T00:00:00.000Z'),
      metadata: { 'stocklens-sha256': validInput.sha256 },
    });
    await expect(adapter.headObject(validInput.objectKey)).resolves.toBeNull();
    expect(sentCommands[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('returns a Node readable stream and sends an idempotent delete', async () => {
    const body = Readable.from(['%PDF-test']);
    const sentCommands: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        sentCommands.push(command);
        return Promise.resolve(
          command instanceof GetObjectCommand ? { Body: body } : {},
        );
      },
    } as unknown as S3Client;
    const adapter = new S3ObjectStorageAdapter(config, { client });

    await expect(adapter.getObjectStream(validInput.objectKey)).resolves.toBe(
      body,
    );
    await expect(
      adapter.deleteObject(validInput.objectKey),
    ).resolves.toBeUndefined();
    expect(sentCommands[0]).toBeInstanceOf(GetObjectCommand);
    expect(sentCommands[1]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('rejects a non-streaming object body', async () => {
    const client = {
      send: jest.fn().mockResolvedValue({ Body: new Uint8Array([1, 2, 3]) }),
    } as unknown as S3Client;
    const adapter = new S3ObjectStorageAdapter(config, { client });

    await expect(adapter.getObjectStream(validInput.objectKey)).rejects.toThrow(
      'Object storage returned a non-streaming body.',
    );
  });

  it('rejects relative object key segments', async () => {
    const adapter = new S3ObjectStorageAdapter(config);

    await expect(
      adapter.headObject('owners/owner/../other.pdf'),
    ).rejects.toThrow('objectKey is invalid.');
  });
});
