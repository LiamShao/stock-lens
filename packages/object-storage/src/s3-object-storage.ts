import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  DEFAULT_PRESIGN_EXPIRES_IN_SECONDS,
  type ObjectStorageConfig,
} from './config';
import {
  CLAIMED_SHA256_METADATA_KEY,
  MAX_PDF_SIZE_BYTES,
  PDF_CONTENT_TYPE,
  type ObjectStorage,
  type PresignedUpload,
  type PresignPdfUploadInput,
  type StoredObjectMetadata,
} from './object-storage';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_OBJECT_KEY_LENGTH = 1024;
interface S3ObjectStorageOptions {
  client?: S3Client;
  now?: () => Date;
}

function validateObjectKey(objectKey: string): void {
  const hasControlCharacter = [...objectKey].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  const hasRelativeSegment = objectKey
    .split('/')
    .some((segment) => segment === '.' || segment === '..');

  if (
    objectKey.length === 0 ||
    objectKey.length > MAX_OBJECT_KEY_LENGTH ||
    objectKey.startsWith('/') ||
    objectKey.includes('\\') ||
    hasControlCharacter ||
    hasRelativeSegment
  ) {
    throw new Error('objectKey is invalid.');
  }
}

function validateConfig(config: ObjectStorageConfig): void {
  if (config.bucket.trim() === '') {
    throw new Error('Object storage bucket is required.');
  }
  if (config.region.trim() === '') {
    throw new Error('Object storage region is required.');
  }
  if (
    !Number.isInteger(config.presignExpiresInSeconds) ||
    config.presignExpiresInSeconds < 1 ||
    config.presignExpiresInSeconds > DEFAULT_PRESIGN_EXPIRES_IN_SECONDS
  ) {
    throw new Error(
      `Presign expiry must be an integer between 1 and ${DEFAULT_PRESIGN_EXPIRES_IN_SECONDS}.`,
    );
  }
}

function validatePresignInput(input: PresignPdfUploadInput): void {
  validateObjectKey(input.objectKey);
  if (
    !Number.isInteger(input.contentLength) ||
    input.contentLength < 1 ||
    input.contentLength > MAX_PDF_SIZE_BYTES
  ) {
    throw new Error(
      `contentLength must be an integer between 1 and ${MAX_PDF_SIZE_BYTES}.`,
    );
  }
  if (!SHA256_PATTERN.test(input.sha256)) {
    throw new Error('sha256 must be a lowercase hexadecimal SHA-256 value.');
  }
}

function createClient(config: ObjectStorageConfig): S3Client {
  const clientConfig: S3ClientConfig = {
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    ...(config.credentials === undefined
      ? {}
      : { credentials: config.credentials }),
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
  };

  return new S3Client(clientConfig);
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };

  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey'
  );
}

export class S3ObjectStorageAdapter implements ObjectStorage {
  private readonly client: S3Client;
  private readonly now: () => Date;

  constructor(
    private readonly config: ObjectStorageConfig,
    options: S3ObjectStorageOptions = {},
  ) {
    validateConfig(config);
    this.client = options.client ?? createClient(config);
    this.now = options.now ?? (() => new Date());
  }

  async createPresignedPdfUpload(
    input: PresignPdfUploadInput,
  ): Promise<PresignedUpload> {
    validatePresignInput(input);
    const signingDate = this.now();
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      ContentLength: input.contentLength,
      ContentType: PDF_CONTENT_TYPE,
      Key: input.objectKey,
      Metadata: {
        [CLAIMED_SHA256_METADATA_KEY]: input.sha256,
      },
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.config.presignExpiresInSeconds,
      signableHeaders: new Set(['content-type']),
      signingDate,
      unhoistableHeaders: new Set([
        `x-amz-meta-${CLAIMED_SHA256_METADATA_KEY}`,
      ]),
    });

    return {
      expiresAt: new Date(
        signingDate.getTime() + this.config.presignExpiresInSeconds * 1000,
      ),
      headers: {
        'content-length': String(input.contentLength),
        'content-type': PDF_CONTENT_TYPE,
        [`x-amz-meta-${CLAIMED_SHA256_METADATA_KEY}`]: input.sha256,
      },
      url,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    validateObjectKey(objectKey);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    validateObjectKey(objectKey);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );

    if (!(response.Body instanceof Readable)) {
      throw new Error('Object storage returned a non-streaming body.');
    }

    return response.Body;
  }

  async headObject(objectKey: string): Promise<StoredObjectMetadata | null> {
    validateObjectKey(objectKey);

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
        }),
      );

      return {
        checksumSha256: response.ChecksumSHA256 ?? null,
        contentLength: response.ContentLength ?? null,
        contentType: response.ContentType ?? null,
        eTag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
        metadata: { ...(response.Metadata ?? {}) },
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}
