import { Test } from '@nestjs/testing';
import type { CookieSerializeOptions } from '@fastify/cookie';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { authResponseSchema } from '@stocklens/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { ApiExceptionFilter } from '../common/api-exception.filter';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService, type AuthResult } from './auth.service';

const config: AuthConfig = {
  accessTokenAudience: 'stocklens-web',
  accessTokenExpiresInSeconds: 900,
  accessTokenIssuer: 'stocklens-api',
  accessTokenSecret: 'test-access-token-secret-at-least-32-characters',
  corsOrigin: 'http://localhost:3000',
  isProduction: false,
  refreshTokenExpiresInDays: 30,
};

const authResult: AuthResult = {
  refreshToken: 'refresh-token-value',
  response: {
    accessToken: 'access-token-value',
    expiresIn: 900,
    user: {
      displayName: 'Test User',
      email: 'test@example.com',
      id: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
      isDemo: false,
    },
  },
};

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
    register: jest.fn(),
  };
  let app: NestFastifyApplication;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: config },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app
      .getHttpAdapter()
      .getInstance()
      .decorateReply(
        'setCookie',
        function setCookie(
          this: FastifyReply,
          name: string,
          value: string,
          options?: CookieSerializeOptions,
        ) {
          const attributes = [
            `${name}=${value}`,
            options?.httpOnly ? 'HttpOnly' : '',
            options?.sameSite ? `SameSite=${options.sameSite}` : '',
          ].filter(Boolean);
          this.header('set-cookie', attributes.join('; '));
          return this;
        },
      );
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('normalizes registration input and sets a protected refresh cookie', async () => {
    authService.register.mockResolvedValue(authResult);

    const response = await app.inject({
      method: 'POST',
      payload: {
        displayName: ' Test User ',
        email: ' TEST@Example.COM ',
        password: 'correct horse battery staple',
      },
      url: '/api/auth/register',
    });

    expect(response.statusCode).toBe(201);
    expect(authService.register).toHaveBeenCalledWith(
      {
        displayName: 'Test User',
        email: 'test@example.com',
        password: 'correct horse battery staple',
      },
      'lightMyRequest',
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.stringContaining('HttpOnly'),
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.stringContaining('SameSite=strict'),
    );
    expect(authResponseSchema.parse(response.json<unknown>())).toEqual(
      authResult.response,
    );
  });

  it('returns the unified API error format for invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      payload: {
        email: 'not-an-email',
        password: 'short',
      },
      url: '/api/auth/register',
    });

    expect(response.statusCode).toBe(400);
    const errorResponse = z
      .object({
        code: z.literal('VALIDATION_ERROR'),
        details: z.object({ issues: z.array(z.unknown()) }),
        message: z.literal('Request validation failed.'),
        requestId: z.string().min(1),
      })
      .parse(response.json<unknown>());
    expect(errorResponse.details.issues.length).toBeGreaterThan(0);
    expect(authService.register).not.toHaveBeenCalled();
  });
});
