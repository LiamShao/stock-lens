import { JobStatus, JobStep, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  ANALYSIS_CHUNK_JOB_NAME,
  ANALYSIS_JOB_BACKOFF_DELAY_MS,
  ANALYSIS_JOB_MAX_ATTEMPTS,
  ANALYSIS_PARSE_JOB_NAME,
  type AnalysisJobData,
} from '@stocklens/shared';

export class PendingAnalysisDispatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Pick<Queue<AnalysisJobData>, 'add' | 'getJob'>,
  ) {}

  async dispatch(limit = 100): Promise<number> {
    const executions = await this.prisma.jobExecution.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, step: true },
      take: limit,
      where: {
        status: JobStatus.QUEUED,
        step: { in: [JobStep.PARSE, JobStep.CHUNK] },
      },
    });
    let dispatched = 0;
    for (const execution of executions) {
      try {
        if ((await this.queue.getJob(execution.id)) === undefined) {
          await this.queue.add(
            execution.step === JobStep.PARSE
              ? ANALYSIS_PARSE_JOB_NAME
              : ANALYSIS_CHUNK_JOB_NAME,
            { jobExecutionId: execution.id },
            {
              attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
              backoff: {
                delay: ANALYSIS_JOB_BACKOFF_DELAY_MS,
                type: 'exponential',
              },
              jobId: execution.id,
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
        }
        dispatched += 1;
      } catch {
        // Durable QUEUED rows remain eligible for the next scan.
      }
    }
    return dispatched;
  }
}
