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
