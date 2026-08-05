import { Global, Module } from '@nestjs/common';

import { AnalysisRepository } from './analysis.repository';
import { DocumentUploadRepository } from './document-upload.repository';
import { DocumentRepository } from './document.repository';
import { ObjectCleanupRepository } from './object-cleanup.repository';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  exports: [
    AnalysisRepository,
    DocumentUploadRepository,
    DocumentRepository,
    ObjectCleanupRepository,
    PrismaService,
  ],
  providers: [
    AnalysisRepository,
    DocumentUploadRepository,
    DocumentRepository,
    ObjectCleanupRepository,
    PrismaService,
  ],
})
export class DatabaseModule {}
