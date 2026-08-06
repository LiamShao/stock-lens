import { Module } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import {
  OBJECT_CLEANUP_QUEUE_NAME,
  type ObjectCleanupJobData,
} from '@stocklens/shared';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ObjectCleanupRepository } from '../database/object-cleanup.repository';
import { DocumentUploadsController } from './document-uploads.controller';
import { DocumentUploadsService } from './document-uploads.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { ObjectCleanupQueuePublisher } from './object-cleanup-queue';
import { ObjectStorageModule } from './object-storage.module';
import { PdfObjectValidator } from './pdf-object-validator';

@Module({
  controllers: [DocumentUploadsController, DocumentsController],
  imports: [AuthModule, DatabaseModule, ObjectStorageModule],
  providers: [
    DocumentUploadsService,
    DocumentsService,
    PdfObjectValidator,
    {
      inject: [ObjectCleanupRepository],
      provide: ObjectCleanupQueuePublisher,
      useFactory: (
        repository: ObjectCleanupRepository,
      ): ObjectCleanupQueuePublisher =>
        new ObjectCleanupQueuePublisher(repository, () =>
          createCleanupQueue(process.env.REDIS_URL),
        ),
    },
  ],
})
export class DocumentsModule {}

function createCleanupQueue(redisUrl: string | undefined) {
  const queue = new Queue<ObjectCleanupJobData>(OBJECT_CLEANUP_QUEUE_NAME, {
    connection: getRedisConnectionOptions(redisUrl ?? 'redis://localhost:6379'),
  });
  queue.on('error', () => {
    // Dispatch returns false while the durable QUEUED execution remains the
    // recovery source. Provider connection details must not reach logs.
  });
  return queue;
}

function getRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use the redis or rediss protocol.');
  }
  const databasePath = url.pathname.slice(1);
  const database = databasePath === '' ? undefined : Number(databasePath);
  if (database !== undefined && !Number.isInteger(database)) {
    throw new Error('REDIS_URL database must be an integer.');
  }
  const port = url.port === '' ? 6379 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('REDIS_URL port must be a valid TCP port.');
  }
  return {
    host: url.hostname,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    port,
    ...(database === undefined ? {} : { db: database }),
    ...(url.password === ''
      ? {}
      : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    ...(url.username === ''
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}
