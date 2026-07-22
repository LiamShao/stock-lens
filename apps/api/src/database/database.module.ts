import { Global, Module } from '@nestjs/common';

import { AnalysisRepository } from './analysis.repository';
import { DocumentRepository } from './document.repository';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  exports: [AnalysisRepository, DocumentRepository, PrismaService],
  providers: [AnalysisRepository, DocumentRepository, PrismaService],
})
export class DatabaseModule {}
