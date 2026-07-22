import { randomUUID, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
} from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import {
  AuthRepository,
  EmailAlreadyExistsError,
  type UserRecord,
} from './auth.repository';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';

export interface AuthResult {
  refreshToken: string;
  response: AuthResponse;
}

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$ibvvNRyp99Z5w2lupIbDpQ$AsmF/N5EUde2MnFBI2z4gT57X0U3th7ayMXoZcTUwbA';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(
    input: RegisterRequest,
    userAgent: string | undefined,
  ): Promise<AuthResult> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const refreshToken = this.tokenService.createRefreshToken();
    let user: UserRecord;
    try {
      user = await this.repository.createUserWithRefreshToken(
        {
          email: input.email,
          passwordHash,
          ...(input.displayName ? { displayName: input.displayName } : {}),
        },
        {
          expiresAt: refreshToken.expiresAt,
          familyId: randomUUID(),
          id: refreshToken.id,
          tokenHash: refreshToken.hash,
          userAgentHash: this.tokenService.hashUserAgent(userAgent),
        },
      );
    } catch (error: unknown) {
      if (error instanceof EmailAlreadyExistsError) {
        throw new ApiException(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    return this.createAuthResult(user, refreshToken.plainText);
  }

  async login(
    input: LoginRequest,
    userAgent: string | undefined,
  ): Promise<AuthResult> {
    const user = await this.repository.findActiveUserByEmail(input.email);
    const passwordMatches = await this.passwordHasher.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    if (user === null || !passwordMatches) {
      throw this.invalidCredentials();
    }
    const now = new Date();
    const refreshToken = this.tokenService.createRefreshToken(now);
    await this.repository.createRefreshTokenAndRecordLogin(
      {
        expiresAt: refreshToken.expiresAt,
        familyId: randomUUID(),
        id: refreshToken.id,
        tokenHash: refreshToken.hash,
        userAgentHash: this.tokenService.hashUserAgent(userAgent),
        userId: user.id,
      },
      now,
    );
    return this.createAuthResult(user, refreshToken.plainText);
  }

  async refresh(
    plainTextToken: string | undefined,
    userAgent: string | undefined,
  ): Promise<AuthResult> {
    const parsed = plainTextToken
      ? this.tokenService.parseRefreshToken(plainTextToken)
      : null;
    if (parsed === null) {
      throw this.invalidRefreshToken();
    }
    const stored = await this.repository.findRefreshToken(parsed.id);
    if (stored === null || !this.hashesMatch(stored.tokenHash, parsed.hash)) {
      throw this.invalidRefreshToken();
    }

    const now = new Date();
    if (stored.revokedAt !== null || stored.lastUsedAt !== null) {
      await this.repository.revokeFamily(stored.familyId, now);
      throw new ApiException(
        'REFRESH_TOKEN_REUSED',
        'Refresh token reuse was detected.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (stored.expiresAt <= now || stored.user.deletedAt !== null) {
      await this.repository.revokeFamily(stored.familyId, now);
      throw this.invalidRefreshToken();
    }

    const replacement = this.tokenService.createRefreshToken(now);
    const rotated = await this.repository.rotateRefreshToken(
      stored.id,
      {
        expiresAt: replacement.expiresAt,
        familyId: stored.familyId,
        id: replacement.id,
        tokenHash: replacement.hash,
        userAgentHash: this.tokenService.hashUserAgent(userAgent),
        userId: stored.userId,
      },
      now,
    );
    if (!rotated) {
      await this.repository.revokeFamily(stored.familyId, now);
      throw new ApiException(
        'REFRESH_TOKEN_REUSED',
        'Refresh token reuse was detected.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.createAuthResult(stored.user, replacement.plainText);
  }

  async logout(plainTextToken: string | undefined): Promise<void> {
    const parsed = plainTextToken
      ? this.tokenService.parseRefreshToken(plainTextToken)
      : null;
    if (parsed === null) {
      return;
    }
    const stored = await this.repository.findRefreshToken(parsed.id);
    if (stored && this.hashesMatch(stored.tokenHash, parsed.hash)) {
      await this.repository.revokeFamily(stored.familyId, new Date());
    }
  }

  async authenticate(accessToken: string): Promise<AuthUser> {
    try {
      const claims = await this.tokenService.verifyAccessToken(accessToken);
      const user = await this.repository.findActiveUserById(claims.sub);
      if (user === null || user.email !== claims.email) {
        throw this.invalidAccessToken();
      }
      return this.toAuthUser(user);
    } catch {
      throw this.invalidAccessToken();
    }
  }

  private async createAuthResult(
    user: UserRecord,
    refreshToken: string,
  ): Promise<AuthResult> {
    const accessToken = await this.tokenService.createAccessToken({
      email: user.email,
      sub: user.id,
    });
    return {
      refreshToken,
      response: {
        accessToken,
        expiresIn: this.config.accessTokenExpiresInSeconds,
        user: this.toAuthUser(user),
      },
    };
  }

  private toAuthUser(user: UserRecord): AuthUser {
    return {
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      isDemo: user.isDemo,
    };
  }

  private hashesMatch(stored: string, presented: string): boolean {
    const storedBuffer = Buffer.from(stored, 'hex');
    const presentedBuffer = Buffer.from(presented, 'hex');
    return (
      storedBuffer.length === presentedBuffer.length &&
      timingSafeEqual(storedBuffer, presentedBuffer)
    );
  }

  private invalidCredentials(): ApiException {
    return new ApiException(
      'INVALID_CREDENTIALS',
      'Email or password is incorrect.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidRefreshToken(): ApiException {
    return new ApiException(
      'INVALID_REFRESH_TOKEN',
      'Refresh token is invalid or expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidAccessToken(): ApiException {
    return new ApiException(
      'INVALID_ACCESS_TOKEN',
      'Access token is invalid or expired.',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
