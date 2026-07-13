import type { ConnectionOptions } from 'bullmq';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export interface WorkerConfig {
  concurrency: number;
  redisUrl: string;
}

export function getWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const concurrency = Number(environment.WORKER_CONCURRENCY ?? 2);

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('WORKER_CONCURRENCY must be a positive integer.');
  }

  return {
    concurrency,
    redisUrl: environment.REDIS_URL ?? DEFAULT_REDIS_URL,
  };
}

export function getRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis or rediss protocol.');
  }

  const databasePath = url.pathname.slice(1);
  const database = databasePath === '' ? undefined : Number(databasePath);

  if (database !== undefined && !Number.isInteger(database)) {
    throw new Error('REDIS_URL database must be an integer.');
  }

  return {
    host: url.hostname,
    maxRetriesPerRequest: null,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(database === undefined ? {} : { db: database }),
    ...(url.password === ''
      ? {}
      : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    ...(url.username === ''
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}
