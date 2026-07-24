import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  analysisPageResponseSchema,
  analysisResourceSchema,
  authResponseSchema,
  type AuthResponse,
} from '@stocklens/shared';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';

import { configureApiApplication } from '../src/app-configuration';
import { AppModule } from '../src/app.module';
import { getAuthConfig } from '../src/auth/auth.config';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('analysis management HTTP integration', () => {
  let app: NestFastifyApplication;
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

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
    });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApiApplication(app, getAuthConfig());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (container !== undefined) {
      await container.stop();
    }
  });

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
    const [owner, other] = await Promise.all([registerUser(), registerUser()]);
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
  });

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
