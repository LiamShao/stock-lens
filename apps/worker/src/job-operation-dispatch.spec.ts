import { JobStep } from '@prisma/client';

import {
  isAnalysisJobStep,
  jobNameForManualRerun,
} from './job-operation-dispatch';

describe('manual re-run dispatch (EXTRACT-Q-008)', () => {
  it.each([
    [JobStep.PARSE, 'parse-analysis'],
    [JobStep.CHUNK, 'chunk-analysis'],
    [
      JobStep.CALCULATE_FINANCIAL_METRICS,
      'calculate-analysis-financial-metrics',
    ],
    [JobStep.EXTRACT, 'extract-analysis'],
  ])(
    'routes %s to the analysis queue with the stable job name',
    (step, name) => {
      expect(isAnalysisJobStep(step)).toBe(true);
      expect(jobNameForManualRerun(step)).toBe(name);
    },
  );

  it('keeps cleanup on its dedicated queue and rejects VALIDATE', () => {
    expect(isAnalysisJobStep(JobStep.OBJECT_CLEANUP)).toBe(false);
    expect(jobNameForManualRerun(JobStep.OBJECT_CLEANUP)).toBe('delete-object');
    expect(() => jobNameForManualRerun(JobStep.VALIDATE)).toThrow(
      'not eligible',
    );
  });
});
