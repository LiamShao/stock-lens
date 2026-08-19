import type { PrismaClient } from '@prisma/client';
import type { JobsOptions, Queue } from 'bullmq';
import type { AnalysisJobData } from '@stocklens/shared';

import { PendingAnalysisDispatcher } from './pending-analysis.dispatcher';

describe('PendingAnalysisDispatcher', () => {
  it('EXTRACT-FR-001 recovers every durable Phase 3/4 queued step with stable IDs', async () => {
    const executions = [
      { id: '11111111-1111-4111-8111-111111111111', step: 'PARSE' },
      { id: '22222222-2222-4222-8222-222222222222', step: 'CHUNK' },
      {
        id: '33333333-3333-4333-8333-333333333333',
        step: 'CALCULATE_FINANCIAL_METRICS',
      },
      { id: '44444444-4444-4444-8444-444444444444', step: 'EXTRACT' },
    ];
    const prisma = {
      jobExecution: { findMany: jest.fn().mockResolvedValue(executions) },
    };
    const add = jest
      .fn<Promise<unknown>, [string, AnalysisJobData, JobsOptions]>()
      .mockResolvedValue({});
    const queue = {
      add,
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher = new PendingAnalysisDispatcher(
      prisma as unknown as PrismaClient,
      queue as unknown as Pick<Queue<AnalysisJobData>, 'add' | 'getJob'>,
    );

    await expect(dispatcher.dispatch()).resolves.toBe(4);
    expect(prisma.jobExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'QUEUED',
          step: {
            in: ['PARSE', 'CHUNK', 'CALCULATE_FINANCIAL_METRICS', 'EXTRACT'],
          },
        },
      }),
    );
    expect(add.mock.calls.map(([name]) => name)).toEqual([
      'parse-analysis',
      'chunk-analysis',
      'calculate-analysis-financial-metrics',
      'extract-analysis',
    ]);
    expect(
      add.mock.calls.every(
        ([, data, options], index) =>
          data.jobExecutionId === executions[index]?.id &&
          options.jobId === executions[index]?.id &&
          options.attempts === 3,
      ),
    ).toBe(true);
  });

  it('PROC-FR-011 leaves Redis failures durable for the next scan', async () => {
    const execution = {
      id: '55555555-5555-4555-8555-555555555555',
      step: 'EXTRACT',
    };
    const dispatcher = new PendingAnalysisDispatcher(
      {
        jobExecution: {
          findMany: jest.fn().mockResolvedValue([execution]),
        },
      } as unknown as PrismaClient,
      {
        add: jest.fn().mockRejectedValue(new Error('redis unavailable')),
        getJob: jest.fn().mockResolvedValue(undefined),
      },
    );

    await expect(dispatcher.dispatch()).resolves.toBe(0);
  });
});
