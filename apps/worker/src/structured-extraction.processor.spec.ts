import { JobStep } from '@prisma/client';
import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import type {
  AnalysisJobData,
  StructuredExtractionOutput,
} from '@stocklens/shared';

import { DeterministicLlmProvider } from './ai/deterministic-llm-provider';
import { LlmProviderError, type LlmProvider } from './ai/llm-provider';
import type {
  ExtractionPublishInput,
  ExtractionPublishRepository,
} from './extraction-publish.repository';
import {
  StructuredExtractionProcessor,
  type StructuredExtractionRuntimeIdentity,
} from './structured-extraction.processor';
import type {
  ExtractionPipelineClaim,
  StructuredExtractionJobRepository,
} from './structured-extraction.repository';

const ownerId = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const chunkId = '33333333-3333-4333-8333-333333333333';
const documentId = '44444444-4444-4444-8444-444444444444';
const pageId = '55555555-5555-4555-8555-555555555555';
const executionId = '66666666-6666-4666-8666-666666666666';
const promptId = '77777777-7777-4777-8777-777777777777';
const runtime: StructuredExtractionRuntimeIdentity = {
  model: 'deterministic-runtime-v1',
  provider: 'deterministic',
};

describe('StructuredExtractionProcessor', () => {
  it('EXTRACT-AC-001 completes metrics and queues a durable extraction execution', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({ structuredFixtures: [] }),
    );
    harness.repository.begin.mockResolvedValue(
      claim(JobStep.CALCULATE_FINANCIAL_METRICS),
    );
    harness.repository.finishMetrics.mockResolvedValue(executionId);

    await harness.processor.process(
      job('calculate-analysis-financial-metrics'),
    );

    expect(harness.repository.finishMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ jobExecutionId: executionId }),
      expect.objectContaining({ step: 'CALCULATE_FINANCIAL_METRICS' }),
      harness.processor.runtimeSha256,
    );
    expect(harness.queue.add).toHaveBeenCalledWith(
      'extract-analysis',
      { jobExecutionId: executionId },
      expect.objectContaining({ attempts: 3, jobId: executionId }),
    );
  });

  it('EXTRACT-AC-009 repairs invalid compliance output and publishes the valid set', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [
          output({ bodyJa: '目標株価は2,000円です。' }),
          output(),
        ],
      }),
    );
    harness.repository.begin.mockResolvedValue(claim(JobStep.EXTRACT));

    await harness.processor.process(job('extract-analysis'));

    expect(harness.repository.markValidating).toHaveBeenCalledTimes(2);
    expect(harness.usageRecorder.record).toHaveBeenCalledTimes(2);
    expect(harness.publishRepository.publish).toHaveBeenCalledTimes(1);
    const published = harness.publishRepository.publish.mock.calls[0]?.[0];
    expect(published?.completion).toEqual({
      attempt: 1,
      jobExecutionId: executionId,
    });
    expect(published?.validated.findings[0]?.status).toBe('SUPPORTED');
    expect(harness.repository.fail).not.toHaveBeenCalled();
  });

  it('EXTRACT-AC-010 stops after three provider calls and saves validation failure', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: Array.from({ length: 3 }, () =>
          output({ bodyJa: '今日売るべきです。' }),
        ),
      }),
    );
    harness.repository.begin.mockResolvedValue(claim(JobStep.EXTRACT));

    await expect(
      harness.processor.process(job('extract-analysis')),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(harness.usageRecorder.record).toHaveBeenCalledTimes(3);
    expect(harness.publishRepository.publish).not.toHaveBeenCalled();
    expect(harness.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ jobExecutionId: executionId }),
      expect.any(Object),
      'EXTRACTION_VALIDATION_EXHAUSTED',
      true,
    );
  });

  it('EXTRACT-AC-011 leaves retryable provider failure to BullMQ retry', async () => {
    const provider: LlmProvider = {
      embedTexts: jest.fn(),
      generateStructured: jest
        .fn()
        .mockRejectedValue(
          new LlmProviderError(
            'PROVIDER_RATE_LIMITED',
            true,
            'Provider rate limit was reached.',
          ),
        ),
    };
    const harness = createHarness(provider);
    harness.repository.begin.mockResolvedValue(claim(JobStep.EXTRACT));

    await expect(
      harness.processor.process(job('extract-analysis')),
    ).rejects.toThrow('Structured extraction failed.');
    expect(harness.repository.fail).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'PROVIDER_RATE_LIMITED',
      false,
    );
    expect(harness.usageRecorder.record).not.toHaveBeenCalled();
  });

  it('EXTRACT-AC-011 treats a succeeded duplicate delivery as a no-op', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({ structuredFixtures: [] }),
    );
    harness.repository.begin.mockResolvedValue({ alreadySucceeded: true });

    await expect(
      harness.processor.process(job('extract-analysis')),
    ).resolves.toBeUndefined();
    expect(harness.publishRepository.publish).not.toHaveBeenCalled();
    expect(harness.repository.fail).not.toHaveBeenCalled();
  });
});

function createHarness(provider: LlmProvider) {
  const repository = {
    begin: jest.fn(),
    fail: jest.fn().mockResolvedValue(undefined),
    failWithoutClaim: jest.fn().mockResolvedValue(undefined),
    finishMetrics: jest.fn(),
    markValidating: jest.fn().mockResolvedValue(undefined),
  };
  const publishRepository = {
    publish: jest
      .fn<Promise<void>, [ExtractionPublishInput]>()
      .mockResolvedValue(undefined),
  };
  const usageRecorder = { record: jest.fn().mockResolvedValue({}) };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  return {
    processor: new StructuredExtractionProcessor(
      repository as unknown as StructuredExtractionJobRepository,
      publishRepository as unknown as ExtractionPublishRepository,
      usageRecorder,
      provider,
      runtime,
      queue,
    ),
    publishRepository,
    queue,
    repository,
    usageRecorder,
  };
}

function claim(
  step: JobStep,
): Exclude<ExtractionPipelineClaim, { alreadySucceeded: true }> {
  const text = '前文。売上高は前年同期比10%増加した。後文。';
  return {
    alreadySucceeded: false,
    analysisId,
    attempt: 1,
    evidenceSources: [
      {
        chunkId,
        content: text,
        contentSha256: 'a'.repeat(64),
        documentId,
        pageId,
        pageNumber: 1,
        pageText: text,
      },
    ],
    inputHash: 'b'.repeat(64),
    ownerId,
    prompt:
      step === JobStep.EXTRACT
        ? {
            contentSha256: 'c'.repeat(64),
            id: promptId,
            schemaVersion: 'structured-finding-v1',
            template: 'Return evidence-based structured findings.',
          }
        : null,
    sourceChunks: [
      {
        chunkId,
        chunkOrder: 0,
        documentId,
        documentName: 'results.pdf',
        documentOrder: 0,
        documentType: 'EARNINGS_SUMMARY',
        pageNumber: 1,
        section: null,
        text,
      },
    ],
    step,
  };
}

function output(
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

function job(name: string): Job<AnalysisJobData> {
  return {
    attemptsMade: 0,
    data: { jobExecutionId: executionId },
    id: executionId,
    name,
  } as Job<AnalysisJobData>;
}
