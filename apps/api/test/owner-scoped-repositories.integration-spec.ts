import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { AnalysisRepository } from '../src/database/analysis.repository';
import { DocumentUploadRepository } from '../src/database/document-upload.repository';
import { DocumentRepository } from '../src/database/document.repository';
import { ObjectCleanupRepository } from '../src/database/object-cleanup.repository';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('owner-scoped repositories', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let analysisRepository: AnalysisRepository;
  let documentUploadRepository: DocumentUploadRepository;
  let documentRepository: DocumentRepository;
  let objectCleanupRepository: ObjectCleanupRepository;
  const testRunId = randomUUID();

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    analysisRepository = new AnalysisRepository(prisma);
    documentUploadRepository = new DocumentUploadRepository(prisma);
    documentRepository = new DocumentRepository(prisma);
    objectCleanupRepository = new ObjectCleanupRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
    if (container !== undefined) {
      await container.stop();
    }
  });

  it('isolates analysis reads, updates, lists, and deletes by owner', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysisA = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Owner A analysis',
    });
    const analysisB = await analysisRepository.create({
      ownerId: ownerB,
      title: 'Owner B analysis',
    });

    await expect(
      analysisRepository.findActiveById(ownerB, analysisA.id),
    ).resolves.toBeNull();
    await expect(
      analysisRepository.rename(ownerB, analysisA.id, 'Cross-user rename'),
    ).resolves.toBe(false);
    await expect(
      analysisRepository.softDelete(ownerB, analysisA.id),
    ).resolves.toBe(false);
    await expect(
      analysisRepository.listActive(ownerB, { limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ id: analysisB.id })]);

    await expect(
      analysisRepository.rename(ownerA, analysisA.id, 'Authorized rename'),
    ).resolves.toBe(true);
    await expect(
      analysisRepository.findActiveById(ownerA, analysisA.id),
    ).resolves.toMatchObject({ title: 'Authorized rename' });
  });

  it('isolates document creation, reads, updates, and deletes by owner', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysisA = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Document ownership analysis',
    });
    const input = {
      analysisId: analysisA.id,
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      ownerId: ownerA,
      sha256: 'a'.repeat(64),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    };
    const document = await documentRepository.createForAnalysis(input);
    expect(document).not.toBeNull();
    if (document === null) {
      throw new Error('Expected the owner-scoped document to be created.');
    }

    await expect(
      documentRepository.createForAnalysis({
        ...input,
        ownerId: ownerB,
        storageKey: `${testRunId}/${randomUUID()}.pdf`,
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.document.create({
        data: {
          ...input,
          ownerId: ownerB,
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.documentPage.create({
        data: {
          documentId: document.id,
          ownerId: ownerB,
          pageNumber: 1,
          text: 'cross-owner page',
          textSha256: '1'.repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const page = await prisma.documentPage.create({
      data: {
        documentId: document.id,
        ownerId: ownerA,
        pageNumber: 1,
        text: 'owned page',
        textSha256: '2'.repeat(64),
      },
    });
    await expect(
      prisma.documentChunk.create({
        data: {
          chunkIndex: 0,
          content: 'cross-owner chunk',
          contentSha256: '3'.repeat(64),
          documentId: document.id,
          ownerId: ownerB,
          pageId: page.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      documentRepository.findActiveById(ownerB, document.id),
    ).resolves.toBeNull();
    await expect(
      documentRepository.markUploaded(ownerB, document.id),
    ).resolves.toBe(false);
    await expect(
      documentRepository.softDelete(ownerB, document.id),
    ).resolves.toBe(false);
    await expect(
      documentRepository.listActiveForAnalysis(ownerB, analysisA.id),
    ).resolves.toEqual([]);

    await expect(
      documentRepository.markUploaded(ownerA, document.id),
    ).resolves.toBe(true);
    const uploadedDocument = await documentRepository.findActiveById(
      ownerA,
      document.id,
    );
    expect(uploadedDocument?.uploadedAt).toBeInstanceOf(Date);
  });

  it('soft-deletes an owned analysis and its active documents together', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Analysis to delete',
    });
    const document = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'delete-me.pdf',
      ownerId: ownerA,
      sha256: 'b'.repeat(64),
      sizeBytes: 2048n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    expect(document).not.toBeNull();

    const deletedAt = new Date('2026-07-22T00:00:00.000Z');
    await expect(
      analysisRepository.softDelete(ownerA, analysis.id, deletedAt),
    ).resolves.toBe(true);
    await expect(
      analysisRepository.findActiveById(ownerA, analysis.id),
    ).resolves.toBeNull();
    if (document !== null) {
      await expect(
        documentRepository.findActiveById(ownerA, document.id),
      ).resolves.toBeNull();
    }
  });

  it('OWN-DEV-003 converges concurrent parent deletion and child creation', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Concurrent ownership analysis',
    });

    await Promise.all([
      documentRepository.createForAnalysis({
        analysisId: analysis.id,
        mimeType: 'application/pdf',
        originalName: 'concurrent.pdf',
        ownerId: ownerA,
        sha256: 'c'.repeat(64),
        sizeBytes: 4096n,
        storageBucket: 'stocklens-test',
        storageKey: `${testRunId}/${randomUUID()}.pdf`,
      }),
      analysisRepository.softDelete(ownerA, analysis.id),
    ]);

    await expect(
      documentRepository.listActiveForAnalysis(ownerA, analysis.id),
    ).resolves.toEqual([]);
  });

  it('PDF-FR-009 scopes upload sessions to the analysis owner', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Upload ownership analysis',
    });
    const upload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });

    expect(upload).toMatchObject({
      analysisId: analysis.id,
      ownerId: ownerA,
      status: 'PENDING',
    });
    await expect(
      prisma.documentUpload.create({
        data: createUploadData(ownerB, analysis.id, testRunId),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('PDF-FR-003 and PDF-FR-009 enforce upload metadata and lifecycle constraints', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Upload constraint analysis',
    });
    const baseData = createUploadData(ownerA, analysis.id, testRunId);

    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          declaredSizeBytes: 1n,
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).resolves.toMatchObject({ declaredSizeBytes: 1n });
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          declaredSizeBytes: 20n * 1024n * 1024n,
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).resolves.toMatchObject({ declaredSizeBytes: 20n * 1024n * 1024n });
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          declaredSizeBytes: 0n,
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_declaredSizeBytes_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          declaredSizeBytes: 20n * 1024n * 1024n + 1n,
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_declaredSizeBytes_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          claimedSha256: 'A'.repeat(64),
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_claimedSha256_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          originalName: '',
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_requiredMetadata_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_expiresAt_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          status: 'REJECTED',
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_failureState_check');
    await expect(
      prisma.documentUpload.create({
        data: {
          ...baseData,
          completedAt: new Date(),
          status: 'COMPLETED',
          storageKey: `${testRunId}/${randomUUID()}.pdf`,
        },
      }),
    ).rejects.toThrow('DocumentUpload_completionState_check');
  });

  it('PDF-FR-009 installs ownership, expiry, and duplicate lookup indexes', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'DocumentUpload'
    `;
    const indexNames = indexes.map(({ indexname }) => indexname);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'DocumentUpload_ownerId_analysisId_status_idx',
        'DocumentUpload_status_expiresAt_idx',
        'DocumentUpload_ownerId_analysisId_claimedSha256_idx',
        'DocumentUpload_ownerId_analysisId_finalizedDocumentId_key',
      ]),
    );
  });

  it('PDF-FR-009 finalizes one upload session to one owner-consistent document', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Upload finalization analysis',
    });
    const upload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    const document = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'finalized.pdf',
      ownerId: ownerA,
      sha256: 'd'.repeat(64),
      sizeBytes: 8192n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    expect(document).not.toBeNull();
    if (document === null) {
      throw new Error('Expected the finalized document to be created.');
    }

    await expect(
      prisma.documentUpload.update({
        data: {
          completedAt: new Date(),
          finalizedDocumentId: document.id,
          status: 'COMPLETED',
        },
        where: { id: upload.id },
      }),
    ).resolves.toMatchObject({
      finalizedDocumentId: document.id,
      status: 'COMPLETED',
    });

    const duplicateUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    await expect(
      prisma.documentUpload.update({
        data: {
          completedAt: new Date(),
          finalizedDocumentId: document.id,
          status: 'COMPLETED',
        },
        where: { id: duplicateUpload.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const otherAnalysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Other upload finalization analysis',
    });
    const otherDocument = await documentRepository.createForAnalysis({
      analysisId: otherAnalysis.id,
      mimeType: 'application/pdf',
      originalName: 'other.pdf',
      ownerId: ownerA,
      sha256: 'e'.repeat(64),
      sizeBytes: 8192n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    expect(otherDocument).not.toBeNull();
    if (otherDocument === null) {
      throw new Error('Expected the other document to be created.');
    }
    const crossAnalysisUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });

    await expect(
      prisma.documentUpload.update({
        data: {
          completedAt: new Date(),
          finalizedDocumentId: otherDocument.id,
          status: 'COMPLETED',
        },
        where: { id: crossAnalysisUpload.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('PDF-FR-008 and PDF-FR-009 persist one idempotent cleanup execution per target', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Object cleanup analysis',
    });
    const upload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    const input = {
      analysisId: analysis.id,
      ownerId: ownerA,
      target: { id: upload.id, kind: 'document-upload' as const },
    };

    const first = await objectCleanupRepository.createOrFind(input);
    const repeated = await objectCleanupRepository.createOrFind(input);

    expect(first).toMatchObject({ status: 'QUEUED' });
    expect(repeated).toEqual(first);
    expect(
      await prisma.jobExecution.count({
        where: {
          idempotencyKey: `object-cleanup:document-upload:${upload.id}:v1`,
        },
      }),
    ).toBe(1);
    await expect(
      prisma.jobExecution.create({
        data: {
          analysisId: analysis.id,
          idempotencyKey: `invalid-object-cleanup-${randomUUID()}`,
          ownerId: ownerA,
          step: 'OBJECT_CLEANUP',
        },
      }),
    ).rejects.toThrow('JobExecution_objectCleanupTarget_check');

    const otherAnalysis = await analysisRepository.create({
      ownerId: ownerB,
      title: 'Cross-owner cleanup target',
    });
    const otherUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerB, otherAnalysis.id, testRunId),
    });
    await expect(
      prisma.jobExecution.create({
        data: {
          analysisId: analysis.id,
          documentUploadId: otherUpload.id,
          idempotencyKey: `cross-owner-object-cleanup-${randomUUID()}`,
          ownerId: ownerA,
          step: 'OBJECT_CLEANUP',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('PDF-FR-007 atomically finalizes a claimed upload and returns it idempotently', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Transactional finalize analysis',
    });
    const upload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    const now = new Date();

    await expect(
      documentUploadRepository.claimForFinalize({
        analysisId: analysis.id,
        id: upload.id,
        now,
        ownerId: ownerA,
      }),
    ).resolves.toMatchObject({ kind: 'claimed' });
    const completed = await documentUploadRepository.completeFinalize({
      analysisId: analysis.id,
      id: upload.id,
      now,
      ownerId: ownerA,
      sha256: upload.claimedSha256,
      sizeBytes: Number(upload.declaredSizeBytes),
    });
    expect(completed).toMatchObject({ kind: 'completed' });
    if (completed.kind !== 'completed') {
      throw new Error('Expected upload finalization to complete.');
    }

    await expect(
      prisma.documentUpload.findUnique({ where: { id: upload.id } }),
    ).resolves.toMatchObject({
      completedAt: now,
      finalizedDocumentId: completed.document.id,
      status: 'COMPLETED',
    });
    await expect(
      analysisRepository.findActiveById(ownerA, analysis.id),
    ).resolves.toMatchObject({ status: 'UPLOADED' });
    await expect(
      documentUploadRepository.claimForFinalize({
        analysisId: analysis.id,
        id: upload.id,
        now: new Date(now.getTime() + 1_000),
        ownerId: ownerA,
      }),
    ).resolves.toMatchObject({
      document: { id: completed.document.id },
      kind: 'completed',
    });
    expect(
      await prisma.document.count({
        where: { analysisId: analysis.id, ownerId: ownerA },
      }),
    ).toBe(1);
  });

  it('PDF-TASK-015 keeps concurrent upload reservations within the three-file limit', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Concurrent upload reservation analysis',
    });
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        retryP2034ForAcceptance(() =>
          documentUploadRepository.createPending({
            analysisId: analysis.id,
            claimedSha256: String(index).repeat(64),
            declaredMimeType: 'application/pdf',
            declaredSizeBytes: 1024,
            documentType: 'UNKNOWN',
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            id: randomUUID(),
            now,
            originalName: `concurrent-${index}.pdf`,
            ownerId: ownerA,
            storageBucket: 'stocklens-test',
            storageKey: `${testRunId}/${randomUUID()}.pdf`,
          }),
        ),
      ),
    );

    expect(results.filter(({ kind }) => kind === 'created')).toHaveLength(3);
    expect(
      results.filter(({ kind }) => kind === 'limit-exceeded'),
    ).toHaveLength(1);
    await expect(
      prisma.documentUpload.count({
        where: {
          analysisId: analysis.id,
          ownerId: ownerA,
          status: { in: ['PENDING', 'VALIDATING'] },
        },
      }),
    ).resolves.toBe(3);
  });

  it('PDF-TASK-015 converges concurrent finalize and delete without duplicate records', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Concurrent finalize analysis',
    });
    const upload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    const now = new Date();
    await expect(
      documentUploadRepository.claimForFinalize({
        analysisId: analysis.id,
        id: upload.id,
        now,
        ownerId: ownerA,
      }),
    ).resolves.toMatchObject({ kind: 'claimed' });

    const finalizeInput = {
      analysisId: analysis.id,
      id: upload.id,
      now,
      ownerId: ownerA,
      sha256: upload.claimedSha256,
      sizeBytes: Number(upload.declaredSizeBytes),
    };
    const finalized = await Promise.all([
      documentUploadRepository.completeFinalize(finalizeInput),
      documentUploadRepository.completeFinalize(finalizeInput),
    ]);
    expect(finalized).toEqual([
      expect.objectContaining({ kind: 'completed' }),
      expect.objectContaining({ kind: 'completed' }),
    ]);
    const documentIds = finalized.flatMap((result) =>
      result.kind === 'completed' ? [result.document.id] : [],
    );
    expect(new Set(documentIds).size).toBe(1);
    const documentId = documentIds[0];
    if (documentId === undefined) {
      throw new Error('Concurrent finalize did not return a document.');
    }
    await expect(
      prisma.document.count({ where: { analysisId: analysis.id } }),
    ).resolves.toBe(1);

    const [repeatedFinalize, deleted] = await Promise.all([
      documentUploadRepository.claimForFinalize({
        analysisId: analysis.id,
        id: upload.id,
        now: new Date(now.getTime() + 1),
        ownerId: ownerA,
      }),
      documentRepository.deleteFinalizedForAnalysis({
        analysisId: analysis.id,
        deletedAt: new Date(now.getTime() + 1),
        id: documentId,
        ownerId: ownerA,
      }),
    ]);
    expect(repeatedFinalize).toMatchObject({
      document: { id: documentId },
      kind: 'completed',
    });
    expect(deleted).toEqual({ kind: 'deleted' });
    await expect(
      prisma.jobExecution.count({
        where: { documentId, step: 'OBJECT_CLEANUP' },
      }),
    ).resolves.toBe(1);
  });

  it('PDF-FR-009 rejects invalid and expired uploads with durable cleanup', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Rejected finalize analysis',
    });
    const invalidUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, analysis.id, testRunId),
    });
    await documentUploadRepository.claimForFinalize({
      analysisId: analysis.id,
      id: invalidUpload.id,
      now: new Date(),
      ownerId: ownerA,
    });
    await expect(
      documentUploadRepository.rejectInvalidFinalize({
        analysisId: analysis.id,
        failureCode: 'INVALID_PDF_HEADER',
        failureMessage: 'Uploaded object failed validation.',
        id: invalidUpload.id,
        ownerId: ownerA,
      }),
    ).resolves.toBe(true);

    const expiredUpload = await prisma.documentUpload.create({
      data: {
        ...createUploadData(ownerA, analysis.id, testRunId),
        status: 'VALIDATING',
      },
    });
    await expect(
      documentUploadRepository.claimForFinalize({
        analysisId: analysis.id,
        id: expiredUpload.id,
        now: new Date(expiredUpload.expiresAt.getTime() + 1),
        ownerId: ownerA,
      }),
    ).resolves.toEqual({ kind: 'expired' });
    await expect(
      prisma.documentUpload.findMany({
        orderBy: { id: 'asc' },
        where: { id: { in: [invalidUpload.id, expiredUpload.id] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCode: 'INVALID_PDF_HEADER',
          id: invalidUpload.id,
          status: 'REJECTED',
        }),
        expect.objectContaining({
          failureCode: null,
          id: expiredUpload.id,
          status: 'EXPIRED',
        }),
      ]),
    );
    expect(
      await prisma.jobExecution.count({
        where: {
          documentUploadId: { in: [invalidUpload.id, expiredUpload.id] },
          status: 'QUEUED',
          step: 'OBJECT_CLEANUP',
        },
      }),
    ).toBe(2);
  });

  it('PDF-FR-002 rejects duplicate SHA and a fourth active document transactionally', async () => {
    const [ownerA] = await createOwners(prisma, testRunId);
    const duplicateAnalysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Duplicate finalize analysis',
    });
    const duplicateUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, duplicateAnalysis.id, testRunId),
    });
    await documentRepository.createForAnalysis({
      analysisId: duplicateAnalysis.id,
      mimeType: 'application/pdf',
      originalName: 'existing.pdf',
      ownerId: ownerA,
      sha256: duplicateUpload.claimedSha256,
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    await documentUploadRepository.claimForFinalize({
      analysisId: duplicateAnalysis.id,
      id: duplicateUpload.id,
      now: new Date(),
      ownerId: ownerA,
    });
    await expect(
      documentUploadRepository.completeFinalize({
        analysisId: duplicateAnalysis.id,
        id: duplicateUpload.id,
        now: new Date(),
        ownerId: ownerA,
        sha256: duplicateUpload.claimedSha256,
        sizeBytes: 1024,
      }),
    ).resolves.toEqual({ kind: 'duplicate' });

    const limitAnalysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Finalize limit analysis',
    });
    for (let index = 0; index < 3; index += 1) {
      await documentRepository.createForAnalysis({
        analysisId: limitAnalysis.id,
        mimeType: 'application/pdf',
        originalName: `existing-${index}.pdf`,
        ownerId: ownerA,
        sha256: String(index).repeat(64),
        sizeBytes: 1024n,
        storageBucket: 'stocklens-test',
        storageKey: `${testRunId}/${randomUUID()}.pdf`,
      });
    }
    const limitUpload = await prisma.documentUpload.create({
      data: createUploadData(ownerA, limitAnalysis.id, testRunId),
    });
    await documentUploadRepository.claimForFinalize({
      analysisId: limitAnalysis.id,
      id: limitUpload.id,
      now: new Date(),
      ownerId: ownerA,
    });
    await expect(
      documentUploadRepository.completeFinalize({
        analysisId: limitAnalysis.id,
        id: limitUpload.id,
        now: new Date(),
        ownerId: ownerA,
        sha256: limitUpload.claimedSha256,
        sizeBytes: 1024,
      }),
    ).resolves.toEqual({ kind: 'limit-exceeded' });

    await expect(
      prisma.documentUpload.findMany({
        where: { id: { in: [duplicateUpload.id, limitUpload.id] } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCode: 'DUPLICATE_DOCUMENT',
          id: duplicateUpload.id,
          status: 'REJECTED',
        }),
        expect.objectContaining({
          failureCode: 'DOCUMENT_LIMIT_EXCEEDED',
          id: limitUpload.id,
          status: 'REJECTED',
        }),
      ]),
    );
    expect(
      await prisma.jobExecution.count({
        where: {
          documentUploadId: { in: [duplicateUpload.id, limitUpload.id] },
          step: 'OBJECT_CLEANUP',
        },
      }),
    ).toBe(2);
  });

  it('PDF-FR-008 lists only active finalized documents for an owned analysis', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Document list analysis',
    });
    const finalized = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'finalized.pdf',
      ownerId: ownerA,
      sha256: '1'.repeat(64),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    const notFinalized = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'not-finalized.pdf',
      ownerId: ownerA,
      sha256: '2'.repeat(64),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    const deleted = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'deleted.pdf',
      ownerId: ownerA,
      sha256: '3'.repeat(64),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    expect(finalized).not.toBeNull();
    expect(notFinalized).not.toBeNull();
    expect(deleted).not.toBeNull();
    if (finalized === null || deleted === null) {
      throw new Error('Expected document fixtures to be created.');
    }
    await documentRepository.markUploaded(ownerA, finalized.id);
    await documentRepository.markUploaded(ownerA, deleted.id);
    await documentRepository.softDelete(ownerA, deleted.id);

    await expect(
      documentRepository.listFinalizedForAnalysis(ownerA, analysis.id),
    ).resolves.toMatchObject({
      documents: [{ id: finalized.id }],
      kind: 'found',
    });
    await expect(
      documentRepository.listFinalizedForAnalysis(ownerB, analysis.id),
    ).resolves.toEqual({ kind: 'analysis-not-found' });
  });

  it('PDF-AC-008 soft-deletes a finalized document with one durable cleanup execution', async () => {
    const [ownerA, ownerB] = await createOwners(prisma, testRunId);
    const analysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Document delete analysis',
    });
    const document = await documentRepository.createForAnalysis({
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'delete-finalized.pdf',
      ownerId: ownerA,
      sha256: '4'.repeat(64),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${testRunId}/${randomUUID()}.pdf`,
    });
    expect(document).not.toBeNull();
    if (document === null) {
      throw new Error('Expected the delete fixture to be created.');
    }
    await documentRepository.markUploaded(ownerA, document.id);
    const deletedAt = new Date();

    await expect(
      documentRepository.deleteFinalizedForAnalysis({
        analysisId: analysis.id,
        deletedAt,
        id: document.id,
        ownerId: ownerB,
      }),
    ).resolves.toEqual({ kind: 'analysis-not-found' });
    await expect(
      documentRepository.findActiveById(ownerA, document.id),
    ).resolves.toMatchObject({ id: document.id });

    const otherAnalysis = await analysisRepository.create({
      ownerId: ownerA,
      title: 'Cross-analysis document delete',
    });
    await expect(
      documentRepository.deleteFinalizedForAnalysis({
        analysisId: otherAnalysis.id,
        deletedAt,
        id: document.id,
        ownerId: ownerA,
      }),
    ).resolves.toEqual({ kind: 'document-not-found' });
    await expect(
      documentRepository.findActiveById(ownerA, document.id),
    ).resolves.toMatchObject({ id: document.id });

    await expect(
      documentRepository.deleteFinalizedForAnalysis({
        analysisId: analysis.id,
        deletedAt,
        id: document.id,
        ownerId: ownerA,
      }),
    ).resolves.toEqual({ kind: 'deleted' });
    await expect(
      documentRepository.findActiveById(ownerA, document.id),
    ).resolves.toBeNull();
    await expect(
      prisma.document.findUnique({ where: { id: document.id } }),
    ).resolves.toMatchObject({ deletedAt });
    expect(
      await prisma.jobExecution.count({
        where: {
          documentId: document.id,
          idempotencyKey: `object-cleanup:document:${document.id}:v1`,
          status: 'QUEUED',
          step: 'OBJECT_CLEANUP',
        },
      }),
    ).toBe(1);

    await expect(
      documentRepository.deleteFinalizedForAnalysis({
        analysisId: analysis.id,
        deletedAt: new Date(deletedAt.getTime() + 1_000),
        id: document.id,
        ownerId: ownerA,
      }),
    ).resolves.toEqual({ kind: 'document-not-found' });
    expect(
      await prisma.jobExecution.count({
        where: { documentId: document.id, step: 'OBJECT_CLEANUP' },
      }),
    ).toBe(1);
  });
});

async function retryP2034ForAcceptance<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (!hasPrismaCode(error, 'P2034') || attempt === attempts) throw error;
    }
  }
  throw new Error('Test-only P2034 retry loop exhausted.');
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function createUploadData(
  ownerId: string,
  analysisId: string,
  testRunId: string,
) {
  return {
    analysisId,
    claimedSha256: 'f'.repeat(64),
    declaredMimeType: 'application/pdf',
    declaredSizeBytes: 1024n,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    originalName: 'upload.pdf',
    ownerId,
    storageBucket: 'stocklens-test',
    storageKey: `${testRunId}/${randomUUID()}.pdf`,
  };
}

async function createOwners(
  prisma: PrismaClient,
  testRunId: string,
): Promise<[string, string]> {
  const firstId = randomUUID();
  const secondId = randomUUID();
  await prisma.user.createMany({
    data: [firstId, secondId].map((id) => ({
      email: `${id}@${testRunId}.integration.test`,
      id,
      passwordHash: 'integration-test-password-hash',
    })),
  });
  return [firstId, secondId];
}
