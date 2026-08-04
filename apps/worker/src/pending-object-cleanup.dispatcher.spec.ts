import type { PrismaClient } from '@prisma/client';

import { PendingObjectCleanupDispatcher } from './pending-object-cleanup.dispatcher';

describe('PendingObjectCleanupDispatcher (PDF-FR-009)', () => {
  it('re-dispatches durable QUEUED executions with stable BullMQ IDs', async () => {
    const firstId = '2a9ca50b-ec59-4eb0-9c49-1bf64dc0a4c4';
    const secondId = '8d39a570-df21-4092-b877-cdad8b737445';
    const prisma = {
      jobExecution: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: firstId }, { id: secondId }]),
      },
    };
    const add = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('redis unavailable'));
    const dispatcher = new PendingObjectCleanupDispatcher(
      prisma as unknown as PrismaClient,
      {
        add,
        getJob: jest.fn().mockResolvedValue(undefined),
      },
    );

    await expect(dispatcher.dispatch()).resolves.toBe(1);
    expect(prisma.jobExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        where: { status: 'QUEUED', step: 'OBJECT_CLEANUP' },
      }),
    );
    expect(add).toHaveBeenNthCalledWith(
      1,
      'delete-object',
      { jobExecutionId: firstId },
      expect.objectContaining({ attempts: 3, jobId: firstId }),
    );
  });
});
