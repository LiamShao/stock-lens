import { createHash, randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Queue, Worker } from 'bullmq';
import type { ObjectStorage } from '@stocklens/object-storage';
import {
  analysisResourceSchema,
  authResponseSchema,
  documentListResponseSchema,
  documentResourceSchema,
  OBJECT_CLEANUP_JOB_NAME,
  OBJECT_CLEANUP_QUEUE_NAME,
  startDocumentUploadResponseSchema,
  type AuthResponse,
  type ObjectCleanupJobData,
} from '@stocklens/shared';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';

import { configureApiApplication } from '../src/app-configuration';
import { AppModule } from '../src/app.module';
import { getAuthConfig } from '../src/auth/auth.config';
import { PrismaService } from '../src/database/prisma.service';
import { OBJECT_STORAGE } from '../src/documents/object-storage.module';
import { getRedisConnectionOptions } from '../../worker/src/config';
import { ObjectCleanupProcessor } from '../../worker/src/object-cleanup.processor';
import { ObjectCleanupJobRepository } from '../../worker/src/object-cleanup.repository';
import {
  startMinio,
  type StartedMinioContainer,
} from './support/minio-test-container';
import { startMigratedPostgres } from './support/postgres-test-container';
import {
  startRedis,
  type StartedRedisContainer,
} from './support/redis-test-container';

jest.setTimeout(180_000);

describe('document storage integration (PDF-TASK-012, PDF-TASK-014)', () => {
  const objectKeysToDelete = new Set<string>();
  let app: NestFastifyApplication;
  let cleanupQueue: Queue<ObjectCleanupJobData>;
  let cleanupWorker: Worker<ObjectCleanupJobData> | undefined;
  let minio: StartedMinioContainer;
  let module: TestingModule;
  let objectStorage: ObjectStorage;
  let postgres: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let redis: StartedRedisContainer;
  let remoteAddressSequence = 30;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    [minio, redis] = await Promise.all([startMinio(), startRedis()]);
    Object.assign(process.env, {
      ACCESS_TOKEN_AUDIENCE: 'stocklens-web-test',
      ACCESS_TOKEN_EXPIRES_IN_SECONDS: '900',
      ACCESS_TOKEN_ISSUER: 'stocklens-api-test',
      ACCESS_TOKEN_SECRET:
        'integration-access-token-secret-at-least-32-characters',
      CORS_ORIGIN: 'http://localhost:3000',
      NODE_ENV: 'test',
      REFRESH_TOKEN_EXPIRES_IN_DAYS: '30',
      REDIS_URL: redis.url,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_BUCKET: minio.bucket,
      S3_ENDPOINT: minio.endpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_PRESIGN_EXPIRES_IN_SECONDS: '300',
      S3_REGION: 'ap-northeast-1',
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    });
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApiApplication(app, getAuthConfig());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    objectStorage = module.get<ObjectStorage>(OBJECT_STORAGE);
    prisma = module.get(PrismaService);
    cleanupQueue = new Queue<ObjectCleanupJobData>(OBJECT_CLEANUP_QUEUE_NAME, {
      connection: getRedisConnectionOptions(redis.url),
    });
  });

  afterEach(async () => {
    await cleanupWorker?.close();
    cleanupWorker = undefined;
    await Promise.all(
      [...objectKeysToDelete].map((objectKey) =>
        objectStorage.deleteObject(objectKey),
      ),
    );
    objectKeysToDelete.clear();
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    await cleanupQueue?.close();
    await Promise.all([
      minio?.container.stop(),
      postgres?.stop(),
      redis?.container.stop(),
    ]);
  });

  it('PDF-AC-001 PDF-AC-007 uploads through a real presigned PUT and finalizes trusted metadata', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { analysisId, auth } = await createOwnedAnalysis();

    const started = await startUpload(auth, analysisId, pdf, sha256);
    const storedUpload = await rememberStoredObject(started.uploadSession.id);
    const putResponse = await fetch(started.upload.url, {
      body: pdf,
      headers: started.upload.headers,
      method: 'PUT',
    });
    expect(putResponse.status).toBe(200);

    const storedObject = await objectStorage.headObject(
      storedUpload.storageKey,
    );
    expect(storedObject).toMatchObject({
      contentLength: pdf.byteLength,
      contentType: 'application/pdf',
      metadata: { 'stocklens-sha256': sha256 },
    });

    const finalized = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(finalized.statusCode).toBe(200);
    expect(
      documentResourceSchema.parse(finalized.json<unknown>()),
    ).toMatchObject({
      analysisId,
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      sha256,
      sizeBytes: pdf.byteLength,
    });

    const persisted = await prisma.documentUpload.findUniqueOrThrow({
      include: { finalizedDocument: true },
      where: { id: started.uploadSession.id },
    });
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.finalizedDocument).toMatchObject({
      sha256,
      sizeBytes: BigInt(pdf.byteLength),
    });
    expect(persisted.finalizedDocument?.uploadedAt).toBeInstanceOf(Date);
    await expect(
      prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } }),
    ).resolves.toMatchObject({ status: 'UPLOADED' });
  });

  it('PDF-AC-005 rejects a real MinIO object with an invalid header and persists cleanup tracking', async () => {
    const invalidPdf = Buffer.from('not-a-pdf despite trusted metadata');
    const sha256 = createHash('sha256').update(invalidPdf).digest('hex');
    const { analysisId, auth } = await createOwnedAnalysis();

    const started = await startUpload(auth, analysisId, invalidPdf, sha256);
    const storedUpload = await rememberStoredObject(started.uploadSession.id);
    const putResponse = await fetch(started.upload.url, {
      body: invalidPdf,
      headers: started.upload.headers,
      method: 'PUT',
    });
    expect(putResponse.status).toBe(200);

    const finalized = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(finalized.statusCode).toBe(422);
    expect(finalized.json()).toMatchObject({ code: 'INVALID_PDF' });

    await expect(
      prisma.documentUpload.findUniqueOrThrow({
        where: { id: started.uploadSession.id },
      }),
    ).resolves.toMatchObject({
      failureCode: 'INVALID_PDF_HEADER',
      status: 'REJECTED',
    });
    await expect(
      prisma.document.count({ where: { analysisId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.jobExecution.findFirstOrThrow({
        where: { documentUploadId: started.uploadSession.id },
      }),
    ).resolves.toMatchObject({
      status: 'QUEUED',
      step: 'OBJECT_CLEANUP',
    });
    const cleanupExecution = await prisma.jobExecution.findFirstOrThrow({
      where: { documentUploadId: started.uploadSession.id },
    });
    await expect(
      cleanupQueue.getJob(cleanupExecution.id),
    ).resolves.toMatchObject({
      data: { jobExecutionId: cleanupExecution.id },
      name: OBJECT_CLEANUP_JOB_NAME,
    });
    await expect(
      objectStorage.headObject(storedUpload.storageKey),
    ).resolves.not.toBeNull();
  });

  it('PDF-AC-008 soft-deletes through HTTP and completes real Redis/BullMQ/MinIO cleanup', async () => {
    const finalized = await createFinalizedDocument();

    const deleted = await request(finalized.auth, {
      method: 'DELETE',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}`,
    });
    expect(deleted.statusCode).toBe(204);

    const listed = await request(finalized.auth, {
      method: 'GET',
      url: `/api/analyses/${finalized.analysisId}/documents`,
    });
    expect(listed.statusCode).toBe(200);
    expect(
      documentListResponseSchema.parse(listed.json<unknown>()).items,
    ).toEqual([]);

    const queuedExecution = await prisma.jobExecution.findFirstOrThrow({
      where: { documentId: finalized.documentId, step: 'OBJECT_CLEANUP' },
    });
    expect(queuedExecution).toMatchObject({
      currentAttempt: 0,
      status: 'QUEUED',
    });
    await expect(
      cleanupQueue.getJob(queuedExecution.id),
    ).resolves.toMatchObject({
      data: { jobExecutionId: queuedExecution.id },
      id: queuedExecution.id,
      name: OBJECT_CLEANUP_JOB_NAME,
    });

    await startCleanupWorker();
    const completedExecution = await waitForCleanupSuccess(
      finalized.documentId,
    );

    expect(completedExecution).toMatchObject({
      currentAttempt: 1,
      errorCode: null,
      errorDetails: null,
      errorMessage: null,
      status: 'SUCCEEDED',
    });
    expect(completedExecution.startedAt).toBeInstanceOf(Date);
    expect(completedExecution.finishedAt).toBeInstanceOf(Date);
    expect(completedExecution.attempts).toHaveLength(1);
    expect(completedExecution.attempts[0]).toMatchObject({
      attempt: 1,
      bullmqJobId: queuedExecution.id,
      errorCode: null,
      errorDetails: null,
      errorMessage: null,
      status: 'SUCCEEDED',
    });
    await expect(
      objectStorage.headObject(finalized.storageKey),
    ).resolves.toBeNull();
    const deletedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: finalized.documentId },
    });
    expect(deletedDocument.deletedAt).toBeInstanceOf(Date);
  });

  it('PDF-AC-008 treats cleanup of an already missing MinIO object as success', async () => {
    const finalized = await createFinalizedDocument();
    await objectStorage.deleteObject(finalized.storageKey);
    await expect(
      objectStorage.headObject(finalized.storageKey),
    ).resolves.toBeNull();
    await startCleanupWorker();

    const deleted = await request(finalized.auth, {
      method: 'DELETE',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}`,
    });
    expect(deleted.statusCode).toBe(204);

    const completedExecution = await waitForCleanupSuccess(
      finalized.documentId,
    );
    expect(completedExecution).toMatchObject({
      currentAttempt: 1,
      errorCode: null,
      status: 'SUCCEEDED',
    });
    expect(completedExecution.attempts).toHaveLength(1);
    expect(completedExecution.attempts[0]).toMatchObject({
      attempt: 1,
      status: 'SUCCEEDED',
    });
  });

  async function createFinalizedDocument(): Promise<{
    analysisId: string;
    auth: AuthResponse;
    documentId: string;
    storageKey: string;
  }> {
    const pdf = Buffer.from('%PDF-1.7\ncleanup acceptance\n%%EOF\n');
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { analysisId, auth } = await createOwnedAnalysis();
    const started = await startUpload(auth, analysisId, pdf, sha256);
    const storedUpload = await rememberStoredObject(started.uploadSession.id);
    const putResponse = await fetch(started.upload.url, {
      body: pdf,
      headers: started.upload.headers,
      method: 'PUT',
    });
    expect(putResponse.status).toBe(200);
    const finalized = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(finalized.statusCode).toBe(200);
    const document = documentResourceSchema.parse(finalized.json<unknown>());
    return {
      analysisId,
      auth,
      documentId: document.id,
      storageKey: storedUpload.storageKey,
    };
  }

  async function startCleanupWorker(): Promise<void> {
    const processor = new ObjectCleanupProcessor(
      new ObjectCleanupJobRepository(prisma),
      objectStorage,
      minio.bucket,
    );
    cleanupWorker = new Worker<ObjectCleanupJobData>(
      OBJECT_CLEANUP_QUEUE_NAME,
      (job) => processor.process(job),
      {
        connection: getRedisConnectionOptions(redis.url),
        concurrency: 1,
      },
    );
    cleanupWorker.on('error', () => {
      // Assertions use durable JobExecution state; connection details stay out
      // of test output unless the bounded poll fails.
    });
    await cleanupWorker.waitUntilReady();
  }

  async function waitForCleanupSuccess(documentId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { documentId, step: 'OBJECT_CLEANUP' },
      });
      if (execution?.status === 'SUCCEEDED') {
        return execution;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Object cleanup did not succeed within 15 seconds.');
  }

  async function createOwnedAnalysis(): Promise<{
    analysisId: string;
    auth: AuthResponse;
  }> {
    const registration = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'MinIO Integration User',
        email: `${randomUUID()}@minio.integration.test`,
        password: 'integration-password',
      },
      remoteAddress: `10.30.0.${remoteAddressSequence++}`,
      url: '/api/auth/register',
    });
    expect(registration.statusCode).toBe(201);
    const auth = authResponseSchema.parse(registration.json<unknown>());
    const analysis = await request(auth, {
      method: 'POST',
      payload: { title: 'MinIO storage integration' },
      url: '/api/analyses',
    });
    expect(analysis.statusCode).toBe(201);
    return {
      analysisId: analysisResourceSchema.parse(analysis.json<unknown>()).id,
      auth,
    };
  }

  async function startUpload(
    auth: AuthResponse,
    analysisId: string,
    body: Buffer,
    sha256: string,
  ) {
    const response = await request(auth, {
      method: 'POST',
      payload: {
        mimeType: 'application/pdf',
        originalName: 'results.pdf',
        sha256,
        sizeBytes: body.byteLength,
      },
      url: `/api/analyses/${analysisId}/document-uploads`,
    });
    expect(response.statusCode).toBe(201);
    return startDocumentUploadResponseSchema.parse(response.json<unknown>());
  }

  async function rememberStoredObject(uploadId: string) {
    const upload = await prisma.documentUpload.findUniqueOrThrow({
      select: { storageKey: true },
      where: { id: uploadId },
    });
    objectKeysToDelete.add(upload.storageKey);
    return upload;
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
