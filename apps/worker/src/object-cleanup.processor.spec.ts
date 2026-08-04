import type { Job } from 'bullmq';
import type { ObjectCleanupJobData } from '@stocklens/shared';

import { ObjectCleanupProcessor } from './object-cleanup.processor';
import type { ObjectCleanupJobRepository } from './object-cleanup.repository';

const jobExecutionId = '6140795e-5c72-4eec-8348-f17133802425';

describe('ObjectCleanupProcessor (PDF-FR-008, PDF-FR-009)', () => {
  it('deletes the object and records a successful attempt', async () => {
    const repository = createRepository();
    const objectStorage = createObjectStorage();
    const processor = new ObjectCleanupProcessor(
      repository as unknown as ObjectCleanupJobRepository,
      objectStorage,
      'stocklens-dev',
    );

    await expect(processor.process(createJob())).resolves.toBeUndefined();
    expect(objectStorage.deleteObject).toHaveBeenCalledWith(
      'owner/analysis/upload/object.pdf',
    );
    expect(repository.markSucceeded).toHaveBeenCalledWith({
      attempt: 1,
      bullmqJobId: 'bull-job-id',
      jobExecutionId,
    });
  });

  it('treats a previously successful execution as idempotent', async () => {
    const repository = createRepository({ alreadySucceeded: true });
    const objectStorage = createObjectStorage();
    const processor = new ObjectCleanupProcessor(
      repository as unknown as ObjectCleanupJobRepository,
      objectStorage,
      'stocklens-dev',
    );

    await expect(processor.process(createJob())).resolves.toBeUndefined();
    expect(objectStorage.deleteObject).not.toHaveBeenCalled();
    expect(repository.markSucceeded).not.toHaveBeenCalled();
  });

  it('stores a sanitized failure and throws a retryable safe error', async () => {
    const repository = createRepository();
    const objectStorage = createObjectStorage();
    objectStorage.deleteObject.mockRejectedValue(
      new Error('secret provider response'),
    );
    const processor = new ObjectCleanupProcessor(
      repository as unknown as ObjectCleanupJobRepository,
      objectStorage,
      'stocklens-dev',
    );

    await expect(processor.process(createJob())).rejects.toThrow(
      'Object cleanup failed.',
    );
    expect(repository.markFailed).toHaveBeenCalledWith({
      attempt: 1,
      bullmqJobId: 'bull-job-id',
      jobExecutionId,
    });
  });

  it('does not leak database details when failure tracking is unavailable', async () => {
    const repository = createRepository();
    repository.markFailed.mockRejectedValue(
      new Error('database connection secret'),
    );
    const objectStorage = createObjectStorage();
    objectStorage.deleteObject.mockRejectedValue(
      new Error('provider credential detail'),
    );
    const processor = new ObjectCleanupProcessor(
      repository as unknown as ObjectCleanupJobRepository,
      objectStorage,
      'stocklens-dev',
    );

    await expect(processor.process(createJob())).rejects.toThrow(
      'Object cleanup failed.',
    );
  });
});

function createJob(): Job<ObjectCleanupJobData> {
  return {
    attemptsMade: 0,
    data: { jobExecutionId },
    id: 'bull-job-id',
    name: 'delete-object',
  } as Job<ObjectCleanupJobData>;
}

function createRepository(
  attempt:
    | { alreadySucceeded: true }
    | {
        alreadySucceeded: false;
        storageBucket: string;
        storageKey: string;
      } = {
    alreadySucceeded: false,
    storageBucket: 'stocklens-dev',
    storageKey: 'owner/analysis/upload/object.pdf',
  },
) {
  return {
    beginAttempt: jest.fn().mockResolvedValue(attempt),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markSucceeded: jest.fn().mockResolvedValue(undefined),
  };
}

function createObjectStorage() {
  return {
    createPresignedPdfUpload: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getObjectStream: jest.fn(),
    headObject: jest.fn(),
  };
}
