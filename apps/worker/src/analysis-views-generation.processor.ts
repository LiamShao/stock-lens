import { createHash } from 'node:crypto';

import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import {
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
  DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET,
  MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT,
  MAX_ANALYSIS_VIEW_REPAIR_ATTEMPTS,
  analysisJobDataSchema,
  type AiUsageAuditInput,
  type AnalysisJobData,
} from '@stocklens/shared';
import { ZodError } from 'zod';

import {
  AnalysisViewsOrchestrationError,
  AnalysisViewsOrchestrator,
} from './ai/analysis-views-orchestrator';
import {
  LlmProviderError,
  type LlmProvider,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
} from './ai/llm-provider';
import {
  AnalysisViewsCitationError,
  validateAnalysisViewsCitations,
} from './analysis-views-citation-validator';
import type { AnalysisViewsGenerationRepository } from './analysis-views-generation.repository';
import type { AnalysisViewsPublishRepository } from './analysis-views-publish.repository';

interface UsageRecorder {
  record(input: AiUsageAuditInput): Promise<unknown>;
}

export interface AnalysisViewsRuntimeIdentity {
  readonly model: string;
  readonly provider: string;
}

export class AnalysisViewsGenerationProcessor {
  readonly runtimeSha256: string;

  constructor(
    private readonly repository: AnalysisViewsGenerationRepository,
    private readonly publishRepository: AnalysisViewsPublishRepository,
    private readonly usageRecorder: UsageRecorder,
    private readonly provider: LlmProvider,
    private readonly runtime: AnalysisViewsRuntimeIdentity,
  ) {
    this.runtimeSha256 = createHash('sha256')
      .update(`${runtime.provider}\n${runtime.model}`)
      .digest('hex');
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
    if (job.id === undefined || job.name !== ANALYSIS_GENERATE_VIEWS_JOB_NAME) {
      throw new UnrecoverableError('Analysis views job envelope is invalid.');
    }
    const data = analysisJobDataSchema.parse(job.data);
    const attempt = {
      attempt: job.attemptsMade + 1,
      bullmqJobId: job.id,
      jobExecutionId: data.jobExecutionId,
    };
    let claim;
    try {
      claim = await this.repository.begin(attempt, this.runtimeSha256);
    } catch (error: unknown) {
      await this.repository.failWithoutClaim(
        attempt,
        readStableCode(error) ?? 'VIEW_GENERATION_DEPENDENCY_FAILED',
      );
      if (isRetryable(error))
        throw new Error('Analysis views generation failed.');
      throw new UnrecoverableError('Analysis views generation failed.');
    }
    if (claim.alreadySucceeded) return;
    const effectiveAttempt = { ...attempt, attempt: claim.attempt };
    const auditedProvider = new AuditedViewsProvider(
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

    let validationStarted = false;
    let repairs = 0;
    let systemPrompt = claim.prompt.template;
    try {
      while (true) {
        try {
          if (
            auditedProvider.callCount >=
            MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT
          ) {
            throw validationExhausted();
          }
          const result = await new AnalysisViewsOrchestrator(
            auditedProvider,
          ).generate({
            budget: DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET,
            source: claim.source,
            systemPrompt,
          });
          validationStarted = true;
          validateAnalysisViewsCitations(result.output, claim.source);
          await this.publishRepository.publish({
            analysisId: claim.analysisId,
            completion: {
              attempt: effectiveAttempt.attempt,
              jobExecutionId: effectiveAttempt.jobExecutionId,
            },
            expectedInputHash: claim.inputHash,
            expectedPrompt: {
              contentSha256: claim.prompt.contentSha256,
              id: claim.prompt.id,
            },
            output: result.output,
            ownerId: claim.ownerId,
          });
          return;
        } catch (error: unknown) {
          if (!isRepairableValidationError(error)) throw error;
          validationStarted = true;
          if (
            repairs >= MAX_ANALYSIS_VIEW_REPAIR_ATTEMPTS ||
            auditedProvider.callCount >=
              MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT
          ) {
            throw validationExhausted();
          }
          repairs += 1;
          systemPrompt = buildRepairPrompt(
            claim.prompt.template,
            repairs,
            readStableCode(error) ?? 'VIEW_VALIDATION_FAILED',
          );
        }
      }
    } catch (error: unknown) {
      const validationFailure =
        validationStarted || error instanceof ViewValidationExhaustedError;
      await this.repository.fail(
        effectiveAttempt,
        claim,
        readStableCode(error) ?? 'VIEW_GENERATION_DEPENDENCY_FAILED',
        validationFailure,
      );
      if (isRetryable(error))
        throw new Error('Analysis views generation failed.');
      throw new UnrecoverableError(
        validationFailure
          ? 'Analysis views validation failed.'
          : 'Analysis views generation failed.',
      );
    }
  }
}

class AuditedViewsProvider implements LlmProvider {
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
    private readonly runtime: AnalysisViewsRuntimeIdentity,
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
      throw new ViewRuntimeIdentityError();
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

class ViewRuntimeIdentityError extends Error {
  readonly code = 'VIEW_RUNTIME_IDENTITY_CHANGED';
  readonly retryable = false;
}

class ViewValidationExhaustedError extends Error {
  readonly code = 'VIEW_VALIDATION_EXHAUSTED';
  readonly retryable = false;
}

function validationExhausted(): ViewValidationExhaustedError {
  return new ViewValidationExhaustedError();
}

function isRepairableValidationError(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    error instanceof AnalysisViewsCitationError ||
    (error instanceof LlmProviderError &&
      error.code === 'PROVIDER_MALFORMED_OUTPUT') ||
    (error instanceof AnalysisViewsOrchestrationError &&
      [
        'VIEW_GENERATION_OUTPUT_LIMIT_EXCEEDED',
        'VIEW_GENERATION_COMPLIANCE_FAILED',
      ].includes(error.code))
  );
}

function buildRepairPrompt(
  basePrompt: string,
  repairAttempt: number,
  stableCode: string,
): string {
  return [
    basePrompt,
    '',
    `Repair attempt ${repairAttempt} of ${MAX_ANALYSIS_VIEW_REPAIR_ATTEMPTS}.`,
    `The previous candidate failed server validation (${stableCode}).`,
    'Return a complete corrected three-view output using only the supplied untrusted source and valid direct evidence IDs.',
  ].join('\n');
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
