import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import {
  getObjectStorageConfig,
  S3ObjectStorageAdapter,
} from '@stocklens/object-storage';
import {
  OBJECT_CLEANUP_QUEUE_NAME,
  ANALYSIS_PROCESSING_QUEUE_NAME,
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
  type AnalysisJobData,
  type ObjectCleanupJobData,
} from '@stocklens/shared';

import {
  getOpenAiProviderConfig,
  getRedisConnectionOptions,
  getWorkerConfig,
} from './config';
import { loadLocalEnvironment } from './environment';
import { ExpiredDocumentUploadScanner } from './expired-document-upload.scanner';
import { AnalysisProcessingJobRepository } from './analysis-processing.repository';
import { AnalysisProcessingProcessor } from './analysis-processing.processor';
import { ObjectCleanupProcessor } from './object-cleanup.processor';
import { ObjectCleanupJobRepository } from './object-cleanup.repository';
import { PendingObjectCleanupDispatcher } from './pending-object-cleanup.dispatcher';
import { PendingAnalysisDispatcher } from './pending-analysis.dispatcher';
import { OpenAiLlmProvider } from './ai/openai-llm-provider';
import { AiUsageRepository } from './ai-usage.repository';
import { ExtractionPublishRepository } from './extraction-publish.repository';
import { StructuredExtractionJobRepository } from './structured-extraction.repository';
import { StructuredExtractionProcessor } from './structured-extraction.processor';
import { AnalysisViewsGenerationProcessor } from './analysis-views-generation.processor';
import { AnalysisViewsGenerationRepository } from './analysis-views-generation.repository';
import { AnalysisViewsPublishRepository } from './analysis-views-publish.repository';

loadLocalEnvironment();
const config = getWorkerConfig();
const openAiConfig = getOpenAiProviderConfig();
const connection = getRedisConnectionOptions(config.redisUrl);
const objectStorageConfig = getObjectStorageConfig();
const prisma = new PrismaClient();
const objectStorage = new S3ObjectStorageAdapter(objectStorageConfig);
const cleanupProcessor = new ObjectCleanupProcessor(
  new ObjectCleanupJobRepository(prisma),
  objectStorage,
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
const expiredUploadScanner = new ExpiredDocumentUploadScanner(prisma);
const analysisQueue = new Queue<AnalysisJobData>(
  ANALYSIS_PROCESSING_QUEUE_NAME,
  { connection },
);
const analysisProcessor = new AnalysisProcessingProcessor(
  new AnalysisProcessingJobRepository(prisma),
  objectStorage,
  objectStorageConfig.bucket,
  analysisQueue,
);
const structuredExtractionProcessor = new StructuredExtractionProcessor(
  new StructuredExtractionJobRepository(prisma),
  new ExtractionPublishRepository(prisma),
  new AiUsageRepository(prisma),
  new OpenAiLlmProvider({ config: openAiConfig }),
  { model: openAiConfig.model, provider: 'openai' },
  analysisQueue,
);
const analysisViewsProcessor = new AnalysisViewsGenerationProcessor(
  new AnalysisViewsGenerationRepository(prisma),
  new AnalysisViewsPublishRepository(prisma),
  new AiUsageRepository(prisma),
  new OpenAiLlmProvider({ config: openAiConfig }),
  { model: openAiConfig.model, provider: 'openai' },
);
const pendingAnalysisDispatcher = new PendingAnalysisDispatcher(
  prisma,
  analysisQueue,
);
async function expireOrphanUploads(): Promise<void> {
  try {
    await expiredUploadScanner.scan();
  } catch {
    console.error(
      JSON.stringify({
        error: 'Expired document upload scan failed.',
        event: 'worker.expired_upload_scan_failed',
      }),
    );
  }
}
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
async function dispatchPendingAnalysis(): Promise<void> {
  try {
    await pendingAnalysisDispatcher.dispatch();
  } catch {
    console.error(
      JSON.stringify({
        error: 'Pending analysis dispatch failed.',
        event: 'worker.dispatch_failed',
        queue: ANALYSIS_PROCESSING_QUEUE_NAME,
      }),
    );
  }
}
async function runCleanupMaintenance(): Promise<void> {
  await expireOrphanUploads();
  await dispatchPendingCleanup();
  await dispatchPendingAnalysis();
}
const pendingCleanupDispatchInterval = setInterval(
  () => void runCleanupMaintenance(),
  60_000,
);
pendingCleanupDispatchInterval.unref();

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_PROCESSING_QUEUE_NAME,
  (job) =>
    job.name === ANALYSIS_GENERATE_VIEWS_JOB_NAME
      ? analysisViewsProcessor.process(job)
      : [
            ANALYSIS_CALCULATE_METRICS_JOB_NAME,
            ANALYSIS_EXTRACT_JOB_NAME,
          ].includes(job.name)
        ? structuredExtractionProcessor.process(job)
        : analysisProcessor.process(job),
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
  console.info(
    JSON.stringify({
      event: 'worker.ready',
      queue: ANALYSIS_PROCESSING_QUEUE_NAME,
    }),
  );
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
  void runCleanupMaintenance();
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
    analysisQueue.close(),
  ]);
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
