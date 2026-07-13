import { z } from 'zod';

export const analysisStatusSchema = z.enum([
  'UPLOADED',
  'PARSING',
  'CHUNKING',
  'EMBEDDING',
  'EXTRACTING',
  'VALIDATING',
  'COMPLETED',
  'FAILED_PARSING',
  'FAILED_CHUNKING',
  'FAILED_EMBEDDING',
  'FAILED_EXTRACTION',
  'FAILED_VALIDATION',
]);

export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
