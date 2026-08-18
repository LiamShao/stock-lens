import {
  LlmProviderError,
  type LlmProvider,
  type ProviderGenerationUsage,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
  validateStructuredGenerationInput,
} from './llm-provider';

export interface DeterministicLlmProviderOptions {
  readonly embeddingFixtures?: readonly (readonly (readonly number[])[])[];
  readonly model?: string;
  readonly structuredFixtures: readonly unknown[];
  readonly usage?: Partial<
    Pick<ProviderGenerationUsage, 'inputTokens' | 'latencyMs' | 'outputTokens'>
  >;
}

export class DeterministicLlmProvider implements LlmProvider {
  private embeddingIndex = 0;
  private structuredIndex = 0;

  constructor(private readonly options: DeterministicLlmProviderOptions) {}

  generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<StructuredGenerationResult<T>> {
    return Promise.resolve().then(() => {
      validateStructuredGenerationInput(input);
      const fixture = this.options.structuredFixtures[this.structuredIndex];
      if (fixture === undefined) {
        throw new LlmProviderError(
          'PROVIDER_FIXTURE_EXHAUSTED',
          false,
          'Deterministic structured output fixture is unavailable.',
        );
      }
      this.structuredIndex += 1;
      const parsed = input.schema.safeParse(fixture);
      if (!parsed.success) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'Deterministic structured output fixture failed schema validation.',
        );
      }
      return {
        usage: {
          inputTokens: this.options.usage?.inputTokens ?? null,
          latencyMs: this.options.usage?.latencyMs ?? 0,
          model: this.options.model ?? 'deterministic-fixture-v1',
          outputTokens: this.options.usage?.outputTokens ?? null,
          provider: 'deterministic',
          providerRequestId: null,
        },
        value: parsed.data,
      };
    });
  }

  embedTexts(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve().then(() => {
      if (texts.length === 0) return [];
      const fixture = this.options.embeddingFixtures?.[this.embeddingIndex];
      if (fixture === undefined || fixture.length !== texts.length) {
        throw new LlmProviderError(
          'PROVIDER_FIXTURE_EXHAUSTED',
          false,
          'Deterministic embedding fixture is unavailable.',
        );
      }
      this.embeddingIndex += 1;
      const dimension = fixture[0]?.length ?? 0;
      if (
        dimension === 0 ||
        fixture.some(
          (embedding) =>
            embedding.length !== dimension ||
            embedding.some((value) => !Number.isFinite(value)),
        )
      ) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'Deterministic embedding fixture is invalid.',
        );
      }
      return fixture.map((embedding) => [...embedding]);
    });
  }
}
