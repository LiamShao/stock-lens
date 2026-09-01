import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateOpenAiAnalysisViews } from './ai/analysis-views-live-evaluation';
import { LlmProviderError } from './ai/llm-provider';
import { OpenAiLlmProvider } from './ai/openai-llm-provider';
import { getOpenAiProviderConfig } from './config';
import { loadLocalEnvironment } from './environment';
import { loadPromptAsset, PromptAssetError } from './prompt-asset';

loadLocalEnvironment();

async function main(): Promise<void> {
  if (process.env.ALLOW_OPENAI_LIVE_EVALUATION !== 'true') {
    throw new AnalysisViewsLiveEvaluationError(
      'OPENAI_ANALYSIS_VIEWS_LIVE_EVALUATION_NOT_ALLOWED',
      'Analysis views live evaluation requires explicit opt-in.',
    );
  }
  const config = getOpenAiProviderConfig();
  const prompt = await loadPromptAsset(resolvePromptManifest(process.cwd()));
  const report = await evaluateOpenAiAnalysisViews({
    model: config.model,
    prompt,
    provider: new OpenAiLlmProvider({ config }),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== 'PASSED') process.exitCode = 1;
}

class AnalysisViewsLiveEvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisViewsLiveEvaluationError';
  }
}

function resolvePromptManifest(cwd: string): string {
  const candidates = [
    resolve(cwd, 'prompts/analysis-views/v1.json'),
    resolve(cwd, '../../prompts/analysis-views/v1.json'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path === undefined) {
    throw new AnalysisViewsLiveEvaluationError(
      'OPENAI_ANALYSIS_VIEWS_LIVE_EVALUATION_PROMPT_NOT_FOUND',
      'Versioned analysis views prompt asset was not found.',
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
    error instanceof AnalysisViewsLiveEvaluationError ||
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
    code: 'OPENAI_ANALYSIS_VIEWS_LIVE_EVALUATION_FAILED',
    message: 'OpenAI analysis views live evaluation failed.',
    retryable: false,
    status: 'FAILED',
  };
}
