import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import {
  getObjectStorageConfig,
  S3ObjectStorageAdapter,
} from '@stocklens/object-storage';
import {
  OBJECT_CLEANUP_QUEUE_NAME,
  type ObjectCleanupJobData,
} from '@stocklens/shared';

import { getRedisConnectionOptions, getWorkerConfig } from './config';
import { loadLocalEnvironment } from './environment';
import { ObjectCleanupProcessor } from './object-cleanup.processor';
import { ObjectCleanupJobRepository } from './object-cleanup.repository';
import { PendingObjectCleanupDispatcher } from './pending-object-cleanup.dispatcher';

loadLocalEnvironment();
const config = getWorkerConfig();
const connection = getRedisConnectionOptions(config.redisUrl);
const objectStorageConfig = getObjectStorageConfig();
const prisma = new PrismaClient();
const cleanupProcessor = new ObjectCleanupProcessor(
  new ObjectCleanupJobRepository(prisma),
  new S3ObjectStorageAdapter(objectStorageConfig),
  objectStorageConfig.bucket,
);
const cleanupQueue = new Queue<ObjectCleanupJobData>(
  OBJECT_CLEANUP_QUEUE_NAME,
  { connection },
);
const pendingCleanupDispatcher = new PendingObjectCleanupDispatcher(
  prisma,
  cleanupQueue,
);
async function dispatchPendingCleanup(): Promise<void> {
  try {
    await pendingCleanupDispatcher.dispatch();
  } catch {
    console.error(
      JSON.stringify({
        error: 'Pending object cleanup dispatch failed.',
        event: 'worker.dispatch_failed',
        queue: OBJECT_CLEANUP_QUEUE_NAME,
      }),
    );
  }
}
const pendingCleanupDispatchInterval = setInterval(
  () => void dispatchPendingCleanup(),
  60_000,
);
pendingCleanupDispatchInterval.unref();

const worker = new Worker(
  'analysis',
  () => {
    throw new Error('Analysis pipeline is not implemented yet.');
  },
  {
    concurrency: config.concurrency,
    connection,
  },
);

const cleanupWorker = new Worker<ObjectCleanupJobData>(
  OBJECT_CLEANUP_QUEUE_NAME,
  (job) => cleanupProcessor.process(job),
  {
    concurrency: config.concurrency,
    connection,
  },
);

worker.on('ready', () => {
  console.info(JSON.stringify({ event: 'worker.ready', queue: 'analysis' }));
});

worker.on('failed', (job, error) => {
  console.error(
    JSON.stringify({
      error: error.message,
      event: 'worker.job_failed',
      jobId: job?.id ?? null,
    }),
  );
});

cleanupWorker.on('ready', () => {
  console.info(
    JSON.stringify({
      event: 'worker.ready',
      queue: OBJECT_CLEANUP_QUEUE_NAME,
    }),
  );
  void dispatchPendingCleanup();
});

cleanupWorker.on('failed', (job) => {
  console.error(
    JSON.stringify({
      error: 'Object cleanup job failed.',
      event: 'worker.job_failed',
      jobId: job?.id ?? null,
      queue: OBJECT_CLEANUP_QUEUE_NAME,
    }),
  );
});

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: 'worker.shutdown', signal }));
  clearInterval(pendingCleanupDispatchInterval);
  await Promise.all([
    worker.close(),
    cleanupWorker.close(),
    cleanupQueue.close(),
  ]);
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
