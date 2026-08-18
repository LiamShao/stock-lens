import type OpenAI from 'openai';
import { z } from 'zod';

import type { OpenAiProviderConfig } from '../config';
import { OpenAiLlmProvider, classifyOpenAiError } from './openai-llm-provider';

const outputSchema = z.object({ value: z.string() }).strict();
const input = {
  maxOutputTokens: 512,
  schema: outputSchema,
  schemaName: 'stocklens_output',
  systemPrompt: 'Extract only the requested structured facts.',
  timeoutMs: 8_000,
  userContext: '<untrusted_pdf>facts</untrusted_pdf>',
};
const config: OpenAiProviderConfig = {
  apiKey: 'test-key-that-is-never-used',
  embeddingModel: null,
  model: 'configured-structured-model',
};

function mockClient(options: {
  embeddingResponse?: unknown;
  response?: unknown;
  responseError?: unknown;
}) {
  const parse = jest.fn<Promise<unknown>, [unknown, unknown]>();
  if ('responseError' in options)
    parse.mockRejectedValue(options.responseError);
  else parse.mockResolvedValue(options.response);
  const create = jest
    .fn<Promise<unknown>, [unknown]>()
    .mockResolvedValue(options.embeddingResponse);
  return {
    client: {
      embeddings: { create },
      responses: { parse },
    } as unknown as OpenAI,
    create,
    parse,
  };
}

function completedResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'resp_safe_identifier',
    incomplete_details: null,
    output: [],
    output_parsed: { value: 'parsed' },
    status: 'completed',
    usage: { input_tokens: 21, output_tokens: 7 },
    ...overrides,
  };
}

describe('OpenAiLlmProvider', () => {
  it('EXTRACT-FR-002 uses Responses parse with Zod, no tools, no storage and bounded timeout', async () => {
    const { client, parse } = mockClient({ response: completedResponse() });
    const now = jest.fn().mockReturnValueOnce(100).mockReturnValueOnce(145);
    const provider = new OpenAiLlmProvider({ client, config, now });

    await expect(provider.generateStructured(input)).resolves.toEqual({
      usage: {
        inputTokens: 21,
        latencyMs: 45,
        model: 'configured-structured-model',
        outputTokens: 7,
        provider: 'openai',
        providerRequestId: 'resp_safe_identifier',
      },
      value: { value: 'parsed' },
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          { content: input.systemPrompt, role: 'system' },
          { content: input.userContext, role: 'user' },
        ],
        max_output_tokens: 512,
        model: 'configured-structured-model',
        parallel_tool_calls: false,
        store: false,
        tool_choice: 'none',
        tools: [],
      }),
      { timeout: 8_000 },
    );
    const request = parse.mock.calls[0]?.[0] as
      { text?: { format?: unknown } } | undefined;
    expect(request?.text?.format).toMatchObject({
      name: 'stocklens_output',
      strict: true,
      type: 'json_schema',
    });
  });

  it.each([
    {
      code: 'PROVIDER_INCOMPLETE',
      response: completedResponse({
        incomplete_details: { reason: 'max_output_tokens' },
        output_parsed: null,
        status: 'incomplete',
      }),
    },
    {
      code: 'PROVIDER_REFUSAL',
      response: completedResponse({
        output: [
          {
            content: [{ refusal: 'raw refusal', type: 'refusal' }],
            type: 'message',
          },
        ],
        output_parsed: null,
      }),
    },
    {
      code: 'PROVIDER_MALFORMED_OUTPUT',
      response: completedResponse({ output_parsed: null }),
    },
    {
      code: 'PROVIDER_RESPONSE_FAILED',
      response: completedResponse({ output_parsed: null, status: 'failed' }),
    },
  ])(
    'classifies $code without exposing provider content',
    async ({ code, response }) => {
      const { client } = mockClient({ response });
      const provider = new OpenAiLlmProvider({ client, config });

      await expect(provider.generateStructured(input)).rejects.toMatchObject({
        code,
        retryable: false,
      });
      await provider.generateStructured(input).catch((error: unknown) => {
        expect(String(error)).not.toContain('raw refusal');
      });
    },
  );

  it.each([
    { code: 'PROVIDER_AUTHENTICATION', retryable: false, status: 401 },
    { code: 'PROVIDER_PERMISSION_DENIED', retryable: false, status: 403 },
    { code: 'PROVIDER_TIMEOUT', retryable: true, status: 408 },
    { code: 'PROVIDER_RATE_LIMITED', retryable: true, status: 429 },
    { code: 'PROVIDER_UNAVAILABLE', retryable: true, status: 503 },
    { code: 'PROVIDER_CONFIGURATION', retryable: false, status: 422 },
  ])('maps HTTP $status to $code', async ({ code, retryable, status }) => {
    const { client } = mockClient({
      responseError: { message: 'raw provider detail', status },
    });
    const provider = new OpenAiLlmProvider({ client, config });

    await expect(provider.generateStructured(input)).rejects.toMatchObject({
      code,
      retryable,
    });
  });

  it('supports embeddings only when an explicit model is configured', async () => {
    const { client, create } = mockClient({
      embeddingResponse: {
        data: [
          { embedding: [0.3, 0.4], index: 1 },
          { embedding: [0.1, 0.2], index: 0 },
        ],
      },
      response: completedResponse(),
    });
    const unconfigured = new OpenAiLlmProvider({ client, config });
    await expect(unconfigured.embedTexts(['a'])).rejects.toMatchObject({
      code: 'PROVIDER_CONFIGURATION',
    });

    const configured = new OpenAiLlmProvider({
      client,
      config: { ...config, embeddingModel: 'configured-embedding-model' },
    });
    await expect(configured.embedTexts(['a', 'b'])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(create).toHaveBeenCalledWith({
      input: ['a', 'b'],
      model: 'configured-embedding-model',
    });
  });
});

describe('classifyOpenAiError', () => {
  it('sanitizes unknown failures without retaining raw error details', () => {
    const classified = classifyOpenAiError(
      new Error('API key and raw provider response'),
    );
    expect(classified).toMatchObject({
      code: 'PROVIDER_RESPONSE_FAILED',
      message: 'Provider request failed.',
      retryable: false,
    });
    expect(classified).not.toHaveProperty('cause');
  });
});
