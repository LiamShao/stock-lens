import { z } from 'zod';

export const ANALYSIS_PROCESSING_QUEUE_NAME = 'analysis';
export const ANALYSIS_PARSE_JOB_NAME = 'parse-analysis';
export const ANALYSIS_CHUNK_JOB_NAME = 'chunk-analysis';
export const ANALYSIS_CALCULATE_METRICS_JOB_NAME =
  'calculate-analysis-financial-metrics';
export const ANALYSIS_EXTRACT_JOB_NAME = 'extract-analysis';
export const ANALYSIS_JOB_MAX_ATTEMPTS = 3;
export const ANALYSIS_JOB_BACKOFF_DELAY_MS = 1_000;

export const analysisJobDataSchema = z
  .object({
    jobExecutionId: z.uuid(),
  })
  .strict();

export type AnalysisJobData = z.infer<typeof analysisJobDataSchema>;

export function createParseIdempotencyKey(
  analysisId: string,
  inputHash: string,
): string {
  return `parse:${z.uuid().parse(analysisId)}:${z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(inputHash)}:pdfjs-v1`;
}

export function createChunkIdempotencyKey(
  analysisId: string,
  inputHash: string,
): string {
  return `chunk:${z.uuid().parse(analysisId)}:${z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(inputHash)}:chars-1200-overlap-150-v1`;
}

export function createFinancialMetricsIdempotencyKey(
  analysisId: string,
  inputHash: string,
): string {
  return `metrics:${parseUuid(analysisId)}:${parseHash(inputHash)}:financial-v1`;
}

export function createExtractionIdempotencyKey(input: {
  analysisId: string;
  inputHash: string;
  promptContentSha256: string;
  promptVersionId: string;
  runtimeSha256: string;
}): string {
  return [
    'extract',
    parseUuid(input.analysisId),
    parseHash(input.inputHash),
    parseUuid(input.promptVersionId),
    parseHash(input.promptContentSha256),
    parseHash(input.runtimeSha256),
    'structured-v1',
  ].join(':');
}

export function parseExtractionIdempotencyKey(value: string): {
  analysisId: string;
  inputHash: string;
  promptContentSha256: string;
  promptVersionId: string;
  runtimeSha256: string;
} {
  const parts = value.split(':');
  if (
    parts.length !== 7 ||
    parts[0] !== 'extract' ||
    parts[6] !== 'structured-v1'
  ) {
    throw new Error('Extraction idempotency key is invalid.');
  }
  return {
    analysisId: parseUuid(parts[1] ?? ''),
    inputHash: parseHash(parts[2] ?? ''),
    promptVersionId: parseUuid(parts[3] ?? ''),
    promptContentSha256: parseHash(parts[4] ?? ''),
    runtimeSha256: parseHash(parts[5] ?? ''),
  };
}

export function createValidationIdempotencyKey(
  analysisId: string,
  extractionExecutionId: string,
): string {
  return `validate:${parseUuid(analysisId)}:${parseUuid(extractionExecutionId)}:evidence-v1`;
}

function parseUuid(value: string): string {
  return z.uuid().parse(value);
}

function parseHash(value: string): string {
  return z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(value);
}
