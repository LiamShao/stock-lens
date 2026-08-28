import {
  AnalysisStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { parseAnalysisViewsIdempotencyKey } from '@stocklens/shared';

import {
  ANALYSIS_VIEWS_PROMPT_NAME,
  ANALYSIS_VIEWS_PROMPT_SCHEMA_VERSION,
  createAnalysisViewsInputHash,
  resolveAnalysisViewsSource,
} from './analysis-views-publish.repository';

export interface AnalysisViewsAttemptInput {
  readonly attempt: number;
  readonly bullmqJobId: string;
  readonly jobExecutionId: string;
}

export type AnalysisViewsGenerationClaim =
  | { readonly alreadySucceeded: true }
  | {
      readonly alreadySucceeded: false;
      readonly analysisId: string;
      readonly attempt: number;
      readonly inputHash: string;
      readonly ownerId: string;
      readonly prompt: {
        readonly contentSha256: string;
        readonly id: string;
        readonly template: string;
      };
      readonly source: NonNullable<
        Awaited<ReturnType<typeof resolveAnalysisViewsSource>>
      >;
    };

export class AnalysisViewsGenerationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  begin(
    input: AnalysisViewsAttemptInput,
    expectedRuntimeSha256: string,
    now = new Date(),
  ): Promise<AnalysisViewsGenerationClaim> {
    return this.prisma.$transaction(
      async (tx) => {
        const execution = await tx.jobExecution.findUnique({
          include: { analysis: { select: { deletedAt: true } } },
          where: { id: input.jobExecutionId },
        });
        if (execution === null || execution.step !== JobStep.GENERATE_VIEWS) {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_EXECUTION_NOT_FOUND',
            'Analysis views execution was not found.',
          );
        }
        if (execution.status === JobStatus.SUCCEEDED) {
          return { alreadySucceeded: true };
        }
        if (execution.analysis.deletedAt !== null) {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_TARGET_UNAVAILABLE',
            'Analysis views target is unavailable.',
          );
        }

        let identity;
        try {
          identity = parseAnalysisViewsIdempotencyKey(execution.idempotencyKey);
        } catch {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_EXECUTION_INVALID',
            'Analysis views execution is invalid.',
          );
        }
        if (
          identity.analysisId !== execution.analysisId ||
          identity.runtimeSha256 !== expectedRuntimeSha256 ||
          identity.schemaVersion !== ANALYSIS_VIEWS_PROMPT_SCHEMA_VERSION
        ) {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_RUNTIME_IDENTITY_CHANGED',
            'Analysis views runtime identity changed.',
          );
        }
        const prompt = await tx.promptVersion.findFirst({
          select: { contentSha256: true, id: true, template: true },
          where: {
            contentSha256: identity.promptContentSha256,
            id: identity.promptVersionId,
            isActive: true,
            name: ANALYSIS_VIEWS_PROMPT_NAME,
            schemaVersion: ANALYSIS_VIEWS_PROMPT_SCHEMA_VERSION,
          },
        });
        if (prompt === null) {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_PROMPT_CHANGED',
            'Analysis views prompt changed.',
          );
        }
        const source = await resolveAnalysisViewsSource(
          tx,
          execution.ownerId,
          execution.analysisId,
          [
            AnalysisStatus.READY_FOR_VIEW_GENERATION,
            AnalysisStatus.FAILED_EXTRACTION,
            AnalysisStatus.FAILED_VALIDATION,
          ],
        );
        if (
          source === null ||
          createAnalysisViewsInputHash(source) !== identity.inputHash
        ) {
          throw new AnalysisViewsGenerationStateError(
            'VIEW_INPUT_CHANGED',
            'Analysis views input changed.',
          );
        }

        const attemptNumber = Math.max(
          execution.currentAttempt + 1,
          input.attempt,
        );
        await tx.jobAttempt.upsert({
          create: {
            attempt: attemptNumber,
            bullmqJobId: input.bullmqJobId,
            jobExecutionId: execution.id,
            ownerId: execution.ownerId,
            startedAt: now,
            status: JobStatus.RUNNING,
          },
          update: {
            bullmqJobId: input.bullmqJobId,
            errorCode: null,
            errorDetails: Prisma.DbNull,
            errorMessage: null,
            finishedAt: null,
            startedAt: now,
            status: JobStatus.RUNNING,
          },
          where: {
            jobExecutionId_attempt: {
              attempt: attemptNumber,
              jobExecutionId: execution.id,
            },
          },
        });
        await tx.jobExecution.update({
          data: {
            currentAttempt: attemptNumber,
            errorCode: null,
            errorDetails: Prisma.DbNull,
            errorMessage: null,
            finishedAt: null,
            startedAt: execution.startedAt ?? now,
            status: JobStatus.RUNNING,
          },
          where: { id: execution.id },
        });
        await tx.analysis.update({
          data: {
            failureCode: null,
            failureMessage: null,
            status: AnalysisStatus.READY_FOR_VIEW_GENERATION,
          },
          where: { id: execution.analysisId },
        });
        return {
          alreadySucceeded: false,
          analysisId: execution.analysisId,
          attempt: attemptNumber,
          inputHash: identity.inputHash,
          ownerId: execution.ownerId,
          prompt,
          source,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async fail(
    input: AnalysisViewsAttemptInput,
    claim: Exclude<AnalysisViewsGenerationClaim, { alreadySucceeded: true }>,
    code: string,
    validationFailure: boolean,
    now = new Date(),
  ): Promise<void> {
    const message = validationFailure
      ? 'Analysis views validation failed.'
      : 'Analysis views generation failed.';
    await this.prisma.$transaction(async (tx) => {
      await tx.jobAttempt.updateMany({
        data: {
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: message,
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: {
          attempt: claim.attempt,
          jobExecutionId: input.jobExecutionId,
        },
      });
      await tx.jobExecution.updateMany({
        data: {
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: message,
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: { id: input.jobExecutionId },
      });
      await tx.analysis.updateMany({
        data: {
          failureCode: code,
          failureMessage: message,
          status: validationFailure
            ? AnalysisStatus.FAILED_VALIDATION
            : AnalysisStatus.FAILED_EXTRACTION,
        },
        where: {
          deletedAt: null,
          id: claim.analysisId,
          ownerId: claim.ownerId,
        },
      });
    });
  }

  async failWithoutClaim(
    input: AnalysisViewsAttemptInput,
    code: string,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const execution = await tx.jobExecution.findUnique({
        where: { id: input.jobExecutionId },
      });
      if (
        execution === null ||
        execution.step !== JobStep.GENERATE_VIEWS ||
        execution.status === JobStatus.SUCCEEDED
      )
        return;
      const attempt = Math.max(execution.currentAttempt + 1, input.attempt);
      await tx.jobAttempt.upsert({
        create: {
          attempt,
          bullmqJobId: input.bullmqJobId,
          errorCode: code,
          errorMessage: 'Analysis views generation failed.',
          finishedAt: now,
          jobExecutionId: execution.id,
          ownerId: execution.ownerId,
          startedAt: now,
          status: JobStatus.FAILED,
        },
        update: {
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: 'Analysis views generation failed.',
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: {
          jobExecutionId_attempt: {
            attempt,
            jobExecutionId: execution.id,
          },
        },
      });
      await tx.jobExecution.update({
        data: {
          currentAttempt: attempt,
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: 'Analysis views generation failed.',
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: { id: execution.id },
      });
      await tx.analysis.updateMany({
        data: {
          failureCode: code,
          failureMessage: 'Analysis views generation failed.',
          status: AnalysisStatus.FAILED_EXTRACTION,
        },
        where: {
          deletedAt: null,
          id: execution.analysisId,
          ownerId: execution.ownerId,
        },
      });
    });
  }
}

export class AnalysisViewsGenerationStateError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisViewsGenerationStateError';
  }
}
