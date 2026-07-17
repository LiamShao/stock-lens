import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@stocklens/shared';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedRequest } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & AuthenticatedRequest>();
    return request.user;
  },
);
