import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@stocklens/shared';

@Injectable()
export class HealthService {
  getLiveness(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
    };
  }
}
