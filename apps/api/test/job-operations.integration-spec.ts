import { randomUUID } from 'node:crypto';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { PrismaService } from '../src/database/prisma.service';
import { JobOperationRepository } from '../../worker/src/job-operation.repository';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('job operation integration (RERUN-TASK-007)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let repository: JobOperationRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new JobOperationRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('RERUN-AC-002 preserves the execution and atomically writes the audit', async () => {
    const execution = await createFailedParseExecution();

    await expect(repository.inspect(execution.id)).resolves.toMatchObject({
      currentAttempt: 3,
      errorCode: 'PROCESSING_DEPENDENCY_FAILED',
      executionId: execution.id,
      manualReruns: 0,
      status: 'FAILED',
      step: 'PARSE',
    });
    await expect(
      repository.rerun(execution.id, 'operator-a', randomUUID()),
    ).resolves.toMatchObject({
      kind: 'queued',
      summary: {
        currentAttempt: 3,
        executionId: execution.id,
        manualReruns: 1,
        status: 'QUEUED',
        step: 'PARSE',
      },
    });
    await expect(
      prisma.jobExecution.count({ where: { id: execution.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.jobOperationAudit.findMany({
        where: { jobExecutionId: execution.id },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        action: 'RERUN',
        operatorId: 'operator-a',
        previousStatus: 'FAILED',
        status: 'QUEUED',
      }),
    ]);
  });

  it('RERUN-AC-003 converges concurrent commands to one transition', async () => {
    const execution = await createFailedParseExecution();
    const results = await Promise.allSettled([
      repository.rerun(execution.id, 'operator-a', randomUUID()),
      repository.rerun(execution.id, 'operator-b', randomUUID()),
    ]);

    expect(results.every(({ status }) => status === 'fulfilled')).toBe(true);
    const fulfilled = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    expect(fulfilled).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'queued' }),
        expect.objectContaining({ kind: 'not-rerunnable' }),
      ]),
    );
    await expect(
      prisma.jobOperationAudit.count({
        where: { jobExecutionId: execution.id },
      }),
    ).resolves.toBe(1);
  });

  it('RERUN-AC-004 rejects non-failed and deleted targets without mutation', async () => {
    const nonFailed = await Promise.all(
      (['QUEUED', 'RUNNING', 'SUCCEEDED'] as const).map(async (status) => {
        const execution = await createFailedParseExecution();
        return prisma.jobExecution.update({
          data: { status },
          where: { id: execution.id },
        });
      }),
    );
    for (const execution of nonFailed) {
      await expect(
        repository.rerun(execution.id, 'operator-a', randomUUID()),
      ).resolves.toEqual({ kind: 'not-rerunnable' });
    }

    const disallowed = await createFailedParseExecution();
    await prisma.jobExecution.update({
      data: { step: 'EMBED' },
      where: { id: disallowed.id },
    });
    await expect(
      repository.rerun(disallowed.id, 'operator-a', randomUUID()),
    ).resolves.toEqual({ kind: 'not-rerunnable' });

    const deleted = await createFailedParseExecution();
    await prisma.analysis.update({
      data: { deletedAt: new Date() },
      where: { id: deleted.analysisId },
    });
    await expect(
      repository.rerun(deleted.id, 'operator-a', randomUUID()),
    ).resolves.toEqual({ kind: 'target-unavailable' });
    await expect(
      prisma.jobOperationAudit.count({
        where: {
          jobExecutionId: {
            in: [...nonFailed.map(({ id }) => id), disallowed.id, deleted.id],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it('RERUN-SEC-004 enforces the five re-run limit without mutation', async () => {
    const execution = await createFailedParseExecution();
    await prisma.jobOperationAudit.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        action: 'RERUN',
        jobExecutionId: execution.id,
        operatorId: `operator-${index}`,
        previousStatus: 'FAILED' as const,
        requestId: randomUUID(),
        status: 'QUEUED' as const,
      })),
    });

    await expect(
      repository.rerun(execution.id, 'operator-six', randomUUID()),
    ).resolves.toEqual({ kind: 'limit-exceeded' });
    await expect(
      prisma.jobExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ status: 'FAILED' });
    await expect(
      prisma.jobOperationAudit.count({
        where: { jobExecutionId: execution.id },
      }),
    ).resolves.toBe(5);
  });

  async function createFailedParseExecution() {
    const owner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@job-operation.integration.test`,
        passwordHash: 'not-used',
      },
    });
    const analysis = await prisma.analysis.create({
      data: {
        ownerId: owner.id,
        status: 'FAILED_PARSING',
        title: 'Job operation integration',
      },
    });
    return prisma.jobExecution.create({
      data: {
        analysisId: analysis.id,
        currentAttempt: 3,
        errorCode: 'PROCESSING_DEPENDENCY_FAILED',
        errorMessage: 'PDF parsing failed.',
        finishedAt: new Date(),
        idempotencyKey: `parse-integration-${randomUUID()}`,
        ownerId: owner.id,
        status: 'FAILED',
        step: 'PARSE',
      },
    });
  }
});
