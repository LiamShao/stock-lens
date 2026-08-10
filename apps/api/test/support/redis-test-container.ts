import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';

const REDIS_PORT = 6379;

export interface StartedRedisContainer {
  container: StartedTestContainer;
  url: string;
}

export async function startRedis(): Promise<StartedRedisContainer> {
  const container = await new GenericContainer(
    process.env.TEST_REDIS_IMAGE ?? 'redis:7.4-alpine',
  )
    .withCommand(['redis-server', '--appendonly', 'no', '--save', ''])
    .withExposedPorts(REDIS_PORT)
    .withStartupTimeout(60_000)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  return {
    container,
    url: `redis://${container.getHost()}:${container.getMappedPort(REDIS_PORT)}`,
  };
}
