import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { AnalysisRepository } from '../src/database/analysis.repository';
import { DocumentRepository } from '../src/database/document.repository';
import { ObjectCleanupRepository } from '../src/database/object-cleanup.repository';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('owner-scoped repositories', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let analysisRepository: AnalysisRepository;
  let documentRepository: DocumentRepository;
  let objectCleanupRepository: ObjectCleanupRepository;
  const testRunId = randomUUID();

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    analysisRepository = new AnalysisRepository(prisma);
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
});

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
