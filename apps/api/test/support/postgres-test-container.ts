import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

const repositoryRoot = resolve(__dirname, '../../../..');

export async function startMigratedPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(
    process.env.TEST_POSTGRES_IMAGE ?? 'stocklens-postgres:16-pgvector',
  )
    .withDatabase('stocklens_test')
    .withUsername('stocklens_test')
    .withPassword('stocklens-test-password')
    .start();

  try {
    process.env.DATABASE_URL = container.getConnectionUri();
    execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'deploy',
        '--schema',
        'prisma/schema.prisma',
      ],
      {
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
        stdio: 'pipe',
      },
    );
    return container;
  } catch (error: unknown) {
    await container.stop();
    throw error;
  }
}
