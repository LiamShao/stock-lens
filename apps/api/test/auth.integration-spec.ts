import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { authResponseSchema } from '@stocklens/shared';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { LightMyRequestResponse } from 'fastify';

import { configureApiApplication } from '../src/app-configuration';
import { AppModule } from '../src/app.module';
import { getAuthConfig } from '../src/auth/auth.config';
import { DemoUserProvisioner } from '../src/auth/demo-user-provisioner';
import { PasswordHasher } from '../src/auth/password-hasher';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/database/prisma.service';
import { startMigratedPostgres } from './support/postgres-test-container';

jest.setTimeout(120_000);

describe('authentication HTTP integration', () => {
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
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await configureApiApplication(app, getAuthConfig());
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

  it('AUTH-AC-001/003/004/005 registers and logs in against PostgreSQL', async () => {
    const email = `${randomUUID()}@integration.test`;
    const password = 'integration-password';
    const registration = await register(email, password, '10.0.0.1');

    expect(registration.statusCode).toBe(201);
    expect(getCookie(registration)).toContain('stocklens_refresh_token=');
    const registeredUser = await prisma.user.findUniqueOrThrow({
      where: { email },
    });
    expect(registeredUser.passwordHash).toMatch(/^\$argon2id\$/);

    const duplicate = await register(email, password, '10.0.0.1');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      code: 'EMAIL_ALREADY_REGISTERED',
    });

    const wrongPassword = await app.inject({
      method: 'POST',
      payload: { email, password: 'incorrect-password' },
      remoteAddress: '10.0.0.2',
      url: '/api/auth/login',
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      payload: {
        email: `${randomUUID()}@integration.test`,
        password: 'incorrect-password',
      },
      remoteAddress: '10.0.0.2',
      url: '/api/auth/login',
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(unknownEmail.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const login = await app.inject({
      method: 'POST',
      payload: { email, password },
      remoteAddress: '10.0.0.2',
      url: '/api/auth/login',
    });
    expect(login.statusCode).toBe(200);
    expect(authResponseSchema.parse(login.json<unknown>()).user.id).toBe(
      registeredUser.id,
    );
    const loggedInUser = await prisma.user.findUniqueOrThrow({
      where: { id: registeredUser.id },
    });
    expect(loggedInUser.lastLoginAt).toBeInstanceOf(Date);
    await expect(
      prisma.refreshToken.count({ where: { userId: registeredUser.id } }),
    ).resolves.toBe(2);
  });

  it('AUTH-AC-006/007 rotates once and revokes a reused token family', async () => {
    const registration = await register(
      `${randomUUID()}@integration.test`,
      'integration-password',
      '10.0.0.3',
    );
    const originalCookie = getCookie(registration);
    const rotated = await app.inject({
      headers: { cookie: originalCookie },
      method: 'POST',
      remoteAddress: '10.0.0.3',
      url: '/api/auth/refresh',
    });
    expect(rotated.statusCode).toBe(200);
    const replacementCookie = getCookie(rotated);

    const reuse = await app.inject({
      headers: { cookie: originalCookie },
      method: 'POST',
      remoteAddress: '10.0.0.3',
      url: '/api/auth/refresh',
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });

    const replacementAfterReuse = await app.inject({
      headers: { cookie: replacementCookie },
      method: 'POST',
      remoteAddress: '10.0.0.3',
      url: '/api/auth/refresh',
    });
    expect(replacementAfterReuse.statusCode).toBe(401);
  });

  it('AUTH-AC-008/009 logs out and rejects access for a deleted user', async () => {
    const registration = await register(
      `${randomUUID()}@integration.test`,
      'integration-password',
      '10.0.0.4',
    );
    const auth = authResponseSchema.parse(registration.json<unknown>());
    const cookie = getCookie(registration);
    const parsedRefreshToken = tokenService.parseRefreshToken(
      cookie.slice(cookie.indexOf('=') + 1),
    );
    expect(parsedRefreshToken).not.toBeNull();

    const me = await app.inject({
      headers: { authorization: `Bearer ${auth.accessToken}` },
      method: 'GET',
      remoteAddress: '10.0.0.4',
      url: '/api/auth/me',
    });
    expect(me.statusCode).toBe(200);

    const logout = await app.inject({
      headers: { cookie },
      method: 'POST',
      remoteAddress: '10.0.0.4',
      url: '/api/auth/logout',
    });
    expect(logout.statusCode).toBe(204);
    if (parsedRefreshToken !== null) {
      const revokedToken = await prisma.refreshToken.findUniqueOrThrow({
        where: { id: parsedRefreshToken.id },
      });
      expect(revokedToken.revokedAt).toBeInstanceOf(Date);
    }

    await prisma.user.update({
      data: { deletedAt: new Date() },
      where: { id: auth.user.id },
    });
    const deletedUserMe = await app.inject({
      headers: { authorization: `Bearer ${auth.accessToken}` },
      method: 'GET',
      remoteAddress: '10.0.0.4',
      url: '/api/auth/me',
    });
    expect(deletedUserMe.statusCode).toBe(401);
    expect(deletedUserMe.json()).toMatchObject({
      code: 'INVALID_ACCESS_TOKEN',
    });
  });

  it('AUTH-AC-011 enforces rate limits and configured credential CORS', async () => {
    const requests = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          payload: { email: 'invalid', password: 'short' },
          remoteAddress: '10.0.0.5',
          url: '/api/auth/register',
        }),
      ),
    );
    expect(requests.at(-1)?.statusCode).toBe(429);
    expect(requests.at(-1)?.json()).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
    });

    const allowedCors = await app.inject({
      headers: {
        'access-control-request-method': 'POST',
        origin: 'http://localhost:3000',
      },
      method: 'OPTIONS',
      remoteAddress: '10.0.0.6',
      url: '/api/auth/login',
    });
    expect(allowedCors.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(allowedCors.headers['access-control-allow-credentials']).toBe(
      'true',
    );

    const rejectedCors = await app.inject({
      headers: {
        'access-control-request-method': 'POST',
        origin: 'https://attacker.example',
      },
      method: 'OPTIONS',
      remoteAddress: '10.0.0.7',
      url: '/api/auth/login',
    });
    expect(rejectedCors.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('DEMO-AC-001/002 and DEMO-DEV-002 provision idempotently and revoke sessions on password rotation', async () => {
    const hasher = new PasswordHasher();
    const provisioner = new DemoUserProvisioner(prisma, hasher);
    const email = `${randomUUID()}@demo.integration.test`;
    const initialConfig = {
      displayName: 'Integration Demo',
      email,
      password: 'initial-demo-password',
    };

    await expect(provisioner.provision(initialConfig)).resolves.toMatchObject({
      action: 'created',
    });
    await expect(provisioner.provision(initialConfig)).resolves.toMatchObject({
      action: 'unchanged',
    });
    const demo = await prisma.user.findUniqueOrThrow({ where: { email } });
    const refreshToken = await prisma.refreshToken.create({
      data: {
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        familyId: randomUUID(),
        tokenHash: 'd'.repeat(64),
        userId: demo.id,
      },
    });

    await expect(
      provisioner.provision({
        ...initialConfig,
        password: 'rotated-demo-password',
      }),
    ).resolves.toMatchObject({ action: 'updated' });
    const updatedDemo = await prisma.user.findUniqueOrThrow({
      where: { id: demo.id },
    });
    await expect(
      hasher.verify(updatedDemo.passwordHash, 'rotated-demo-password'),
    ).resolves.toBe(true);
    const revokedDemoToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: refreshToken.id },
    });
    expect(revokedDemoToken.revokedAt).toBeInstanceOf(Date);
  });

  function register(
    email: string,
    password: string,
    remoteAddress: string,
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method: 'POST',
      payload: { displayName: 'Integration User', email, password },
      remoteAddress,
      url: '/api/auth/register',
    });
  }
});

function getCookie(response: LightMyRequestResponse): string {
  const setCookie = response.headers['set-cookie'];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) {
    throw new Error('Expected a refresh token cookie.');
  }
  return value.split(';', 1)[0] ?? value;
}
