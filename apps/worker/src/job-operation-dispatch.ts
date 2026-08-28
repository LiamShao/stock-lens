import { JobStep } from '@prisma/client';
import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_CHUNK_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  ANALYSIS_GENERATE_VIEWS_JOB_NAME,
  ANALYSIS_PARSE_JOB_NAME,
  OBJECT_CLEANUP_JOB_NAME,
} from '@stocklens/shared';

export function isAnalysisJobStep(step: JobStep): boolean {
  return step !== JobStep.OBJECT_CLEANUP;
}

export function jobNameForManualRerun(step: JobStep): string {
  if (step === JobStep.PARSE) return ANALYSIS_PARSE_JOB_NAME;
  if (step === JobStep.CHUNK) return ANALYSIS_CHUNK_JOB_NAME;
  if (step === JobStep.CALCULATE_FINANCIAL_METRICS)
    return ANALYSIS_CALCULATE_METRICS_JOB_NAME;
  if (step === JobStep.EXTRACT) return ANALYSIS_EXTRACT_JOB_NAME;
  if (step === JobStep.GENERATE_VIEWS) return ANALYSIS_GENERATE_VIEWS_JOB_NAME;
  if (step === JobStep.OBJECT_CLEANUP) return OBJECT_CLEANUP_JOB_NAME;
  throw new Error('Job step is not eligible for manual re-run dispatch.');
}
