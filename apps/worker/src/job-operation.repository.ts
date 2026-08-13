import { JobStatus, JobStep, Prisma, type PrismaClient } from '@prisma/client';

const ALLOWED_STEPS = [
  JobStep.OBJECT_CLEANUP,
  JobStep.PARSE,
  JobStep.CHUNK,
] as const;
const MAX_MANUAL_RERUNS = 5;

export interface JobSummary {
  currentAttempt: number;
  errorCode: string | null;
  executionId: string;
  manualReruns: number;
  status: JobStatus;
  step: JobStep;
}

export type RerunResult =
  | {
      kind:
        | 'not-found'
        | 'not-rerunnable'
        | 'target-unavailable'
        | 'limit-exceeded';
    }
  | { kind: 'queued'; summary: JobSummary };

export class JobOperationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async inspect(executionId: string): Promise<JobSummary | null> {
    const execution = await this.prisma.jobExecution.findUnique({
      include: {
        _count: { select: { operationAudits: { where: { action: 'RERUN' } } } },
      },
      where: { id: executionId },
    });
    return execution === null
      ? null
      : toSummary(execution, execution._count.operationAudits);
  }

  rerun(
    executionId: string,
    operatorId: string,
    requestId: string,
  ): Promise<RerunResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "JobExecution"
          WHERE "id" = ${executionId}::uuid
          FOR UPDATE
        `;
        const execution = await tx.jobExecution.findUnique({
          include: {
            _count: {
              select: { operationAudits: { where: { action: 'RERUN' } } },
            },
            analysis: { select: { deletedAt: true } },
            document: { select: { deletedAt: true } },
            documentUpload: { select: { status: true } },
          },
          where: { id: executionId },
        });
        if (execution === null) return { kind: 'not-found' };
        if (
          !ALLOWED_STEPS.includes(
            execution.step as (typeof ALLOWED_STEPS)[number],
          ) ||
          execution.status !== JobStatus.FAILED
        )
          return { kind: 'not-rerunnable' };
        if (execution._count.operationAudits >= MAX_MANUAL_RERUNS)
          return { kind: 'limit-exceeded' };
        const targetAvailable =
          execution.step === JobStep.OBJECT_CLEANUP
            ? execution.document !== null || execution.documentUpload !== null
            : execution.analysis.deletedAt === null;
        if (!targetAvailable) return { kind: 'target-unavailable' };
        const updated = await tx.jobExecution.update({
          data: {
            errorCode: null,
            errorDetails: Prisma.DbNull,
            errorMessage: null,
            finishedAt: null,
            status: JobStatus.QUEUED,
          },
          where: { id: execution.id },
        });
        await tx.jobOperationAudit.create({
          data: {
            action: 'RERUN',
            jobExecutionId: execution.id,
            operatorId,
            previousStatus: JobStatus.FAILED,
            requestId,
            status: JobStatus.QUEUED,
          },
        });
        return {
          kind: 'queued',
          summary: toSummary(updated, execution._count.operationAudits + 1),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}

function toSummary(
  execution: {
    currentAttempt: number;
    errorCode: string | null;
    id: string;
    status: JobStatus;
    step: JobStep;
  },
  manualReruns: number,
): JobSummary {
  return {
    currentAttempt: execution.currentAttempt,
    errorCode: execution.errorCode,
    executionId: execution.id,
    manualReruns,
    status: execution.status,
    step: execution.step,
  };
}
