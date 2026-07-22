import { getDemoUserConfig, LOCAL_DEMO_PASSWORD } from './demo-user.config';

describe('getDemoUserConfig', () => {
  it('normalizes the configured email and display name', () => {
    expect(
      getDemoUserConfig({
        DEMO_USER_DISPLAY_NAME: '  StockLens Demo  ',
        DEMO_USER_EMAIL: '  DEMO@EXAMPLE.COM ',
        DEMO_USER_PASSWORD: 'demo-password-123',
      }),
    ).toEqual({
      displayName: 'StockLens Demo',
      email: 'demo@example.com',
      password: 'demo-password-123',
    });
  });

  it('reports invalid keys without including configured secrets', () => {
    expect(() =>
      getDemoUserConfig({
        DEMO_USER_DISPLAY_NAME: 'StockLens Demo',
        DEMO_USER_EMAIL: 'demo@example.com',
        DEMO_USER_PASSWORD: 'too-short',
      }),
    ).toThrow('Invalid demo user configuration: DEMO_USER_PASSWORD');
  });

  it('DEMO-DEV-001 requires explicit production opt-in', () => {
    expect(() =>
      getDemoUserConfig({
        DEMO_USER_DISPLAY_NAME: 'StockLens Demo',
        DEMO_USER_EMAIL: 'demo@example.com',
        DEMO_USER_PASSWORD: 'a-unique-production-password',
        NODE_ENV: 'production',
      }),
    ).toThrow('Invalid demo user configuration: ALLOW_DEMO_USER_PROVISIONING');
  });

  it('DEMO-DEV-001 forbids the local demo password in production', () => {
    expect(() =>
      getDemoUserConfig({
        ALLOW_DEMO_USER_PROVISIONING: 'true',
        DEMO_USER_DISPLAY_NAME: 'StockLens Demo',
        DEMO_USER_EMAIL: 'demo@example.com',
        DEMO_USER_PASSWORD: LOCAL_DEMO_PASSWORD,
        NODE_ENV: 'production',
      }),
    ).toThrow('Invalid demo user configuration: DEMO_USER_PASSWORD');
  });

  it('DEMO-DEV-001 permits explicit production provisioning', () => {
    expect(
      getDemoUserConfig({
        ALLOW_DEMO_USER_PROVISIONING: 'true',
        DEMO_USER_DISPLAY_NAME: 'Production Demo',
        DEMO_USER_EMAIL: 'demo@example.com',
        DEMO_USER_PASSWORD: 'a-unique-production-password',
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ email: 'demo@example.com' });
  });
});
