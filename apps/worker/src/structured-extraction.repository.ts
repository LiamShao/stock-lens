import { createHash } from 'node:crypto';

import {
  AnalysisStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  createExtractionIdempotencyKey,
  createFinancialMetricsIdempotencyKey,
  parseExtractionIdempotencyKey,
} from '@stocklens/shared';

import type { ExtractionSourceChunk } from './ai/structured-extraction-orchestrator';
import type { ActiveEvidenceSource } from './extraction-publish.repository';

export interface ExtractionPipelineAttemptInput {
  readonly attempt: number;
  readonly bullmqJobId: string;
  readonly jobExecutionId: string;
}

interface ExtractionPromptClaim {
  readonly contentSha256: string;
  readonly id: string;
  readonly schemaVersion: string;
  readonly template: string;
}

export type ExtractionPipelineClaim =
  | { readonly alreadySucceeded: true }
  | {
      readonly alreadySucceeded: false;
      readonly analysisId: string;
      readonly attempt: number;
      readonly evidenceSources: readonly ActiveEvidenceSource[];
      readonly inputHash: string;
      readonly ownerId: string;
      readonly prompt: ExtractionPromptClaim | null;
      readonly sourceChunks: readonly ExtractionSourceChunk[];
      readonly step: JobStep;
    };

export class StructuredExtractionJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  begin(
    input: ExtractionPipelineAttemptInput,
    expectedRuntimeSha256: string,
    now = new Date(),
  ): Promise<ExtractionPipelineClaim> {
    return this.prisma.$transaction(
      async (tx) => {
        const execution = await tx.jobExecution.findUnique({
          include: { analysis: { select: { deletedAt: true } } },
          where: { id: input.jobExecutionId },
        });
        if (
          execution === null ||
          (execution.step !== JobStep.CALCULATE_FINANCIAL_METRICS &&
            execution.step !== JobStep.EXTRACT)
        ) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_EXECUTION_NOT_FOUND',
            'Structured extraction execution was not found.',
          );
        }
        if (execution.status === JobStatus.SUCCEEDED) {
          return { alreadySucceeded: true };
        }
        if (execution.analysis.deletedAt !== null) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_TARGET_UNAVAILABLE',
            'Structured extraction target is unavailable.',
          );
        }

        const chunks = await tx.documentChunk.findMany({
          orderBy: [
            { document: { createdAt: 'asc' } },
            { documentId: 'asc' },
            { page: { pageNumber: 'asc' } },
            { chunkIndex: 'asc' },
            { id: 'asc' },
          ],
          select: {
            chunkIndex: true,
            content: true,
            contentSha256: true,
            document: {
              select: {
                createdAt: true,
                documentType: true,
                id: true,
                originalName: true,
              },
            },
            id: true,
            page: { select: { id: true, pageNumber: true, text: true } },
            section: true,
          },
          where: {
            document: {
              analysisId: execution.analysisId,
              deletedAt: null,
            },
            ownerId: execution.ownerId,
          },
        });
        if (chunks.length === 0) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_SOURCE_EMPTY',
            'Structured extraction source is unavailable.',
          );
        }
        const inputHash = createSourceInputHash(chunks);
        let prompt: ExtractionPromptClaim | null = null;
        if (execution.step === JobStep.EXTRACT) {
          let key;
          try {
            key = parseExtractionIdempotencyKey(execution.idempotencyKey);
          } catch {
            throw new ExtractionPipelineStateError(
              'EXTRACTION_EXECUTION_INVALID',
              'Structured extraction execution is invalid.',
            );
          }
          if (
            key.analysisId !== execution.analysisId ||
            key.inputHash !== inputHash ||
            key.runtimeSha256 !== expectedRuntimeSha256
          ) {
            throw new ExtractionPipelineStateError(
              'EXTRACTION_INPUT_CHANGED',
              'Structured extraction input changed.',
            );
          }
          prompt = await tx.promptVersion.findFirst({
            select: {
              contentSha256: true,
              id: true,
              schemaVersion: true,
              template: true,
            },
            where: {
              contentSha256: key.promptContentSha256,
              id: key.promptVersionId,
              isActive: true,
            },
          });
          if (prompt === null) {
            throw new ExtractionPipelineStateError(
              'EXTRACTION_PROMPT_CHANGED',
              'Structured extraction prompt changed.',
            );
          }
          if (prompt.schemaVersion !== 'structured-finding-v1') {
            throw new ExtractionPipelineStateError(
              'EXTRACTION_PROMPT_SCHEMA_MISMATCH',
              'Structured extraction prompt schema is incompatible.',
            );
          }
        } else if (
          execution.idempotencyKey !==
          createFinancialMetricsIdempotencyKey(execution.analysisId, inputHash)
        ) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_INPUT_CHANGED',
            'Structured extraction input changed.',
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
            status: AnalysisStatus.EXTRACTING,
          },
          where: { id: execution.analysisId },
        });

        const documentOrder = new Map<string, number>();
        for (const chunk of chunks) {
          if (!documentOrder.has(chunk.document.id)) {
            documentOrder.set(chunk.document.id, documentOrder.size);
          }
        }
        return {
          alreadySucceeded: false,
          analysisId: execution.analysisId,
          attempt: attemptNumber,
          evidenceSources: chunks.map((chunk) => ({
            chunkId: chunk.id,
            content: chunk.content,
            contentSha256: chunk.contentSha256,
            documentId: chunk.document.id,
            pageId: chunk.page.id,
            pageNumber: chunk.page.pageNumber,
            pageText: chunk.page.text,
          })),
          inputHash,
          ownerId: execution.ownerId,
          prompt,
          sourceChunks: chunks.map((chunk) => ({
            chunkId: chunk.id,
            chunkOrder: chunk.chunkIndex,
            documentId: chunk.document.id,
            documentName: chunk.document.originalName,
            documentOrder: documentOrder.get(chunk.document.id) ?? 0,
            documentType: chunk.document.documentType,
            pageNumber: chunk.page.pageNumber,
            section: chunk.section,
            text: chunk.content,
          })),
          step: execution.step,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async finishMetrics(
    input: ExtractionPipelineAttemptInput,
    claim: Exclude<ExtractionPipelineClaim, { alreadySucceeded: true }>,
    runtimeSha256: string,
    now = new Date(),
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const activePrompt = await tx.promptVersion.findFirst({
          orderBy: { version: 'desc' },
          select: {
            contentSha256: true,
            id: true,
            schemaVersion: true,
          },
          where: { isActive: true, name: 'structured-extraction' },
        });
        if (activePrompt === null) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_PROMPT_UNAVAILABLE',
            'Structured extraction prompt is unavailable.',
          );
        }
        if (activePrompt.schemaVersion !== 'structured-finding-v1') {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_PROMPT_SCHEMA_MISMATCH',
            'Structured extraction prompt schema is incompatible.',
          );
        }
        const currentSources = await tx.documentChunk.findMany({
          orderBy: { id: 'asc' },
          select: { contentSha256: true, id: true },
          where: {
            document: { analysisId: claim.analysisId, deletedAt: null },
            ownerId: claim.ownerId,
          },
        });
        if (
          currentSources.length === 0 ||
          createSourceInputHash(currentSources) !== claim.inputHash
        ) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_INPUT_CHANGED',
            'Structured extraction input changed.',
          );
        }
        const idempotencyKey = createExtractionIdempotencyKey({
          analysisId: claim.analysisId,
          inputHash: claim.inputHash,
          promptContentSha256: activePrompt.contentSha256,
          promptVersionId: activePrompt.id,
          runtimeSha256,
        });
        const extraction = await tx.jobExecution.upsert({
          create: {
            analysisId: claim.analysisId,
            idempotencyKey,
            ownerId: claim.ownerId,
            status: JobStatus.QUEUED,
            step: JobStep.EXTRACT,
          },
          update: {},
          where: { idempotencyKey },
        });
        await completeExecution(tx, input, now);
        const target = await tx.analysis.updateMany({
          data: { status: AnalysisStatus.EXTRACTING },
          where: {
            deletedAt: null,
            id: claim.analysisId,
            ownerId: claim.ownerId,
          },
        });
        if (target.count !== 1) {
          throw new ExtractionPipelineStateError(
            'EXTRACTION_TARGET_UNAVAILABLE',
            'Structured extraction target is unavailable.',
          );
        }
        return extraction.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markValidating(ownerId: string, analysisId: string): Promise<void> {
    const result = await this.prisma.analysis.updateMany({
      data: { status: AnalysisStatus.VALIDATING },
      where: {
        deletedAt: null,
        id: analysisId,
        ownerId,
        status: { in: [AnalysisStatus.EXTRACTING, AnalysisStatus.VALIDATING] },
      },
    });
    if (result.count !== 1) {
      throw new ExtractionPipelineStateError(
        'EXTRACTION_TARGET_UNAVAILABLE',
        'Structured extraction target is unavailable.',
      );
    }
  }

  async fail(
    input: ExtractionPipelineAttemptInput,
    claim: Exclude<ExtractionPipelineClaim, { alreadySucceeded: true }>,
    code: string,
    validationFailure: boolean,
    now = new Date(),
  ): Promise<void> {
    const message = validationFailure
      ? 'Structured extraction validation failed.'
      : 'Structured extraction failed.';
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
    input: ExtractionPipelineAttemptInput,
    code: string,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const execution = await tx.jobExecution.findUnique({
        where: { id: input.jobExecutionId },
      });
      if (execution === null || execution.status === JobStatus.SUCCEEDED)
        return;
      const attempt = Math.max(execution.currentAttempt + 1, input.attempt);
      await tx.jobAttempt.upsert({
        create: {
          attempt,
          bullmqJobId: input.bullmqJobId,
          errorCode: code,
          errorMessage: 'Structured extraction failed.',
          finishedAt: now,
          jobExecutionId: execution.id,
          ownerId: execution.ownerId,
          startedAt: now,
          status: JobStatus.FAILED,
        },
        update: {
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: 'Structured extraction failed.',
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
          errorMessage: 'Structured extraction failed.',
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: { id: execution.id },
      });
      await tx.analysis.updateMany({
        data: {
          failureCode: code,
          failureMessage: 'Structured extraction failed.',
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

export function createSourceInputHash(
  sources: readonly { contentSha256: string; id?: string; chunkId?: string }[],
): string {
  return createHash('sha256')
    .update(
      [...sources]
        .map((source) => ({
          contentSha256: source.contentSha256,
          id: source.id ?? source.chunkId ?? '',
        }))
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((source) => `${source.id}:${source.contentSha256}`)
        .join('\n'),
    )
    .digest('hex');
}

async function completeExecution(
  tx: Prisma.TransactionClient,
  input: ExtractionPipelineAttemptInput,
  now: Date,
): Promise<void> {
  await tx.jobAttempt.update({
    data: { finishedAt: now, status: JobStatus.SUCCEEDED },
    where: {
      jobExecutionId_attempt: {
        attempt: input.attempt,
        jobExecutionId: input.jobExecutionId,
      },
    },
  });
  await tx.jobExecution.update({
    data: { finishedAt: now, status: JobStatus.SUCCEEDED },
    where: { id: input.jobExecutionId },
  });
}

export class ExtractionPipelineStateError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionPipelineStateError';
  }
}
