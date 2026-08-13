import type { OnModuleDestroy } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  ANALYSIS_JOB_BACKOFF_DELAY_MS,
  ANALYSIS_JOB_MAX_ATTEMPTS,
  ANALYSIS_PARSE_JOB_NAME,
  type AnalysisJobData,
} from '@stocklens/shared';

export type AnalysisQueue = Pick<Queue<AnalysisJobData>, 'add' | 'getJob'> &
  Partial<Pick<Queue<AnalysisJobData>, 'close'>>;

const options = (id: string): JobsOptions => ({
  attempts: ANALYSIS_JOB_MAX_ATTEMPTS,
  backoff: { delay: ANALYSIS_JOB_BACKOFF_DELAY_MS, type: 'exponential' },
  jobId: id,
  removeOnComplete: true,
  removeOnFail: false,
});

export class AnalysisProcessingQueuePublisher implements OnModuleDestroy {
  constructor(private readonly queue: AnalysisQueue) {}

  async dispatch(jobExecutionId: string): Promise<boolean> {
    try {
      if ((await this.queue.getJob(jobExecutionId)) === undefined) {
        await this.queue.add(
          ANALYSIS_PARSE_JOB_NAME,
          { jobExecutionId },
          options(jobExecutionId),
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close?.();
  }
}
