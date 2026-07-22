import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { HttpStatus } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import type { AuthConfig } from './auth/auth.config';
import { ApiException } from './common/api-exception';
import { ApiExceptionFilter } from './common/api-exception.filter';

export async function configureApiApplication(
  app: NestFastifyApplication,
  authConfig: AuthConfig,
): Promise<void> {
  await app.register(cookie);
  await app.register(rateLimit, {
    errorResponseBuilder: () =>
      new ApiException(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    max: 100,
    timeWindow: '1 minute',
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      callback(null, origin === authConfig.corsOrigin);
    },
  });
  app.useGlobalFilters(new ApiExceptionFilter());
}
