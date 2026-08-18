import {
  getOpenAiProviderConfig,
  getRedisConnectionOptions,
  getWorkerConfig,
} from './config';

describe('getWorkerConfig', () => {
  it('uses safe local defaults', () => {
    expect(getWorkerConfig({})).toEqual({
      concurrency: 2,
      redisUrl: 'redis://localhost:6379',
    });
  });

  it('rejects invalid concurrency', () => {
    expect(() => getWorkerConfig({ WORKER_CONCURRENCY: '0' })).toThrow(
      'WORKER_CONCURRENCY must be a positive integer.',
    );
  });
});

describe('getOpenAiProviderConfig', () => {
  it('requires an explicit API key and model without hard-coded defaults', () => {
    expect(() => getOpenAiProviderConfig({})).toThrow(
      'OPENAI_API_KEY must be configured for the OpenAI provider.',
    );
    expect(() =>
      getOpenAiProviderConfig({ OPENAI_API_KEY: 'x'.repeat(32) }),
    ).toThrow('OPENAI_MODEL must be a valid provider model identifier.');
  });

  it('returns validated structured and optional embedding model configuration', () => {
    expect(
      getOpenAiProviderConfig({
        OPENAI_API_KEY: 'test-key-that-is-long-enough',
        OPENAI_EMBEDDING_MODEL: 'text-embedding-model',
        OPENAI_MODEL: 'structured-output-model',
      }),
    ).toEqual({
      apiKey: 'test-key-that-is-long-enough',
      embeddingModel: 'text-embedding-model',
      model: 'structured-output-model',
    });
  });

  it('does not include credential content in configuration errors', () => {
    const secret = 'secret-value-that-must-not-leak';
    expect(() =>
      getOpenAiProviderConfig({
        OPENAI_API_KEY: secret,
        OPENAI_MODEL: 'invalid model name',
      }),
    ).toThrow('OPENAI_MODEL must be a valid provider model identifier.');
    try {
      getOpenAiProviderConfig({
        OPENAI_API_KEY: secret,
        OPENAI_MODEL: 'invalid model name',
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe('getRedisConnectionOptions', () => {
  it('parses a Redis URL without leaking connection ownership', () => {
    expect(
      getRedisConnectionOptions('redis://worker:secret@redis:6380/2'),
    ).toEqual({
      db: 2,
      host: 'redis',
      maxRetriesPerRequest: null,
      password: 'secret',
      port: 6380,
      username: 'worker',
    });
  });
});
