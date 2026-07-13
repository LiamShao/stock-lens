import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
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

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

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
