import { Module } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import {
  ANALYSIS_PROCESSING_QUEUE_NAME,
  type AnalysisJobData,
} from '@stocklens/shared';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { AnalysisViewsService } from './analysis-views.service';
import { AnalysisProcessingQueuePublisher } from './analysis-processing.queue';

@Module({
  controllers: [AnalysesController],
  imports: [AuthModule, DatabaseModule],
  providers: [
    AnalysesService,
    AnalysisViewsService,
    {
      provide: AnalysisProcessingQueuePublisher,
      useFactory: (): AnalysisProcessingQueuePublisher => {
        const queue = new Queue<AnalysisJobData>(
          ANALYSIS_PROCESSING_QUEUE_NAME,
          {
            connection: redisConnection(
              process.env.REDIS_URL ?? 'redis://localhost:6379',
            ),
          },
        );
        queue.on('error', () => {
          // Durable QUEUED state is the recovery source; omit connection detail.
        });
        return new AnalysisProcessingQueuePublisher(queue);
      },
    },
  ],
})
export class AnalysesModule {}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('REDIS_URL must use redis or rediss.');
  return {
    host: url.hostname,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    port: url.port === '' ? 6379 : Number(url.port),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
