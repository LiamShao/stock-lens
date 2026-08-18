import { z } from 'zod';

import { DeterministicLlmProvider } from './deterministic-llm-provider';
const outputSchema = z.object({ value: z.string() }).strict();

const input = {
  maxOutputTokens: 256,
  schema: outputSchema,
  schemaName: 'fixture_output',
  systemPrompt: 'Return the fixture.',
  timeoutMs: 5_000,
  userContext: 'Untrusted fixture context.',
};

describe('DeterministicLlmProvider', () => {
  it('EXTRACT-FR-002 returns strict parsed fixtures and content-free usage', async () => {
    const provider = new DeterministicLlmProvider({
      model: 'deterministic-test-v2',
      structuredFixtures: [{ value: 'first' }],
      usage: { inputTokens: 10, latencyMs: 2, outputTokens: 4 },
    });

    await expect(provider.generateStructured(input)).resolves.toEqual({
      usage: {
        inputTokens: 10,
        latencyMs: 2,
        model: 'deterministic-test-v2',
        outputTokens: 4,
        provider: 'deterministic',
        providerRequestId: null,
      },
      value: { value: 'first' },
    });
  });

  it('EXTRACT-FR-002 rejects malformed and exhausted fixtures with stable errors', async () => {
    const malformed = new DeterministicLlmProvider({
      structuredFixtures: [{ value: 1 }],
    });
    await expect(malformed.generateStructured(input)).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_OUTPUT',
      retryable: false,
    });

    const exhausted = new DeterministicLlmProvider({ structuredFixtures: [] });
    await expect(exhausted.generateStructured(input)).rejects.toMatchObject({
      code: 'PROVIDER_FIXTURE_EXHAUSTED',
      retryable: false,
    });
  });

  it('EXTRACT-SEC-007 enforces structured input budgets before reading a fixture', async () => {
    const provider = new DeterministicLlmProvider({
      structuredFixtures: [{ value: 'unused' }],
    });
    await expect(
      provider.generateStructured({
        ...input,
        userContext: 'x'.repeat(48_001),
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_INPUT_INVALID',
      retryable: false,
    });
  });

  it('provides deterministic embedding fixtures for the provider interface', async () => {
    const provider = new DeterministicLlmProvider({
      embeddingFixtures: [
        [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      ],
      structuredFixtures: [],
    });
    await expect(provider.embedTexts(['a', 'b'])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    await expect(provider.embedTexts(['a'])).rejects.toMatchObject({
      code: 'PROVIDER_FIXTURE_EXHAUSTED',
    });
  });
});
