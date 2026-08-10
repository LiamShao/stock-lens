import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';

const MINIO_API_PORT = 9000;
const MINIO_ACCESS_KEY = 'stocklens-integration';
const MINIO_SECRET_KEY = 'stocklens-integration-password';

export interface StartedMinioContainer {
  accessKeyId: string;
  bucket: string;
  container: StartedTestContainer;
  endpoint: string;
  secretAccessKey: string;
}

export async function startMinio(
  bucket = 'stocklens-integration-private',
): Promise<StartedMinioContainer> {
  const container = await new GenericContainer(
    process.env.TEST_MINIO_IMAGE ?? 'minio/minio:RELEASE.2025-04-22T22-12-26Z',
  )
    .withCommand([
      'server',
      '/data',
      '--address',
      `:${MINIO_API_PORT}`,
      '--console-address',
      ':9001',
    ])
    .withEnvironment({
      MINIO_ROOT_PASSWORD: MINIO_SECRET_KEY,
      MINIO_ROOT_USER: MINIO_ACCESS_KEY,
    })
    .withExposedPorts(MINIO_API_PORT)
    .withStartupTimeout(60_000)
    .withWaitStrategy(
      Wait.forHttp('/minio/health/ready', MINIO_API_PORT).forStatusCode(200),
    )
    .start();

  try {
    await execOrThrow(container, [
      'mc',
      'alias',
      'set',
      'local',
      `http://127.0.0.1:${MINIO_API_PORT}`,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
    ]);
    await execOrThrow(container, [
      'mc',
      'mb',
      '--ignore-existing',
      `local/${bucket}`,
    ]);
    return {
      accessKeyId: MINIO_ACCESS_KEY,
      bucket,
      container,
      endpoint: `http://${container.getHost()}:${container.getMappedPort(MINIO_API_PORT)}`,
      secretAccessKey: MINIO_SECRET_KEY,
    };
  } catch (error: unknown) {
    await container.stop();
    throw error;
  }
}

async function execOrThrow(
  container: StartedTestContainer,
  command: string[],
): Promise<void> {
  const result = await container.exec(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `MinIO setup command failed with exit code ${result.exitCode}.`,
    );
  }
}
