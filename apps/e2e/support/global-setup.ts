import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';

import { PrismaClient } from '@prisma/client';
import { S3ObjectStorageAdapter } from '@stocklens/object-storage';
import { authResponseSchema } from '@stocklens/shared';
import type * as PostgreSqlModule from '@testcontainers/postgresql';
import type { PostgreSqlContainer as PostgreSqlContainerType } from '@testcontainers/postgresql';
import type * as TestcontainersModule from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

import { createAnalysisViewsOutput } from './analysis-views-fixture';
import {
  E2E_ANALYSIS_TITLE,
  E2E_API_ORIGIN,
  E2E_DOCUMENT_NAME,
  E2E_INJECTION_SENTINEL,
  E2E_OWNER_A,
  E2E_OWNER_B,
  E2E_WEB_ORIGIN,
} from './constants';
import { createSyntheticPdf } from './synthetic-pdf';

const require = createRequire(import.meta.url);
const { PostgreSqlContainer } =
  require('@testcontainers/postgresql') as typeof PostgreSqlModule;
const { GenericContainer, Wait } =
  require('testcontainers') as typeof TestcontainersModule;

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const POSTGRES_IMAGE = 'stocklens-postgres:16-pgvector';
const REDIS_PORT = 6379;
const MINIO_PORT = 9000;
const MINIO_ACCESS_KEY = 'stocklens-e2e';
const MINIO_SECRET_KEY = 'stocklens-e2e-private-password';
const MINIO_BUCKET = 'stocklens-e2e-private';

interface ManagedProcess {
  child: ChildProcess;
  output: ReturnType<typeof createWriteStream>;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  await Promise.all([assertPortAvailable(3000), assertPortAvailable(3001)]);
  const temporaryDirectory = mkdtempSync(
    resolve(tmpdir(), 'stocklens-analysis-views-e2e-'),
  );
  const apiLogPath = resolve(temporaryDirectory, 'api.log');
  let apiProcess: ManagedProcess | undefined;
  let workerProcess: ManagedProcess | undefined;
  let webProcess: ManagedProcess | undefined;
  let postgres:
    Awaited<ReturnType<PostgreSqlContainerType['start']>> | undefined;
  let redis: StartedTestContainer | undefined;
  let minio: StartedTestContainer | undefined;
  let prisma: PrismaClient | undefined;

  const cleanup = async () => {
    await Promise.all([
      stopProcess(webProcess),
      stopProcess(workerProcess),
      stopProcess(apiProcess),
    ]);
    await prisma?.$disconnect();
    await Promise.all([minio?.stop(), redis?.stop(), postgres?.stop()]);
    await rm(temporaryDirectory, { force: true, recursive: true });
  };

  try {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('stocklens_e2e')
      .withUsername('stocklens_e2e')
      .withPassword('stocklens-e2e-database-password')
      .start();
    [redis, minio] = await Promise.all([startRedis(), startMinio()]);
    const databaseUrl = postgres.getConnectionUri();
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
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );

    const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(MINIO_PORT)}`;
    const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(REDIS_PORT)}`;
    const apiEnvironment = {
      ...process.env,
      ACCESS_TOKEN_AUDIENCE: 'stocklens-web-e2e',
      ACCESS_TOKEN_EXPIRES_IN_SECONDS: '900',
      ACCESS_TOKEN_ISSUER: 'stocklens-api-e2e',
      ACCESS_TOKEN_SECRET:
        'stocklens-e2e-access-token-secret-at-least-32-characters',
      API_PORT: '3001',
      CORS_ORIGIN: E2E_WEB_ORIGIN,
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      REDIS_URL: redisUrl,
      REFRESH_TOKEN_EXPIRES_IN_DAYS: '30',
      S3_ACCESS_KEY_ID: MINIO_ACCESS_KEY,
      S3_BUCKET: MINIO_BUCKET,
      S3_ENDPOINT: minioEndpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_PRESIGN_EXPIRES_IN_SECONDS: '300',
      S3_REGION: 'ap-northeast-1',
      S3_SECRET_ACCESS_KEY: MINIO_SECRET_KEY,
    };
    apiProcess = startProcess(
      resolve(repositoryRoot, 'apps/api/dist/main.js'),
      [],
      apiEnvironment,
      apiLogPath,
    );
    await waitForUrl(`${E2E_API_ORIGIN}/api/health/live`);

    const [ownerA, ownerB] = await Promise.all([
      registerUser(E2E_OWNER_A),
      registerUser(E2E_OWNER_B),
    ]);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await seedActivePrompts(prisma);
    const fixture = await seedCompletedAnalysis({
      minioEndpoint,
      ownerId: ownerA.user.id,
      prisma,
    });

    const workerLogPath = resolve(temporaryDirectory, 'worker.log');
    workerProcess = startProcess(
      resolve(repositoryRoot, 'apps/worker/dist/e2e-main.js'),
      [],
      {
        ...apiEnvironment,
        STOCKLENS_ALLOW_E2E_DETERMINISTIC_WORKER: 'true',
        WORKER_CONCURRENCY: '1',
      },
      workerLogPath,
    );
    await waitForLog(workerLogPath, '"event":"worker.ready"');

    const webLogPath = resolve(temporaryDirectory, 'web.log');
    webProcess = startProcess(
      resolve(repositoryRoot, 'apps/web/node_modules/next/dist/bin/next'),
      ['start', '--hostname', '127.0.0.1', '--port', '3000'],
      { ...process.env, NODE_ENV: 'production' },
      webLogPath,
      resolve(repositoryRoot, 'apps/web'),
    );
    await waitForUrl(E2E_WEB_ORIGIN);

    Object.assign(process.env, {
      STOCKLENS_E2E_ANALYSIS_ID: fixture.analysisId,
      STOCKLENS_E2E_API_LOG_PATH: apiLogPath,
      STOCKLENS_E2E_DATABASE_URL: databaseUrl,
      STOCKLENS_E2E_DOCUMENT_ID: fixture.documentId,
      STOCKLENS_E2E_OWNER_B_ID: ownerB.user.id,
      STOCKLENS_E2E_STORAGE_KEY: fixture.storageKey,
      STOCKLENS_E2E_WORKER_LOG_PATH: workerLogPath,
    });
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function seedActivePrompts(prisma: PrismaClient): Promise<void> {
  const prompts = [
    {
      name: 'structured-extraction',
      schemaVersion: 'structured-finding-v1',
      templatePath: resolve(
        repositoryRoot,
        'prompts/structured-extraction/system.ja.md',
      ),
    },
    {
      name: 'analysis-views',
      schemaVersion: 'analysis-views-v1',
      templatePath: resolve(
        repositoryRoot,
        'prompts/analysis-views/system.ja.md',
      ),
    },
  ] as const;
  for (const prompt of prompts) {
    const template = await readFile(prompt.templatePath, 'utf8');
    await prisma.promptVersion.create({
      data: {
        contentSha256: sha256(template),
        isActive: true,
        name: prompt.name,
        schemaVersion: prompt.schemaVersion,
        template,
        version: 1,
      },
    });
  }
}

async function startRedis(): Promise<StartedTestContainer> {
  return new GenericContainer('redis:7.4-alpine')
    .withCommand(['redis-server', '--appendonly', 'no', '--save', ''])
    .withExposedPorts(REDIS_PORT)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
}

async function startMinio(): Promise<StartedTestContainer> {
  const container = await new GenericContainer(
    'minio/minio:RELEASE.2025-04-22T22-12-26Z',
  )
    .withCommand([
      'server',
      '/data',
      '--address',
      `:${MINIO_PORT}`,
      '--console-address',
      ':9001',
    ])
    .withEnvironment({
      MINIO_API_CORS_ALLOW_ORIGIN: E2E_WEB_ORIGIN,
      MINIO_ROOT_PASSWORD: MINIO_SECRET_KEY,
      MINIO_ROOT_USER: MINIO_ACCESS_KEY,
    })
    .withExposedPorts(MINIO_PORT)
    .withWaitStrategy(
      Wait.forHttp('/minio/health/ready', MINIO_PORT).forStatusCode(200),
    )
    .start();
  try {
    await execInContainer(container, [
      'mc',
      'alias',
      'set',
      'local',
      `http://127.0.0.1:${MINIO_PORT}`,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
    ]);
    await execInContainer(container, [
      'mc',
      'mb',
      '--ignore-existing',
      `local/${MINIO_BUCKET}`,
    ]);
    return container;
  } catch (error) {
    await container.stop();
    throw error;
  }
}

async function execInContainer(
  container: StartedTestContainer,
  command: string[],
): Promise<void> {
  const result = await container.exec(command);
  if (result.exitCode !== 0) {
    throw new Error('E2E infrastructure setup failed.');
  }
}

async function registerUser(user: {
  displayName: string;
  email: string;
  password: string;
}) {
  const response = await fetch(`${E2E_API_ORIGIN}/api/auth/register`, {
    body: JSON.stringify(user),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new Error('E2E user registration failed.');
  return authResponseSchema.parse(await response.json());
}

async function seedCompletedAnalysis(input: {
  minioEndpoint: string;
  ownerId: string;
  prisma: PrismaClient;
}): Promise<{ analysisId: string; documentId: string; storageKey: string }> {
  const analysisId = randomUUID();
  const documentId = randomUUID();
  const pageId = randomUUID();
  const chunkId = randomUUID();
  const findingId = randomUUID();
  const evidenceId = randomUUID();
  const storageKey = `e2e/${input.ownerId}/${analysisId}/${documentId}.pdf`;
  const pdf = createSyntheticPdf(3);
  const pdfSha256 = sha256(pdf);
  const objectStorage = new S3ObjectStorageAdapter({
    bucket: MINIO_BUCKET,
    credentials: {
      accessKeyId: MINIO_ACCESS_KEY,
      secretAccessKey: MINIO_SECRET_KEY,
    },
    endpoint: input.minioEndpoint,
    forcePathStyle: true,
    presignExpiresInSeconds: 300,
    region: 'ap-northeast-1',
  });
  const upload = await objectStorage.createPresignedPdfUpload({
    contentLength: pdf.byteLength,
    objectKey: storageKey,
    sha256: pdfSha256,
  });
  await putPresignedObject(upload.url, upload.headers, pdf);

  const output = createAnalysisViewsOutput(evidenceId);
  const excerpt = `${E2E_INJECTION_SENTINEL}\n売上高は前年同期比で増加しました。`;
  await input.prisma.$transaction(async (transaction) => {
    await transaction.analysis.create({
      data: {
        analystViewOutput: output.analystView,
        buffettMungerOutput: output.buffettMunger,
        completedAt: new Date('2026-09-01T03:00:00.000Z'),
        id: analysisId,
        justTellMeOutput: output.justTellMe,
        ownerId: input.ownerId,
        status: 'COMPLETED',
        title: E2E_ANALYSIS_TITLE,
      },
    });
    await transaction.document.create({
      data: {
        analysisId,
        documentType: 'EARNINGS_PRESENTATION',
        id: documentId,
        mimeType: 'application/pdf',
        originalName: E2E_DOCUMENT_NAME,
        ownerId: input.ownerId,
        pageCount: 3,
        sha256: pdfSha256,
        sizeBytes: BigInt(pdf.byteLength),
        storageBucket: MINIO_BUCKET,
        storageKey,
        uploadedAt: new Date('2026-09-01T02:00:00.000Z'),
      },
    });
    await transaction.documentPage.create({
      data: {
        documentId,
        id: pageId,
        ownerId: input.ownerId,
        pageNumber: 2,
        text: excerpt,
        textSha256: sha256(excerpt),
      },
    });
    await transaction.documentChunk.create({
      data: {
        chunkIndex: 0,
        content: excerpt,
        contentSha256: sha256(excerpt),
        documentId,
        id: chunkId,
        ownerId: input.ownerId,
        pageId,
        tokenCount: 24,
      },
    });
    await transaction.analysisFinding.create({
      data: {
        analysisId,
        body: '現在の資料から売上高の増加を確認できます。',
        category: 'FINANCIAL_HIGHLIGHT',
        findingKey: 'e2e.revenue-growth',
        id: findingId,
        importance: 4,
        ownerId: input.ownerId,
        status: 'SUPPORTED',
        title: '売上高の増加',
      },
    });
    await transaction.evidence.create({
      data: {
        analysisId,
        chunkId,
        documentId,
        excerpt,
        excerptSha256: sha256(excerpt),
        id: evidenceId,
        ownerId: input.ownerId,
        pageId,
        pageNumber: 2,
      },
    });
    await transaction.findingEvidence.create({
      data: {
        analysisId,
        evidenceId,
        findingId,
        ownerId: input.ownerId,
      },
    });
  });
  return { analysisId, documentId, storageKey };
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function putPresignedObject(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: Uint8Array,
): Promise<void> {
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  await new Promise<void>((resolvePromise, reject) => {
    const uploadRequest = request(
      target,
      { headers, method: 'PUT' },
      (response) => {
        response.resume();
        response.once('end', () => {
          if (response.statusCode === 200) resolvePromise();
          else reject(new Error('E2E PDF upload failed.'));
        });
      },
    );
    uploadRequest.once('error', reject);
    uploadRequest.end(Buffer.from(body));
  });
}

function startProcess(
  executable: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
  logPath: string,
  workingDirectory = repositoryRoot,
): ManagedProcess {
  const output = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, [executable, ...arguments_], {
    cwd: workingDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.pipe(output, { end: false });
  child.stderr?.pipe(output, { end: false });
  return { child, output };
}

async function stopProcess(
  process_: ManagedProcess | undefined,
): Promise<void> {
  if (!process_) return;
  if (process_.child.exitCode === null) {
    process_.child.kill('SIGTERM');
    await Promise.race([
      once(process_.child, 'exit'),
      new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ]);
    if (process_.child.exitCode === null) process_.child.kill('SIGKILL');
  }
  process_.output.end();
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // The isolated process is still starting.
    }
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 100),
    );
  }
  throw new Error('E2E application startup timed out.');
}

async function waitForLog(logPath: string, marker: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await readFile(logPath, 'utf8')).includes(marker)) return;
    } catch {
      // The isolated process has not created its log yet.
    }
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 100),
    );
  }
  throw new Error('E2E worker startup timed out.');
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(new Error(`E2E port ${port} is already in use.`)),
    );
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => (error ? reject(error) : resolvePromise()));
    });
  });
}
