import { JobStatus, JobStep, Prisma, type PrismaClient } from '@prisma/client';

export interface CleanupAttemptInput {
  attempt: number;
  bullmqJobId: string;
  jobExecutionId: string;
}

export type CleanupAttempt =
  | { alreadySucceeded: true }
  | {
      alreadySucceeded: false;
      storageBucket: string;
      storageKey: string;
    };

export class ObjectCleanupJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  beginAttempt(
    input: CleanupAttemptInput,
    now = new Date(),
  ): Promise<CleanupAttempt> {
    return this.prisma.$transaction(
      async (transaction) => {
        const execution = await transaction.jobExecution.findUnique({
          select: {
            currentAttempt: true,
            document: {
              select: { storageBucket: true, storageKey: true },
            },
            documentUpload: {
              select: { storageBucket: true, storageKey: true },
            },
            id: true,
            ownerId: true,
            startedAt: true,
            status: true,
            step: true,
          },
          where: { id: input.jobExecutionId },
        });
        if (execution === null || execution.step !== JobStep.OBJECT_CLEANUP) {
          throw new Error('Object cleanup execution was not found.');
        }
        if (execution.status === JobStatus.SUCCEEDED) {
          return { alreadySucceeded: true };
        }

        const target = execution.document ?? execution.documentUpload;
        if (
          target === null ||
          (execution.document !== null && execution.documentUpload !== null)
        ) {
          throw new Error('Object cleanup target is invalid.');
        }

        await transaction.jobAttempt.upsert({
          create: {
            attempt: input.attempt,
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
              attempt: input.attempt,
              jobExecutionId: execution.id,
            },
          },
        });
        await transaction.jobExecution.update({
          data: {
            currentAttempt: Math.max(execution.currentAttempt, input.attempt),
            errorCode: null,
            errorDetails: Prisma.DbNull,
            errorMessage: null,
            finishedAt: null,
            startedAt: execution.startedAt ?? now,
            status: JobStatus.RUNNING,
          },
          where: { id: execution.id },
        });

        return {
          alreadySucceeded: false,
          storageBucket: target.storageBucket,
          storageKey: target.storageKey,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markSucceeded(
    input: CleanupAttemptInput,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.jobAttempt.update({
        data: {
          errorCode: null,
          errorDetails: Prisma.DbNull,
          errorMessage: null,
          finishedAt: now,
          status: JobStatus.SUCCEEDED,
        },
        where: {
          jobExecutionId_attempt: {
            attempt: input.attempt,
            jobExecutionId: input.jobExecutionId,
          },
        },
      }),
      this.prisma.jobExecution.update({
        data: {
          errorCode: null,
          errorDetails: Prisma.DbNull,
          errorMessage: null,
          finishedAt: now,
          status: JobStatus.SUCCEEDED,
        },
        where: { id: input.jobExecutionId },
      }),
    ]);
  }

  async markFailed(
    input: CleanupAttemptInput,
    now = new Date(),
  ): Promise<void> {
    const failure = {
      errorCode: 'OBJECT_STORAGE_DELETE_FAILED',
      errorDetails: Prisma.DbNull,
      errorMessage: 'Object storage deletion failed.',
      finishedAt: now,
      status: JobStatus.FAILED,
    } as const;
    await this.prisma.$transaction([
      this.prisma.jobAttempt.update({
        data: failure,
        where: {
          jobExecutionId_attempt: {
            attempt: input.attempt,
            jobExecutionId: input.jobExecutionId,
          },
        },
      }),
      this.prisma.jobExecution.update({
        data: failure,
        where: { id: input.jobExecutionId },
      }),
    ]);
  }
}
