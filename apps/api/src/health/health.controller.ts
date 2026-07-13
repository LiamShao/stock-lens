import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@stocklens/shared';

import { HealthService } from './health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the API process is alive' })
  @ApiOkResponse({
    schema: {
      example: { service: 'api', status: 'ok' },
      properties: {
        service: { example: 'api', type: 'string' },
        status: { enum: ['ok'], type: 'string' },
      },
      required: ['service', 'status'],
      type: 'object',
    },
  })
  getLiveness(): HealthResponse {
    return this.healthService.getLiveness();
  }
}
