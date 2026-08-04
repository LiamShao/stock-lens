import { Injectable } from '@nestjs/common';
import { JobStatus, JobStep, Prisma } from '@prisma/client';
import {
  createObjectCleanupIdempotencyKey,
  type ObjectCleanupTarget,
} from '@stocklens/shared';

import { PrismaService } from './prisma.service';

const cleanupExecutionSelection = {
  id: true,
  status: true,
} satisfies Prisma.JobExecutionSelect;

export type CleanupExecutionRecord = Prisma.JobExecutionGetPayload<{
  select: typeof cleanupExecutionSelection;
}>;

export interface CreateCleanupExecutionInput {
  analysisId: string;
  ownerId: string;
  target: ObjectCleanupTarget;
}

@Injectable()
export class ObjectCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrFind(
    input: CreateCleanupExecutionInput,
  ): Promise<CleanupExecutionRecord | null> {
    const targetExists = await this.targetExists(input);
    if (!targetExists) {
      return null;
    }

    const idempotencyKey = createObjectCleanupIdempotencyKey(input.target);
    return this.prisma.jobExecution.upsert({
      create: {
        analysisId: input.analysisId,
        idempotencyKey,
        ownerId: input.ownerId,
        status: JobStatus.QUEUED,
        step: JobStep.OBJECT_CLEANUP,
        ...(input.target.kind === 'document'
          ? { documentId: input.target.id }
          : { documentUploadId: input.target.id }),
      },
      select: cleanupExecutionSelection,
      update: {},
      where: { idempotencyKey },
    });
  }

  listPending(limit: number): Promise<CleanupExecutionRecord[]> {
    return this.prisma.jobExecution.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: cleanupExecutionSelection,
      take: limit,
      where: {
        status: JobStatus.QUEUED,
        step: JobStep.OBJECT_CLEANUP,
      },
    });
  }

  async markQueuedForRetry(id: string): Promise<boolean> {
    const result = await this.prisma.jobExecution.updateMany({
      data: {
        errorCode: null,
        errorDetails: Prisma.DbNull,
        errorMessage: null,
        finishedAt: null,
        status: JobStatus.QUEUED,
      },
      where: {
        id,
        status: JobStatus.FAILED,
        step: JobStep.OBJECT_CLEANUP,
      },
    });
    return result.count === 1;
  }

  private async targetExists(
    input: CreateCleanupExecutionInput,
  ): Promise<boolean> {
    const where = {
      analysisId: input.analysisId,
      id: input.target.id,
      ownerId: input.ownerId,
    };
    const target =
      input.target.kind === 'document'
        ? await this.prisma.document.findFirst({ select: { id: true }, where })
        : await this.prisma.documentUpload.findFirst({
            select: { id: true },
            where,
          });
    return target !== null;
  }
}
