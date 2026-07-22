import { DemoUserConfigurationError } from './demo-user.config';
import { toDemoUserCliError } from './demo-user-error';

describe('toDemoUserCliError', () => {
  it('DEMO-SEC-004 reports invalid keys without values', () => {
    expect(
      toDemoUserCliError(
        new DemoUserConfigurationError(['DEMO_USER_PASSWORD']),
      ),
    ).toMatchObject({
      code: 'DEMO_USER_CONFIG_INVALID',
      error: 'Invalid demo user configuration: DEMO_USER_PASSWORD',
    });
  });

  it('DEMO-DEV-004 hides unknown driver and runtime details', () => {
    const output = toDemoUserCliError(
      new Error('postgresql://user:secret@internal-host/database'),
    );

    expect(output).toEqual({
      code: 'DEMO_USER_PROVISION_FAILED',
      error: 'Demo user provisioning failed.',
      event: 'demo_user_provision_failed',
    });
    expect(JSON.stringify(output)).not.toContain('secret');
    expect(JSON.stringify(output)).not.toContain('internal-host');
  });
});
