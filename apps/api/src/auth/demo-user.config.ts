import { z } from 'zod';

export const LOCAL_DEMO_PASSWORD = 'stocklens-demo-password';

const demoUserEnvironmentSchema = z
  .object({
    ALLOW_DEMO_USER_PROVISIONING: z.enum(['true', 'false']).default('false'),
    DEMO_USER_DISPLAY_NAME: z.string().trim().min(1).max(80),
    DEMO_USER_EMAIL: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    DEMO_USER_PASSWORD: z.string().min(12).max(128),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === 'production' &&
      value.ALLOW_DEMO_USER_PROVISIONING !== 'true'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Production demo provisioning requires explicit opt-in.',
        path: ['ALLOW_DEMO_USER_PROVISIONING'],
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      value.DEMO_USER_PASSWORD === LOCAL_DEMO_PASSWORD
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The local demo password is forbidden in production.',
        path: ['DEMO_USER_PASSWORD'],
      });
    }
  });

export class DemoUserConfigurationError extends Error {
  constructor(readonly invalidKeys: string[]) {
    super(`Invalid demo user configuration: ${invalidKeys.join(', ')}`);
    this.name = 'DemoUserConfigurationError';
  }
}

export interface DemoUserConfig {
  displayName: string;
  email: string;
  password: string;
}

export function getDemoUserConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DemoUserConfig {
  const result = demoUserEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const invalidKeys = [
      ...new Set(
        result.error.issues.map((issue) => issue.path.join('.') || 'unknown'),
      ),
    ].join(', ');
    throw new DemoUserConfigurationError(invalidKeys.split(', '));
  }

  return {
    displayName: result.data.DEMO_USER_DISPLAY_NAME,
    email: result.data.DEMO_USER_EMAIL,
    password: result.data.DEMO_USER_PASSWORD,
  };
}
