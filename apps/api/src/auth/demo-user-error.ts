import { DemoUserConfigurationError } from './demo-user.config';
import {
  DeletedDemoUserError,
  DemoUserConflictError,
} from './demo-user-provisioner';

export interface DemoUserCliError {
  code: string;
  error: string;
  event: 'demo_user_provision_failed';
}

export function toDemoUserCliError(error: unknown): DemoUserCliError {
  if (error instanceof DemoUserConfigurationError) {
    return {
      code: 'DEMO_USER_CONFIG_INVALID',
      error: `Invalid demo user configuration: ${error.invalidKeys.join(', ')}`,
      event: 'demo_user_provision_failed',
    };
  }
  if (error instanceof DemoUserConflictError) {
    return {
      code: 'DEMO_USER_CONFLICT',
      error: 'The configured email cannot be used for the demo account.',
      event: 'demo_user_provision_failed',
    };
  }
  if (error instanceof DeletedDemoUserError) {
    return {
      code: 'DEMO_USER_DELETED',
      error: 'The configured demo account is unavailable.',
      event: 'demo_user_provision_failed',
    };
  }
  return {
    code: 'DEMO_USER_PROVISION_FAILED',
    error: 'Demo user provisioning failed.',
    event: 'demo_user_provision_failed',
  };
}
