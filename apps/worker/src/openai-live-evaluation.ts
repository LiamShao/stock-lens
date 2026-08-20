import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { getOpenAiProviderConfig } from './config';
import { loadLocalEnvironment } from './environment';
import { LlmProviderError } from './ai/llm-provider';
import { evaluateOpenAiStructuredExtraction } from './ai/openai-live-evaluation';
import { OpenAiLlmProvider } from './ai/openai-llm-provider';
import { loadPromptAsset, PromptAssetError } from './prompt-asset';

loadLocalEnvironment();

async function main(): Promise<void> {
  if (process.env.ALLOW_OPENAI_LIVE_EVALUATION !== 'true') {
    throw new LiveEvaluationError(
      'OPENAI_LIVE_EVALUATION_NOT_ALLOWED',
      'Live evaluation requires explicit opt-in.',
    );
  }
  const config = getOpenAiProviderConfig();
  const prompt = await loadPromptAsset(resolvePromptManifest(process.cwd()));
  const report = await evaluateOpenAiStructuredExtraction({
    model: config.model,
    prompt,
    provider: new OpenAiLlmProvider({ config }),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== 'PASSED') process.exitCode = 1;
}

class LiveEvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LiveEvaluationError';
  }
}

function resolvePromptManifest(cwd: string): string {
  const candidates = [
    resolve(cwd, 'prompts/structured-extraction/v1.json'),
    resolve(cwd, '../../prompts/structured-extraction/v1.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path === undefined) {
    throw new LiveEvaluationError(
      'OPENAI_LIVE_EVALUATION_PROMPT_NOT_FOUND',
      'Versioned prompt asset was not found.',
    );
  }
  return path;
}

void main().catch((error: unknown) => {
  const failure = sanitizeFailure(error);
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
});

function sanitizeFailure(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  status: 'FAILED';
} {
  if (error instanceof LlmProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      status: 'FAILED',
    };
  }
  if (
    error instanceof LiveEvaluationError ||
    error instanceof PromptAssetError
  ) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      status: 'FAILED',
    };
  }
  return {
    code: 'OPENAI_LIVE_EVALUATION_FAILED',
    message: 'OpenAI live evaluation failed.',
    retryable: false,
    status: 'FAILED',
  };
}
