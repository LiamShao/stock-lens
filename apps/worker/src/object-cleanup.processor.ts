import type { Job } from 'bullmq';
import type { ObjectStorage } from '@stocklens/object-storage';
import {
  OBJECT_CLEANUP_JOB_NAME,
  objectCleanupJobDataSchema,
  type ObjectCleanupJobData,
} from '@stocklens/shared';

import type { ObjectCleanupJobRepository } from './object-cleanup.repository';

export class ObjectCleanupProcessor {
  constructor(
    private readonly repository: ObjectCleanupJobRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly configuredBucket: string,
  ) {}

  async process(job: Job<ObjectCleanupJobData>): Promise<void> {
    if (job.name !== OBJECT_CLEANUP_JOB_NAME || job.id === undefined) {
      throw new Error('Object cleanup job envelope is invalid.');
    }
    const data = objectCleanupJobDataSchema.parse(job.data);
    const attemptInput = {
      attempt: job.attemptsMade + 1,
      bullmqJobId: job.id,
      jobExecutionId: data.jobExecutionId,
    };
    const attempt = await this.repository.beginAttempt(attemptInput);
    if (attempt.alreadySucceeded) {
      return;
    }
    if (attempt.storageBucket !== this.configuredBucket) {
      await this.markFailedSafely(attemptInput);
      throw new Error('Object cleanup storage configuration mismatch.');
    }

    try {
      await this.objectStorage.deleteObject(attempt.storageKey);
      await this.repository.markSucceeded(attemptInput);
    } catch {
      await this.markFailedSafely(attemptInput);
      throw new Error('Object cleanup failed.');
    }
  }

  private async markFailedSafely(
    input: Parameters<ObjectCleanupJobRepository['markFailed']>[0],
  ): Promise<void> {
    try {
      await this.repository.markFailed(input);
    } catch {
      // BullMQ will retry even if failure history is temporarily unavailable.
      // Never forward database or provider details through the worker event.
    }
  }
}
