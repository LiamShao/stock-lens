import { JwtService } from '@nestjs/jwt';

import type { AuthConfig } from './auth.config';
import { TokenService } from './token.service';

const config: AuthConfig = {
  accessTokenAudience: 'stocklens-web',
  accessTokenExpiresInSeconds: 900,
  accessTokenIssuer: 'stocklens-api',
  accessTokenSecret: 'test-access-token-secret-at-least-32-characters',
  corsOrigin: 'http://localhost:3000',
  isProduction: false,
  refreshTokenExpiresInDays: 30,
};

describe('TokenService', () => {
  const service = new TokenService(new JwtService(), config);

  it('creates verifiable access tokens with the expected subject', async () => {
    const token = await service.createAccessToken({
      email: 'test@example.com',
      sub: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
    });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      email: 'test@example.com',
      sub: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
    });
  });

  it('creates an opaque refresh token and only exposes its hash after parsing', () => {
    const token = service.createRefreshToken(
      new Date('2026-07-17T00:00:00.000Z'),
    );
    const parsed = service.parseRefreshToken(token.plainText);

    expect(parsed).toEqual({ hash: token.hash, id: token.id });
    expect(token.hash).not.toContain(token.plainText);
    expect(token.expiresAt).toEqual(new Date('2026-08-16T00:00:00.000Z'));
  });

  it('AUTH-SEC-003 rejects a valid token signed with a non-allowlisted algorithm', async () => {
    const token = await new JwtService().signAsync(
      { email: 'test@example.com' },
      {
        algorithm: 'HS384',
        audience: config.accessTokenAudience,
        issuer: config.accessTokenIssuer,
        secret: config.accessTokenSecret,
        subject: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
      },
    );

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });
});
