import { Global, Module } from '@nestjs/common';

import { AnalysisRepository } from './analysis.repository';
import { DocumentRepository } from './document.repository';
import { ObjectCleanupRepository } from './object-cleanup.repository';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  exports: [
    AnalysisRepository,
    DocumentRepository,
    ObjectCleanupRepository,
    PrismaService,
  ],
  providers: [
    AnalysisRepository,
    DocumentRepository,
    ObjectCleanupRepository,
    PrismaService,
  ],
})
export class DatabaseModule {}
