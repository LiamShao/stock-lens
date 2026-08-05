import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DocumentUploadsController } from './document-uploads.controller';
import { DocumentUploadsService } from './document-uploads.service';
import { ObjectStorageModule } from './object-storage.module';
import { PdfObjectValidator } from './pdf-object-validator';

@Module({
  controllers: [DocumentUploadsController],
  imports: [AuthModule, DatabaseModule, ObjectStorageModule],
  providers: [DocumentUploadsService, PdfObjectValidator],
})
export class DocumentsModule {}
