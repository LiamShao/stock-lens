export interface JobOperatorConfig {
  enabled: boolean;
  operatorSecret: string;
  production: boolean;
}

export function getJobOperatorConfig(
  environment: NodeJS.ProcessEnv = process.env,
): JobOperatorConfig {
  const production = environment.NODE_ENV === 'production';
  const enabled = environment.ALLOW_JOB_RERUN === 'true';
  const operatorSecret = environment.JOB_OPERATOR_SECRET ?? '';
  if (!enabled) throw new Error('JOB_RERUN_DISABLED');
  if (
    operatorSecret.length < 32 ||
    (production && operatorSecret === 'stocklens-local-job-operator-secret')
  ) {
    throw new Error('JOB_OPERATOR_CONFIGURATION_INVALID');
  }
  return { enabled, operatorSecret, production };
}
