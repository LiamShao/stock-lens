import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { ZodError } from 'zod';

import type { OpenAiProviderConfig } from '../config';
import {
  LlmProviderError,
  type LlmProvider,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
  validateStructuredGenerationInput,
} from './llm-provider';

export interface OpenAiLlmProviderOptions {
  readonly client?: OpenAI;
  readonly config: OpenAiProviderConfig;
  readonly now?: () => number;
}

export class OpenAiLlmProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly now: () => number;

  constructor(private readonly options: OpenAiLlmProviderOptions) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.config.apiKey,
        maxRetries: 0,
      });
    this.now = options.now ?? Date.now;
  }

  async generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<StructuredGenerationResult<T>> {
    validateStructuredGenerationInput(input);
    const startedAt = this.now();
    try {
      const response = await this.client.responses.parse(
        {
          input: [
            { content: input.systemPrompt, role: 'system' },
            { content: input.userContext, role: 'user' },
          ],
          max_output_tokens: input.maxOutputTokens,
          model: this.options.config.model,
          parallel_tool_calls: false,
          store: false,
          text: {
            format: zodTextFormat(input.schema, input.schemaName),
          },
          tool_choice: 'none',
          tools: [],
        },
        { timeout: input.timeoutMs },
      );
      if (response.status === 'incomplete') {
        throw new LlmProviderError(
          'PROVIDER_INCOMPLETE',
          false,
          response.incomplete_details?.reason === 'max_output_tokens'
            ? 'Provider response exceeded the configured output limit.'
            : 'Provider response was incomplete.',
        );
      }
      if (containsRefusal(response.output)) {
        throw new LlmProviderError(
          'PROVIDER_REFUSAL',
          false,
          'Provider refused structured generation.',
        );
      }
      if (response.status !== 'completed') {
        throw new LlmProviderError(
          'PROVIDER_RESPONSE_FAILED',
          false,
          'Provider did not complete structured generation.',
        );
      }
      if (response.output_parsed === null) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'Provider returned no parsed structured output.',
        );
      }
      const parsed = input.schema.safeParse(response.output_parsed);
      if (!parsed.success) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'Provider structured output failed application schema validation.',
        );
      }
      return {
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          latencyMs: Math.max(0, Math.round(this.now() - startedAt)),
          model: this.options.config.model,
          outputTokens: response.usage?.output_tokens ?? null,
          provider: 'openai',
          providerRequestId: response.id,
        },
        value: parsed.data,
      };
    } catch (error) {
      throw classifyOpenAiError(error);
    }
  }

  async embedTexts(texts: readonly string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((text) => text.trim() === '')) {
      throw new LlmProviderError(
        'PROVIDER_INPUT_INVALID',
        false,
        'Embedding input must not contain empty text.',
      );
    }
    const model = this.options.config.embeddingModel;
    if (model === null) {
      throw new LlmProviderError(
        'PROVIDER_CONFIGURATION',
        false,
        'Embedding model is not configured.',
      );
    }
    try {
      const response = await this.client.embeddings.create({
        input: [...texts],
        model,
      });
      const ordered = [...response.data].sort(
        (left, right) => left.index - right.index,
      );
      if (
        ordered.length !== texts.length ||
        ordered.some(
          (item, index) =>
            item.index !== index ||
            item.embedding.length === 0 ||
            item.embedding.some((value) => !Number.isFinite(value)),
        )
      ) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'Provider returned invalid embeddings.',
        );
      }
      return ordered.map(({ embedding }) => embedding);
    } catch (error) {
      throw classifyOpenAiError(error);
    }
  }
}

function containsRefusal(output: readonly unknown[]): boolean {
  return output.some((item) => {
    if (
      !isRecord(item) ||
      item.type !== 'message' ||
      !Array.isArray(item.content)
    ) {
      return false;
    }
    return item.content.some(
      (content) => isRecord(content) && content.type === 'refusal',
    );
  });
}

export function classifyOpenAiError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) return error;
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    readErrorName(error) === 'APIConnectionTimeoutError'
  ) {
    return new LlmProviderError(
      'PROVIDER_TIMEOUT',
      true,
      'Provider request timed out.',
    );
  }
  if (
    error instanceof OpenAI.APIConnectionError ||
    readErrorName(error) === 'APIConnectionError'
  ) {
    return new LlmProviderError(
      'PROVIDER_UNAVAILABLE',
      true,
      'Provider connection was unavailable.',
    );
  }
  if (readErrorName(error) === 'LengthFinishReasonError') {
    return new LlmProviderError(
      'PROVIDER_INCOMPLETE',
      false,
      'Provider response exceeded the configured output limit.',
    );
  }
  if (readErrorName(error) === 'ContentFilterFinishReasonError') {
    return new LlmProviderError(
      'PROVIDER_REFUSAL',
      false,
      'Provider refused structured generation.',
    );
  }
  if (error instanceof ZodError) {
    return new LlmProviderError(
      'PROVIDER_MALFORMED_OUTPUT',
      false,
      'Provider structured output failed application schema validation.',
    );
  }

  const status = readStatus(error);
  if (status === 401) {
    return new LlmProviderError(
      'PROVIDER_AUTHENTICATION',
      false,
      'Provider authentication failed.',
    );
  }
  if (status === 403) {
    return new LlmProviderError(
      'PROVIDER_PERMISSION_DENIED',
      false,
      'Provider permission was denied.',
    );
  }
  if (status === 408) {
    return new LlmProviderError(
      'PROVIDER_TIMEOUT',
      true,
      'Provider request timed out.',
    );
  }
  if (status === 429) {
    return new LlmProviderError(
      'PROVIDER_RATE_LIMITED',
      true,
      'Provider rate limit was reached.',
    );
  }
  if (status !== null && status >= 500) {
    return new LlmProviderError(
      'PROVIDER_UNAVAILABLE',
      true,
      'Provider service was unavailable.',
    );
  }
  if (status !== null && status >= 400) {
    return new LlmProviderError(
      'PROVIDER_CONFIGURATION',
      false,
      'Provider rejected the configured request.',
    );
  }
  return new LlmProviderError(
    'PROVIDER_RESPONSE_FAILED',
    false,
    'Provider request failed.',
  );
}

function readStatus(error: unknown): number | null {
  if (!isRecord(error) || typeof error.status !== 'number') return null;
  return error.status;
}

function readErrorName(error: unknown): string | null {
  if (!isRecord(error) || typeof error.name !== 'string') return null;
  return error.name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
