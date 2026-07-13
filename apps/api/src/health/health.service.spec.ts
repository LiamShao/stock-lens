import { healthResponseSchema } from '@stocklens/shared';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns a valid liveness response', () => {
    const response = new HealthService().getLiveness();

    expect(healthResponseSchema.parse(response)).toEqual({
      service: 'api',
      status: 'ok',
    });
  });
});
