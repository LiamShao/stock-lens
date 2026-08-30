import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisPageResponseSchema,
  analysisResourceSchema,
  analysisViewsResourceSchema,
  authResponseSchema,
  processAnalysisResponseSchema,
  type AuthResponse,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';

import { configureApiApplication } from '../src/app-configuration';
import { AnalysisProcessingQueuePublisher } from '../src/analyses/analysis-processing.queue';
import { AppModule } from '../src/app.module';
import { getAuthConfig } from '../src/auth/auth.config';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('analysis management HTTP integration', () => {
  const dispatchProcessing = jest.fn().mockResolvedValue(true);
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let tokenService: TokenService;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    Object.assign(process.env, {
      ACCESS_TOKEN_AUDIENCE: 'stocklens-web-test',
      ACCESS_TOKEN_EXPIRES_IN_SECONDS: '900',
      ACCESS_TOKEN_ISSUER: 'stocklens-api-test',
      ACCESS_TOKEN_SECRET:
        'integration-access-token-secret-at-least-32-characters',
      CORS_ORIGIN: 'http://localhost:3000',
      NODE_ENV: 'test',
      REFRESH_TOKEN_EXPIRES_IN_DAYS: '30',
      S3_ACCESS_KEY_ID: 'integration-access-key',
      S3_BUCKET: 'integration-private',
      S3_FORCE_PATH_STYLE: 'false',
      S3_PRESIGN_EXPIRES_IN_SECONDS: '300',
      S3_REGION: 'ap-northeast-1',
      S3_SECRET_ACCESS_KEY: 'integration-secret-key',
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AnalysisProcessingQueuePublisher)
      .useValue({ dispatch: dispatchProcessing })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApiApplication(app, getAuthConfig(), { rateLimitMax: 200 });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = module.get(PrismaService);
    tokenService = module.get(TokenService);
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (container !== undefined) {
      await container.stop();
    }
  });

  it(
    'PROC-AC-001/005/008 starts one owner-scoped durable parse execution',
    verifyProcessing,
  );

  it('ANALYSIS-AC-001/002/007/008 creates a validated DRAFT with optional company', async () => {
    const user = await registerUser();
    const company = await prisma.company.create({
      data: { nameJa: `統合テスト株式会社 ${randomUUID()}` },
    });

    const missingToken = await app.inject({
      method: 'POST',
      payload: { title: 'Unauthorized' },
      url: '/api/analyses',
    });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.json()).toMatchObject({
      code: 'ACCESS_TOKEN_REQUIRED',
    });

    const created = await request(user, {
      method: 'POST',
      payload: { companyId: company.id, title: '  FY2026 Results  ' },
      url: '/api/analyses',
    });
    expect(created.statusCode).toBe(201);
    const resource = analysisResourceSchema.parse(created.json<unknown>());
    expect(resource).toMatchObject({
      companyId: company.id,
      status: 'DRAFT',
      title: 'FY2026 Results',
    });
    expect(created.json<Record<string, unknown>>()).not.toHaveProperty(
      'ownerId',
    );
    await expect(
      prisma.analysis.findUniqueOrThrow({ where: { id: resource.id } }),
    ).resolves.toMatchObject({
      ownerId: user.user.id,
      status: 'DRAFT',
      title: 'FY2026 Results',
    });

    const withoutCompany = await request(user, {
      method: 'POST',
      payload: { companyId: null, title: 'Without company' },
      url: '/api/analyses',
    });
    expect(withoutCompany.statusCode).toBe(201);
    expect(withoutCompany.json()).toMatchObject({ companyId: null });

    const unknownCompany = await request(user, {
      method: 'POST',
      payload: { companyId: randomUUID(), title: 'Unknown company' },
      url: '/api/analyses',
    });
    expect(unknownCompany.statusCode).toBe(404);
    expect(unknownCompany.json()).toMatchObject({ code: 'COMPANY_NOT_FOUND' });

    for (const payload of [
      { title: '   ' },
      { title: 'x'.repeat(121) },
      { title: 'control\u0000character' },
      { ownerId: randomUUID(), title: 'Injected owner' },
    ]) {
      const invalid = await request(user, {
        method: 'POST',
        payload,
        url: '/api/analyses',
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('ANALYSIS-AC-003/004 paginates stable owner history and filters status', async () => {
    const [owner, other] = await Promise.all([
      createAuthenticatedUser(),
      createAuthenticatedUser(),
    ]);
    const ids: string[] = [];
    for (const title of ['First', 'Second', 'Third']) {
      const response = await request(owner, {
        method: 'POST',
        payload: { title },
        url: '/api/analyses',
      });
      const created = analysisResourceSchema.parse(response.json<unknown>());
      ids.push(created.id);
      await prisma.analysis.update({
        data: { createdAt: new Date('2026-07-24T12:00:00.000Z') },
        where: { id: created.id },
      });
    }
    const expectedOrder = [...ids].sort().reverse();
    await request(other, {
      method: 'POST',
      payload: { title: 'Other owner' },
      url: '/api/analyses',
    });

    const first = await request(owner, {
      method: 'GET',
      url: '/api/analyses?limit=2&status=DRAFT',
    });
    expect(first.statusCode).toBe(200);
    const firstPage = analysisPageResponseSchema.parse(first.json<unknown>());
    expect(firstPage.items.map((item) => item.id)).toEqual(
      expectedOrder.slice(0, 2),
    );
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = await request(owner, {
      method: 'GET',
      url: `/api/analyses?limit=2&status=DRAFT&cursor=${encodeURIComponent(
        firstPage.nextCursor ?? '',
      )}`,
    });
    const secondPage = analysisPageResponseSchema.parse(second.json<unknown>());
    expect(secondPage.items.map((item) => item.id)).toEqual(
      expectedOrder.slice(2),
    );
    expect(secondPage.nextCursor).toBeNull();

    for (const query of [
      'limit=0',
      'limit=51',
      'status=INVALID',
      'cursor=invalid!',
      `ownerId=${other.user.id}`,
    ]) {
      const invalid = await request(owner, {
        method: 'GET',
        url: `/api/analyses?${query}`,
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });

  it('ANALYSIS-AC-005/006/009/011 isolates get, rename, and transactional delete', async () => {
    const [owner, other] = await Promise.all([registerUser(), registerUser()]);
    const created = await request(owner, {
      method: 'POST',
      payload: { title: 'Owner analysis' },
      url: '/api/analyses',
    });
    const analysis = analysisResourceSchema.parse(created.json<unknown>());
    const document = await prisma.document.create({
      data: {
        analysisId: analysis.id,
        mimeType: 'application/pdf',
        originalName: 'results.pdf',
        ownerId: owner.user.id,
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
        storageBucket: 'integration-private',
        storageKey: `${owner.user.id}/${analysis.id}/${randomUUID()}.pdf`,
      },
    });

    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const crossUser = await request(other, {
        method,
        ...(method === 'PATCH'
          ? { payload: { title: 'Cross-user rename' } }
          : {}),
        url: `/api/analyses/${analysis.id}`,
      });
      expect(crossUser.statusCode).toBe(404);
      expect(crossUser.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });
    }

    const get = await request(owner, {
      method: 'GET',
      url: `/api/analyses/${analysis.id}`,
    });
    expect(get.statusCode).toBe(200);

    const renamed = await request(owner, {
      method: 'PATCH',
      payload: { title: '  Renamed analysis  ' },
      url: `/api/analyses/${analysis.id}`,
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ title: 'Renamed analysis' });

    const deleted = await request(owner, {
      method: 'DELETE',
      url: `/api/analyses/${analysis.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    const [deletedAnalysis, deletedDocument] = await Promise.all([
      prisma.analysis.findUniqueOrThrow({ where: { id: analysis.id } }),
      prisma.document.findUniqueOrThrow({ where: { id: document.id } }),
    ]);
    expect(deletedAnalysis.deletedAt).toBeInstanceOf(Date);
    expect(deletedDocument.deletedAt).toEqual(deletedAnalysis.deletedAt);

    const repeatedDelete = await request(owner, {
      method: 'DELETE',
      url: `/api/analyses/${analysis.id}`,
    });
    expect(repeatedDelete.statusCode).toBe(404);

    const invalidPath = await request(owner, {
      method: 'GET',
      url: '/api/analyses/not-a-uuid',
    });
    expect(invalidPath.statusCode).toBe(400);
    expect(invalidPath.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('VIEW-AC-010 returns completed aggregate views to Owner A and 404 to Owner B', async () => {
    const [owner, other] = await Promise.all([
      createAuthenticatedUser(),
      createAuthenticatedUser(),
    ]);
    const evidenceId = randomUUID();
    const output = analysisViewsOutput(evidenceId);
    const analysis = await prisma.analysis.create({
      data: {
        analystViewOutput: output.analystView,
        buffettMungerOutput: output.buffettMunger,
        completedAt: new Date('2026-08-30T02:00:00.000Z'),
        justTellMeOutput: output.justTellMe,
        ownerId: owner.user.id,
        status: 'COMPLETED',
        title: 'Completed views',
      },
    });
    const document = await prisma.document.create({
      data: {
        analysisId: analysis.id,
        mimeType: 'application/pdf',
        originalName: '2026年3月期決算短信.pdf',
        ownerId: owner.user.id,
        sha256: 'c'.repeat(64),
        sizeBytes: 1024,
        storageBucket: 'integration-private',
        storageKey: `${owner.user.id}/${analysis.id}/${randomUUID()}.pdf`,
      },
    });
    const page = await prisma.documentPage.create({
      data: {
        documentId: document.id,
        ownerId: owner.user.id,
        pageNumber: 3,
        text: '売上高は前年同期比で増加しました。',
        textSha256: 'd'.repeat(64),
      },
    });
    const chunk = await prisma.documentChunk.create({
      data: {
        chunkIndex: 0,
        content: page.text,
        contentSha256: 'e'.repeat(64),
        documentId: document.id,
        ownerId: owner.user.id,
        pageId: page.id,
      },
    });
    await prisma.evidence.create({
      data: {
        analysisId: analysis.id,
        chunkId: chunk.id,
        documentId: document.id,
        excerpt: page.text,
        excerptSha256: 'f'.repeat(64),
        id: evidenceId,
        ownerId: owner.user.id,
        pageId: page.id,
        pageNumber: page.pageNumber,
      },
    });
    const finding = await prisma.analysisFinding.create({
      data: {
        analysisId: analysis.id,
        body: '現在の資料に基づく確認事項です。',
        category: 'FINANCIAL_HIGHLIGHT',
        findingKey: 'financial.highlight',
        importance: 4,
        ownerId: owner.user.id,
        status: 'SUPPORTED',
        title: '売上高の変化',
      },
    });
    await prisma.findingEvidence.create({
      data: {
        analysisId: analysis.id,
        evidenceId,
        findingId: finding.id,
        ownerId: owner.user.id,
      },
    });

    const completed = await request(owner, {
      method: 'GET',
      url: `/api/analyses/${analysis.id}/views`,
    });
    expect(completed.statusCode).toBe(200);
    const resource = analysisViewsResourceSchema.parse(
      completed.json<unknown>(),
    );
    expect(resource).toMatchObject({
      analysisId: analysis.id,
      evidences: [
        {
          documentName: document.originalName,
          excerpt: page.text,
          id: evidenceId,
          pageNumber: 3,
        },
      ],
      status: 'COMPLETED',
    });
    expect(resource.evidences).toHaveLength(1);

    const crossOwner = await request(other, {
      method: 'GET',
      url: `/api/analyses/${analysis.id}/views`,
    });
    expect(crossOwner.statusCode).toBe(404);
    expect(crossOwner.json()).toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });
    expect(crossOwner.json<Record<string, unknown>>()).not.toHaveProperty(
      'evidences',
    );

    await prisma.analysis.update({
      data: { status: 'VALIDATING' },
      where: { id: analysis.id },
    });
    const notReady = await request(owner, {
      method: 'GET',
      url: `/api/analyses/${analysis.id}/views`,
    });
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json()).toMatchObject({
      code: 'ANALYSIS_VIEWS_NOT_READY',
    });
  });

  it('ANALYSIS-AC-010 publishes concrete OpenAPI operations and bearer security', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );

    const collectionPath = document.paths['/api/analyses'];
    expect(collectionPath?.get?.responses['200']).toBeDefined();
    expect(collectionPath?.get?.responses['400']).toBeDefined();
    expect(collectionPath?.get?.security).toEqual([{ bearer: [] }]);
    expect(collectionPath?.post?.responses['201']).toBeDefined();
    expect(collectionPath?.post?.responses['400']).toBeDefined();
    expect(collectionPath?.post?.responses['404']).toBeDefined();
    expect(collectionPath?.post?.security).toEqual([{ bearer: [] }]);

    const resourcePath = document.paths['/api/analyses/{analysisId}'];
    expect(resourcePath?.get?.responses['200']).toBeDefined();
    expect(resourcePath?.get?.responses['404']).toBeDefined();
    expect(resourcePath?.patch?.responses['200']).toBeDefined();
    expect(resourcePath?.patch?.responses['404']).toBeDefined();
    expect(resourcePath?.delete?.responses['204']).toBeDefined();
    const processPath = document.paths['/api/analyses/{analysisId}/process'];
    expect(processPath?.post?.responses['202']).toBeDefined();
    expect(processPath?.post?.responses['404']).toBeDefined();
    const viewsPath = document.paths['/api/analyses/{analysisId}/views'];
    expect(viewsPath?.get?.responses['200']).toBeDefined();
    expect(viewsPath?.get?.responses['400']).toBeDefined();
    expect(viewsPath?.get?.responses['404']).toBeDefined();
    expect(viewsPath?.get?.responses['409']).toBeDefined();
    expect(viewsPath?.get?.responses['500']).toBeDefined();
    expect(viewsPath?.get?.security).toEqual([{ bearer: [] }]);
  });

  async function verifyProcessing(): Promise<void> {
    const [owner, other] = await Promise.all([registerUser(), registerUser()]);
    const created = await request(owner, {
      method: 'POST',
      payload: { title: 'Process analysis' },
      url: '/api/analyses',
    });
    const analysis = analysisResourceSchema.parse(created.json<unknown>());
    await prisma.analysis.update({
      data: { status: 'UPLOADED' },
      where: { id: analysis.id },
    });
    await prisma.document.create({
      data: {
        analysisId: analysis.id,
        mimeType: 'application/pdf',
        originalName: 'results.pdf',
        ownerId: owner.user.id,
        sha256: 'b'.repeat(64),
        sizeBytes: 1024,
        storageBucket: 'integration-private',
        storageKey: `${owner.user.id}/${analysis.id}/${randomUUID()}.pdf`,
      },
    });

    const crossUser = await request(other, {
      method: 'POST',
      url: `/api/analyses/${analysis.id}/process`,
    });
    expect(crossUser.statusCode).toBe(404);
    expect(
      await prisma.jobExecution.count({ where: { analysisId: analysis.id } }),
    ).toBe(0);

    const accepted = await request(owner, {
      method: 'POST',
      url: `/api/analyses/${analysis.id}/process`,
    });
    expect(accepted.statusCode).toBe(202);
    const result = processAnalysisResponseSchema.parse(
      accepted.json<unknown>(),
    );
    expect(result).toMatchObject({
      analysisId: analysis.id,
      status: 'PARSING',
    });

    const repeated = await request(owner, {
      method: 'POST',
      url: `/api/analyses/${analysis.id}/process`,
    });
    expect(repeated.statusCode).toBe(202);
    expect(repeated.json()).toMatchObject({ executionId: result.executionId });
    expect(
      await prisma.jobExecution.count({
        where: { analysisId: analysis.id, step: 'PARSE' },
      }),
    ).toBe(1);
    expect(dispatchProcessing).toHaveBeenCalledWith(result.executionId);
  }

  async function registerUser(): Promise<AuthResponse> {
    const response = await app.inject({
      method: 'POST',
      payload: {
        displayName: 'Analysis Integration User',
        email: `${randomUUID()}@analysis.integration.test`,
        password: 'integration-password',
      },
      url: '/api/auth/register',
    });
    expect(response.statusCode).toBe(201);
    return authResponseSchema.parse(response.json<unknown>());
  }

  async function createAuthenticatedUser(): Promise<AuthResponse> {
    const email = `${randomUUID()}@analysis.integration.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-used-by-bearer-auth' },
    });
    return {
      accessToken: await tokenService.createAccessToken({
        email,
        sub: user.id,
      }),
      expiresIn: 900,
      user: {
        displayName: null,
        email,
        id: user.id,
        isDemo: false,
      },
    };
  }

  function request(
    auth: AuthResponse,
    options: InjectOptions,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      ...options,
      headers: {
        ...options.headers,
        authorization: `Bearer ${auth.accessToken}`,
      },
    });
  }
});

function analysisViewsOutput(
  evidenceId: string,
): AnalysisViewsGenerationOutput {
  return {
    analystView: analysisView(evidenceId, [
      'BUSINESS_OVERVIEW',
      'FINANCIAL_HIGHLIGHTS',
      'MANAGEMENT_GUIDANCE',
      'POSITIVE_FINDINGS',
      'RISKS',
      'UNCERTAINTIES',
      'WATCH_ITEMS',
      'SOURCES',
    ]),
    buffettMunger: analysisView(evidenceId, [
      'BUSINESS_UNDERSTANDABILITY',
      'COMPETITIVE_ADVANTAGE',
      'CASH_GENERATION',
      'CAPITAL_ALLOCATION',
      'MANAGEMENT_INCENTIVES',
      'LONG_TERM_RISKS',
      'MISSING_INFORMATION',
    ]),
    justTellMe: analysisView(evidenceId, [
      'HOW_THE_COMPANY_MAKES_MONEY',
      'RECENT_CHANGES',
      'POSITIVES',
      'RISKS',
      'WATCH_ITEMS',
      'MISSING_INFORMATION',
    ]),
  } as AnalysisViewsGenerationOutput;
}

function analysisView(evidenceId: string, sectionKeys: readonly string[]) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => ({
      blocks: [
        {
          evidenceIds: [evidenceId],
          isMissingInformation: false,
          key: `block.${index}`,
          text: '現在の資料に基づく確認事項です。',
        },
      ],
      key,
      title: `確認項目${index + 1}`,
    })),
  };
}
