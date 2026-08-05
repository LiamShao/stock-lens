import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  documentTypeSchema,
  documentUploadStatusSchema,
  MAX_PDF_SIZE_BYTES,
} from '@stocklens/shared';

export class StartDocumentUploadOpenApi {
  @ApiProperty({ example: '決算短信.pdf', maxLength: 255, minLength: 1 })
  declare originalName: string;

  @ApiProperty({ enum: ['application/pdf'] })
  declare mimeType: 'application/pdf';

  @ApiProperty({ maximum: MAX_PDF_SIZE_BYTES, minimum: 1 })
  declare sizeBytes: number;

  @ApiProperty({ example: 'a'.repeat(64), pattern: '^[a-f0-9]{64}$' })
  declare sha256: string;

  @ApiPropertyOptional({
    default: 'UNKNOWN',
    enum: documentTypeSchema.options,
  })
  declare documentType?: string;
}

export class DocumentUploadResourceOpenApi {
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

  @ApiProperty({ enum: documentUploadStatusSchema.options })
  declare status: string;

  @ApiProperty({ format: 'date-time' })
  declare expiresAt: string;

  @ApiProperty({ format: 'date-time' })
  declare createdAt: string;
}

export class PresignedPdfUploadOpenApi {
  @ApiProperty({ format: 'uri' })
  declare url: string;

  @ApiProperty({
    additionalProperties: { type: 'string' },
    example: {
      'content-length': '1024',
      'content-type': 'application/pdf',
      'x-amz-meta-stocklens-sha256': 'a'.repeat(64),
    },
    type: 'object',
  })
  declare headers: Record<string, string>;

  @ApiProperty({ format: 'date-time' })
  declare expiresAt: string;
}

export class StartDocumentUploadResponseOpenApi {
  @ApiProperty({ type: DocumentUploadResourceOpenApi })
  declare uploadSession: DocumentUploadResourceOpenApi;

  @ApiProperty({ type: PresignedPdfUploadOpenApi })
  declare upload: PresignedPdfUploadOpenApi;
}
