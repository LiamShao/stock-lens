import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { PrismaService } from '../src/database/prisma.service';
import { AiUsageRepository } from '../../worker/src/ai-usage.repository';
import { loadPromptAsset } from '../../worker/src/prompt-asset';
import { PromptVersionRepository } from '../../worker/src/prompt-version.repository';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('prompt and usage audit integration (EXTRACT-TASK-004)', () => {
  const repositoryRoot = resolve(__dirname, '../../..');
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let prompts: PromptVersionRepository;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaService();
    await prisma.$connect();
    prompts = new PromptVersionRepository(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('EXTRACT-FR-004 runs the explicit CLI and activates idempotently', async () => {
    const assetPath = resolve(
      repositoryRoot,
      'prompts/structured-extraction/v1.json',
    );
    const cliOutput = execFileSync(
      'pnpm',
      [
        'prompt:activate',
        '--',
        '--asset',
        assetPath,
        '--operator-id',
        'integration-release-bot',
        '--confirm',
        'structured-extraction@1',
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          ALLOW_PROMPT_ACTIVATION: 'true',
          DATABASE_URL: container.getConnectionUri(),
        },
      },
    );
    expect(
      JSON.parse(cliOutput.trim().split('\n').at(-1) ?? '{}'),
    ).toMatchObject({
      action: 'created-and-activated',
      code: 'PROMPT_VERSION_ACTIVATED',
      name: 'structured-extraction',
      operatorId: 'integration-release-bot',
      version: 1,
    });
    const asset = await loadPromptAsset(assetPath);
    const first = await prompts.activate(asset);
    const second = await prompts.activate(asset);

    expect(first).toMatchObject({
      action: 'already-active',
      contentSha256: asset.contentSha256,
      name: asset.name,
      schemaVersion: asset.schemaVersion,
      version: asset.version,
    });
    expect(second).toEqual({ ...first, action: 'already-active' });
    await expect(
      prisma.promptVersion.count({ where: { name: asset.name } }),
    ).resolves.toBe(1);
  });

  it('EXTRACT-FR-004 serializes concurrent activation for one prompt name', async () => {
    const template = 'Concurrent activation prompt.';
    const asset = {
      contentSha256: createHash('sha256').update(template).digest('hex'),
      name: 'concurrent-extraction',
      schemaVersion: 'structured-finding-v1',
      template,
      version: 1,
    };
    const results = await Promise.all([
      prompts.activate(asset),
      prompts.activate(asset),
    ]);

    expect(results.map(({ action }) => action).sort()).toEqual([
      'already-active',
      'created-and-activated',
    ]);
    await expect(
      prisma.promptVersion.count({
        where: { isActive: true, name: asset.name },
      }),
    ).resolves.toBe(1);
  });

  it('EXTRACT-FR-004 switches versions and database constraints preserve immutable content', async () => {
    const template = 'Second immutable test prompt.';
    const secondAsset = {
      contentSha256: createHash('sha256').update(template).digest('hex'),
      name: 'structured-extraction',
      schemaVersion: 'structured-finding-v1',
      template,
      version: 2,
    };
    const second = await prompts.activate(secondAsset);

    await expect(
      prisma.promptVersion.count({
        where: { isActive: true, name: secondAsset.name },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.promptVersion.update({
        data: { template: 'mutated' },
        where: { id: second.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.promptVersion.findUniqueOrThrow({ where: { id: second.id } }),
    ).resolves.toMatchObject({ template });
  });

  it('EXTRACT-FR-013 records content-free usage with owner lineage', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@usage.integration.test`,
        passwordHash: 'not-used',
      },
    });
    const analysis = await prisma.analysis.create({
      data: { ownerId: owner.id, title: 'Usage audit' },
    });
    const execution = await prisma.jobExecution.create({
      data: {
        analysisId: analysis.id,
        idempotencyKey: `extract-usage-${randomUUID()}`,
        ownerId: owner.id,
        step: 'EXTRACT',
      },
    });
    const prompt = await prisma.promptVersion.findFirstOrThrow({
      where: { isActive: true, name: 'structured-extraction' },
    });
    const usage = await new AiUsageRepository(prisma).record({
      analysisId: analysis.id,
      embeddingTokens: null,
      estimatedCostMicros: 25n,
      inputTokens: 100,
      jobExecutionId: execution.id,
      latencyMs: 300,
      model: 'deterministic-test-model',
      operation: 'STRUCTURED_GENERATION',
      outputTokens: 20,
      ownerId: owner.id,
      promptVersionId: prompt.id,
      provider: 'deterministic',
      providerRequestId: 'provider-request-safe',
      requestId: randomUUID(),
    });

    expect(usage).toMatchObject({
      analysisId: analysis.id,
      estimatedCostMicros: 25n,
      metadata: null,
      ownerId: owner.id,
      promptVersionId: prompt.id,
    });
    expect(JSON.stringify(usage, bigintReplacer)).not.toContain(
      'Second immutable test prompt.',
    );

    const otherOwner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@usage.integration.test`,
        passwordHash: 'not-used',
      },
    });
    await expect(
      new AiUsageRepository(prisma).record({
        analysisId: analysis.id,
        embeddingTokens: null,
        estimatedCostMicros: null,
        inputTokens: 1,
        jobExecutionId: execution.id,
        latencyMs: 1,
        model: 'deterministic-test-model',
        operation: 'STRUCTURED_GENERATION',
        outputTokens: 1,
        ownerId: otherOwner.id,
        promptVersionId: prompt.id,
        provider: 'deterministic',
        providerRequestId: null,
        requestId: null,
      }),
    ).rejects.toThrow();
  });
});

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
