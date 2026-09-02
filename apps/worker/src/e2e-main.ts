import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import {
  getObjectStorageConfig,
  S3ObjectStorageAdapter,
} from '@stocklens/object-storage';
import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
  ANALYSIS_PROCESSING_QUEUE_NAME,
  type AnalysisJobData,
} from '@stocklens/shared';

import { AiUsageRepository } from './ai-usage.repository';
import {
  E2E_DETERMINISTIC_MODEL,
  E2eDeterministicLlmProvider,
} from './ai/e2e-deterministic-llm-provider';
import { AnalysisProcessingJobRepository } from './analysis-processing.repository';
import { AnalysisProcessingProcessor } from './analysis-processing.processor';
import { AnalysisViewsGenerationProcessor } from './analysis-views-generation.processor';
import { AnalysisViewsGenerationRepository } from './analysis-views-generation.repository';
import { AnalysisViewsPublishRepository } from './analysis-views-publish.repository';
import { getRedisConnectionOptions, getWorkerConfig } from './config';
import { ExtractionPublishRepository } from './extraction-publish.repository';
import { StructuredExtractionProcessor } from './structured-extraction.processor';
import { StructuredExtractionJobRepository } from './structured-extraction.repository';

if (
  process.env.NODE_ENV !== 'test' ||
  process.env.STOCKLENS_ALLOW_E2E_DETERMINISTIC_WORKER !== 'true'
) {
  throw new Error('The deterministic E2E worker is restricted to test runs.');
}

const config = getWorkerConfig();
const connection = getRedisConnectionOptions(config.redisUrl);
const storageConfig = getObjectStorageConfig();
const prisma = new PrismaClient();
const queue = new Queue<AnalysisJobData>(ANALYSIS_PROCESSING_QUEUE_NAME, {
  connection,
});
const storage = new S3ObjectStorageAdapter(storageConfig);
const provider = new E2eDeterministicLlmProvider();
const runtime = {
  model: E2E_DETERMINISTIC_MODEL,
  provider: 'deterministic',
} as const;
const processing = new AnalysisProcessingProcessor(
  new AnalysisProcessingJobRepository(prisma),
  storage,
  storageConfig.bucket,
  queue,
);
const extraction = new StructuredExtractionProcessor(
  new StructuredExtractionJobRepository(prisma),
  new ExtractionPublishRepository(prisma),
  new AiUsageRepository(prisma),
  provider,
  runtime,
  queue,
);
const views = new AnalysisViewsGenerationProcessor(
  new AnalysisViewsGenerationRepository(prisma),
  new AnalysisViewsPublishRepository(prisma),
  new AiUsageRepository(prisma),
  provider,
  runtime,
);

const worker = new Worker<AnalysisJobData>(
  ANALYSIS_PROCESSING_QUEUE_NAME,
  (job) =>
    job.name === ANALYSIS_GENERATE_VIEWS_JOB_NAME
      ? views.process(job)
      : [ANALYSIS_CALCULATE_METRICS_JOB_NAME, ANALYSIS_EXTRACT_JOB_NAME].includes(
            job.name,
          )
        ? extraction.process(job)
        : processing.process(job),
  { concurrency: config.concurrency, connection },
);

worker.on('ready', () => {
  console.info(
    JSON.stringify({
      event: 'worker.ready',
      provider: runtime.provider,
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

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: 'worker.shutdown', signal }));
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
