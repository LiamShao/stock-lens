import {
  getPromptActivationConfig,
  PromptActivationConfigError,
} from './prompt-activation.config';

describe('prompt activation config (EXTRACT-FR-004)', () => {
  it('requires an explicit enable flag and operator identity', () => {
    expect(
      captureConfigError(() =>
        getPromptActivationConfig('release-bot', {
          ALLOW_PROMPT_ACTIVATION: 'false',
        }),
      ).code,
    ).toBe('PROMPT_ACTIVATION_DISABLED');
    expect(
      captureConfigError(() =>
        getPromptActivationConfig(null, {
          ALLOW_PROMPT_ACTIVATION: 'true',
        }),
      ).code,
    ).toBe('PROMPT_ACTIVATION_INPUT_INVALID');
    expect(
      getPromptActivationConfig('release-bot', {
        ALLOW_PROMPT_ACTIVATION: 'true',
      }),
    ).toEqual({ enabled: true, operatorId: 'release-bot' });
  });
});

function captureConfigError(
  action: () => unknown,
): PromptActivationConfigError {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof PromptActivationConfigError) return error;
    throw error;
  }
  throw new Error('Expected prompt activation configuration to fail.');
}
