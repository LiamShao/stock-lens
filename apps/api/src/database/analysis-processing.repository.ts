import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AnalysisStatus, JobStatus, JobStep } from '@prisma/client';
import { createParseIdempotencyKey } from '@stocklens/shared';

import { PrismaService } from './prisma.service';
import { runSerializableTransaction } from './serializable-transaction';

export type StartProcessingResult =
  | { kind: 'not-found' }
  | { kind: 'no-documents' }
  | { kind: 'not-processable' }
  | {
      kind: 'started';
      acceptedAt: Date;
      analysisId: string;
      executionId: string;
      ownerId: string;
    };

@Injectable()
export class AnalysisProcessingRepository {
  constructor(private readonly prisma: PrismaService) {}

  start(ownerId: string, analysisId: string): Promise<StartProcessingResult> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const analysis = await transaction.analysis.findFirst({
        select: { id: true, status: true },
        where: { deletedAt: null, id: analysisId, ownerId },
      });
      if (analysis === null) return { kind: 'not-found' };

      const active = await transaction.jobExecution.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, id: true },
        where: {
          analysisId,
          ownerId,
          status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] },
          step: JobStep.PARSE,
        },
      });
      if (active !== null && analysis.status === AnalysisStatus.PARSING) {
        return {
          kind: 'started',
          acceptedAt: active.createdAt,
          analysisId,
          executionId: active.id,
          ownerId,
        };
      }
      if (analysis.status !== AnalysisStatus.UPLOADED) {
        return { kind: 'not-processable' };
      }

      const documents = await transaction.document.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, sha256: true },
        where: { analysisId, deletedAt: null, ownerId },
      });
      if (documents.length === 0) return { kind: 'no-documents' };

      const inputHash = createHash('sha256')
        .update(documents.map(({ id, sha256 }) => `${id}:${sha256}`).join('\n'))
        .digest('hex');
      const execution = await transaction.jobExecution.upsert({
        create: {
          analysisId,
          idempotencyKey: createParseIdempotencyKey(analysisId, inputHash),
          ownerId,
          status: JobStatus.QUEUED,
          step: JobStep.PARSE,
        },
        update: {},
        where: {
          idempotencyKey: createParseIdempotencyKey(analysisId, inputHash),
        },
      });
      if (execution.status === JobStatus.FAILED) {
        return { kind: 'not-processable' };
      }
      await transaction.analysis.update({
        data: {
          failureCode: null,
          failureMessage: null,
          status: AnalysisStatus.PARSING,
        },
        where: { id: analysisId },
      });
      return {
        kind: 'started',
        acceptedAt: execution.createdAt,
        analysisId,
        executionId: execution.id,
        ownerId,
      };
    });
  }
}
