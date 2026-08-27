import { createHash, randomUUID } from 'node:crypto';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { analysisViewsGenerationOutputSchema } from '@stocklens/shared';

import { PrismaService } from '../src/database/prisma.service';
import { AnalysisViewsPublishRepository } from '../../worker/src/analysis-views-publish.repository';
import { extractFinancialMetricSnapshot } from '../../worker/src/financial-metric-parser';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('VIEW-TASK-004 owner-scoped atomic view publish', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: AnalysisViewsPublishRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    repository = new AnalysisViewsPublishRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma !== undefined) await prisma.$disconnect();
    if (container !== undefined) await container.stop();
  });

  it('VIEW-AC-002/004 atomically publishes three views and completion metadata', async () => {
    const fixture = await createFixture(prisma);
    const snapshot = await repository.loadSource(
      fixture.ownerId,
      fixture.analysisId,
    );
    const output = createOutput(fixture.evidenceId);
    const completedAt = new Date('2026-08-27T10:00:00.000Z');

    expect(snapshot.source.findings[0]?.evidences[0]).toEqual({
      chunkId: fixture.chunkId,
      documentId: fixture.documentId,
      documentName: 'results.pdf',
      excerpt: '売上高は前年同期比10%増加',
      id: fixture.evidenceId,
      pageNumber: 1,
    });

    await repository.publish(
      {
        analysisId: fixture.analysisId,
        expectedInputHash: snapshot.inputHash,
        expectedPrompt: fixture.prompt,
        output,
        ownerId: fixture.ownerId,
      },
      completedAt,
    );

    await expect(
      prisma.analysis.findUnique({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({
      analystViewOutput: output.analystView,
      buffettMungerOutput: output.buffettMunger,
      completedAt,
      justTellMeOutput: output.justTellMe,
      status: 'COMPLETED',
    });

    await expect(
      repository.publish({
        analysisId: fixture.analysisId,
        expectedInputHash: snapshot.inputHash,
        expectedPrompt: fixture.prompt,
        output,
        ownerId: fixture.ownerId,
      }),
    ).rejects.toMatchObject({ code: 'VIEW_TARGET_CHANGED' });
  });

  it('VIEW-AC-005 rejects unknown, unlinked, and cross-owner evidence without partial output', async () => {
    const fixture = await createFixture(prisma);
    const snapshot = await repository.loadSource(
      fixture.ownerId,
      fixture.analysisId,
    );
    const unlinkedEvidenceId = await createUnlinkedEvidence(
      prisma,
      fixture,
      '追加の根拠',
    );
    const other = await createFixture(prisma, false);

    await expect(
      repository.loadSource(other.ownerId, fixture.analysisId),
    ).rejects.toMatchObject({ code: 'VIEW_SOURCE_UNAVAILABLE' });

    for (const evidenceId of [
      randomUUID(),
      unlinkedEvidenceId,
      other.evidenceId,
    ]) {
      await expect(
        repository.publish({
          analysisId: fixture.analysisId,
          expectedInputHash: snapshot.inputHash,
          expectedPrompt: fixture.prompt,
          output: createOutput(evidenceId),
          ownerId: fixture.ownerId,
        }),
      ).rejects.toMatchObject({ code: 'VIEW_CITATION_EVIDENCE_INVALID' });
    }

    await expect(
      prisma.analysis.findUnique({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({
      analystViewOutput: null,
      buffettMungerOutput: null,
      completedAt: null,
      justTellMeOutput: null,
      status: 'READY_FOR_VIEW_GENERATION',
    });
  });

  it('VIEW-AC-006 rejects compliance violations before persistence', async () => {
    const fixture = await createFixture(prisma);
    const snapshot = await repository.loadSource(
      fixture.ownerId,
      fixture.analysisId,
    );
    const output = createOutput(fixture.evidenceId);
    output.justTellMe.sections[0].blocks[0]!.text =
      'この株の購入を推奨します。';

    await expect(
      repository.publish({
        analysisId: fixture.analysisId,
        expectedInputHash: snapshot.inputHash,
        expectedPrompt: fixture.prompt,
        output,
        ownerId: fixture.ownerId,
      }),
    ).rejects.toMatchObject({ code: 'VIEW_OUTPUT_COMPLIANCE_FAILED' });
    await expect(
      prisma.analysis.findUnique({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({ status: 'READY_FOR_VIEW_GENERATION' });
  });

  it('VIEW-AC-009 fails closed when input, prompt, or active parent changes', async () => {
    const inputRace = await createFixture(prisma);
    const inputSnapshot = await repository.loadSource(
      inputRace.ownerId,
      inputRace.analysisId,
    );
    await prisma.analysisFinding.update({
      data: { body: 'Provider 呼出中に変更された Finding。' },
      where: { id: inputRace.findingId },
    });
    await expect(
      repository.publish({
        analysisId: inputRace.analysisId,
        expectedInputHash: inputSnapshot.inputHash,
        expectedPrompt: inputRace.prompt,
        output: createOutput(inputRace.evidenceId),
        ownerId: inputRace.ownerId,
      }),
    ).rejects.toMatchObject({ code: 'VIEW_INPUT_CHANGED' });

    const promptRace = await createFixture(prisma, false);
    const promptSnapshot = await repository.loadSource(
      promptRace.ownerId,
      promptRace.analysisId,
    );
    await prisma.promptVersion.update({
      data: { isActive: false },
      where: { id: promptRace.prompt.id },
    });
    await expect(
      repository.publish({
        analysisId: promptRace.analysisId,
        expectedInputHash: promptSnapshot.inputHash,
        expectedPrompt: promptRace.prompt,
        output: createOutput(promptRace.evidenceId),
        ownerId: promptRace.ownerId,
      }),
    ).rejects.toMatchObject({ code: 'VIEW_PROMPT_CHANGED' });

    const parentRace = await createFixture(prisma, true);
    const parentSnapshot = await repository.loadSource(
      parentRace.ownerId,
      parentRace.analysisId,
    );
    await prisma.analysis.update({
      data: { deletedAt: new Date() },
      where: { id: parentRace.analysisId },
    });
    await expect(
      repository.publish({
        analysisId: parentRace.analysisId,
        expectedInputHash: parentSnapshot.inputHash,
        expectedPrompt: parentRace.prompt,
        output: createOutput(parentRace.evidenceId),
        ownerId: parentRace.ownerId,
      }),
    ).rejects.toMatchObject({ code: 'VIEW_TARGET_CHANGED' });
  });
});

async function createFixture(prisma: PrismaService, activatePrompt = true) {
  if (activatePrompt) {
    await prisma.promptVersion.updateMany({
      data: { isActive: false },
      where: { name: 'analysis-views' },
    });
  }
  const owner = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: 'test-password-hash',
    },
  });
  const analysis = await prisma.analysis.create({
    data: {
      financialMetrics: extractFinancialMetricSnapshot([]),
      ownerId: owner.id,
      status: 'READY_FOR_VIEW_GENERATION',
      title: 'Analysis views publish',
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
  const text = '前文。売上高は前年同期比10%増加した。後文。追加の根拠。';
  const page = await prisma.documentPage.create({
    data: {
      documentId: document.id,
      ownerId: owner.id,
      pageNumber: 1,
      text,
      textSha256: sha256(text),
    },
  });
  const chunk = await prisma.documentChunk.create({
    data: {
      chunkIndex: 0,
      content: text,
      contentSha256: sha256(text),
      documentId: document.id,
      ownerId: owner.id,
      pageId: page.id,
    },
  });
  const finding = await prisma.analysisFinding.create({
    data: {
      analysisId: analysis.id,
      body: '売上高は前年同期比で増加した。',
      category: 'FINANCIAL_HIGHLIGHT',
      findingKey: 'financial.revenue-growth',
      importance: 4,
      ownerId: owner.id,
      status: 'SUPPORTED',
      title: '売上高の増加',
    },
  });
  const excerpt = '売上高は前年同期比10%増加';
  const evidence = await prisma.evidence.create({
    data: {
      analysisId: analysis.id,
      chunkId: chunk.id,
      documentId: document.id,
      endOffset: text.indexOf(excerpt) + excerpt.length,
      excerpt,
      excerptSha256: sha256(excerpt),
      ownerId: owner.id,
      pageId: page.id,
      pageNumber: 1,
      startOffset: text.indexOf(excerpt),
    },
  });
  await prisma.findingEvidence.create({
    data: {
      analysisId: analysis.id,
      evidenceId: evidence.id,
      findingId: finding.id,
      ownerId: owner.id,
    },
  });

  let prompt = await prisma.promptVersion.findFirst({
    where: {
      isActive: true,
      name: 'analysis-views',
      schemaVersion: 'analysis-views-v1',
    },
  });
  if (prompt === null) {
    const content = `view-prompt-${randomUUID()}`;
    prompt = await prisma.promptVersion.create({
      data: {
        contentSha256: sha256(content),
        isActive: true,
        name: 'analysis-views',
        schemaVersion: 'analysis-views-v1',
        template: content,
        version:
          (await prisma.promptVersion.count({
            where: { name: 'analysis-views' },
          })) + 1,
      },
    });
  }
  return {
    analysisId: analysis.id,
    chunkId: chunk.id,
    documentId: document.id,
    evidenceId: evidence.id,
    findingId: finding.id,
    ownerId: owner.id,
    pageId: page.id,
    prompt: { contentSha256: prompt.contentSha256, id: prompt.id },
  };
}

async function createUnlinkedEvidence(
  prisma: PrismaService,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  excerpt: string,
) {
  const evidence = await prisma.evidence.create({
    data: {
      analysisId: fixture.analysisId,
      chunkId: fixture.chunkId,
      documentId: fixture.documentId,
      excerpt,
      excerptSha256: sha256(excerpt),
      ownerId: fixture.ownerId,
      pageId: fixture.pageId,
      pageNumber: 1,
    },
  });
  return evidence.id;
}

function createOutput(evidenceId: string) {
  const view = (keys: readonly string[]) => ({
    schemaVersion: '1.0.0',
    sections: keys.map((key) => ({
      blocks: [
        {
          evidenceIds: [evidenceId],
          isMissingInformation: false,
          key: `${key.toLowerCase()}.fact`,
          text: '資料に基づく事実です。',
        },
      ],
      key,
      title: '概要',
    })),
  });
  return analysisViewsGenerationOutputSchema.parse({
    analystView: view([
      'BUSINESS_OVERVIEW',
      'FINANCIAL_HIGHLIGHTS',
      'MANAGEMENT_GUIDANCE',
      'POSITIVE_FINDINGS',
      'RISKS',
      'UNCERTAINTIES',
      'WATCH_ITEMS',
      'SOURCES',
    ]),
    buffettMunger: view([
      'BUSINESS_UNDERSTANDABILITY',
      'COMPETITIVE_ADVANTAGE',
      'CASH_GENERATION',
      'CAPITAL_ALLOCATION',
      'MANAGEMENT_INCENTIVES',
      'LONG_TERM_RISKS',
      'MISSING_INFORMATION',
    ]),
    justTellMe: view([
      'HOW_THE_COMPANY_MAKES_MONEY',
      'RECENT_CHANGES',
      'POSITIVES',
      'RISKS',
      'WATCH_ITEMS',
      'MISSING_INFORMATION',
    ]),
  });
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
