import { randomUUID } from 'node:crypto';

import {
  AnalysisStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  createValidationIdempotencyKey,
  financialMetricSnapshotSchema,
  type FinancialMetricSnapshot,
} from '@stocklens/shared';

import type {
  EvidenceSourceChunk,
  ValidatedExtractionSet,
} from './evidence-validator';

export interface ActiveEvidenceSource extends EvidenceSourceChunk {
  readonly contentSha256: string;
}

export interface ExtractionPublishInput {
  readonly analysisId: string;
  readonly expectedPrompt: {
    readonly contentSha256: string;
    readonly id: string;
  };
  readonly expectedSources: readonly {
    readonly chunkId: string;
    readonly contentSha256: string;
  }[];
  readonly financialMetrics: FinancialMetricSnapshot;
  readonly ownerId: string;
  readonly validated: ValidatedExtractionSet;
  readonly completion?: {
    readonly attempt: number;
    readonly jobExecutionId: string;
  };
}

export type ExtractionPublishConflictCode =
  | 'EXTRACTION_TARGET_CHANGED'
  | 'EXTRACTION_INPUT_CHANGED'
  | 'EXTRACTION_PROMPT_CHANGED';

export class ExtractionPublishConflictError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: ExtractionPublishConflictCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExtractionPublishConflictError';
  }
}

export class ExtractionPublishRepository {
  constructor(private readonly prisma: PrismaClient) {}

  loadActiveSources(
    ownerId: string,
    analysisId: string,
  ): Promise<ActiveEvidenceSource[]> {
    return this.prisma.documentChunk
      .findMany({
        orderBy: [
          { document: { createdAt: 'asc' } },
          { documentId: 'asc' },
          { page: { pageNumber: 'asc' } },
          { chunkIndex: 'asc' },
          { id: 'asc' },
        ],
        select: {
          content: true,
          contentSha256: true,
          documentId: true,
          id: true,
          page: { select: { pageNumber: true, text: true } },
          pageId: true,
        },
        where: {
          document: {
            analysis: { deletedAt: null, id: analysisId, ownerId },
            deletedAt: null,
          },
          ownerId,
        },
      })
      .then((chunks) =>
        chunks.map((chunk) => ({
          chunkId: chunk.id,
          content: chunk.content,
          contentSha256: chunk.contentSha256,
          documentId: chunk.documentId,
          pageId: chunk.pageId,
          pageNumber: chunk.page.pageNumber,
          pageText: chunk.page.text,
        })),
      );
  }

  async publish(
    input: ExtractionPublishInput,
    now = new Date(),
  ): Promise<void> {
    const financialMetrics = financialMetricSnapshotSchema.parse(
      input.financialMetrics,
    );
    await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.analysis.findFirst({
          select: { id: true },
          where: {
            deletedAt: null,
            id: input.analysisId,
            ownerId: input.ownerId,
            status: AnalysisStatus.VALIDATING,
          },
        });
        if (target === null) {
          throw new ExtractionPublishConflictError(
            'EXTRACTION_TARGET_CHANGED',
            'Extraction publish target changed.',
          );
        }

        if (input.completion !== undefined) {
          const execution = await tx.jobExecution.findFirst({
            select: { id: true },
            where: {
              analysisId: input.analysisId,
              id: input.completion.jobExecutionId,
              ownerId: input.ownerId,
              status: JobStatus.RUNNING,
              step: JobStep.EXTRACT,
            },
          });
          const attempt = await tx.jobAttempt.findUnique({
            select: { id: true, status: true },
            where: {
              jobExecutionId_attempt: {
                attempt: input.completion.attempt,
                jobExecutionId: input.completion.jobExecutionId,
              },
            },
          });
          if (execution === null || attempt?.status !== JobStatus.RUNNING) {
            throw new ExtractionPublishConflictError(
              'EXTRACTION_TARGET_CHANGED',
              'Extraction publish execution changed.',
            );
          }
        }

        const prompt = await tx.promptVersion.findFirst({
          select: { id: true },
          where: {
            contentSha256: input.expectedPrompt.contentSha256,
            id: input.expectedPrompt.id,
            isActive: true,
          },
        });
        if (prompt === null) {
          throw new ExtractionPublishConflictError(
            'EXTRACTION_PROMPT_CHANGED',
            'Extraction prompt changed before publish.',
          );
        }

        const currentSources = await tx.documentChunk.findMany({
          orderBy: { id: 'asc' },
          select: { contentSha256: true, id: true },
          where: {
            document: {
              analysisId: input.analysisId,
              deletedAt: null,
            },
            ownerId: input.ownerId,
          },
        });
        if (
          currentSources.length === 0 ||
          serializeSourceIdentity(currentSources) !==
            serializeSourceIdentity(input.expectedSources)
        ) {
          throw new ExtractionPublishConflictError(
            'EXTRACTION_INPUT_CHANGED',
            'Extraction input changed before publish.',
          );
        }

        await tx.analysisFinding.deleteMany({
          where: { analysisId: input.analysisId, ownerId: input.ownerId },
        });
        await tx.evidence.deleteMany({
          where: { analysisId: input.analysisId, ownerId: input.ownerId },
        });

        const findingRows = input.validated.findings.map((finding) => ({
          analysisId: input.analysisId,
          body: finding.body,
          category: finding.category,
          findingKey: finding.findingKey,
          id: randomUUID(),
          importance: finding.importance,
          ownerId: input.ownerId,
          status: finding.status,
          title: finding.title,
        }));
        if (findingRows.length > 0) {
          await tx.analysisFinding.createMany({ data: findingRows });
        }

        const evidenceRows = new Map<
          string,
          ValidatedExtractionSet['findings'][number]['evidence'][number] & {
            id: string;
          }
        >();
        const links: Array<{
          evidenceId: string;
          findingId: string;
        }> = [];
        input.validated.findings.forEach((finding, findingIndex) => {
          const findingRow = findingRows[findingIndex];
          if (findingRow === undefined) return;
          for (const evidence of finding.evidence) {
            const key = [
              evidence.documentId,
              evidence.pageNumber,
              evidence.excerptSha256,
            ].join(':');
            let row = evidenceRows.get(key);
            if (row === undefined) {
              row = { ...evidence, id: randomUUID() };
              evidenceRows.set(key, row);
            }
            links.push({ evidenceId: row.id, findingId: findingRow.id });
          }
        });
        if (evidenceRows.size > 0) {
          await tx.evidence.createMany({
            data: [...evidenceRows.values()].map((evidence) => ({
              analysisId: input.analysisId,
              chunkId: evidence.chunkId,
              documentId: evidence.documentId,
              endOffset: evidence.endOffset,
              excerpt: evidence.excerpt,
              excerptSha256: evidence.excerptSha256,
              id: evidence.id,
              ownerId: input.ownerId,
              pageId: evidence.pageId,
              pageNumber: evidence.pageNumber,
              startOffset: evidence.startOffset,
            })),
          });
        }
        if (links.length > 0) {
          await tx.findingEvidence.createMany({
            data: links.map((link) => ({
              analysisId: input.analysisId,
              evidenceId: link.evidenceId,
              findingId: link.findingId,
              ownerId: input.ownerId,
            })),
            skipDuplicates: true,
          });
        }

        await tx.analysis.update({
          data: {
            failureCode: null,
            failureMessage: null,
            financialMetrics,
            status: AnalysisStatus.READY_FOR_VIEW_GENERATION,
          },
          where: { id: input.analysisId },
        });

        if (input.completion !== undefined) {
          await tx.jobAttempt.update({
            data: { finishedAt: now, status: JobStatus.SUCCEEDED },
            where: {
              jobExecutionId_attempt: {
                attempt: input.completion.attempt,
                jobExecutionId: input.completion.jobExecutionId,
              },
            },
          });
          await tx.jobExecution.update({
            data: { finishedAt: now, status: JobStatus.SUCCEEDED },
            where: { id: input.completion.jobExecutionId },
          });
          const validationKey = createValidationIdempotencyKey(
            input.analysisId,
            input.completion.jobExecutionId,
          );
          const validation = await tx.jobExecution.upsert({
            create: {
              analysisId: input.analysisId,
              currentAttempt: 1,
              finishedAt: now,
              idempotencyKey: validationKey,
              ownerId: input.ownerId,
              startedAt: now,
              status: JobStatus.SUCCEEDED,
              step: JobStep.VALIDATE,
            },
            update: {
              currentAttempt: 1,
              errorCode: null,
              errorDetails: Prisma.DbNull,
              errorMessage: null,
              finishedAt: now,
              startedAt: now,
              status: JobStatus.SUCCEEDED,
            },
            where: { idempotencyKey: validationKey },
          });
          await tx.jobAttempt.upsert({
            create: {
              attempt: 1,
              finishedAt: now,
              jobExecutionId: validation.id,
              ownerId: input.ownerId,
              startedAt: now,
              status: JobStatus.SUCCEEDED,
            },
            update: {
              errorCode: null,
              errorDetails: Prisma.DbNull,
              errorMessage: null,
              finishedAt: now,
              startedAt: now,
              status: JobStatus.SUCCEEDED,
            },
            where: {
              jobExecutionId_attempt: {
                attempt: 1,
                jobExecutionId: validation.id,
              },
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function serializeSourceIdentity(
  sources: readonly { chunkId?: string; contentSha256: string; id?: string }[],
): string {
  return [...sources]
    .map((source) => ({
      contentSha256: source.contentSha256,
      id: source.chunkId ?? source.id ?? '',
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((source) => `${source.id}:${source.contentSha256}`)
    .join('\n');
}
