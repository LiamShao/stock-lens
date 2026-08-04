import { JobStatus, JobStep, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  OBJECT_CLEANUP_BACKOFF_DELAY_MS,
  OBJECT_CLEANUP_JOB_NAME,
  OBJECT_CLEANUP_MAX_ATTEMPTS,
  type ObjectCleanupJobData,
} from '@stocklens/shared';

const DEFAULT_DISPATCH_LIMIT = 100;

export class PendingObjectCleanupDispatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Pick<Queue<ObjectCleanupJobData>, 'add' | 'getJob'>,
  ) {}

  async dispatch(limit = DEFAULT_DISPATCH_LIMIT): Promise<number> {
    const executions = await this.prisma.jobExecution.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: limit,
      where: {
        status: JobStatus.QUEUED,
        step: JobStep.OBJECT_CLEANUP,
      },
    });
    const results = await Promise.all(
      executions.map(async ({ id }) => {
        try {
          const existingJob = await this.queue.getJob(id);
          if (existingJob !== undefined) {
            if (await existingJob.isFailed()) {
              await existingJob.retry();
            }
            return true;
          }
          await this.queue.add(
            OBJECT_CLEANUP_JOB_NAME,
            { jobExecutionId: id },
            {
              attempts: OBJECT_CLEANUP_MAX_ATTEMPTS,
              backoff: {
                delay: OBJECT_CLEANUP_BACKOFF_DELAY_MS,
                type: 'exponential',
              },
              jobId: id,
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
          return true;
        } catch {
          return false;
        }
      }),
    );
    return results.filter(Boolean).length;
  }
}
