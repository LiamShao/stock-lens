import { createHash, randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
  ANALYSIS_PROCESSING_QUEUE_NAME,
  ANALYSIS_VIEW_SCHEMA_VERSION,
  createAnalysisViewsIdempotencyKey,
  type AnalysisJobData,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

import { PrismaService } from '../src/database/prisma.service';
import { AiUsageRepository } from '../../worker/src/ai-usage.repository';
import { DeterministicLlmProvider } from '../../worker/src/ai/deterministic-llm-provider';
import {
  LlmProviderError,
  type LlmProvider,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
} from '../../worker/src/ai/llm-provider';
import { AnalysisViewsGenerationProcessor } from '../../worker/src/analysis-views-generation.processor';
import { AnalysisViewsGenerationRepository } from '../../worker/src/analysis-views-generation.repository';
import { AnalysisViewsPublishRepository } from '../../worker/src/analysis-views-publish.repository';
import { getRedisConnectionOptions } from '../../worker/src/config';
import { extractFinancialMetricSnapshot } from '../../worker/src/financial-metric-parser';
import { JobOperationRepository } from '../../worker/src/job-operation.repository';
import { PendingAnalysisDispatcher } from '../../worker/src/pending-analysis.dispatcher';
import { startMigratedPostgres } from './support/postgres-test-container';
import {
  startRedis,
  type StartedRedisContainer,
} from './support/redis-test-container';

jest.setTimeout(120_000);

const runtime = {
  model: 'deterministic-views-v1',
  provider: 'deterministic',
} as const;
const runtimeSha256 = sha256(`${runtime.provider}\n${runtime.model}`);

describe('VIEW-TASK-005 durable view generation worker', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      startMigratedPostgres(),
      startRedis(),
    ]);
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await redis?.container.stop();
    await postgres?.stop();
  });

  it('VIEW-AC-001/002/007 recovers a pending execution, repairs once, and atomically completes', async () => {
    const fixture = await createFixture(prisma);
    const harness = await startHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [output(randomUUID()), output(fixture.evidenceId)],
        usage: { inputTokens: 80, latencyMs: 5, outputTokens: 60 },
      }),
    );
    try {
      await expect(harness.dispatcher.dispatch()).resolves.toBe(1);
      await waitForStatus(fixture.analysisId, 'COMPLETED');

      const execution = await prisma.jobExecution.findUniqueOrThrow({
        include: { attempts: true },
        where: { id: fixture.executionId },
      });
      expect(execution).toMatchObject({
        currentAttempt: 1,
        errorCode: null,
        status: 'SUCCEEDED',
        step: 'GENERATE_VIEWS',
      });
      expect(execution.attempts).toHaveLength(1);
      await expect(
        prisma.aiUsageLog.count({
          where: { jobExecutionId: fixture.executionId },
        }),
      ).resolves.toBe(2);
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: fixture.analysisId },
      });
      expect(analysis.status).toBe('COMPLETED');
      expect(analysis.failureCode).toBeNull();
      expect(analysis.completedAt).toBeInstanceOf(Date);
      expect(analysis.analystViewOutput).not.toBeNull();
      expect(analysis.buffettMungerOutput).not.toBeNull();
      expect(analysis.justTellMeOutput).not.toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('VIEW-AC-008 retries a transient provider failure on the same execution', async () => {
    const fixture = await createFixture(prisma);
    let calls = 0;
    const provider: LlmProvider = {
      embedTexts: () => Promise.resolve([]),
      generateStructured: <T>(
        input: StructuredGenerationInput<T>,
      ): Promise<StructuredGenerationResult<T>> => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(
            new LlmProviderError(
              'PROVIDER_RATE_LIMITED',
              true,
              'test-only provider throttling detail',
            ),
          );
        }
        return Promise.resolve({
          usage: {
            inputTokens: 10,
            latencyMs: 1,
            model: runtime.model,
            outputTokens: 10,
            provider: runtime.provider,
            providerRequestId: null,
          },
          value: input.schema.parse(output(fixture.evidenceId)),
        });
      },
    };
    const harness = await startHarness(provider);
    try {
      await harness.queue.add(
        ANALYSIS_GENERATE_VIEWS_JOB_NAME,
        { jobExecutionId: fixture.executionId },
        jobOptions(fixture.executionId),
      );
      await waitForStatus(fixture.analysisId, 'COMPLETED');

      const execution = await prisma.jobExecution.findUniqueOrThrow({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { id: fixture.executionId },
      });
      expect(calls).toBe(2);
      expect(execution).toMatchObject({
        currentAttempt: 2,
        status: 'SUCCEEDED',
      });
      expect(
        execution.attempts.map(({ errorCode, status }) => [status, errorCode]),
      ).toEqual([
        ['FAILED', 'PROVIDER_RATE_LIMITED'],
        ['SUCCEEDED', null],
      ]);
      expect(JSON.stringify(execution)).not.toContain(
        'test-only provider throttling detail',
      );
    } finally {
      await harness.close();
    }
  });

  it('VIEW-AC-008/009 manually re-runs an exhausted execution without duplicate output', async () => {
    const fixture = await createFixture(prisma);
    const invalid = output(randomUUID());
    const first = await startHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [invalid, invalid, invalid],
      }),
    );
    try {
      await first.queue.add(
        ANALYSIS_GENERATE_VIEWS_JOB_NAME,
        { jobExecutionId: fixture.executionId },
        jobOptions(fixture.executionId),
      );
      await waitForStatus(fixture.analysisId, 'FAILED_VALIDATION');
      const failedJob = await first.queue.getJob(fixture.executionId);
      await failedJob?.remove();
    } finally {
      await first.close();
    }

    const rerun = await new JobOperationRepository(prisma).rerun(
      fixture.executionId,
      'integration-test-operator',
      randomUUID(),
    );
    expect(rerun.kind).toBe('queued');
    const second = await startHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [output(fixture.evidenceId)],
      }),
    );
    try {
      await expect(second.dispatcher.dispatch()).resolves.toBe(1);
      await waitForStatus(fixture.analysisId, 'COMPLETED');

      const execution = await prisma.jobExecution.findUniqueOrThrow({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { id: fixture.executionId },
      });
      expect(execution).toMatchObject({
        currentAttempt: 2,
        status: 'SUCCEEDED',
      });
      expect(execution.attempts.map(({ status }) => status)).toEqual([
        'FAILED',
        'SUCCEEDED',
      ]);
      await expect(
        prisma.jobExecution.count({
          where: {
            analysisId: fixture.analysisId,
            step: 'GENERATE_VIEWS',
          },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.jobOperationAudit.count({
          where: { jobExecutionId: fixture.executionId, action: 'RERUN' },
        }),
      ).resolves.toBe(1);
    } finally {
      await second.close();
    }
  });

  async function startHarness(provider: LlmProvider) {
    const connection = getRedisConnectionOptions(redis.url);
    const queueName = `${ANALYSIS_PROCESSING_QUEUE_NAME}-${randomUUID()}`;
    const queue = new Queue<AnalysisJobData>(queueName, { connection });
    const processor = new AnalysisViewsGenerationProcessor(
      new AnalysisViewsGenerationRepository(prisma),
      new AnalysisViewsPublishRepository(prisma),
      new AiUsageRepository(prisma),
      provider,
      runtime,
    );
    const worker = new Worker<AnalysisJobData>(
      queueName,
      (job) => processor.process(job),
      { connection, concurrency: 1 },
    );
    const dispatcher = new PendingAnalysisDispatcher(prisma, queue);
    await worker.waitUntilReady();
    return {
      close: async () => {
        await worker.close();
        await queue.close();
      },
      dispatcher,
      queue,
    };
  }

  async function waitForStatus(
    analysisId: string,
    status: 'COMPLETED' | 'FAILED_VALIDATION',
  ): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const analysis = await prisma.analysis.findUniqueOrThrow({
        where: { id: analysisId },
      });
      if (analysis.status === status) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for analysis status ${status}.`);
  }
});

async function createFixture(prisma: PrismaService) {
  let prompt = await prisma.promptVersion.findFirst({
    where: { isActive: true, name: 'analysis-views' },
  });
  if (prompt === null) {
    const template = 'Generate three evidence-based Japanese views.';
    prompt = await prisma.promptVersion.create({
      data: {
        contentSha256: sha256(template),
        isActive: true,
        name: 'analysis-views',
        schemaVersion: 'analysis-views-v1',
        template,
        version: 1,
      },
    });
  }
  const owner = await prisma.user.create({
    data: {
      email: `${randomUUID()}@views-worker.integration.test`,
      passwordHash: 'test-password-hash',
    },
  });
  const analysis = await prisma.analysis.create({
    data: {
      financialMetrics: extractFinancialMetricSnapshot([]),
      ownerId: owner.id,
      status: 'READY_FOR_VIEW_GENERATION',
      title: 'Durable analysis views',
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
  const snapshot = await new AnalysisViewsPublishRepository(prisma).loadSource(
    owner.id,
    analysis.id,
  );
  const execution = await prisma.jobExecution.create({
    data: {
      analysisId: analysis.id,
      idempotencyKey: createAnalysisViewsIdempotencyKey({
        analysisId: analysis.id,
        inputHash: snapshot.inputHash,
        promptContentSha256: prompt.contentSha256,
        promptVersionId: prompt.id,
        runtimeSha256,
        schemaVersion: prompt.schemaVersion,
      }),
      ownerId: owner.id,
      status: 'QUEUED',
      step: 'GENERATE_VIEWS',
    },
  });
  return {
    analysisId: analysis.id,
    evidenceId: evidence.id,
    executionId: execution.id,
  };
}

function output(evidenceId: string): AnalysisViewsGenerationOutput {
  return {
    analystView: view(
      [
        'BUSINESS_OVERVIEW',
        'FINANCIAL_HIGHLIGHTS',
        'MANAGEMENT_GUIDANCE',
        'POSITIVE_FINDINGS',
        'RISKS',
        'UNCERTAINTIES',
        'WATCH_ITEMS',
        'SOURCES',
      ],
      evidenceId,
    ),
    buffettMunger: view(
      [
        'BUSINESS_UNDERSTANDABILITY',
        'COMPETITIVE_ADVANTAGE',
        'CASH_GENERATION',
        'CAPITAL_ALLOCATION',
        'MANAGEMENT_INCENTIVES',
        'LONG_TERM_RISKS',
        'MISSING_INFORMATION',
      ],
      evidenceId,
    ),
    justTellMe: view(
      [
        'HOW_THE_COMPANY_MAKES_MONEY',
        'RECENT_CHANGES',
        'POSITIVES',
        'RISKS',
        'WATCH_ITEMS',
        'MISSING_INFORMATION',
      ],
      evidenceId,
    ),
  } as AnalysisViewsGenerationOutput;
}

function view(sectionKeys: readonly string[], evidenceId: string) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => ({
      blocks: [
        {
          evidenceIds: [evidenceId],
          isMissingInformation: false,
          key: `block.${index}`,
          text: '現在の資料に基づく確認事項です。',
        },
      ],
      key,
      title: `確認項目${index + 1}`,
    })),
  };
}

function jobOptions(jobExecutionId: string) {
  return {
    attempts: 3,
    backoff: { delay: 10, type: 'exponential' as const },
    jobId: jobExecutionId,
    removeOnComplete: true,
    removeOnFail: false,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
