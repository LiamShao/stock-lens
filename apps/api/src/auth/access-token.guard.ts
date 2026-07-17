import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ApiException } from '../common/api-exception';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & Partial<AuthenticatedRequest>>();
    const authorization = request.headers.authorization;
    const [scheme, token, extra] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || extra) {
      throw new ApiException(
        'ACCESS_TOKEN_REQUIRED',
        'A Bearer access token is required.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    request.user = await this.authService.authenticate(token);
    return true;
  }
}
