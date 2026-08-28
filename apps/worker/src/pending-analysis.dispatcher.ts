import { JobStatus, JobStep, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_CHUNK_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
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
        step: {
          in: [
            JobStep.PARSE,
            JobStep.CHUNK,
            JobStep.CALCULATE_FINANCIAL_METRICS,
            JobStep.EXTRACT,
            JobStep.GENERATE_VIEWS,
          ],
        },
      },
    });
    let dispatched = 0;
    for (const execution of executions) {
      try {
        if ((await this.queue.getJob(execution.id)) === undefined) {
          await this.queue.add(
            jobNameForStep(execution.step),
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

function jobNameForStep(step: JobStep): string {
  if (step === JobStep.PARSE) return ANALYSIS_PARSE_JOB_NAME;
  if (step === JobStep.CHUNK) return ANALYSIS_CHUNK_JOB_NAME;
  if (step === JobStep.CALCULATE_FINANCIAL_METRICS)
    return ANALYSIS_CALCULATE_METRICS_JOB_NAME;
  if (step === JobStep.EXTRACT) return ANALYSIS_EXTRACT_JOB_NAME;
  if (step === JobStep.GENERATE_VIEWS) return ANALYSIS_GENERATE_VIEWS_JOB_NAME;
  throw new Error('Analysis job step is not dispatchable.');
}
