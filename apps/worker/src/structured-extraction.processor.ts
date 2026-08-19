import { createHash } from 'node:crypto';

import { JobStep } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  ANALYSIS_JOB_BACKOFF_DELAY_MS,
  ANALYSIS_JOB_MAX_ATTEMPTS,
  DEFAULT_STRUCTURED_EXTRACTION_BUDGET,
  MAX_EXTRACTION_PROVIDER_CALLS_PER_JOB_ATTEMPT,
  MAX_EXTRACTION_REPAIR_ATTEMPTS,
  analysisJobDataSchema,
  type AiUsageAuditInput,
  type AnalysisJobData,
} from '@stocklens/shared';

import {
  ExtractionOrchestrationError,
  StructuredExtractionOrchestrator,
} from './ai/structured-extraction-orchestrator';
import {
  LlmProviderError,
  type LlmProvider,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
} from './ai/llm-provider';
import {
  EvidenceValidationError,
  validateExtractionEvidence,
} from './evidence-validator';
import type { ExtractionPublishRepository } from './extraction-publish.repository';
import { extractFinancialMetricSnapshot } from './financial-metric-parser';
import {
  ExtractionPipelineStateError,
  type ExtractionPipelineAttemptInput,
  type StructuredExtractionJobRepository,
} from './structured-extraction.repository';

interface UsageRecorder {
  record(input: AiUsageAuditInput): Promise<unknown>;
}

export interface StructuredExtractionRuntimeIdentity {
  readonly model: string;
  readonly provider: string;
}

export class StructuredExtractionProcessor {
  readonly runtimeSha256: string;

  constructor(
    private readonly repository: StructuredExtractionJobRepository,
    private readonly publishRepository: ExtractionPublishRepository,
    private readonly usageRecorder: UsageRecorder,
    private readonly provider: LlmProvider,
    private readonly runtime: StructuredExtractionRuntimeIdentity,
    private readonly queue: Pick<Queue<AnalysisJobData>, 'add'>,
  ) {
    this.runtimeSha256 = createHash('sha256')
      .update(`${runtime.provider}\n${runtime.model}`)
      .digest('hex');
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
    if (
      job.id === undefined ||
      ![
        ANALYSIS_CALCULATE_METRICS_JOB_NAME,
        ANALYSIS_EXTRACT_JOB_NAME,
      ].includes(job.name)
    ) {
      throw new UnrecoverableError('Extraction job envelope is invalid.');
    }
    const data = analysisJobDataSchema.parse(job.data);
    const attempt: ExtractionPipelineAttemptInput = {
      attempt: job.attemptsMade + 1,
      bullmqJobId: job.id,
      jobExecutionId: data.jobExecutionId,
    };
    let claim;
    try {
      claim = await this.repository.begin(attempt, this.runtimeSha256);
    } catch (error: unknown) {
      const code = readStableCode(error) ?? 'EXTRACTION_DEPENDENCY_FAILED';
      await this.repository.failWithoutClaim(attempt, code);
      if (isRetryable(error)) throw new Error('Structured extraction failed.');
      throw new UnrecoverableError('Structured extraction failed.');
    }
    if (claim.alreadySucceeded) return;
    const effectiveAttempt = { ...attempt, attempt: claim.attempt };
    const expectedStep =
      job.name === ANALYSIS_CALCULATE_METRICS_JOB_NAME
        ? JobStep.CALCULATE_FINANCIAL_METRICS
        : JobStep.EXTRACT;
    if (claim.step !== expectedStep) {
      await this.repository.fail(
        effectiveAttempt,
        claim,
        'EXTRACTION_JOB_STEP_MISMATCH',
        false,
      );
      throw new UnrecoverableError('Extraction job step is invalid.');
    }

    let validationStarted = false;
    try {
      const financialMetrics = extractFinancialMetricSnapshot(
        claim.evidenceSources.map((source) => ({
          chunkId: source.chunkId,
          content: source.content,
          documentId: source.documentId,
          documentName:
            claim.sourceChunks.find((chunk) => chunk.chunkId === source.chunkId)
              ?.documentName ?? 'document.pdf',
          pageNumber: source.pageNumber,
        })),
      );
      if (claim.step === JobStep.CALCULATE_FINANCIAL_METRICS) {
        const extractionExecutionId = await this.repository.finishMetrics(
          effectiveAttempt,
          claim,
          this.runtimeSha256,
        );
        try {
          await this.queue.add(
            ANALYSIS_EXTRACT_JOB_NAME,
            { jobExecutionId: extractionExecutionId },
            analysisJobOptions(extractionExecutionId),
          );
        } catch {
          // Durable QUEUED extraction is recovered by the dispatcher.
        }
        return;
      }
      if (claim.prompt === null) {
        throw new ExtractionPipelineStateError(
          'EXTRACTION_PROMPT_UNAVAILABLE',
          'Structured extraction prompt is unavailable.',
        );
      }

      const auditedProvider = new AuditedCountingProvider(
        this.provider,
        this.usageRecorder,
        {
          analysisId: claim.analysisId,
          jobExecutionId: effectiveAttempt.jobExecutionId,
          ownerId: claim.ownerId,
          promptVersionId: claim.prompt.id,
        },
        this.runtime,
      );
      let repairs = 0;
      let systemPrompt = claim.prompt.template;
      while (true) {
        try {
          const remainingCalls =
            MAX_EXTRACTION_PROVIDER_CALLS_PER_JOB_ATTEMPT -
            auditedProvider.callCount;
          if (remainingCalls < 1) throw validationExhausted();
          const result = await new StructuredExtractionOrchestrator(
            auditedProvider,
          ).extract({
            budget: {
              ...DEFAULT_STRUCTURED_EXTRACTION_BUDGET,
              maxProviderCalls: remainingCalls,
            },
            chunks: claim.sourceChunks,
            systemPrompt,
          });
          await this.repository.markValidating(claim.ownerId, claim.analysisId);
          validationStarted = true;
          const validated = validateExtractionEvidence(
            result.output,
            claim.evidenceSources,
          );
          await this.publishRepository.publish({
            analysisId: claim.analysisId,
            completion: {
              attempt: effectiveAttempt.attempt,
              jobExecutionId: effectiveAttempt.jobExecutionId,
            },
            expectedPrompt: {
              contentSha256: claim.prompt.contentSha256,
              id: claim.prompt.id,
            },
            expectedSources: claim.evidenceSources,
            financialMetrics,
            ownerId: claim.ownerId,
            validated,
          });
          return;
        } catch (error: unknown) {
          if (
            repairs > 0 &&
            error instanceof ExtractionOrchestrationError &&
            error.code === 'EXTRACTION_PROVIDER_CALL_LIMIT_EXCEEDED'
          ) {
            throw validationExhausted();
          }
          if (!isRepairableValidationError(error)) throw error;
          if (
            repairs >= MAX_EXTRACTION_REPAIR_ATTEMPTS ||
            auditedProvider.callCount >=
              MAX_EXTRACTION_PROVIDER_CALLS_PER_JOB_ATTEMPT
          ) {
            throw validationExhausted();
          }
          repairs += 1;
          systemPrompt = buildRepairPrompt(
            claim.prompt.template,
            repairs,
            readStableCode(error) ?? 'VALIDATION_FAILED',
          );
        }
      }
    } catch (error: unknown) {
      const validationFailure =
        validationStarted || error instanceof ValidationExhaustedError;
      const code = readStableCode(error) ?? 'EXTRACTION_DEPENDENCY_FAILED';
      await this.repository.fail(
        effectiveAttempt,
        claim,
        code,
        validationFailure,
      );
      if (isRetryable(error)) throw new Error('Structured extraction failed.');
      throw new UnrecoverableError(
        validationFailure
          ? 'Structured extraction validation failed.'
          : 'Structured extraction failed.',
      );
    }
  }
}

class AuditedCountingProvider implements LlmProvider {
  callCount = 0;

  constructor(
    private readonly delegate: LlmProvider,
    private readonly usageRecorder: UsageRecorder,
    private readonly context: {
      readonly analysisId: string;
      readonly jobExecutionId: string;
      readonly ownerId: string;
      readonly promptVersionId: string;
    },
    private readonly runtime: StructuredExtractionRuntimeIdentity,
  ) {}

  async generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<StructuredGenerationResult<T>> {
    this.callCount += 1;
    const result = await this.delegate.generateStructured(input);
    if (
      result.usage.model !== this.runtime.model ||
      result.usage.provider !== this.runtime.provider
    ) {
      throw new ExtractionPipelineStateError(
        'EXTRACTION_RUNTIME_IDENTITY_MISMATCH',
        'Structured extraction runtime identity changed.',
      );
    }
    await this.usageRecorder.record({
      analysisId: this.context.analysisId,
      embeddingTokens: null,
      estimatedCostMicros: null,
      inputTokens: result.usage.inputTokens,
      jobExecutionId: this.context.jobExecutionId,
      latencyMs: result.usage.latencyMs,
      model: result.usage.model,
      operation: 'STRUCTURED_GENERATION',
      outputTokens: result.usage.outputTokens,
      ownerId: this.context.ownerId,
      promptVersionId: this.context.promptVersionId,
      provider: result.usage.provider,
      providerRequestId: result.usage.providerRequestId,
      requestId: null,
    });
    return result;
  }

  embedTexts(texts: readonly string[]): Promise<number[][]> {
    return this.delegate.embedTexts(texts);
  }
}

class ValidationExhaustedError extends Error {
  readonly code = 'EXTRACTION_VALIDATION_EXHAUSTED';
  readonly retryable = false;

  constructor() {
    super('Structured extraction validation attempts were exhausted.');
    this.name = 'ValidationExhaustedError';
  }
}

function validationExhausted(): ValidationExhaustedError {
  return new ValidationExhaustedError();
}

function isRepairableValidationError(error: unknown): boolean {
  return (
    error instanceof EvidenceValidationError ||
    (error instanceof LlmProviderError &&
      error.code === 'PROVIDER_MALFORMED_OUTPUT') ||
    (error instanceof ExtractionOrchestrationError &&
      error.code === 'EXTRACTION_CONFLICTING_FINDING_KEY')
  );
}

function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    error.retryable === true
  );
}

function readStableCode(error: unknown): string | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    typeof error.code !== 'string'
  ) {
    return null;
  }
  return error.code;
}

function buildRepairPrompt(
  basePrompt: string,
  repairAttempt: number,
  stableCode: string,
): string {
  return [
    basePrompt,
    '',
    `Repair attempt ${repairAttempt} of ${MAX_EXTRACTION_REPAIR_ATTEMPTS}.`,
    `The previous candidate failed server validation (${stableCode}).`,
    'Return a complete corrected output from the supplied untrusted source context. Do not repeat unsupported evidence or forbidden investment language.',
  ].join('\n');
}

function analysisJobOptions(jobExecutionId: string) {
  return {
    attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
    backoff: {
      delay: ANALYSIS_JOB_BACKOFF_DELAY_MS,
      type: 'exponential' as const,
    },
    jobId: jobExecutionId,
    removeOnComplete: true,
    removeOnFail: false,
  };
}
