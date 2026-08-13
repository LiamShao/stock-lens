import { randomUUID } from 'node:crypto';

import { JobStep, PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  ANALYSIS_CHUNK_JOB_NAME,
  ANALYSIS_PARSE_JOB_NAME,
  ANALYSIS_PROCESSING_QUEUE_NAME,
  OBJECT_CLEANUP_JOB_NAME,
  OBJECT_CLEANUP_QUEUE_NAME,
} from '@stocklens/shared';

import { getRedisConnectionOptions } from './config';
import { loadLocalEnvironment } from './environment';
import { getJobOperatorConfig } from './job-operation.config';
import { JobOperationRepository } from './job-operation.repository';

loadLocalEnvironment();

async function main(): Promise<void> {
  getJobOperatorConfig();
  const [command, ...args] = process.argv.slice(2);
  const executionId = readArgument(args, '--execution-id');
  const operatorId = readArgument(args, '--operator-id');
  if (!executionId || !operatorId)
    return fail(
      'JOB_OPERATION_INPUT_INVALID',
      'Required operator input is missing.',
    );
  const prisma = new PrismaClient();
  try {
    const repository = new JobOperationRepository(prisma);
    if (command === 'inspect') {
      const summary = await repository.inspect(executionId);
      if (!summary)
        return fail('JOB_EXECUTION_NOT_FOUND', 'Job execution was not found.');
      return output({
        code: 'JOB_INSPECTED',
        message: 'Job execution inspected.',
        requestId: randomUUID(),
        ...summary,
      });
    }
    if (command !== 'rerun' || readArgument(args, '--confirm') !== executionId)
      return fail(
        'JOB_OPERATION_INPUT_INVALID',
        'Explicit execution confirmation is required.',
      );
    const requestId = randomUUID();
    const result = await repository.rerun(executionId, operatorId, requestId);
    if (result.kind !== 'queued')
      return fail(
        mapCode(result.kind),
        'Job execution could not be queued.',
        requestId,
      );
    await dispatch(result.summary.step, executionId);
    output({
      code: 'JOB_RERUN_QUEUED',
      message: 'Job execution queued.',
      requestId,
      ...result.summary,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function dispatch(step: JobStep, executionId: string): Promise<void> {
  const connection = getRedisConnectionOptions(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );
  const analysis = step === JobStep.PARSE || step === JobStep.CHUNK;
  const queue = new Queue(
    analysis ? ANALYSIS_PROCESSING_QUEUE_NAME : OBJECT_CLEANUP_QUEUE_NAME,
    { connection },
  );
  try {
    const existing = await queue.getJob(executionId);
    if (existing) await existing.remove();
    const name =
      step === JobStep.PARSE
        ? ANALYSIS_PARSE_JOB_NAME
        : step === JobStep.CHUNK
          ? ANALYSIS_CHUNK_JOB_NAME
          : OBJECT_CLEANUP_JOB_NAME;
    await queue.add(
      name,
      { jobExecutionId: executionId },
      {
        attempts: 3,
        backoff: { delay: 1_000, type: 'exponential' },
        jobId: executionId,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  } catch {
    // Durable QUEUED state is recovered by the worker dispatcher.
  } finally {
    await queue.close();
  }
}

function readArgument(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}
function mapCode(kind: string): string {
  return (
    (
      {
        'limit-exceeded': 'JOB_RERUN_LIMIT_EXCEEDED',
        'not-found': 'JOB_EXECUTION_NOT_FOUND',
        'not-rerunnable': 'JOB_NOT_RERUNNABLE',
        'target-unavailable': 'JOB_TARGET_NOT_AVAILABLE',
      } as Record<string, string>
    )[kind] ?? 'JOB_OPERATION_FAILED'
  );
}
function output(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
function fail(code: string, message: string, requestId = randomUUID()): void {
  process.stderr.write(`${JSON.stringify({ code, message, requestId })}\n`);
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  void error;
  fail('JOB_OPERATION_FAILED', 'Job operation failed.');
});
