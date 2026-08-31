import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Queue, Worker } from 'bullmq';
import type { ObjectStorage } from '@stocklens/object-storage';
import {
  ANALYSIS_PROCESSING_QUEUE_NAME,
  ANALYSIS_PARSE_JOB_NAME,
  analysisResourceSchema,
  authResponseSchema,
  documentListResponseSchema,
  documentResourceSchema,
  OBJECT_CLEANUP_JOB_NAME,
  OBJECT_CLEANUP_QUEUE_NAME,
  presignedDocumentDownloadSchema,
  processAnalysisResponseSchema,
  startDocumentUploadResponseSchema,
  type AnalysisJobData,
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
import { AnalysisProcessingProcessor } from '../../worker/src/analysis-processing.processor';
import { AnalysisProcessingJobRepository } from '../../worker/src/analysis-processing.repository';
import { getRedisConnectionOptions } from '../../worker/src/config';
import { JobOperationRepository } from '../../worker/src/job-operation.repository';
import { ObjectCleanupProcessor } from '../../worker/src/object-cleanup.processor';
import { ObjectCleanupJobRepository } from '../../worker/src/object-cleanup.repository';
import { ExpiredDocumentUploadScanner } from '../../worker/src/expired-document-upload.scanner';
import { PendingObjectCleanupDispatcher } from '../../worker/src/pending-object-cleanup.dispatcher';
import { PendingAnalysisDispatcher } from '../../worker/src/pending-analysis.dispatcher';
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

const repositoryRoot = resolve(__dirname, '../../..');

describe('document storage integration (PDF-TASK-012/014, PROC-TASK-011)', () => {
  const objectKeysToDelete = new Set<string>();
  let analysisQueue: Queue<AnalysisJobData>;
  let analysisWorker: Worker<AnalysisJobData> | undefined;
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
    analysisQueue = new Queue<AnalysisJobData>(ANALYSIS_PROCESSING_QUEUE_NAME, {
      connection: getRedisConnectionOptions(redis.url),
    });
    cleanupQueue = new Queue<ObjectCleanupJobData>(OBJECT_CLEANUP_QUEUE_NAME, {
      connection: getRedisConnectionOptions(redis.url),
    });
  });

  afterEach(async () => {
    await analysisWorker?.close();
    analysisWorker = undefined;
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
    await analysisQueue?.close();
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

    const headSpy = jest.spyOn(objectStorage, 'headObject');
    const streamSpy = jest.spyOn(objectStorage, 'getObjectStream');
    const finalized = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(finalized.statusCode).toBe(200);
    const document = documentResourceSchema.parse(finalized.json<unknown>());
    expect(document).toMatchObject({
      analysisId,
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      sha256,
      sizeBytes: pdf.byteLength,
    });
    expect(headSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy).toHaveBeenCalledTimes(1);

    const repeated = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/document-uploads/${started.uploadSession.id}/finalize`,
    });
    expect(repeated.statusCode).toBe(200);
    expect(documentResourceSchema.parse(repeated.json<unknown>())).toEqual(
      document,
    );
    expect(headSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy).toHaveBeenCalledTimes(1);
    headSpy.mockRestore();
    streamSpy.mockRestore();

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

  it('VIEW-AC-013/015 issues an owner-scoped five-minute read URL and hides unavailable objects', async () => {
    const pdf = Buffer.from('%PDF-1.7\nread presign acceptance\n%%EOF\n');
    const finalized = await createFinalizedPdf(pdf);
    const requestedAt = Date.now();
    const response = await request(finalized.auth, {
      method: 'POST',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}/download-url`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const download = presignedDocumentDownloadSchema.parse(
      response.json<unknown>(),
    );
    expect(new Date(download.expiresAt).getTime()).toBeGreaterThanOrEqual(
      requestedAt + 299_000,
    );
    expect(new Date(download.expiresAt).getTime()).toBeLessThanOrEqual(
      Date.now() + 300_000,
    );
    const fetched = await fetch(download.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await fetched.arrayBuffer())).toEqual(pdf);

    const { auth: outsider } = await createOwnedAnalysis();
    const crossOwner = await request(outsider, {
      method: 'POST',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}/download-url`,
    });
    expect(crossOwner.statusCode).toBe(404);
    expect(crossOwner.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });
    expect(JSON.stringify(crossOwner.json())).not.toContain(
      finalized.storageKey,
    );

    const missingDocument = await request(finalized.auth, {
      method: 'POST',
      url: `/api/analyses/${finalized.analysisId}/documents/${randomUUID()}/download-url`,
    });
    expect(missingDocument.statusCode).toBe(404);
    expect(missingDocument.json()).toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });

    await objectStorage.deleteObject(finalized.storageKey);
    const missingObject = await request(finalized.auth, {
      method: 'POST',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}/download-url`,
    });
    expect(missingObject.statusCode).toBe(503);
    expect(missingObject.json()).toMatchObject({
      code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
      message: 'Document download is temporarily unavailable.',
    });
    expect(JSON.stringify(missingObject.json())).not.toContain(
      finalized.storageKey,
    );
  });

  it('PROC-AC-002 PROC-AC-004 PROC-AC-012 completes the real processing pipeline', async () => {
    const pdf = createTextPdf([
      `First page ${'A'.repeat(1_350)}`,
      'Second page evidence for StockLens processing.',
    ]);
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

    await startAnalysisWorker();
    const processResponse = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/process`,
    });
    expect(processResponse.statusCode).toBe(202);
    const accepted = processAnalysisResponseSchema.parse(
      processResponse.json<unknown>(),
    );
    expect(accepted).toMatchObject({ analysisId, status: 'PARSING' });

    const completed = await waitForAnalysisReady(analysisId);
    expect(completed.analysis).toMatchObject({
      failureCode: null,
      failureMessage: null,
      status: 'READY_FOR_EMBEDDING',
    });
    expect(completed.executions).toHaveLength(3);
    expect(completed.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currentAttempt: 1,
          id: accepted.executionId,
          status: 'SUCCEEDED',
          step: 'PARSE',
        }),
        expect.objectContaining({
          currentAttempt: 1,
          status: 'SUCCEEDED',
          step: 'CHUNK',
        }),
        expect.objectContaining({
          currentAttempt: 0,
          status: 'QUEUED',
          step: 'CALCULATE_FINANCIAL_METRICS',
        }),
      ]),
    );
    expect(
      completed.executions
        .filter(({ step }) => step === 'PARSE' || step === 'CHUNK')
        .every(({ attempts }) => attempts.length === 1),
    ).toBe(true);

    const pages = await prisma.documentPage.findMany({
      orderBy: { pageNumber: 'asc' },
      where: { documentId: document.id },
    });
    expect(pages.map(({ pageNumber }) => pageNumber)).toEqual([1, 2]);
    expect(
      pages.every(
        ({ text, textSha256 }) =>
          createHash('sha256').update(text).digest('hex') === textSha256,
      ),
    ).toBe(true);
    const chunks = await prisma.documentChunk.findMany({
      orderBy: { chunkIndex: 'asc' },
      where: { documentId: document.id },
    });
    expect(chunks).toHaveLength(2);
    expect(new Set(chunks.map(({ pageId }) => pageId))).toEqual(
      new Set(pages.map(({ id }) => id)),
    );
    expect(
      chunks.every(({ content }) => Array.from(content).length <= 1_200),
    ).toBe(true);
    await expect(
      prisma.document.findUniqueOrThrow({ where: { id: document.id } }),
    ).resolves.toMatchObject({ pageCount: 2 });
    await expect(
      objectStorage.headObject(storedUpload.storageKey),
    ).resolves.not.toBeNull();
  });

  it('PROC-AC-003 preserves an empty page while chunking extractable pages', async () => {
    const finalized = await createFinalizedPdf(
      createTextPdf(['', 'Extractable evidence remains page two.']),
    );
    await startAnalysisWorker();
    await startProcessing(finalized.auth, finalized.analysisId);
    await waitForAnalysisReady(finalized.analysisId);

    const pages = await prisma.documentPage.findMany({
      orderBy: { pageNumber: 'asc' },
      where: { documentId: finalized.documentId },
    });
    expect(pages).toEqual([
      expect.objectContaining({ pageNumber: 1, text: '' }),
      expect.objectContaining({ pageNumber: 2 }),
    ]);
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: finalized.documentId },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ pageId: pages[1]?.id });
  });

  it.each([
    {
      code: 'PDF_PARSE_INVALID',
      label: 'malformed input',
      pdf: Buffer.from('%PDF-not-valid'),
    },
    {
      code: 'PDF_PAGE_LIMIT_EXCEEDED',
      label: '501 page input',
      pdf: createTextPdf(Array.from({ length: 501 }, () => '')),
    },
  ])(
    'PROC-AC-007 persists a sanitized non-retryable failure for $label',
    async ({ code, pdf }) => {
      const finalized = await createFinalizedPdf(pdf);
      await startAnalysisWorker();
      await startProcessing(finalized.auth, finalized.analysisId);
      const failed = await waitForAnalysisFailure(finalized.analysisId);

      expect(failed.analysis).toMatchObject({
        failureCode: code,
        failureMessage: 'PDF parsing failed.',
        status: 'FAILED_PARSING',
      });
      expect(failed.execution).toMatchObject({
        currentAttempt: 1,
        errorCode: code,
        errorDetails: null,
        errorMessage: 'PDF parsing failed.',
        status: 'FAILED',
      });
      expect(failed.execution.attempts).toHaveLength(1);
      await expect(
        prisma.documentPage.count({
          where: { documentId: finalized.documentId },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.documentChunk.count({
          where: { documentId: finalized.documentId },
        }),
      ).resolves.toBe(0);
    },
  );

  it('PROC-AC-006 retries transient storage failure and succeeds on attempt three', async () => {
    const finalized = await createFinalizedPdf(
      createTextPdf(['Retryable storage evidence.']),
    );
    let reads = 0;
    const retryingStorage: ObjectStorage = {
      createPresignedPdfDownload: (input) =>
        objectStorage.createPresignedPdfDownload(input),
      createPresignedPdfUpload: (input) =>
        objectStorage.createPresignedPdfUpload(input),
      deleteObject: (objectKey) => objectStorage.deleteObject(objectKey),
      getObjectStream: (objectKey) => {
        reads += 1;
        if (reads < 3) {
          throw new Error('test-only transient object read failure');
        }
        return objectStorage.getObjectStream(objectKey);
      },
      headObject: (objectKey) => objectStorage.headObject(objectKey),
    };
    await startAnalysisWorker(retryingStorage);
    await startProcessing(finalized.auth, finalized.analysisId);
    const completed = await waitForAnalysisReady(finalized.analysisId);
    const parse = completed.executions.find(({ step }) => step === 'PARSE');

    expect(reads).toBe(3);
    expect(parse).toMatchObject({ currentAttempt: 3, status: 'SUCCEEDED' });
    expect(parse?.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        errorCode: 'PROCESSING_DEPENDENCY_FAILED',
        status: 'FAILED',
      }),
      expect.objectContaining({
        attempt: 2,
        errorCode: 'PROCESSING_DEPENDENCY_FAILED',
        status: 'FAILED',
      }),
      expect.objectContaining({ attempt: 3, status: 'SUCCEEDED' }),
    ]);
  });

  it('PROC-AC-005 PROC-AC-010 recovers a missing queue job and ignores duplicate delivery', async () => {
    const finalized = await createFinalizedPdf(
      createTextPdf(['Durable queue recovery evidence.']),
    );
    const accepted = await startProcessing(
      finalized.auth,
      finalized.analysisId,
    );
    const queued = await analysisQueue.getJob(accepted.executionId);
    expect(queued).toBeDefined();
    await queued?.remove();

    const dispatcher = new PendingAnalysisDispatcher(prisma, analysisQueue);
    await expect(dispatcher.dispatch()).resolves.toBeGreaterThanOrEqual(1);
    await startAnalysisWorker();
    await waitForAnalysisReady(finalized.analysisId);
    const pageCount = await prisma.documentPage.count({
      where: { documentId: finalized.documentId },
    });
    const chunkCount = await prisma.documentChunk.count({
      where: { documentId: finalized.documentId },
    });

    await analysisQueue.add(
      ANALYSIS_PARSE_JOB_NAME,
      { jobExecutionId: accepted.executionId },
      {
        jobId: accepted.executionId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    await waitForQueueJobRemoval(accepted.executionId);
    await expect(
      prisma.documentPage.count({
        where: { documentId: finalized.documentId },
      }),
    ).resolves.toBe(pageCount);
    await expect(
      prisma.documentChunk.count({
        where: { documentId: finalized.documentId },
      }),
    ).resolves.toBe(chunkCount);
    await expect(
      prisma.jobExecution.count({
        where: { analysisId: finalized.analysisId },
      }),
    ).resolves.toBe(3);
  });

  it('RERUN-AC-002 RERUN-AC-005 recovers failed parse through the durable dispatcher', async () => {
    const finalized = await createFinalizedPdf(
      createTextPdf(['Parse re-run recovery evidence.']),
    );
    const unavailableStorage: ObjectStorage = {
      createPresignedPdfDownload: (input) =>
        objectStorage.createPresignedPdfDownload(input),
      createPresignedPdfUpload: (input) =>
        objectStorage.createPresignedPdfUpload(input),
      deleteObject: (objectKey) => objectStorage.deleteObject(objectKey),
      getObjectStream: () => {
        throw new Error('test-only persistent object read failure');
      },
      headObject: (objectKey) => objectStorage.headObject(objectKey),
    };
    await startAnalysisWorker(unavailableStorage);
    const accepted = await startProcessing(
      finalized.auth,
      finalized.analysisId,
    );
    const failed = await waitForFinalAnalysisFailure(finalized.analysisId);
    expect(failed.execution).toMatchObject({
      currentAttempt: 3,
      id: accepted.executionId,
      status: 'FAILED',
    });
    await analysisWorker?.close();
    analysisWorker = undefined;
    await (await analysisQueue.getJob(accepted.executionId))?.remove();

    const operations = new JobOperationRepository(prisma);
    await expect(
      operations.rerun(
        accepted.executionId,
        'dispatcher-recovery-operator',
        randomUUID(),
      ),
    ).resolves.toMatchObject({
      kind: 'queued',
      summary: { status: 'QUEUED', step: 'PARSE' },
    });
    await expect(
      analysisQueue.getJob(accepted.executionId),
    ).resolves.toBeUndefined();

    const dispatcher = new PendingAnalysisDispatcher(prisma, analysisQueue);
    await expect(dispatcher.dispatch()).resolves.toBeGreaterThanOrEqual(1);
    await startAnalysisWorker();
    const completed = await waitForAnalysisReady(finalized.analysisId);
    const parse = completed.executions.find(({ step }) => step === 'PARSE');
    expect(parse).toMatchObject({ currentAttempt: 4, status: 'SUCCEEDED' });
    expect(parse?.attempts).toHaveLength(4);
  });

  it('RERUN-AC-002 re-dispatches a failed chunk to the chunk processor', async () => {
    const finalized = await createFinalizedPdf(createTextPdf(['']));
    await startAnalysisWorker();
    await startProcessing(finalized.auth, finalized.analysisId);
    const firstFailure = await waitForChunkFailure(finalized.analysisId, 1);
    expect(firstFailure.execution).toMatchObject({
      errorCode: 'PDF_HAS_NO_TEXT',
      status: 'FAILED',
      step: 'CHUNK',
    });
    await analysisWorker?.close();
    analysisWorker = undefined;
    await (await analysisQueue.getJob(firstFailure.execution.id))?.remove();

    const operations = new JobOperationRepository(prisma);
    await expect(
      operations.rerun(
        firstFailure.execution.id,
        'chunk-rerun-operator',
        randomUUID(),
      ),
    ).resolves.toMatchObject({
      kind: 'queued',
      summary: { status: 'QUEUED', step: 'CHUNK' },
    });
    const dispatcher = new PendingAnalysisDispatcher(prisma, analysisQueue);
    await expect(dispatcher.dispatch()).resolves.toBeGreaterThanOrEqual(1);
    await startAnalysisWorker();
    const repeatedFailure = await waitForChunkFailure(finalized.analysisId, 2);
    expect(repeatedFailure.execution).toMatchObject({
      currentAttempt: 2,
      errorCode: 'PDF_HAS_NO_TEXT',
      id: firstFailure.execution.id,
      status: 'FAILED',
    });
    expect(repeatedFailure.execution.attempts).toHaveLength(2);
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

  it('PDF-TASK-015 retries transient cleanup failure three times and persists attempt history', async () => {
    const finalized = await createFinalizedDocument();
    let targetDeleteAttempts = 0;
    const retryingStorage: ObjectStorage = {
      createPresignedPdfDownload: (input) =>
        objectStorage.createPresignedPdfDownload(input),
      createPresignedPdfUpload: (input) =>
        objectStorage.createPresignedPdfUpload(input),
      deleteObject: async (objectKey) => {
        if (objectKey === finalized.storageKey) {
          targetDeleteAttempts += 1;
          if (targetDeleteAttempts < 3) {
            throw new Error('test-only transient object storage failure');
          }
        }
        await objectStorage.deleteObject(objectKey);
      },
      getObjectStream: (objectKey) => objectStorage.getObjectStream(objectKey),
      headObject: (objectKey) => objectStorage.headObject(objectKey),
    };

    const deleted = await request(finalized.auth, {
      method: 'DELETE',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}`,
    });
    expect(deleted.statusCode).toBe(204);
    await startCleanupWorker(retryingStorage);

    const completedExecution = await waitForCleanupSuccess(
      finalized.documentId,
    );
    expect(targetDeleteAttempts).toBe(3);
    expect(completedExecution).toMatchObject({
      currentAttempt: 3,
      errorCode: null,
      errorDetails: null,
      errorMessage: null,
      status: 'SUCCEEDED',
    });
    expect(completedExecution.attempts).toHaveLength(3);
    expect(completedExecution.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        errorCode: 'OBJECT_STORAGE_DELETE_FAILED',
        status: 'FAILED',
      }),
      expect.objectContaining({
        attempt: 2,
        errorCode: 'OBJECT_STORAGE_DELETE_FAILED',
        status: 'FAILED',
      }),
      expect.objectContaining({
        attempt: 3,
        errorCode: null,
        status: 'SUCCEEDED',
      }),
    ]);
    await expect(
      objectStorage.headObject(finalized.storageKey),
    ).resolves.toBeNull();
  });

  it('RERUN-AC-001 RERUN-AC-007 inspects and re-runs failed cleanup through the real CLI', async () => {
    const finalized = await createFinalizedDocument();
    const failingStorage: ObjectStorage = {
      createPresignedPdfDownload: (input) =>
        objectStorage.createPresignedPdfDownload(input),
      createPresignedPdfUpload: (input) =>
        objectStorage.createPresignedPdfUpload(input),
      deleteObject: async (objectKey) => {
        if (objectKey === finalized.storageKey) {
          throw new Error('test-only cleanup dependency failure');
        }
        await objectStorage.deleteObject(objectKey);
      },
      getObjectStream: (objectKey) => objectStorage.getObjectStream(objectKey),
      headObject: (objectKey) => objectStorage.headObject(objectKey),
    };
    const deleted = await request(finalized.auth, {
      method: 'DELETE',
      url: `/api/analyses/${finalized.analysisId}/documents/${finalized.documentId}`,
    });
    expect(deleted.statusCode).toBe(204);
    await startCleanupWorker(failingStorage);
    const failed = await waitForCleanupFailure(finalized.documentId);
    expect(failed).toMatchObject({ currentAttempt: 3, status: 'FAILED' });
    await cleanupWorker?.close();
    cleanupWorker = undefined;

    const operatorId = 'phase3-integration-operator';
    const inspected = runJobCli([
      'inspect',
      '--execution-id',
      failed.id,
      '--operator-id',
      operatorId,
    ]);
    expect(inspected).toMatchObject({
      code: 'JOB_INSPECTED',
      currentAttempt: 3,
      executionId: failed.id,
      manualReruns: 0,
      status: 'FAILED',
      step: 'OBJECT_CLEANUP',
    });

    const rerun = runJobCli([
      'rerun',
      '--execution-id',
      failed.id,
      '--operator-id',
      operatorId,
      '--confirm',
      failed.id,
    ]);
    expect(rerun).toMatchObject({
      code: 'JOB_RERUN_QUEUED',
      executionId: failed.id,
      manualReruns: 1,
      status: 'QUEUED',
      step: 'OBJECT_CLEANUP',
    });
    const audit = await prisma.jobOperationAudit.findFirstOrThrow({
      where: { jobExecutionId: failed.id },
    });
    expect(audit).toMatchObject({
      action: 'RERUN',
      operatorId,
      previousStatus: 'FAILED',
      status: 'QUEUED',
    });

    await startCleanupWorker();
    const completed = await waitForCleanupSuccess(finalized.documentId);
    expect(completed).toMatchObject({ currentAttempt: 4, status: 'SUCCEEDED' });
    expect(completed.attempts).toHaveLength(4);
    await expect(
      objectStorage.headObject(finalized.storageKey),
    ).resolves.toBeNull();
    const output = JSON.stringify({ audit, inspected, rerun });
    expect(output).not.toContain(finalized.storageKey);
    expect(output).not.toContain('stocklens-integration-job-secret');
    expect(output).not.toContain('cleanup acceptance');
  });

  it('PDF-Q-005 expires an orphan and deletes it through the real cleanup pipeline', async () => {
    const pdf = Buffer.from('%PDF-1.7\norphan cleanup acceptance\n%%EOF\n');
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

    const scanNow = new Date(
      new Date(started.uploadSession.expiresAt).getTime() + 1,
    );
    const scanner = new ExpiredDocumentUploadScanner(prisma);
    await expect(scanner.scan(scanNow)).resolves.toBe(1);
    await expect(
      prisma.documentUpload.findUniqueOrThrow({
        where: { id: started.uploadSession.id },
      }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });

    const dispatcher = new PendingObjectCleanupDispatcher(prisma, cleanupQueue);
    await expect(dispatcher.dispatch()).resolves.toBeGreaterThanOrEqual(1);
    await startCleanupWorker();
    const execution = await waitForUploadCleanupSuccess(
      started.uploadSession.id,
    );
    expect(execution).toMatchObject({
      currentAttempt: 1,
      status: 'SUCCEEDED',
    });
    expect(execution.attempts).toHaveLength(1);
    await expect(
      objectStorage.headObject(storedUpload.storageKey),
    ).resolves.toBeNull();

    await expect(scanner.scan(scanNow)).resolves.toBe(0);
    await expect(
      prisma.jobExecution.count({
        where: { documentUploadId: started.uploadSession.id },
      }),
    ).resolves.toBe(1);
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

  async function createFinalizedPdf(pdf: Buffer<ArrayBuffer>): Promise<{
    analysisId: string;
    auth: AuthResponse;
    documentId: string;
    storageKey: string;
  }> {
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

  async function startCleanupWorker(
    workerStorage: ObjectStorage = objectStorage,
  ): Promise<void> {
    const processor = new ObjectCleanupProcessor(
      new ObjectCleanupJobRepository(prisma),
      workerStorage,
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

  async function startAnalysisWorker(
    workerStorage: ObjectStorage = objectStorage,
  ): Promise<void> {
    const processor = new AnalysisProcessingProcessor(
      new AnalysisProcessingJobRepository(prisma),
      workerStorage,
      minio.bucket,
      analysisQueue,
    );
    analysisWorker = new Worker<AnalysisJobData>(
      ANALYSIS_PROCESSING_QUEUE_NAME,
      (job) => processor.process(job),
      {
        connection: getRedisConnectionOptions(redis.url),
        concurrency: 1,
      },
    );
    analysisWorker.on('error', () => {
      // Durable execution state is asserted below without exposing connection
      // details in test output.
    });
    await analysisWorker.waitUntilReady();
  }

  async function waitForAnalysisReady(analysisId: string) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: analysisId },
      });
      const executions = await prisma.jobExecution.findMany({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
        where: { analysisId },
      });
      if (analysis.status === 'READY_FOR_EMBEDDING') {
        return { analysis, executions };
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Analysis processing did not complete within 30 seconds.');
  }

  async function waitForAnalysisFailure(analysisId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: analysisId },
      });
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { analysisId, step: 'PARSE' },
      });
      if (
        analysis.status === 'FAILED_PARSING' &&
        execution?.status === 'FAILED'
      )
        return { analysis, execution };
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Analysis processing did not fail within 15 seconds.');
  }

  async function waitForFinalAnalysisFailure(analysisId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: analysisId },
      });
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { analysisId, step: 'PARSE' },
      });
      if (
        analysis.status === 'FAILED_PARSING' &&
        execution?.status === 'FAILED' &&
        execution.currentAttempt === 3
      ) {
        return { analysis, execution };
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      'Analysis processing did not exhaust retries in 15 seconds.',
    );
  }

  async function waitForChunkFailure(
    analysisId: string,
    currentAttempt: number,
  ) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: analysisId },
      });
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { analysisId, step: 'CHUNK' },
      });
      if (
        analysis.status === 'FAILED_CHUNKING' &&
        execution?.status === 'FAILED' &&
        execution.currentAttempt === currentAttempt
      ) {
        return { analysis, execution };
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Document chunking did not fail within 15 seconds.');
  }

  async function waitForQueueJobRemoval(jobId: string): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if ((await analysisQueue.getJob(jobId)) === undefined) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Analysis queue job was not removed within 10 seconds.');
  }

  async function startProcessing(auth: AuthResponse, analysisId: string) {
    const response = await request(auth, {
      method: 'POST',
      url: `/api/analyses/${analysisId}/process`,
    });
    expect(response.statusCode).toBe(202);
    return processAnalysisResponseSchema.parse(response.json<unknown>());
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

  async function waitForCleanupFailure(documentId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { documentId, step: 'OBJECT_CLEANUP' },
      });
      if (execution?.status === 'FAILED' && execution.currentAttempt === 3) {
        return execution;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Object cleanup did not fail within 15 seconds.');
  }

  async function waitForUploadCleanupSuccess(documentUploadId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const execution = await prisma.jobExecution.findFirst({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { documentUploadId, step: 'OBJECT_CLEANUP' },
      });
      if (execution?.status === 'SUCCEEDED') {
        return execution;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Upload cleanup did not succeed within 15 seconds.');
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

  function createTextPdf(pageTexts: readonly string[]) {
    const pageObjectStart = 3;
    const streamObjectStart = pageObjectStart + pageTexts.length;
    const fontObjectId = streamObjectStart + pageTexts.length;
    const pageIds = pageTexts.map((_, index) => pageObjectStart + index);
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
      ...pageTexts.map(
        (_, index) =>
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${streamObjectStart + index} 0 R >>`,
      ),
      ...pageTexts.map((text) => {
        const escaped = text.replace(/([\\()])/g, '\\$1');
        const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
        return `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
      }),
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    pdf += offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf);
  }

  function runJobCli(args: readonly string[]): Record<string, unknown> {
    const stdout = execFileSync(
      'pnpm',
      [
        '--filter',
        '@stocklens/worker',
        'exec',
        'tsx',
        'src/job-operations.ts',
        ...args,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          ALLOW_JOB_RERUN: 'true',
          JOB_OPERATOR_SECRET:
            'stocklens-integration-job-secret-at-least-32-characters',
          NODE_ENV: 'test',
          REDIS_URL: redis.url,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return JSON.parse(stdout.trim()) as Record<string, unknown>;
  }
});
