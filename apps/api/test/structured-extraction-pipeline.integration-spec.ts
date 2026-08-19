import { createHash, randomUUID } from 'node:crypto';

import { JobStep } from '@prisma/client';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createFinancialMetricsIdempotencyKey } from '@stocklens/shared';

import { PrismaService } from '../src/database/prisma.service';
import { AnalysisProcessingJobRepository } from '../../worker/src/analysis-processing.repository';
import { validateExtractionEvidence } from '../../worker/src/evidence-validator';
import { ExtractionPublishRepository } from '../../worker/src/extraction-publish.repository';
import { extractFinancialMetricSnapshot } from '../../worker/src/financial-metric-parser';
import {
  createSourceInputHash,
  StructuredExtractionJobRepository,
} from '../../worker/src/structured-extraction.repository';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('EXTRACT-TASK-009 durable PostgreSQL pipeline', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: StructuredExtractionJobRepository;
  let publishRepository: ExtractionPublishRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    repository = new StructuredExtractionJobRepository(prisma);
    publishRepository = new ExtractionPublishRepository(prisma);
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma !== undefined) await prisma.$disconnect();
    if (container !== undefined) await container.stop();
  });

  it('EXTRACT-AC-001/013 tracks metrics, extraction and validation through idempotent handoff', async () => {
    const fixture = await createFixture(prisma);
    const runtimeSha256 = sha256('deterministic\ndeterministic-runtime-v1');
    const metricAttempt = {
      attempt: 1,
      bullmqJobId: fixture.metricExecutionId,
      jobExecutionId: fixture.metricExecutionId,
    };
    const metricClaim = await repository.begin(metricAttempt, runtimeSha256);
    expect(metricClaim.alreadySucceeded).toBe(false);
    if (metricClaim.alreadySucceeded)
      throw new Error('Unexpected completed claim.');
    expect(metricClaim.step).toBe(JobStep.CALCULATE_FINANCIAL_METRICS);

    const extractionExecutionId = await repository.finishMetrics(
      metricAttempt,
      metricClaim,
      runtimeSha256,
    );
    const extractAttempt = {
      attempt: 1,
      bullmqJobId: extractionExecutionId,
      jobExecutionId: extractionExecutionId,
    };
    const extractClaim = await repository.begin(extractAttempt, runtimeSha256);
    expect(extractClaim.alreadySucceeded).toBe(false);
    if (extractClaim.alreadySucceeded)
      throw new Error('Unexpected completed claim.');
    expect(extractClaim.prompt).toMatchObject({ id: fixture.promptId });

    await repository.markValidating(fixture.ownerId, fixture.analysisId);
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
        ],
      },
      extractClaim.evidenceSources,
    );
    await publishRepository.publish({
      analysisId: fixture.analysisId,
      completion: {
        attempt: extractClaim.attempt,
        jobExecutionId: extractionExecutionId,
      },
      expectedPrompt: {
        contentSha256: extractClaim.prompt!.contentSha256,
        id: extractClaim.prompt!.id,
      },
      expectedSources: extractClaim.evidenceSources,
      financialMetrics: extractFinancialMetricSnapshot(
        extractClaim.evidenceSources.map((source) => ({
          chunkId: source.chunkId,
          content: source.content,
          documentId: source.documentId,
          documentName: 'results.pdf',
          pageNumber: source.pageNumber,
        })),
      ),
      ownerId: fixture.ownerId,
      validated,
    });

    const executions = await prisma.jobExecution.findMany({
      include: { attempts: true },
      orderBy: { createdAt: 'asc' },
      where: { analysisId: fixture.analysisId },
    });
    expect(executions.map(({ status, step }) => [step, status])).toEqual([
      ['CALCULATE_FINANCIAL_METRICS', 'SUCCEEDED'],
      ['EXTRACT', 'SUCCEEDED'],
      ['VALIDATE', 'SUCCEEDED'],
    ]);
    expect(executions.every(({ attempts }) => attempts.length === 1)).toBe(
      true,
    );
    await expect(
      prisma.analysis.findUniqueOrThrow({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({ status: 'READY_FOR_VIEW_GENERATION' });
    await expect(
      repository.begin({ ...extractAttempt, attempt: 2 }, runtimeSha256),
    ).resolves.toEqual({ alreadySucceeded: true });
    await expect(
      prisma.analysisFinding.count({
        where: { analysisId: fixture.analysisId },
      }),
    ).resolves.toBe(1);
  });

  it('EXTRACT-AC-001 hands Phase 3 chunks to one durable metrics execution', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'test-password-hash',
      },
    });
    const analysis = await prisma.analysis.create({
      data: { ownerId: owner.id, status: 'CHUNKING', title: 'Chunk handoff' },
    });
    const document = await prisma.document.create({
      data: {
        analysisId: analysis.id,
        mimeType: 'application/pdf',
        originalName: 'handoff.pdf',
        ownerId: owner.id,
        sha256: sha256('pdf'),
        sizeBytes: 100n,
        storageBucket: 'stocklens-test',
        storageKey: `${randomUUID()}/handoff.pdf`,
      },
    });
    const text = '抽出対象の本文';
    const page = await prisma.documentPage.create({
      data: {
        documentId: document.id,
        ownerId: owner.id,
        pageNumber: 1,
        text,
        textSha256: sha256(text),
      },
    });
    const chunkExecution = await prisma.jobExecution.create({
      data: {
        analysisId: analysis.id,
        currentAttempt: 1,
        idempotencyKey: `chunk-test:${randomUUID()}`,
        ownerId: owner.id,
        startedAt: new Date(),
        status: 'RUNNING',
        step: 'CHUNK',
      },
    });
    await prisma.jobAttempt.create({
      data: {
        attempt: 1,
        bullmqJobId: chunkExecution.id,
        jobExecutionId: chunkExecution.id,
        ownerId: owner.id,
        startedAt: new Date(),
        status: 'RUNNING',
      },
    });
    const processingRepository = new AnalysisProcessingJobRepository(prisma);
    const chunks = [
      {
        chunkIndex: 0,
        content: text,
        contentSha256: sha256(text),
        documentId: document.id,
        pageId: page.id,
        section: null,
      },
    ];

    const firstMetricExecutionId = await processingRepository.finishChunk(
      {
        attempt: 1,
        bullmqJobId: chunkExecution.id,
        jobExecutionId: chunkExecution.id,
      },
      owner.id,
      analysis.id,
      chunks,
    );

    await expect(
      prisma.jobExecution.findUniqueOrThrow({
        where: { id: firstMetricExecutionId },
      }),
    ).resolves.toMatchObject({
      analysisId: analysis.id,
      status: 'QUEUED',
      step: 'CALCULATE_FINANCIAL_METRICS',
    });
    await expect(
      prisma.jobExecution.count({
        where: {
          analysisId: analysis.id,
          step: 'CALCULATE_FINANCIAL_METRICS',
        },
      }),
    ).resolves.toBe(1);
  });
});

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
      status: 'READY_FOR_EMBEDDING',
      title: 'Durable structured extraction',
    },
  });
  const document = await prisma.document.create({
    data: {
      analysisId: analysis.id,
      documentType: 'EARNINGS_SUMMARY',
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      ownerId: owner.id,
      sha256: sha256('pdf'),
      sizeBytes: 1024n,
      storageBucket: 'stocklens-test',
      storageKey: `${randomUUID()}/results.pdf`,
    },
  });
  const text = '前文。売上高は前年同期比10%増加した。後文。';
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
  const promptText = 'Return evidence-based structured findings.';
  const prompt = await prisma.promptVersion.create({
    data: {
      contentSha256: sha256(promptText),
      isActive: true,
      name: 'structured-extraction',
      schemaVersion: 'structured-finding-v1',
      template: promptText,
      version: 1,
    },
  });
  const inputHash = createSourceInputHash([
    { contentSha256: chunk.contentSha256, id: chunk.id },
  ]);
  const metricExecution = await prisma.jobExecution.create({
    data: {
      analysisId: analysis.id,
      idempotencyKey: createFinancialMetricsIdempotencyKey(
        analysis.id,
        inputHash,
      ),
      ownerId: owner.id,
      status: 'QUEUED',
      step: 'CALCULATE_FINANCIAL_METRICS',
    },
  });
  return {
    analysisId: analysis.id,
    chunkId: chunk.id,
    metricExecutionId: metricExecution.id,
    ownerId: owner.id,
    promptId: prompt.id,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
