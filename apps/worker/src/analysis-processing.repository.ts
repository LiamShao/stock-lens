import { createHash } from 'node:crypto';

import {
  AnalysisStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  createChunkIdempotencyKey,
  createFinancialMetricsIdempotencyKey,
} from '@stocklens/shared';

import type { ExtractedPage } from './pdf-text-extractor';
import type { GeneratedChunk } from './page-chunker';

export interface ProcessingAttemptInput {
  attempt: number;
  bullmqJobId: string;
  jobExecutionId: string;
}

export type ProcessingClaim =
  | { alreadySucceeded: true }
  | {
      alreadySucceeded: false;
      analysisId: string;
      attempt: number;
      documents: Array<{
        id: string;
        sha256: string;
        storageBucket: string;
        storageKey: string;
      }>;
      ownerId: string;
      step: JobStep;
    };

export class AnalysisProcessingJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  begin(
    input: ProcessingAttemptInput,
    now = new Date(),
  ): Promise<ProcessingClaim> {
    return this.prisma.$transaction(
      async (tx) => {
        const execution = await tx.jobExecution.findUnique({
          include: { analysis: { select: { deletedAt: true } } },
          where: { id: input.jobExecutionId },
        });
        if (
          execution === null ||
          (execution.step !== JobStep.PARSE && execution.step !== JobStep.CHUNK)
        )
          throw new Error('Processing execution was not found.');
        if (execution.status === JobStatus.SUCCEEDED)
          return { alreadySucceeded: true };
        if (execution.analysis.deletedAt !== null)
          throw new Error('Processing target is unavailable.');
        const attemptNumber = Math.max(
          execution.currentAttempt + 1,
          input.attempt,
        );
        const documents = await tx.document.findMany({
          orderBy: { id: 'asc' },
          select: {
            id: true,
            sha256: true,
            storageBucket: true,
            storageKey: true,
          },
          where: {
            analysisId: execution.analysisId,
            deletedAt: null,
            ownerId: execution.ownerId,
          },
        });
        if (documents.length === 0)
          throw new Error('Processing target is unavailable.');
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
            status:
              execution.step === JobStep.PARSE
                ? AnalysisStatus.PARSING
                : AnalysisStatus.CHUNKING,
          },
          where: { id: execution.analysisId },
        });
        return {
          alreadySucceeded: false,
          analysisId: execution.analysisId,
          attempt: attemptNumber,
          documents,
          ownerId: execution.ownerId,
          step: execution.step,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async finishParse(
    input: ProcessingAttemptInput,
    ownerId: string,
    analysisId: string,
    results: Array<{ documentId: string; pages: ExtractedPage[] }>,
    now = new Date(),
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const active = await tx.analysis.findFirst({
          select: { id: true },
          where: {
            deletedAt: null,
            id: analysisId,
            ownerId,
            status: AnalysisStatus.PARSING,
          },
        });
        if (active === null) throw new Error('Processing target changed.');
        for (const result of results) {
          await tx.documentChunk.deleteMany({
            where: { documentId: result.documentId, ownerId },
          });
          await tx.documentPage.deleteMany({
            where: { documentId: result.documentId, ownerId },
          });
          if (result.pages.length > 0) {
            await tx.documentPage.createMany({
              data: result.pages.map((page) => ({
                documentId: result.documentId,
                ownerId,
                pageNumber: page.pageNumber,
                sectionMetadata: page.sectionMetadata ?? Prisma.JsonNull,
                text: page.text,
                textSha256: page.textSha256,
              })),
            });
          }
          await tx.document.update({
            data: { pageCount: result.pages.length },
            where: { id: result.documentId },
          });
        }
        const pages = await tx.documentPage.findMany({
          orderBy: [{ documentId: 'asc' }, { pageNumber: 'asc' }],
          select: { documentId: true, textSha256: true },
          where: { document: { analysisId, deletedAt: null }, ownerId },
        });
        const inputHash = createHash('sha256')
          .update(
            pages
              .map((page) => `${page.documentId}:${page.textSha256}`)
              .join('\n'),
          )
          .digest('hex');
        const chunkExecution = await tx.jobExecution.upsert({
          create: {
            analysisId,
            idempotencyKey: createChunkIdempotencyKey(analysisId, inputHash),
            ownerId,
            status: JobStatus.QUEUED,
            step: JobStep.CHUNK,
          },
          update: {},
          where: {
            idempotencyKey: createChunkIdempotencyKey(analysisId, inputHash),
          },
        });
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
        await tx.analysis.update({
          data: { status: AnalysisStatus.CHUNKING },
          where: { id: analysisId },
        });
        return chunkExecution.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  loadPages(ownerId: string, analysisId: string) {
    return this.prisma.documentPage.findMany({
      orderBy: [{ documentId: 'asc' }, { pageNumber: 'asc' }],
      select: {
        documentId: true,
        id: true,
        pageNumber: true,
        sectionMetadata: true,
        text: true,
      },
      where: { document: { analysisId, deletedAt: null }, ownerId },
    });
  }

  async finishChunk(
    input: ProcessingAttemptInput,
    ownerId: string,
    analysisId: string,
    chunks: Array<GeneratedChunk & { chunkIndex: number; documentId: string }>,
    now = new Date(),
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const active = await tx.analysis.findFirst({
          select: { id: true },
          where: {
            deletedAt: null,
            id: analysisId,
            ownerId,
            status: AnalysisStatus.CHUNKING,
          },
        });
        if (active === null) throw new Error('Processing target changed.');
        await tx.documentChunk.deleteMany({
          where: { document: { analysisId }, ownerId },
        });
        if (chunks.length > 0)
          await tx.documentChunk.createMany({
            data: chunks.map((chunk) => ({
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentSha256: chunk.contentSha256,
              documentId: chunk.documentId,
              ownerId,
              pageId: chunk.pageId,
              section: chunk.section,
            })),
          });
        const persistedChunks = await tx.documentChunk.findMany({
          orderBy: { id: 'asc' },
          select: { contentSha256: true, id: true },
          where: { document: { analysisId, deletedAt: null }, ownerId },
        });
        const inputHash = createHash('sha256')
          .update(
            persistedChunks
              .map((chunk) => `${chunk.id}:${chunk.contentSha256}`)
              .join('\n'),
          )
          .digest('hex');
        const metricExecution = await tx.jobExecution.upsert({
          create: {
            analysisId,
            idempotencyKey: createFinancialMetricsIdempotencyKey(
              analysisId,
              inputHash,
            ),
            ownerId,
            status: JobStatus.QUEUED,
            step: JobStep.CALCULATE_FINANCIAL_METRICS,
          },
          update: {},
          where: {
            idempotencyKey: createFinancialMetricsIdempotencyKey(
              analysisId,
              inputHash,
            ),
          },
        });
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
        await tx.analysis.update({
          data: {
            failureCode: null,
            failureMessage: null,
            status: AnalysisStatus.READY_FOR_EMBEDDING,
          },
          where: { id: analysisId },
        });
        return metricExecution.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async fail(
    input: ProcessingAttemptInput,
    step: JobStep,
    code: string,
    now = new Date(),
  ): Promise<void> {
    const message =
      step === JobStep.PARSE
        ? 'PDF parsing failed.'
        : 'Document chunking failed.';
    const status =
      step === JobStep.PARSE
        ? AnalysisStatus.FAILED_PARSING
        : AnalysisStatus.FAILED_CHUNKING;
    await this.prisma.$transaction(async (tx) => {
      await tx.jobAttempt.update({
        data: {
          errorCode: code,
          errorDetails: Prisma.DbNull,
          errorMessage: message,
          finishedAt: now,
          status: JobStatus.FAILED,
        },
        where: {
          jobExecutionId_attempt: {
            attempt: input.attempt,
            jobExecutionId: input.jobExecutionId,
          },
        },
      });
      const execution = await tx.jobExecution.update({
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
        data: { failureCode: code, failureMessage: message, status },
        where: {
          deletedAt: null,
          id: execution.analysisId,
          ownerId: execution.ownerId,
        },
      });
    });
  }
}
