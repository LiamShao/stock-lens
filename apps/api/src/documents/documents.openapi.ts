import { ApiProperty } from '@nestjs/swagger';
import { documentTypeSchema, MAX_PDF_SIZE_BYTES } from '@stocklens/shared';

export class DocumentResourceOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare id: string;

  @ApiProperty({ format: 'uuid' })
  declare analysisId: string;

  @ApiProperty()
  declare originalName: string;

  @ApiProperty({ enum: documentTypeSchema.options })
  declare documentType: string;

  @ApiProperty({ enum: ['application/pdf'] })
  declare mimeType: 'application/pdf';

  @ApiProperty({ maximum: MAX_PDF_SIZE_BYTES, minimum: 1 })
  declare sizeBytes: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  declare sha256: string;

  @ApiProperty({ format: 'date-time' })
  declare uploadedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare createdAt: string;

  @ApiProperty({ format: 'date-time' })
  declare updatedAt: string;
}

export class DocumentListResponseOpenApi {
  @ApiProperty({ isArray: true, maxItems: 3, type: DocumentResourceOpenApi })
  declare items: DocumentResourceOpenApi[];
}

export class PresignedDocumentDownloadOpenApi {
  @ApiProperty({ format: 'uri' })
  declare url: string;

  @ApiProperty({ format: 'date-time' })
  declare expiresAt: string;
}
