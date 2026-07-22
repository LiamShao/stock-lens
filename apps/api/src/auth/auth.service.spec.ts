import type { AuthConfig } from './auth.config';
import type {
  AuthRepository,
  RefreshTokenRecord,
  UserRecord,
} from './auth.repository';
import { AuthService } from './auth.service';
import type { TokenService } from './token.service';

const user: UserRecord = {
  deletedAt: null,
  displayName: 'Test User',
  email: 'test@example.com',
  id: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
  isDemo: false,
  passwordHash: 'stored-password-hash',
};

const config: AuthConfig = {
  accessTokenAudience: 'stocklens-web',
  accessTokenExpiresInSeconds: 900,
  accessTokenIssuer: 'stocklens-api',
  accessTokenSecret: 'test-access-token-secret-at-least-32-characters',
  corsOrigin: 'http://localhost:3000',
  isProduction: false,
  refreshTokenExpiresInDays: 30,
};

describe('AuthService', () => {
  const repository = {
    createRefreshTokenAndRecordLogin: jest.fn(),
    createUserWithRefreshToken: jest.fn(),
    findActiveUserByEmail: jest.fn(),
    findActiveUserById: jest.fn(),
    findRefreshToken: jest.fn(),
    revokeFamily: jest.fn(),
    rotateRefreshToken: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const tokenService = {
    createAccessToken: jest.fn(),
    createRefreshToken: jest.fn(),
    hashUserAgent: jest.fn(),
    parseRefreshToken: jest.fn(),
    verifyAccessToken: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AuthService(
      repository as unknown as AuthRepository,
      passwordHasher,
      tokenService as unknown as TokenService,
      config,
    );
    tokenService.createAccessToken.mockResolvedValue('access-token');
  });

  it('AUTH-AC-004 persists the login token and audit timestamp atomically', async () => {
    repository.findActiveUserByEmail.mockResolvedValue(user);
    passwordHasher.verify.mockResolvedValue(true);
    tokenService.createRefreshToken.mockReturnValue({
      expiresAt: new Date('2026-08-21T00:00:00.000Z'),
      hash: 'aa'.repeat(32),
      id: '11111111-1111-4111-8111-111111111111',
      plainText: 'refresh-token',
    });
    tokenService.hashUserAgent.mockReturnValue('user-agent-hash');

    await expect(
      service.login(
        { email: user.email, password: 'correct-password' },
        'test-agent',
      ),
    ).resolves.toMatchObject({ refreshToken: 'refresh-token' });
    expect(repository.createRefreshTokenAndRecordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
      expect.any(Date),
    );
  });

  it('AUTH-SEC-002 performs dummy password verification for an unknown email', async () => {
    repository.findActiveUserByEmail.mockResolvedValue(null);
    passwordHasher.verify.mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'unknown@example.com', password: 'incorrect-password' },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      expect.stringMatching(/^\$argon2id\$/),
      'incorrect-password',
    );
    expect(repository.createRefreshTokenAndRecordLogin).not.toHaveBeenCalled();
  });

  it('rotates a refresh token without changing its family', async () => {
    const stored = createStoredRefreshToken();
    tokenService.parseRefreshToken.mockReturnValue({
      hash: 'aa'.repeat(32),
      id: stored.id,
    });
    repository.findRefreshToken.mockResolvedValue(stored);
    tokenService.createRefreshToken.mockReturnValue({
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      hash: 'bb'.repeat(32),
      id: '33333333-3333-4333-8333-333333333333',
      plainText: 'replacement-token',
    });
    tokenService.hashUserAgent.mockReturnValue('user-agent-hash');
    repository.rotateRefreshToken.mockResolvedValue(true);

    const result = await service.refresh('refresh-token', 'test-agent');

    expect(repository.rotateRefreshToken).toHaveBeenCalledWith(
      stored.id,
      expect.objectContaining({
        familyId: stored.familyId,
        userId: user.id,
      }),
      expect.any(Date),
    );
    expect(result).toEqual({
      refreshToken: 'replacement-token',
      response: {
        accessToken: 'access-token',
        expiresIn: 900,
        user: {
          displayName: user.displayName,
          email: user.email,
          id: user.id,
          isDemo: false,
        },
      },
    });
  });

  it('revokes the token family when a consumed token is reused', async () => {
    const stored = {
      ...createStoredRefreshToken(),
      lastUsedAt: new Date('2026-07-17T00:00:00.000Z'),
      revokedAt: new Date('2026-07-17T00:00:00.000Z'),
    };
    tokenService.parseRefreshToken.mockReturnValue({
      hash: stored.tokenHash,
      id: stored.id,
    });
    repository.findRefreshToken.mockResolvedValue(stored);

    await expect(
      service.refresh('refresh-token', undefined),
    ).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSED',
    });
    expect(repository.revokeFamily).toHaveBeenCalledWith(
      stored.familyId,
      expect.any(Date),
    );
  });

  it('does not authenticate a token for a deleted or missing user', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      email: user.email,
      sub: user.id,
    });
    repository.findActiveUserById.mockResolvedValue(null);

    await expect(service.authenticate('access-token')).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN',
    });
  });
});

function createStoredRefreshToken(): RefreshTokenRecord {
  return {
    expiresAt: new Date('2099-08-01T00:00:00.000Z'),
    familyId: '22222222-2222-4222-8222-222222222222',
    id: '11111111-1111-4111-8111-111111111111',
    lastUsedAt: null,
    revokedAt: null,
    tokenHash: 'aa'.repeat(32),
    user,
    userId: user.id,
  };
}
