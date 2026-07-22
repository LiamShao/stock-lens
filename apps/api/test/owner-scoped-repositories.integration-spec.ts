import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { AnalysisRepository } from '../src/database/analysis.repository';
import { DocumentRepository } from '../src/database/document.repository';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('owner-scoped repositories', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let analysisRepository: AnalysisRepository;
  let documentRepository: DocumentRepository;
  const testRunId = randomUUID();

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    analysisRepository = new AnalysisRepository(prisma);
    documentRepository = new DocumentRepository(prisma);
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
});

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
