import { Worker } from 'bullmq';

import { getRedisConnectionOptions, getWorkerConfig } from './config';

const config = getWorkerConfig();
const connection = getRedisConnectionOptions(config.redisUrl);

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

async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: 'worker.shutdown', signal }));
  await worker.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
