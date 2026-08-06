import type { OnModuleDestroy } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import {
  OBJECT_CLEANUP_BACKOFF_DELAY_MS,
  OBJECT_CLEANUP_JOB_NAME,
  OBJECT_CLEANUP_MAX_ATTEMPTS,
  type ObjectCleanupJobData,
  type ObjectCleanupTarget,
} from '@stocklens/shared';

import type { ObjectCleanupRepository } from '../database/object-cleanup.repository';

const PENDING_DISPATCH_LIMIT = 100;

export type CleanupQueue = Pick<Queue<ObjectCleanupJobData>, 'add' | 'getJob'> &
  Partial<Pick<Queue<ObjectCleanupJobData>, 'close'>>;

export interface EnqueueObjectCleanupInput {
  analysisId: string;
  ownerId: string;
  target: ObjectCleanupTarget;
}

export interface EnqueueObjectCleanupResult {
  dispatched: boolean;
  jobExecutionId: string | null;
}

const cleanupJobOptions = (jobExecutionId: string): JobsOptions => ({
  attempts: OBJECT_CLEANUP_MAX_ATTEMPTS,
  backoff: {
    delay: OBJECT_CLEANUP_BACKOFF_DELAY_MS,
    type: 'exponential',
  },
  jobId: jobExecutionId,
  removeOnComplete: true,
  removeOnFail: false,
});

export class ObjectCleanupQueuePublisher implements OnModuleDestroy {
  private readonly queueFactory: (() => CleanupQueue) | undefined;
  private queue: CleanupQueue | undefined;

  constructor(
    private readonly repository: ObjectCleanupRepository,
    queue: CleanupQueue | (() => CleanupQueue),
  ) {
    if (typeof queue === 'function') {
      this.queueFactory = queue;
    } else {
      this.queue = queue;
    }
  }

  async enqueue(
    input: EnqueueObjectCleanupInput,
  ): Promise<EnqueueObjectCleanupResult> {
    const execution = await this.repository.createOrFind(input);
    if (execution === null) {
      return { dispatched: false, jobExecutionId: null };
    }
    if (execution.status === 'SUCCEEDED') {
      return { dispatched: false, jobExecutionId: execution.id };
    }
    if (execution.status === 'FAILED') {
      await this.repository.markQueuedForRetry(execution.id);
    }

    return {
      dispatched: await this.dispatch(execution.id),
      jobExecutionId: execution.id,
    };
  }

  async dispatchPending(limit = PENDING_DISPATCH_LIMIT): Promise<number> {
    const executions = await this.repository.listPending(limit);
    const results = await Promise.all(
      executions.map(({ id }) => this.dispatch(id)),
    );
    return results.filter(Boolean).length;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close?.();
  }

  private async dispatch(jobExecutionId: string): Promise<boolean> {
    try {
      const queue = this.getQueue();
      const existingJob = await queue.getJob(jobExecutionId);
      if (existingJob !== undefined) {
        if (await existingJob.isFailed()) {
          await existingJob.retry();
        }
        return true;
      }
      await queue.add(
        OBJECT_CLEANUP_JOB_NAME,
        { jobExecutionId },
        cleanupJobOptions(jobExecutionId),
      );
      return true;
    } catch {
      // The QUEUED JobExecution is the durable recovery source. Callers can
      // retry dispatch without reconstructing storage coordinates.
      return false;
    }
  }

  private getQueue(): CleanupQueue {
    this.queue ??= this.queueFactory?.();
    if (this.queue === undefined) {
      throw new Error('Object cleanup queue is not configured.');
    }
    return this.queue;
  }
}
