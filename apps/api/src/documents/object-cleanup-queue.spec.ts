import type { Queue } from 'bullmq';
import type { ObjectCleanupJobData } from '@stocklens/shared';

import type {
  CleanupExecutionRecord,
  ObjectCleanupRepository,
} from '../database/object-cleanup.repository';
import { ObjectCleanupQueuePublisher } from './object-cleanup-queue';

describe('ObjectCleanupQueuePublisher (PDF-FR-008, PDF-FR-009)', () => {
  const executionId = 'af17ed0f-d999-42a3-97e3-73eb824b0c77';
  const input = {
    analysisId: '210626d7-b9f6-44ca-a318-20235ed46f20',
    ownerId: '7faac835-70b9-4779-b074-e93370035007',
    target: {
      id: '49e3e699-4c2b-40ac-ada3-05908e9afc20',
      kind: 'document-upload' as const,
    },
  };

  it('persists before dispatching and applies bounded retries', async () => {
    const order: string[] = [];
    const repository = createRepository({ id: executionId, status: 'QUEUED' });
    repository.createOrFind.mockImplementation(() => {
      order.push('persist');
      return Promise.resolve({ id: executionId, status: 'QUEUED' });
    });
    const add = jest.fn(() => {
      order.push('dispatch');
      return Promise.resolve({});
    });
    const publisher = new ObjectCleanupQueuePublisher(
      repository as unknown as ObjectCleanupRepository,
      {
        add,
        getJob: jest.fn().mockResolvedValue(undefined),
      } as unknown as Pick<Queue<ObjectCleanupJobData>, 'add' | 'getJob'>,
    );

    await expect(publisher.enqueue(input)).resolves.toEqual({
      dispatched: true,
      jobExecutionId: executionId,
    });
    expect(order).toEqual(['persist', 'dispatch']);
    expect(add).toHaveBeenCalledWith(
      'delete-object',
      { jobExecutionId: executionId },
      expect.objectContaining({
        attempts: 3,
        backoff: { delay: 1_000, type: 'exponential' },
        jobId: executionId,
      }),
    );
  });

  it('keeps the durable queued execution when Redis dispatch fails', async () => {
    const repository = createRepository({ id: executionId, status: 'QUEUED' });
    const publisher = new ObjectCleanupQueuePublisher(
      repository as unknown as ObjectCleanupRepository,
      {
        add: jest.fn().mockRejectedValue(new Error('redis details')),
        getJob: jest.fn().mockResolvedValue(undefined),
      },
    );

    await expect(publisher.enqueue(input)).resolves.toEqual({
      dispatched: false,
      jobExecutionId: executionId,
    });
  });

  it('does not dispatch an already successful cleanup', async () => {
    const repository = createRepository({
      id: executionId,
      status: 'SUCCEEDED',
    });
    const add = jest.fn();
    const publisher = new ObjectCleanupQueuePublisher(
      repository as unknown as ObjectCleanupRepository,
      { add, getJob: jest.fn() },
    );

    await expect(publisher.enqueue(input)).resolves.toEqual({
      dispatched: false,
      jobExecutionId: executionId,
    });
    expect(add).not.toHaveBeenCalled();
  });

  it('resets and retries a retained failed BullMQ job', async () => {
    const repository = createRepository({ id: executionId, status: 'FAILED' });
    const retry = jest.fn().mockResolvedValue(undefined);
    const add = jest.fn();
    const publisher = new ObjectCleanupQueuePublisher(
      repository as unknown as ObjectCleanupRepository,
      {
        add,
        getJob: jest.fn().mockResolvedValue({
          isFailed: jest.fn().mockResolvedValue(true),
          retry,
        }),
      },
    );

    await expect(publisher.enqueue(input)).resolves.toEqual({
      dispatched: true,
      jobExecutionId: executionId,
    });
    expect(repository.markQueuedForRetry).toHaveBeenCalledWith(executionId);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });
});

function createRepository(record: CleanupExecutionRecord) {
  return {
    createOrFind: jest.fn().mockResolvedValue(record),
    listPending: jest.fn().mockResolvedValue([]),
    markQueuedForRetry: jest.fn().mockResolvedValue(true),
  };
}
