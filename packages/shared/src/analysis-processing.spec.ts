import {
  ANALYSIS_CALCULATE_METRICS_JOB_NAME,
  ANALYSIS_EXTRACT_JOB_NAME,
  createExtractionIdempotencyKey,
  createFinancialMetricsIdempotencyKey,
  createValidationIdempotencyKey,
  parseExtractionIdempotencyKey,
} from './analysis-processing';

const analysisId = '11111111-1111-4111-8111-111111111111';
const promptVersionId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';

describe('structured extraction job contract', () => {
  it('EXTRACT-FR-001 fixes stable job names and versioned idempotency keys', () => {
    expect(ANALYSIS_CALCULATE_METRICS_JOB_NAME).toBe(
      'calculate-analysis-financial-metrics',
    );
    expect(ANALYSIS_EXTRACT_JOB_NAME).toBe('extract-analysis');
    expect(
      createFinancialMetricsIdempotencyKey(analysisId, 'a'.repeat(64)),
    ).toBe(`metrics:${analysisId}:${'a'.repeat(64)}:financial-v1`);
    expect(createValidationIdempotencyKey(analysisId, executionId)).toBe(
      `validate:${analysisId}:${executionId}:evidence-v1`,
    );
  });

  it('EXTRACT-FR-009 round-trips the bound input, prompt and runtime identity', () => {
    const input = {
      analysisId,
      inputHash: 'a'.repeat(64),
      promptContentSha256: 'b'.repeat(64),
      promptVersionId,
      runtimeSha256: 'c'.repeat(64),
    };

    expect(
      parseExtractionIdempotencyKey(createExtractionIdempotencyKey(input)),
    ).toEqual(input);
    expect(() => parseExtractionIdempotencyKey('extract:invalid')).toThrow(
      'Extraction idempotency key is invalid.',
    );
  });
});
