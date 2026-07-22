import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserOpenApi {
  @ApiProperty({ format: 'uuid' })
  declare id: string;

  @ApiProperty({ format: 'email' })
  declare email: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  declare displayName: string | null;

  @ApiProperty()
  declare isDemo: boolean;
}

export class AuthResponseOpenApi {
  @ApiProperty()
  declare accessToken: string;

  @ApiProperty({ example: 900, minimum: 1 })
  declare expiresIn: number;

  @ApiProperty({ type: AuthUserOpenApi })
  declare user: AuthUserOpenApi;
}

export class ApiErrorOpenApi {
  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  declare code: string;

  @ApiProperty({ example: 'Email or password is incorrect.' })
  declare message: string;

  @ApiProperty({ format: 'uuid' })
  declare requestId: string;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  declare details: Record<string, unknown>;
}

export const REFRESH_COOKIE_RESPONSE_HEADER = {
  'set-cookie': {
    description:
      'HttpOnly, SameSite=Strict refresh token cookie scoped to /api/auth.',
    schema: { type: 'string' },
  },
};
