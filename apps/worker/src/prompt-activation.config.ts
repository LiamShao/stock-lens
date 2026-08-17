export interface PromptActivationConfig {
  enabled: true;
  operatorId: string;
}

export function getPromptActivationConfig(
  operatorId: string | null,
  environment: NodeJS.ProcessEnv = process.env,
): PromptActivationConfig {
  if (environment.ALLOW_PROMPT_ACTIVATION !== 'true') {
    throw new PromptActivationConfigError(
      'PROMPT_ACTIVATION_DISABLED',
      'Prompt activation is disabled.',
    );
  }
  if (
    operatorId === null ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,127}$/.test(operatorId)
  ) {
    throw new PromptActivationConfigError(
      'PROMPT_ACTIVATION_INPUT_INVALID',
      'A valid operator identifier is required.',
    );
  }
  return { enabled: true, operatorId };
}

export class PromptActivationConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PromptActivationConfigError';
  }
}
