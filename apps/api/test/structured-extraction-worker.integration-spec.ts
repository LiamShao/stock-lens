import { createHash, randomUUID } from 'node:crypto';

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_PROCESSING_QUEUE_NAME,
  createFinancialMetricsIdempotencyKey,
  type AnalysisJobData,
  type StructuredExtractionOutput,
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
import { getRedisConnectionOptions } from '../../worker/src/config';
import { ExtractionPublishRepository } from '../../worker/src/extraction-publish.repository';
import { StructuredExtractionProcessor } from '../../worker/src/structured-extraction.processor';
import {
  createSourceInputHash,
  StructuredExtractionJobRepository,
} from '../../worker/src/structured-extraction.repository';
import { startMigratedPostgres } from './support/postgres-test-container';
import {
  startRedis,
  type StartedRedisContainer,
} from './support/redis-test-container';

jest.setTimeout(120_000);

const runtime = {
  model: 'deterministic-runtime-v1',
  provider: 'deterministic',
} as const;

describe('EXTRACT-TASK-010 full worker integration', () => {
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

  it('EXTRACT-AC-001/002/009/011/013/014 runs Metrics through repaired Extract on real BullMQ', async () => {
    const fixture = await createFixture(prisma);
    const provider = new DeterministicLlmProvider({
      model: runtime.model,
      structuredFixtures: [
        output(fixture.chunkId, { bodyJa: '今日売るべきです。' }),
        output(fixture.chunkId),
      ],
      usage: { inputTokens: 120, latencyMs: 7, outputTokens: 40 },
    });
    const harness = await startWorkerHarness(provider);
    try {
      await harness.queue.add(
        ANALYSIS_CALCULATE_METRICS_JOB_NAME,
        { jobExecutionId: fixture.metricExecutionId },
        { attempts: 3, jobId: fixture.metricExecutionId },
      );
      await waitFor(async () => {
        const analysis = await prisma.analysis.findUniqueOrThrow({
          where: { id: fixture.analysisId },
        });
        return analysis.status === 'READY_FOR_VIEW_GENERATION';
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
        ['GENERATE_VIEWS', 'QUEUED'],
      ]);
      expect(
        executions
          .filter(({ step }) => step !== 'GENERATE_VIEWS')
          .every(({ attempts }) => attempts.length === 1),
      ).toBe(true);
      expect(executions.at(-1)?.attempts).toHaveLength(0);
      await expect(
        prisma.analysisFinding.count({
          where: { analysisId: fixture.analysisId },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.evidence.count({ where: { analysisId: fixture.analysisId } }),
      ).resolves.toBe(1);
      const usage = await prisma.aiUsageLog.findMany({
        where: { analysisId: fixture.analysisId },
      });
      expect(usage).toHaveLength(2);
      expect(
        usage.map(({ inputTokens, model, outputTokens, provider }) => ({
          inputTokens,
          model,
          outputTokens,
          provider,
        })),
      ).toEqual(
        Array.from({ length: 2 }, () => ({
          inputTokens: 120,
          model: runtime.model,
          outputTokens: 40,
          provider: runtime.provider,
        })),
      );
      expect(Object.keys(usage[0] ?? {})).not.toEqual(
        expect.arrayContaining(['prompt', 'sourceText', 'response']),
      );
    } finally {
      await harness.close();
    }
  });

  it('EXTRACT-AC-010 exhausts exactly three validated provider calls and persists only sanitized failure', async () => {
    const fixture = await createFixture(prisma);
    const invalid = output(fixture.chunkId, { bodyJa: '今日売るべきです。' });
    const harness = await startWorkerHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [invalid, invalid, invalid],
      }),
    );
    try {
      await harness.queue.add(
        ANALYSIS_CALCULATE_METRICS_JOB_NAME,
        { jobExecutionId: fixture.metricExecutionId },
        { attempts: 3, jobId: fixture.metricExecutionId },
      );
      await waitFor(async () => {
        const analysis = await prisma.analysis.findUniqueOrThrow({
          where: { id: fixture.analysisId },
        });
        return analysis.status === 'FAILED_VALIDATION';
      });

      const extraction = await prisma.jobExecution.findFirstOrThrow({
        include: { attempts: true },
        where: { analysisId: fixture.analysisId, step: 'EXTRACT' },
      });
      expect(extraction).toMatchObject({
        currentAttempt: 1,
        errorCode: 'EXTRACTION_VALIDATION_EXHAUSTED',
        errorDetails: null,
        errorMessage: 'Structured extraction validation failed.',
        status: 'FAILED',
      });
      expect(extraction.attempts).toHaveLength(1);
      await expect(
        prisma.aiUsageLog.count({
          where: { jobExecutionId: extraction.id },
        }),
      ).resolves.toBe(3);
      await expect(
        prisma.analysisFinding.count({
          where: { analysisId: fixture.analysisId },
        }),
      ).resolves.toBe(0);
      const persistedFailure = JSON.stringify({
        errorCode: extraction.errorCode,
        errorDetails: extraction.errorDetails,
        errorMessage: extraction.errorMessage,
      });
      expect(persistedFailure).not.toContain('今日売るべきです');
      expect(persistedFailure).not.toContain('売上高は前年同期比10%増加');
    } finally {
      await harness.close();
    }
  });

  it('EXTRACT-AC-011 recovers a transient provider failure on the second BullMQ attempt', async () => {
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
          value: input.schema.parse(output(fixture.chunkId)),
        });
      },
    };
    const harness = await startWorkerHarness(provider);
    try {
      await harness.queue.add(
        ANALYSIS_CALCULATE_METRICS_JOB_NAME,
        { jobExecutionId: fixture.metricExecutionId },
        { attempts: 3, jobId: fixture.metricExecutionId },
      );
      await waitFor(async () => {
        const analysis = await prisma.analysis.findUniqueOrThrow({
          where: { id: fixture.analysisId },
        });
        return analysis.status === 'READY_FOR_VIEW_GENERATION';
      });

      const extraction = await prisma.jobExecution.findFirstOrThrow({
        include: { attempts: { orderBy: { attempt: 'asc' } } },
        where: { analysisId: fixture.analysisId, step: 'EXTRACT' },
      });
      expect(calls).toBe(2);
      expect(extraction).toMatchObject({
        currentAttempt: 2,
        status: 'SUCCEEDED',
      });
      expect(
        extraction.attempts.map(({ errorCode, status }) => [status, errorCode]),
      ).toEqual([
        ['FAILED', 'PROVIDER_RATE_LIMITED'],
        ['SUCCEEDED', null],
      ]);
      await expect(
        prisma.aiUsageLog.count({ where: { jobExecutionId: extraction.id } }),
      ).resolves.toBe(1);
      expect(JSON.stringify(extraction)).not.toContain(
        'test-only provider throttling detail',
      );
    } finally {
      await harness.close();
    }
  });

  it('EXTRACT-AC-012 fails closed when source input changes during the provider call', async () => {
    const fixture = await createFixture(prisma);
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const providerReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: LlmProvider = {
      embedTexts: () => Promise.resolve([]),
      generateStructured: async <T>(
        input: StructuredGenerationInput<T>,
      ): Promise<StructuredGenerationResult<T>> => {
        started?.();
        await providerReleased;
        return {
          usage: {
            inputTokens: 10,
            latencyMs: 1,
            model: runtime.model,
            outputTokens: 10,
            provider: runtime.provider,
            providerRequestId: null,
          },
          value: input.schema.parse(output(fixture.chunkId)),
        };
      },
    };
    const repository = new StructuredExtractionJobRepository(prisma);
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const processor = createProcessor(repository, provider, queue);
    const metricJob = job(
      ANALYSIS_CALCULATE_METRICS_JOB_NAME,
      fixture.metricExecutionId,
    );
    await processor.process(metricJob);
    const extraction = await prisma.jobExecution.findFirstOrThrow({
      where: { analysisId: fixture.analysisId, step: 'EXTRACT' },
    });
    const running = processor.process(job('extract-analysis', extraction.id));
    await providerStarted;
    const changed = '変更後の本文。';
    await prisma.documentChunk.update({
      data: { content: changed, contentSha256: sha256(changed) },
      where: { id: fixture.chunkId },
    });
    release?.();

    await expect(running).rejects.toThrow(
      'Structured extraction validation failed.',
    );
    await expect(
      prisma.analysis.findUniqueOrThrow({ where: { id: fixture.analysisId } }),
    ).resolves.toMatchObject({
      failureCode: 'EXTRACTION_INPUT_CHANGED',
      status: 'FAILED_VALIDATION',
    });
    await expect(
      prisma.analysisFinding.count({
        where: { analysisId: fixture.analysisId },
      }),
    ).resolves.toBe(0);
  });

  async function startWorkerHarness(provider: LlmProvider) {
    const connection = getRedisConnectionOptions(redis.url);
    const queueName = `${ANALYSIS_PROCESSING_QUEUE_NAME}-${randomUUID()}`;
    const queue = new Queue<AnalysisJobData>(queueName, { connection });
    const processor = createProcessor(
      new StructuredExtractionJobRepository(prisma),
      provider,
      queue,
    );
    const worker = new Worker<AnalysisJobData>(
      queueName,
      (bullmqJob) => processor.process(bullmqJob),
      { connection, concurrency: 1 },
    );
    await worker.waitUntilReady();
    return {
      close: async () => {
        await worker.close();
        await queue.close();
      },
      queue,
    };
  }

  function createProcessor(
    repository: StructuredExtractionJobRepository,
    provider: LlmProvider,
    queue: Pick<Queue<AnalysisJobData>, 'add'>,
  ) {
    return new StructuredExtractionProcessor(
      repository,
      new ExtractionPublishRepository(prisma),
      new AiUsageRepository(prisma),
      provider,
      runtime,
      queue,
    );
  }
});

async function createFixture(prisma: PrismaService) {
  const owner = await prisma.user.create({
    data: {
      email: `${randomUUID()}@worker.integration.test`,
      passwordHash: 'test-password-hash',
    },
  });
  const analysis = await prisma.analysis.create({
    data: {
      ownerId: owner.id,
      status: 'READY_FOR_EMBEDDING',
      title: 'Full worker integration',
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
  let prompt = await prisma.promptVersion.findFirst({
    where: { isActive: true, name: 'structured-extraction' },
  });
  if (prompt === null) {
    const template = 'Return evidence-based structured findings.';
    prompt = await prisma.promptVersion.create({
      data: {
        contentSha256: sha256(template),
        isActive: true,
        name: 'structured-extraction',
        schemaVersion: 'structured-finding-v1',
        template,
        version: 1,
      },
    });
  }
  const viewPrompt = await prisma.promptVersion.findFirst({
    where: { isActive: true, name: 'analysis-views' },
  });
  if (viewPrompt === null) {
    const template = 'Generate three evidence-based Japanese views.';
    await prisma.promptVersion.create({
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
  };
}

function output(
  chunkId: string,
  overrides: Partial<StructuredExtractionOutput['findings'][number]> = {},
): StructuredExtractionOutput {
  return {
    findings: [
      {
        bodyJa: '売上高は前年同期比で増加した。',
        category: 'FINANCIAL_HIGHLIGHT',
        evidence: [{ chunkId, excerpt: '売上高は前年同期比10%増加' }],
        findingKey: 'financial.revenue-growth',
        importance: 4,
        titleJa: '売上高の増加',
        ...overrides,
      },
    ],
  };
}

function job(name: string, executionId: string): Job<AnalysisJobData> {
  return {
    attemptsMade: 0,
    data: { jobExecutionId: executionId },
    id: executionId,
    name,
  } as Job<AnalysisJobData>;
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for structured extraction state.');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
