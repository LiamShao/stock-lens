import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ObjectStorage } from '@stocklens/object-storage';
import {
  analysisResourceSchema,
  authResponseSchema,
  documentListResponseSchema,
  documentResourceSchema,
  MAX_PDF_SIZE_BYTES,
  startDocumentUploadResponseSchema,
  type AuthResponse,
} from '@stocklens/shared';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';

import { configureApiApplication } from '../src/app-configuration';
import { AppModule } from '../src/app.module';
import { getAuthConfig } from '../src/auth/auth.config';
import { PrismaService } from '../src/database/prisma.service';
import { OBJECT_STORAGE } from '../src/documents/object-storage.module';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('document upload HTTP integration (PDF-TASK-011, PDF-TASK-013)', () => {
  const createPresignedPdfUpload: jest.MockedFunction<
    ObjectStorage['createPresignedPdfUpload']
  > = jest.fn();
  const getObjectStream: jest.MockedFunction<ObjectStorage['getObjectStream']> =
    jest.fn();
  const headObject: jest.MockedFunction<ObjectStorage['headObject']> =
    jest.fn();
  const objectStorage: jest.Mocked<ObjectStorage> = {
    createPresignedPdfUpload,
    deleteObject: jest.fn(),
    getObjectStream,
    headObject,
  };
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let remoteAddressSequence = 10;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    Object.assign(process.env, {
      ACCESS_TOKEN_AUDIENCE: 'stocklens-web-test',
      ACCESS_TOKEN_EXPIRES_IN_SECONDS: '900',
      ACCESS_TOKEN_ISSUER: 'stocklens-api-test',
      ACCESS_TOKEN_SECRET:
        'integration-access-token-secret-at-least-32-characters',
      CORS_ORIGIN: 'http://localhost:3000',
      NODE_ENV: 'test',
      REFRESH_TOKEN_EXPIRES_IN_DAYS: '30',
      S3_ACCESS_KEY_ID: 'integration-access-key',
      S3_BUCKET: 'integration-private',
      S3_FORCE_PATH_STYLE: 'false',
      S3_PRESIGN_EXPIRES_IN_SECONDS: '300',
      S3_REGION: 'ap-northeast-1',
      S3_SECRET_ACCESS_KEY: 'integration-secret-key',
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue(objectStorage)
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApiApplication(app, getAuthConfig());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = module.get(PrismaService);
  });

  beforeEach(() => {
    createPresignedPdfUpload.mockReset();
    objectStorage.deleteObject.mockReset();
    getObjectStream.mockReset();
    headObject.mockReset();
    createPresignedPdfUpload.mockImplementation((input) =>
      Promise.resolve({
        expiresAt: new Date(Date.now() + 300_000),
        headers: {
          'content-length': String(input.contentLength),
          'content-type': 'application/pdf',
          'x-amz-meta-stocklens-sha256': input.sha256,
        },
        url: `https://storage.integration.test/${input.objectKey}?signature=test`,
      }),
    );
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (container !== undefined) {
      await container.stop();
    }
  });

  it('PDF-AC-001 creates a pending session and returns a constrained short-lived URL', async () => {
    const { analysisId, auth } = await createOwnedAnalysis();
    const requestedAt = Date.now();
    const response = await startUpload(auth, analysisId, {
      documentType: 'EARNINGS_SUMMARY',
      mimeType: 'application/pdf',
      originalName: '決算短信.PDF',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    });

    expect(response.statusCode).toBe(201);
    const resource = startDocumentUploadResponseSchema.parse(
      response.json<unknown>(),
    );
    expect(resource.upload.headers).toEqual({
      'content-length': '1024',
      'content-type': 'application/pdf',
      'x-amz-meta-stocklens-sha256': 'a'.repeat(64),
    });
    expect(
      new Date(resource.upload.expiresAt).getTime(),
    ).toBeGreaterThanOrEqual(requestedAt + 299_000);
    expect(new Date(resource.upload.expiresAt).getTime()).toBeLessThanOrEqual(
      Date.now() + 300_000,
    );
    expect(resource.uploadSession).toMatchObject({
      analysisId,
      documentType: 'EARNINGS_SUMMARY',
      mimeType: 'application/pdf',
      originalName: '決算短信.PDF',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      status: 'PENDING',
    });
    expect(resource.uploadSession).not.toHaveProperty('ownerId');
    expect(resource.uploadSession).not.toHaveProperty('storageBucket');
    expect(resource.uploadSession).not.toHaveProperty('storageKey');

    const stored = await prisma.documentUpload.findUniqueOrThrow({
      where: { id: resource.uploadSession.id },
    });
    expect(stored).toMatchObject({
      analysisId,
      claimedSha256: 'a'.repeat(64),
      declaredMimeType: 'application/pdf',
      declaredSizeBytes: 1024n,
      ownerId: auth.user.id,
      status: 'PENDING',
      storageBucket: 'integration-private',
    });
    expect(stored.storageKey).not.toContain('決算短信');
    expect(createPresignedPdfUpload).toHaveBeenCalledWith({
      contentLength: 1024,
      objectKey: stored.storageKey,
      sha256: 'a'.repeat(64),
    });
  });

  it('PDF-AC-002 rejects a fourth active slot without creating an intent or URL', async () => {
    const { analysisId, auth } = await createOwnedAnalysis();
    for (const shaPrefix of ['a', 'b', 'c']) {
      const accepted = await startUpload(auth, analysisId, {
        mimeType: 'application/pdf',
        originalName: `${shaPrefix}.pdf`,
        sha256: shaPrefix.repeat(64),
        sizeBytes: 1,
      });
      expect(accepted.statusCode).toBe(201);
    }

    const rejected = await startUpload(auth, analysisId, {
      mimeType: 'application/pdf',
      originalName: 'fourth.pdf',
      sha256: 'd'.repeat(64),
      sizeBytes: 1,
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({
      code: 'DOCUMENT_LIMIT_EXCEEDED',
    });
    await expect(
      prisma.documentUpload.count({ where: { analysisId } }),
    ).resolves.toBe(3);
    await expect(
      prisma.document.count({ where: { analysisId } }),
    ).resolves.toBe(0);
    expect(createPresignedPdfUpload).toHaveBeenCalledTimes(3);
  });

  it('PDF-AC-003 rejects zero and oversized files before persistence or presigning', async () => {
    const { analysisId, auth } = await createOwnedAnalysis();
    for (const sizeBytes of [0, MAX_PDF_SIZE_BYTES + 1]) {
      const rejected = await startUpload(auth, analysisId, {
        mimeType: 'application/pdf',
        originalName: 'invalid-size.pdf',
        sha256: 'e'.repeat(64),
        sizeBytes,
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    await expect(
      prisma.documentUpload.count({ where: { analysisId } }),
    ).resolves.toBe(0);
    expect(createPresignedPdfUpload).not.toHaveBeenCalled();
  });

  it('PDF-AC-004 rejects invalid extension and MIME before persistence or presigning', async () => {
    const { analysisId, auth } = await createOwnedAnalysis();
    for (const payload of [
      {
        mimeType: 'application/pdf',
        originalName: 'results.txt',
        sha256: 'f'.repeat(64),
        sizeBytes: 1024,
      },
      {
        mimeType: 'application/octet-stream',
        originalName: 'results.pdf',
        sha256: 'f'.repeat(64),
        sizeBytes: 1024,
      },
    ]) {
      const rejected = await startUpload(auth, analysisId, payload);
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    await expect(
      prisma.documentUpload.count({ where: { analysisId } }),
    ).resolves.toBe(0);
    expect(createPresignedPdfUpload).not.toHaveBeenCalled();
  });

  it('PDF-AC-006 rejects cross-user upload start without persistence or presigning', async () => {
    const { analysisId } = await createOwnedAnalysis();
    const outsider = await registerUser('Cross-user Start');
    const payload = {
      mimeType: 'application/pdf',
      originalName: 'cross-user.pdf',
      sha256: '1'.repeat(64),
      sizeBytes: 1024,
    };

    const crossUser = await startUpload(outsider, analysisId, payload);
    expect(crossUser.statusCode).toBe(404);
    expect(crossUser.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });

    const missing = await startUpload(outsider, randomUUID(), payload);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });
    await expect(
      prisma.documentUpload.count({ where: { analysisId } }),
    ).resolves.toBe(0);
    expect(createPresignedPdfUpload).not.toHaveBeenCalled();
  });

  it('PDF-AC-006 hides upload and document operations from a cross-user bearer without side effects', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { analysisId, auth: owner } = await createOwnedAnalysis();
    const outsider = await registerUser('Cross-user Resource');
    const startedResponse = await startUpload(owner, analysisId, {
      mimeType: 'application/pdf',
      originalName: 'owned.pdf',
      sha256,
      sizeBytes: pdf.byteLength,
    });
    expect(startedResponse.statusCode).toBe(201);
    const started = startDocumentUploadResponseSchema.parse(
      startedResponse.json<unknown>(),
    );

    const crossPresign = await request(outsider, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/presign`,
    });
    expect(crossPresign.statusCode).toBe(404);
    expect(crossPresign.json()).toMatchObject({
      code: 'DOCUMENT_UPLOAD_NOT_FOUND',
    });

    const crossFinalize = await request(outsider, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(crossFinalize.statusCode).toBe(404);
    expect(crossFinalize.json()).toMatchObject({
      code: 'DOCUMENT_UPLOAD_NOT_FOUND',
    });
    expect(createPresignedPdfUpload).toHaveBeenCalledTimes(1);
    expect(headObject).not.toHaveBeenCalled();
    expect(getObjectStream).not.toHaveBeenCalled();
    await expect(
      prisma.documentUpload.findUniqueOrThrow({
        where: { id: started.uploadSession.id },
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    await expect(
      prisma.document.count({ where: { analysisId } }),
    ).resolves.toBe(0);

    headObject.mockResolvedValue({
      checksumSha256: null,
      contentLength: pdf.byteLength,
      contentType: 'application/pdf',
      eTag: 'integration-etag',
      lastModified: new Date(),
      metadata: { 'stocklens-sha256': sha256 },
    });
    getObjectStream.mockResolvedValue(Readable.from([pdf]));
    const ownerFinalize = await request(owner, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(ownerFinalize.statusCode).toBe(200);
    const document = documentResourceSchema.parse(
      ownerFinalize.json<unknown>(),
    );

    const crossList = await request(outsider, {
      method: 'GET',
      url: `/api/analyses/${analysisId}/documents`,
    });
    expect(crossList.statusCode).toBe(404);
    expect(crossList.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });

    const crossDelete = await request(outsider, {
      method: 'DELETE',
      url: `/api/analyses/${analysisId}/documents/${document.id}`,
    });
    expect(crossDelete.statusCode).toBe(404);
    expect(crossDelete.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });

    const ownerList = await request(owner, {
      method: 'GET',
      url: `/api/analyses/${analysisId}/documents`,
    });
    expect(ownerList.statusCode).toBe(200);
    expect(
      documentListResponseSchema.parse(ownerList.json<unknown>()).items,
    ).toEqual([document]);
    await expect(
      prisma.document.findUniqueOrThrow({ where: { id: document.id } }),
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.jobExecution.count({ where: { documentId: document.id } }),
    ).resolves.toBe(0);
  });

  async function createOwnedAnalysis(): Promise<{
    analysisId: string;
    auth: AuthResponse;
  }> {
    const auth = await registerUser('Document Upload Integration User');
    const analysis = await request(auth, {
      method: 'POST',
      payload: { title: 'Document upload integration' },
      url: '/api/analyses',
    });
    expect(analysis.statusCode).toBe(201);
    return {
      analysisId: analysisResourceSchema.parse(analysis.json<unknown>()).id,
      auth,
    };
  }

  async function registerUser(displayName: string): Promise<AuthResponse> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName,
        email: `${randomUUID()}@document-upload.integration.test`,
        password: 'integration-password',
      },
      remoteAddress: `10.20.0.${remoteAddressSequence++}`,
      url: '/api/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    return authResponseSchema.parse(registration.json<unknown>());
  }

  function startUpload(
    auth: AuthResponse,
    analysisId: string,
    payload: NonNullable<InjectOptions['payload']>,
  ): Promise<LightMyRequestResponse> {
    return request(auth, {
      method: 'POST',
      payload,
      url: `/api/analyses/${analysisId}/document-uploads`,
    });
  }

  function request(
    auth: AuthResponse,
    options: InjectOptions,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      ...options,
      headers: {
        ...options.headers,
        authorization: `Bearer ${auth.accessToken}`,
      },
    });
  }
});
