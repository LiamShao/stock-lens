import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { analysisStatusSchema } from '@stocklens/shared';

export class AnalysisResourceOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare id: string;

  @ApiProperty({ maxLength: 120, minLength: 1 })
  declare title: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  declare companyId: string | null;

  @ApiProperty({ enum: analysisStatusSchema.options })
  declare status: string;

  @ApiProperty({ nullable: true, type: String })
  declare failureCode: string | null;

  @ApiProperty({ nullable: true, type: String })
  declare failureMessage: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
  })
  declare completedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  declare createdAt: string;

  @ApiProperty({ format: 'date-time' })
  declare updatedAt: string;
}

export class AnalysisPageOpenApi {
  @ApiProperty({ type: [AnalysisResourceOpenApi] })
  declare items: AnalysisResourceOpenApi[];

  @ApiProperty({ nullable: true, type: String })
  declare nextCursor: string | null;
}

export class CreateAnalysisOpenApi {
  @ApiProperty({ maxLength: 120, minLength: 1 })
  declare title: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  declare companyId?: string | null;
}

export class RenameAnalysisOpenApi {
  @ApiProperty({ maxLength: 120, minLength: 1 })
  declare title: string;
}

export class ProcessAnalysisOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare executionId: string;

  @ApiProperty({ format: 'uuid' })
  declare analysisId: string;

  @ApiProperty({ enum: ['PARSING'] })
  declare status: 'PARSING';

  @ApiProperty({ format: 'date-time' })
  declare acceptedAt: string;
}

export class AnalysisViewBlockOpenApi {
  @ApiProperty({ maxLength: 80, pattern: '^[a-z0-9][a-z0-9._-]{0,79}$' })
  declare key: string;

  @ApiProperty({ maxLength: 800, minLength: 1 })
  declare text: string;

  @ApiProperty({ format: 'uuid', isArray: true, maxItems: 5 })
  declare evidenceIds: string[];

  @ApiProperty()
  declare isMissingInformation: boolean;
}

export class AnalysisViewSectionOpenApi {
  @ApiProperty()
  declare key: string;

  @ApiProperty({ maxLength: 80, minLength: 1 })
  declare title: string;

  @ApiProperty({ maxItems: 3, minItems: 1, type: [AnalysisViewBlockOpenApi] })
  declare blocks: AnalysisViewBlockOpenApi[];
}

export class AnalysisViewOpenApi {
  @ApiProperty({ enum: ['1.0.0'] })
  declare schemaVersion: '1.0.0';

  @ApiProperty({ type: [AnalysisViewSectionOpenApi] })
  declare sections: AnalysisViewSectionOpenApi[];
}

export class AnalysisViewsOpenApi {
  @ApiProperty({ type: AnalysisViewOpenApi })
  declare justTellMe: AnalysisViewOpenApi;

  @ApiProperty({ type: AnalysisViewOpenApi })
  declare analyst: AnalysisViewOpenApi;

  @ApiProperty({ type: AnalysisViewOpenApi })
  declare buffettMunger: AnalysisViewOpenApi;
}

export class AnalysisViewEvidenceOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare id: string;

  @ApiProperty({ format: 'uuid' })
  declare documentId: string;

  @ApiProperty({ maxLength: 255 })
  declare documentName: string;

  @ApiProperty({ minimum: 1 })
  declare pageNumber: number;

  @ApiProperty({ maxLength: 800, minLength: 1 })
  declare excerpt: string;

  @ApiProperty({ format: 'uuid' })
  declare chunkId: string;
}

export class AnalysisViewsResourceOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare analysisId: string;

  @ApiProperty({ enum: ['COMPLETED'] })
  declare status: 'COMPLETED';

  @ApiProperty({ format: 'date-time' })
  declare completedAt: string;

  @ApiProperty({ type: AnalysisViewsOpenApi })
  declare views: AnalysisViewsOpenApi;

  @ApiProperty({ maxItems: 120, type: [AnalysisViewEvidenceOpenApi] })
  declare evidences: AnalysisViewEvidenceOpenApi[];
}
