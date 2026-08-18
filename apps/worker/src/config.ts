import type { ConnectionOptions } from 'bullmq';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export interface WorkerConfig {
  concurrency: number;
  redisUrl: string;
}

export interface OpenAiProviderConfig {
  apiKey: string;
  embeddingModel: string | null;
  model: string;
}

const PROVIDER_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

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

export function getOpenAiProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAiProviderConfig {
  const apiKey = environment.OPENAI_API_KEY?.trim() ?? '';
  const model = environment.OPENAI_MODEL?.trim() ?? '';
  const embeddingModel = environment.OPENAI_EMBEDDING_MODEL?.trim() ?? '';
  if (apiKey.length < 20) {
    throw new Error(
      'OPENAI_API_KEY must be configured for the OpenAI provider.',
    );
  }
  if (!PROVIDER_IDENTIFIER_PATTERN.test(model)) {
    throw new Error('OPENAI_MODEL must be a valid provider model identifier.');
  }
  if (
    embeddingModel !== '' &&
    !PROVIDER_IDENTIFIER_PATTERN.test(embeddingModel)
  ) {
    throw new Error(
      'OPENAI_EMBEDDING_MODEL must be a valid provider model identifier.',
    );
  }
  return {
    apiKey,
    embeddingModel: embeddingModel === '' ? null : embeddingModel,
    model,
  };
}
