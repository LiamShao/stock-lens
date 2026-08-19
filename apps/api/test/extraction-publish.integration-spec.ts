import { createHash, randomUUID } from 'node:crypto';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { PrismaService } from '../src/database/prisma.service';
import { validateExtractionEvidence } from '../../worker/src/evidence-validator';
import { ExtractionPublishRepository } from '../../worker/src/extraction-publish.repository';
import { extractFinancialMetricSnapshot } from '../../worker/src/financial-metric-parser';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('EXTRACT-TASK-008 atomic extraction publish', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: ExtractionPublishRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    repository = new ExtractionPublishRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma !== undefined) await prisma.$disconnect();
    if (container !== undefined) await container.stop();
  });

  it('EXTRACT-AC-004/FR-009 atomically publishes exact evidence and converges on replacement', async () => {
    const fixture = await createFixture(prisma);
    const sources = await repository.loadActiveSources(
      fixture.ownerId,
      fixture.analysisId,
    );
    const validated = validateExtractionEvidence(
      {
        findings: [
          {
            bodyJa: '売上高は前年同期比で増加した。',
            category: 'FINANCIAL_HIGHLIGHT',
            evidence: [
              {
                chunkId: fixture.chunkId,
                excerpt: '売上高は前年同期比10%増加',
              },
            ],
            findingKey: 'financial.revenue-growth',
            importance: 4,
            titleJa: '売上高の増加',
          },
          {
            bodyJa: '追加資料が必要である。',
            category: 'MISSING_INFORMATION',
            evidence: [],
            findingKey: 'missing.segment-detail',
            importance: 2,
            titleJa: 'セグメント情報不足',
          },
        ],
      },
      sources,
    );
    const publishInput = {
      analysisId: fixture.analysisId,
      expectedPrompt: {
        contentSha256: fixture.promptSha256,
        id: fixture.promptId,
      },
      expectedSources: sources,
      financialMetrics: extractFinancialMetricSnapshot([]),
      ownerId: fixture.ownerId,
      validated,
    };

    await repository.publish(publishInput);

    await expect(
      prisma.analysis.findUnique({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({
      financialMetrics: { schemaVersion: '1.0.0' },
      status: 'READY_FOR_VIEW_GENERATION',
    });
    const findings = await prisma.analysisFinding.findMany({
      include: { evidenceLinks: { include: { evidence: true } } },
      orderBy: { findingKey: 'asc' },
      where: { analysisId: fixture.analysisId },
    });
    expect(findings).toHaveLength(2);
    const supported = findings.find(
      (finding) => finding.findingKey === 'financial.revenue-growth',
    );
    expect(supported?.status).toBe('SUPPORTED');
    expect(supported?.evidenceLinks).toHaveLength(1);
    expect(supported?.evidenceLinks[0]?.evidence).toMatchObject({
      chunkId: fixture.chunkId,
      documentId: fixture.documentId,
      excerpt: '売上高は前年同期比10%増加',
      pageNumber: 1,
      startOffset: 3,
    });
    const insufficient = findings.find(
      (finding) => finding.findingKey === 'missing.segment-detail',
    );
    expect(insufficient?.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(insufficient?.evidenceLinks).toEqual([]);

    await prisma.analysis.update({
      data: { status: 'VALIDATING' },
      where: { id: fixture.analysisId },
    });
    await repository.publish(publishInput);
    await expect(
      Promise.all([
        prisma.analysisFinding.count({
          where: { analysisId: fixture.analysisId },
        }),
        prisma.evidence.count({ where: { analysisId: fixture.analysisId } }),
        prisma.findingEvidence.count({
          where: { analysisId: fixture.analysisId },
        }),
      ]),
    ).resolves.toEqual([2, 1, 1]);
  });

  it('EXTRACT-AC-005/012 fails closed on owner, input, or prompt changes', async () => {
    const fixture = await createFixture(prisma);
    const otherOwner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'test-password-hash',
      },
    });
    const sources = await repository.loadActiveSources(
      fixture.ownerId,
      fixture.analysisId,
    );
    const input = createPublishInput(fixture, sources);

    await expect(
      repository.loadActiveSources(otherOwner.id, fixture.analysisId),
    ).resolves.toEqual([]);

    await expect(
      repository.publish({ ...input, ownerId: otherOwner.id }),
    ).rejects.toMatchObject({ code: 'EXTRACTION_TARGET_CHANGED' });

    await prisma.documentChunk.update({
      data: {
        content: '変更された原文',
        contentSha256: sha256('変更された原文'),
      },
      where: { id: fixture.chunkId },
    });
    await expect(repository.publish(input)).rejects.toMatchObject({
      code: 'EXTRACTION_INPUT_CHANGED',
    });

    const changedSources = await repository.loadActiveSources(
      fixture.ownerId,
      fixture.analysisId,
    );
    await prisma.promptVersion.update({
      data: { isActive: false },
      where: { id: fixture.promptId },
    });
    await expect(
      repository.publish(createPublishInput(fixture, changedSources)),
    ).rejects.toMatchObject({ code: 'EXTRACTION_PROMPT_CHANGED' });
    await expect(
      prisma.analysisFinding.count({
        where: { analysisId: fixture.analysisId },
      }),
    ).resolves.toBe(0);
  });

  it('EXTRACT-FR-009 rolls back replacement when any row fails', async () => {
    const fixture = await createFixture(prisma);
    const sources = await repository.loadActiveSources(
      fixture.ownerId,
      fixture.analysisId,
    );
    const input = createPublishInput(fixture, sources);
    await repository.publish(input);
    const original = await prisma.analysisFinding.findFirstOrThrow({
      where: { analysisId: fixture.analysisId },
    });
    await prisma.analysis.update({
      data: { status: 'VALIDATING' },
      where: { id: fixture.analysisId },
    });

    await expect(
      repository.publish({
        ...input,
        validated: {
          findings: [
            input.validated.findings[0]!,
            input.validated.findings[0]!,
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.analysisFinding.findMany({
        where: { analysisId: fixture.analysisId },
      }),
    ).resolves.toEqual([expect.objectContaining({ id: original.id })]);
    await expect(
      prisma.analysis.findUnique({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({ status: 'VALIDATING' });
  });
});

function createPublishInput(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  sources: Awaited<
    ReturnType<ExtractionPublishRepository['loadActiveSources']>
  >,
) {
  return {
    analysisId: fixture.analysisId,
    expectedPrompt: {
      contentSha256: fixture.promptSha256,
      id: fixture.promptId,
    },
    expectedSources: sources,
    financialMetrics: extractFinancialMetricSnapshot([]),
    ownerId: fixture.ownerId,
    validated: validateExtractionEvidence(
      {
        findings: [
          {
            bodyJa: '資料に記載された事実である。',
            category: 'BUSINESS_OVERVIEW',
            evidence: [],
            findingKey: 'business.fact',
            importance: 3,
            titleJa: '事業概要',
          },
        ],
      },
      sources,
    ),
  };
}

async function createFixture(prisma: PrismaService) {
  const owner = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: 'test-password-hash',
    },
  });
  const analysis = await prisma.analysis.create({
    data: {
      ownerId: owner.id,
      status: 'VALIDATING',
      title: 'Extraction publish',
    },
  });
  const document = await prisma.document.create({
    data: {
      analysisId: analysis.id,
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      ownerId: owner.id,
      sha256: sha256('pdf'),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${randomUUID()}/results.pdf`,
    },
  });
  const pageText = '前文。売上高は前年同期比10%増加した。後文。';
  const page = await prisma.documentPage.create({
    data: {
      documentId: document.id,
      ownerId: owner.id,
      pageNumber: 1,
      text: pageText,
      textSha256: sha256(pageText),
    },
  });
  const chunk = await prisma.documentChunk.create({
    data: {
      chunkIndex: 0,
      content: pageText,
      contentSha256: sha256(pageText),
      documentId: document.id,
      ownerId: owner.id,
      pageId: page.id,
    },
  });
  const promptContent = `prompt-${randomUUID()}`;
  const promptSha256 = sha256(promptContent);
  const prompt = await prisma.promptVersion.create({
    data: {
      contentSha256: promptSha256,
      isActive: true,
      name: `structured-${randomUUID()}`,
      schemaVersion: '1.0.0',
      template: promptContent,
      version: 1,
    },
  });
  return {
    analysisId: analysis.id,
    chunkId: chunk.id,
    documentId: document.id,
    ownerId: owner.id,
    promptId: prompt.id,
    promptSha256,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
