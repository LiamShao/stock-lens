import { getRedisConnectionOptions, getWorkerConfig } from './config';

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
