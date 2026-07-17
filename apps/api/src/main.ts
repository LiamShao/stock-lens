import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import { AppModule } from './app.module';
import { getAuthConfig } from './auth/auth.config';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { loadLocalEnvironment } from './environment';

async function bootstrap(): Promise<void> {
  loadLocalEnvironment();
  const authConfig = getAuthConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      genReqId: (request: IncomingMessage | Http2ServerRequest) => {
        const requestId = request.headers['x-request-id'];
        return typeof requestId === 'string' ? requestId : randomUUID();
      },
      logger: true,
    }),
    {
      logger: new ConsoleLogger({ json: true }),
    },
  );

  await app.register(cookie);
  await app.register(rateLimit, {
    errorResponseBuilder: (request) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      details: {},
      message: 'Too many requests.',
      requestId: request.id,
    }),
    max: 100,
    timeWindow: '1 minute',
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    credentials: true,
    origin: authConfig.corsOrigin,
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('StockLens AI API')
    .setDescription('Evidence-based company research API for uploaded IR PDFs.')
    .setVersion('0.1.0')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
