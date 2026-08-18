import type { z } from 'zod';

export const MAX_STRUCTURED_GENERATION_SYSTEM_PROMPT_CHARACTERS = 30_000;
export const MAX_STRUCTURED_GENERATION_USER_CONTEXT_CHARACTERS = 48_000;

export type LlmProviderErrorCode =
  | 'PROVIDER_INPUT_INVALID'
  | 'PROVIDER_FIXTURE_EXHAUSTED'
  | 'PROVIDER_CONFIGURATION'
  | 'PROVIDER_AUTHENTICATION'
  | 'PROVIDER_PERMISSION_DENIED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REFUSAL'
  | 'PROVIDER_INCOMPLETE'
  | 'PROVIDER_MALFORMED_OUTPUT'
  | 'PROVIDER_RESPONSE_FAILED';

export class LlmProviderError extends Error {
  constructor(
    readonly code: LlmProviderErrorCode,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export interface StructuredGenerationInput<T> {
  readonly maxOutputTokens: number;
  readonly schema: z.ZodType<T>;
  readonly schemaName: string;
  readonly systemPrompt: string;
  readonly timeoutMs: number;
  readonly userContext: string;
}

export interface ProviderGenerationUsage {
  readonly inputTokens: number | null;
  readonly latencyMs: number;
  readonly model: string;
  readonly outputTokens: number | null;
  readonly provider: string;
  readonly providerRequestId: string | null;
}

export interface StructuredGenerationResult<T> {
  readonly usage: ProviderGenerationUsage;
  readonly value: T;
}

export interface LlmProvider {
  generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<StructuredGenerationResult<T>>;

  embedTexts(texts: readonly string[]): Promise<number[][]>;
}

export function validateStructuredGenerationInput<T>(
  input: StructuredGenerationInput<T>,
): void {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(input.schemaName)) {
    throw new LlmProviderError(
      'PROVIDER_INPUT_INVALID',
      false,
      'Structured generation schema name is invalid.',
    );
  }
  if (
    input.systemPrompt.length < 1 ||
    input.systemPrompt.length >
      MAX_STRUCTURED_GENERATION_SYSTEM_PROMPT_CHARACTERS
  ) {
    throw new LlmProviderError(
      'PROVIDER_INPUT_INVALID',
      false,
      'Structured generation system prompt is outside the allowed bounds.',
    );
  }
  if (
    input.userContext.length < 1 ||
    input.userContext.length > MAX_STRUCTURED_GENERATION_USER_CONTEXT_CHARACTERS
  ) {
    throw new LlmProviderError(
      'PROVIDER_INPUT_INVALID',
      false,
      'Structured generation user context is outside the allowed bounds.',
    );
  }
  if (
    !Number.isInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 128 ||
    input.maxOutputTokens > 8_192
  ) {
    throw new LlmProviderError(
      'PROVIDER_INPUT_INVALID',
      false,
      'Structured generation output token budget is invalid.',
    );
  }
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 1_000 ||
    input.timeoutMs > 120_000
  ) {
    throw new LlmProviderError(
      'PROVIDER_INPUT_INVALID',
      false,
      'Structured generation timeout is invalid.',
    );
  }
}
