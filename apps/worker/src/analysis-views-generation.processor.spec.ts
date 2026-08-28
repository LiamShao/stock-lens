import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  FINANCIAL_METRIC_KEYS,
  FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION,
  financialMetricSnapshotSchema,
  type AnalysisJobData,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

import { DeterministicLlmProvider } from './ai/deterministic-llm-provider';
import { LlmProviderError, type LlmProvider } from './ai/llm-provider';
import {
  AnalysisViewsGenerationProcessor,
  type AnalysisViewsRuntimeIdentity,
} from './analysis-views-generation.processor';
import type {
  AnalysisViewsGenerationClaim,
  AnalysisViewsGenerationRepository,
} from './analysis-views-generation.repository';
import type {
  AnalysisViewsPublishInput,
  AnalysisViewsPublishRepository,
} from './analysis-views-publish.repository';

const ownerId = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const findingId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const unknownEvidenceId = '55555555-5555-4555-8555-555555555555';
const executionId = '66666666-6666-4666-8666-666666666666';
const promptId = '77777777-7777-4777-8777-777777777777';
const runtime: AnalysisViewsRuntimeIdentity = {
  model: 'deterministic-views-v1',
  provider: 'deterministic',
};

describe('AnalysisViewsGenerationProcessor', () => {
  it('VIEW-AC-007 repairs an invalid citation in the same execution', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: [output(unknownEvidenceId), output(evidenceId)],
      }),
    );
    harness.repository.begin.mockResolvedValue(claim());

    await harness.processor.process(job());

    expect(harness.usageRecorder.record).toHaveBeenCalledTimes(2);
    expect(harness.publishRepository.publish).toHaveBeenCalledTimes(1);
    expect(harness.publishRepository.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: { attempt: 1, jobExecutionId: executionId },
        expectedInputHash: 'a'.repeat(64),
      }),
    );
    expect(harness.repository.fail).not.toHaveBeenCalled();
  });

  it('VIEW-AC-008 stops after three candidates and saves sanitized validation failure', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({
        model: runtime.model,
        structuredFixtures: Array.from({ length: 3 }, () =>
          output(unknownEvidenceId),
        ),
      }),
    );
    harness.repository.begin.mockResolvedValue(claim());

    await expect(harness.processor.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(harness.usageRecorder.record).toHaveBeenCalledTimes(3);
    expect(harness.publishRepository.publish).not.toHaveBeenCalled();
    expect(harness.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ jobExecutionId: executionId }),
      expect.any(Object),
      'VIEW_VALIDATION_EXHAUSTED',
      true,
    );
  });

  it('VIEW-FR-010 leaves a transient provider failure to BullMQ retry', async () => {
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
    harness.repository.begin.mockResolvedValue(claim());

    await expect(harness.processor.process(job())).rejects.toThrow(
      'Analysis views generation failed.',
    );
    expect(harness.repository.fail).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      'PROVIDER_RATE_LIMITED',
      false,
    );
    expect(harness.usageRecorder.record).not.toHaveBeenCalled();
  });

  it('VIEW-AC-009 treats a succeeded duplicate delivery as a no-op', async () => {
    const harness = createHarness(
      new DeterministicLlmProvider({ structuredFixtures: [] }),
    );
    harness.repository.begin.mockResolvedValue({ alreadySucceeded: true });

    await expect(harness.processor.process(job())).resolves.toBeUndefined();
    expect(harness.publishRepository.publish).not.toHaveBeenCalled();
    expect(harness.repository.fail).not.toHaveBeenCalled();
  });
});

function createHarness(provider: LlmProvider) {
  const repository = {
    begin: jest.fn(),
    fail: jest.fn().mockResolvedValue(undefined),
    failWithoutClaim: jest.fn().mockResolvedValue(undefined),
  };
  const publishRepository = {
    publish: jest
      .fn<Promise<void>, [AnalysisViewsPublishInput]>()
      .mockResolvedValue(undefined),
  };
  const usageRecorder = { record: jest.fn().mockResolvedValue({}) };
  return {
    processor: new AnalysisViewsGenerationProcessor(
      repository as unknown as AnalysisViewsGenerationRepository,
      publishRepository as unknown as AnalysisViewsPublishRepository,
      usageRecorder,
      provider,
      runtime,
    ),
    publishRepository,
    repository,
    usageRecorder,
  };
}

function claim(): Exclude<
  AnalysisViewsGenerationClaim,
  { alreadySucceeded: true }
> {
  return {
    alreadySucceeded: false,
    analysisId,
    attempt: 1,
    inputHash: 'a'.repeat(64),
    ownerId,
    prompt: {
      contentSha256: 'b'.repeat(64),
      id: promptId,
      template: 'Generate three evidence-based Japanese analysis views.',
    },
    source: {
      analysisId,
      analysisTitle: 'サンプル企業の分析',
      companyNameJa: 'サンプル株式会社',
      financialMetrics: financialMetricSnapshotSchema.parse({
        metrics: FINANCIAL_METRIC_KEYS.map((metric) => ({
          comparison: null,
          current: null,
          metric,
          previous: null,
          status: 'UNKNOWN',
          unknownReasons: ['MISSING_VALUE'],
        })),
        schemaVersion: FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION,
      }),
      findings: [
        {
          body: '主力事業の売上が増加しました。',
          category: 'FINANCIAL_HIGHLIGHT',
          evidences: [
            {
              chunkId: '88888888-8888-4888-8888-888888888888',
              documentId: '99999999-9999-4999-8999-999999999999',
              documentName: '決算短信.pdf',
              excerpt: '主力事業の売上が増加',
              id: evidenceId,
              pageNumber: 1,
            },
          ],
          findingKey: 'financial.revenue',
          id: findingId,
          importance: 4,
          status: 'SUPPORTED',
          title: '売上の増加',
        },
      ],
    },
  };
}

function output(citationId: string): AnalysisViewsGenerationOutput {
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
      citationId,
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
      citationId,
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
      citationId,
    ),
  } as AnalysisViewsGenerationOutput;
}

function view(sectionKeys: readonly string[], citationId: string) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => ({
      blocks: [
        {
          evidenceIds: [citationId],
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

function job(): Job<AnalysisJobData> {
  return {
    attemptsMade: 0,
    data: { jobExecutionId: executionId },
    id: executionId,
    name: 'generate-analysis-views',
  } as Job<AnalysisJobData>;
}
