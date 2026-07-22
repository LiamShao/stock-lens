import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import { AppModule } from './app.module';
import { configureApiApplication } from './app-configuration';
import { getAuthConfig } from './auth/auth.config';
import { getFastifyLoggerOptions } from './common/logger.config';
import { resolveRequestId } from './common/request-id';
import { loadLocalEnvironment } from './environment';

async function bootstrap(): Promise<void> {
  loadLocalEnvironment();
  const authConfig = getAuthConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      genReqId: (request: IncomingMessage | Http2ServerRequest) => {
        return resolveRequestId(request.headers['x-request-id']);
      },
      logger: getFastifyLoggerOptions(),
    }),
    {
      logger: new ConsoleLogger({ json: true }),
    },
  );

  await configureApiApplication(app, authConfig);
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle('StockLens AI API')
    .setDescription('Evidence-based company research API for uploaded IR PDFs.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('stocklens_refresh_token')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
