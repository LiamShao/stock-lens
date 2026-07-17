import { authEnvironmentSchema, type AuthEnvironment } from '@stocklens/shared';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  accessTokenAudience: string;
  accessTokenExpiresInSeconds: number;
  accessTokenIssuer: string;
  accessTokenSecret: string;
  corsOrigin: string;
  isProduction: boolean;
  refreshTokenExpiresInDays: number;
}

export function getAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  const parsed: AuthEnvironment = authEnvironmentSchema.parse(environment);
  return {
    accessTokenAudience: parsed.ACCESS_TOKEN_AUDIENCE,
    accessTokenExpiresInSeconds: parsed.ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    accessTokenIssuer: parsed.ACCESS_TOKEN_ISSUER,
    accessTokenSecret: parsed.ACCESS_TOKEN_SECRET,
    corsOrigin: parsed.CORS_ORIGIN,
    isProduction: parsed.NODE_ENV === 'production',
    refreshTokenExpiresInDays: parsed.REFRESH_TOKEN_EXPIRES_IN_DAYS,
  };
}
