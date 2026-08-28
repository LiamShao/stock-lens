import { createHash } from 'node:crypto';

import {
  AnalysisStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import {
  analysisViewsGenerationOutputSchema,
  financialMetricSnapshotSchema,
  validateAnalysisViewsCompliance,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

import {
  analysisViewsSourceSchema,
  type AnalysisViewsSource,
} from './ai/analysis-views-orchestrator';
import { validateAnalysisViewsCitations } from './analysis-views-citation-validator';

export const ANALYSIS_VIEWS_PROMPT_NAME = 'analysis-views';
export const ANALYSIS_VIEWS_PROMPT_SCHEMA_VERSION = 'analysis-views-v1';

export interface AnalysisViewsSourceSnapshot {
  readonly inputHash: string;
  readonly source: AnalysisViewsSource;
}

export interface AnalysisViewsPublishInput {
  readonly analysisId: string;
  readonly expectedInputHash: string;
  readonly expectedPrompt: {
    readonly contentSha256: string;
    readonly id: string;
  };
  readonly output: AnalysisViewsGenerationOutput;
  readonly ownerId: string;
  readonly completion?: {
    readonly attempt: number;
    readonly jobExecutionId: string;
  };
}

export type AnalysisViewsPublishErrorCode =
  | 'VIEW_SOURCE_UNAVAILABLE'
  | 'VIEW_TARGET_CHANGED'
  | 'VIEW_INPUT_CHANGED'
  | 'VIEW_PROMPT_CHANGED'
  | 'VIEW_OUTPUT_COMPLIANCE_FAILED';

export class AnalysisViewsPublishError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: AnalysisViewsPublishErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisViewsPublishError';
  }
}

export class AnalysisViewsPublishRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async loadSource(
    ownerId: string,
    analysisId: string,
  ): Promise<AnalysisViewsSourceSnapshot> {
    const source = await resolveAnalysisViewsSource(
      this.prisma,
      ownerId,
      analysisId,
    );
    if (source === null) {
      throw new AnalysisViewsPublishError(
        'VIEW_SOURCE_UNAVAILABLE',
        'Analysis view source is unavailable.',
      );
    }
    return { inputHash: createAnalysisViewsInputHash(source), source };
  }

  async publish(
    input: AnalysisViewsPublishInput,
    now = new Date(),
  ): Promise<void> {
    const output = analysisViewsGenerationOutputSchema.parse(input.output);
    if (!validateAnalysisViewsCompliance(output).valid) {
      throw new AnalysisViewsPublishError(
        'VIEW_OUTPUT_COMPLIANCE_FAILED',
        'Analysis view output failed compliance validation.',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.analysis.findFirst({
          select: { id: true },
          where: {
            deletedAt: null,
            id: input.analysisId,
            ownerId: input.ownerId,
            status: AnalysisStatus.READY_FOR_VIEW_GENERATION,
          },
        });
        if (target === null) {
          throw new AnalysisViewsPublishError(
            'VIEW_TARGET_CHANGED',
            'Analysis view publish target changed.',
          );
        }

        if (input.completion !== undefined) {
          const [execution, attempt] = await Promise.all([
            tx.jobExecution.findFirst({
              select: { id: true },
              where: {
                analysisId: input.analysisId,
                id: input.completion.jobExecutionId,
                ownerId: input.ownerId,
                status: JobStatus.RUNNING,
                step: JobStep.GENERATE_VIEWS,
              },
            }),
            tx.jobAttempt.findUnique({
              select: { status: true },
              where: {
                jobExecutionId_attempt: {
                  attempt: input.completion.attempt,
                  jobExecutionId: input.completion.jobExecutionId,
                },
              },
            }),
          ]);
          if (execution === null || attempt?.status !== JobStatus.RUNNING) {
            throw new AnalysisViewsPublishError(
              'VIEW_TARGET_CHANGED',
              'Analysis view publish execution changed.',
            );
          }
        }

        const prompt = await tx.promptVersion.findFirst({
          select: { id: true },
          where: {
            contentSha256: input.expectedPrompt.contentSha256,
            id: input.expectedPrompt.id,
            isActive: true,
            name: ANALYSIS_VIEWS_PROMPT_NAME,
            schemaVersion: ANALYSIS_VIEWS_PROMPT_SCHEMA_VERSION,
          },
        });
        if (prompt === null) {
          throw new AnalysisViewsPublishError(
            'VIEW_PROMPT_CHANGED',
            'Analysis view prompt changed before publish.',
          );
        }

        const source = await resolveAnalysisViewsSource(
          tx,
          input.ownerId,
          input.analysisId,
        );
        if (
          source === null ||
          createAnalysisViewsInputHash(source) !== input.expectedInputHash
        ) {
          throw new AnalysisViewsPublishError(
            'VIEW_INPUT_CHANGED',
            'Analysis view input changed before publish.',
          );
        }

        validateAnalysisViewsCitations(output, source);

        const updated = await tx.analysis.updateMany({
          data: {
            analystViewOutput: output.analystView,
            buffettMungerOutput: output.buffettMunger,
            completedAt: now,
            failureCode: null,
            failureMessage: null,
            justTellMeOutput: output.justTellMe,
            status: AnalysisStatus.COMPLETED,
          },
          where: {
            deletedAt: null,
            id: input.analysisId,
            ownerId: input.ownerId,
            status: AnalysisStatus.READY_FOR_VIEW_GENERATION,
          },
        });
        if (updated.count !== 1) {
          throw new AnalysisViewsPublishError(
            'VIEW_TARGET_CHANGED',
            'Analysis view publish target changed.',
          );
        }
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
            data: {
              errorCode: null,
              errorDetails: Prisma.DbNull,
              errorMessage: null,
              finishedAt: now,
              status: JobStatus.SUCCEEDED,
            },
            where: { id: input.completion.jobExecutionId },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

export function createAnalysisViewsInputHash(
  source: AnalysisViewsSource,
): string {
  return createHash('sha256')
    .update(JSON.stringify(analysisViewsSourceSchema.parse(source)))
    .digest('hex');
}

export async function resolveAnalysisViewsSource(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  analysisId: string,
  allowedStatuses: readonly AnalysisStatus[] = [
    AnalysisStatus.READY_FOR_VIEW_GENERATION,
  ],
): Promise<AnalysisViewsSource | null> {
  const analysis = await db.analysis.findFirst({
    select: {
      company: { select: { nameJa: true } },
      financialMetrics: true,
      id: true,
      title: true,
    },
    where: {
      deletedAt: null,
      id: analysisId,
      ownerId,
      status: { in: [...allowedStatuses] },
    },
  });
  if (analysis === null) return null;

  const metrics = financialMetricSnapshotSchema.safeParse(
    analysis.financialMetrics,
  );
  if (!metrics.success) return null;

  const findings = await db.analysisFinding.findMany({
    include: {
      evidenceLinks: {
        include: {
          evidence: {
            include: {
              chunk: { select: { content: true } },
              document: { select: { originalName: true } },
              page: { select: { pageNumber: true, text: true } },
            },
          },
        },
        orderBy: { evidenceId: 'asc' },
        where: {
          evidence: {
            analysisId,
            document: { deletedAt: null },
            ownerId,
          },
          ownerId,
        },
      },
    },
    orderBy: [{ findingKey: 'asc' }, { id: 'asc' }],
    where: { analysisId, ownerId },
  });
  if (findings.length === 0) return null;
  if (
    findings.some((finding) =>
      finding.evidenceLinks.some(
        ({ evidence }) =>
          evidence.pageNumber !== evidence.page.pageNumber ||
          !evidence.chunk.content.includes(evidence.excerpt) ||
          !evidence.page.text.includes(evidence.excerpt),
      ),
    )
  ) {
    return null;
  }

  const parsed = analysisViewsSourceSchema.safeParse({
    analysisId: analysis.id,
    analysisTitle: analysis.title,
    companyNameJa: analysis.company?.nameJa ?? null,
    financialMetrics: metrics.data,
    findings: findings.map((finding) => ({
      body: finding.body,
      category: finding.category,
      evidences: finding.evidenceLinks.map(({ evidence }) => ({
        chunkId: evidence.chunkId,
        documentId: evidence.documentId,
        documentName: evidence.document.originalName,
        excerpt: evidence.excerpt,
        id: evidence.id,
        pageNumber: evidence.page.pageNumber,
      })),
      findingKey: finding.findingKey,
      id: finding.id,
      importance: finding.importance,
      status: finding.status,
      title: finding.title,
    })),
  });
  return parsed.success ? parsed.data : null;
}
