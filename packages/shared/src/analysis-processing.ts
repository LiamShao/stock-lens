import { z } from 'zod';

export const ANALYSIS_PROCESSING_QUEUE_NAME = 'analysis';
export const ANALYSIS_PARSE_JOB_NAME = 'parse-analysis';
export const ANALYSIS_CHUNK_JOB_NAME = 'chunk-analysis';
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
