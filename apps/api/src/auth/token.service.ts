import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import type { AccessTokenClaims, RefreshTokenValue } from './auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  createAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwtService.signAsync(
      { email: claims.email },
      {
        audience: this.config.accessTokenAudience,
        expiresIn: this.config.accessTokenExpiresInSeconds,
        issuer: this.config.accessTokenIssuer,
        secret: this.config.accessTokenSecret,
        subject: claims.sub,
      },
    );
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token, {
      audience: this.config.accessTokenAudience,
      issuer: this.config.accessTokenIssuer,
      secret: this.config.accessTokenSecret,
    });
  }

  createRefreshToken(now = new Date()): RefreshTokenValue {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + this.config.refreshTokenExpiresInDays,
    );
    return {
      expiresAt,
      hash: this.hashRefreshSecret(secret),
      id,
      plainText: `${id}.${secret}`,
    };
  }

  parseRefreshToken(value: string): { hash: string; id: string } | null {
    const separator = value.indexOf('.');
    if (separator <= 0 || separator === value.length - 1) {
      return null;
    }
    const id = value.slice(0, separator);
    const secret = value.slice(separator + 1);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      secret.length < 32
    ) {
      return null;
    }
    return { hash: this.hashRefreshSecret(secret), id };
  }

  hashUserAgent(userAgent: string | undefined): string | null {
    return userAgent ? this.sha256(userAgent) : null;
  }

  private hashRefreshSecret(secret: string): string {
    return this.sha256(secret);
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
