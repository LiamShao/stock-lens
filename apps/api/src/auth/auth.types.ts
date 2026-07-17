import type { AuthUser } from '@stocklens/shared';

export interface AccessTokenClaims {
  email: string;
  sub: string;
}

export interface RefreshTokenValue {
  expiresAt: Date;
  hash: string;
  id: string;
  plainText: string;
}

export interface AuthenticatedRequest {
  user: AuthUser;
}
