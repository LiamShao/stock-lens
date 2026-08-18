import { z } from 'zod';

export const FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION = '1.0.0';

export const financialMetricKeySchema = z.enum([
  'REVENUE',
  'OPERATING_PROFIT',
  'NET_INCOME',
  'OPERATING_CASH_FLOW',
]);

export type FinancialMetricKey = z.infer<typeof financialMetricKeySchema>;

export const FINANCIAL_METRIC_KEYS = financialMetricKeySchema.options;

export const financialMetricUnitSchema = z.enum([
  'JPY',
  'THOUSAND_JPY',
  'MILLION_JPY',
  'HUNDRED_MILLION_JPY',
]);

export const financialMetricScopeSchema = z.enum([
  'CONSOLIDATED',
  'NON_CONSOLIDATED',
]);

export const financialMetricPeriodSchema = z
  .object({
    duration: z.enum(['ANNUAL', 'Q1', 'Q2', 'Q3', 'INTERIM']),
    endMonth: z.number().int().min(1).max(12),
    fiscalYear: z.number().int().min(1900).max(2200),
    label: z.string().trim().min(1).max(80),
    normalizedKey: z
      .string()
      .regex(/^FY:\d{4}-(?:0[1-9]|1[0-2]):(?:ANNUAL|Q1|Q2|Q3|INTERIM)$/u),
  })
  .strict();

export const financialMetricSourceSchema = z
  .object({
    chunkId: z.uuid(),
    documentId: z.uuid(),
    documentName: z.string().trim().min(1).max(255),
    excerpt: z.string().trim().min(1).max(2_000),
    pageNumber: z.number().int().positive(),
  })
  .strict();

export const financialMetricObservationSchema = z
  .object({
    formula: z.string().trim().min(1).max(240),
    normalizedValueYen: z.string().regex(/^-?(?:0|[1-9]\d*)$/u),
    period: financialMetricPeriodSchema,
    rawUnit: z.string().trim().min(1).max(20),
    rawValue: z.string().trim().min(1).max(80),
    scope: financialMetricScopeSchema,
    source: financialMetricSourceSchema,
    unit: financialMetricUnitSchema,
  })
  .strict();

export const financialMetricComparisonSchema = z
  .object({
    amountChangeYen: z.string().regex(/^-?(?:0|[1-9]\d*)$/u),
    amountFormula: z.string().trim().min(1).max(240),
    rateFormula: z.string().trim().min(1).max(240).nullable(),
    ratePercent: z
      .string()
      .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u)
      .nullable(),
  })
  .strict();

export const financialMetricUnknownReasonSchema = z.enum([
  'MISSING_VALUE',
  'AMBIGUOUS_LABEL',
  'AMBIGUOUS_UNIT',
  'AMBIGUOUS_PERIOD',
  'AMBIGUOUS_SCOPE',
  'AMBIGUOUS_SIGN',
  'CONFLICTING_VALUES',
  'ZERO_PREVIOUS_VALUE',
]);

export const financialMetricResultSchema = z
  .object({
    comparison: financialMetricComparisonSchema.nullable(),
    current: financialMetricObservationSchema.nullable(),
    metric: financialMetricKeySchema,
    previous: financialMetricObservationSchema.nullable(),
    status: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN']),
    unknownReasons: z.array(financialMetricUnknownReasonSchema).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === 'COMPLETE' &&
      (value.current === null ||
        value.previous === null ||
        value.comparison === null ||
        value.comparison.ratePercent === null ||
        value.unknownReasons.length > 0)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A complete metric requires both observations and a full comparison.',
      });
    }
    if (
      value.status === 'UNKNOWN' &&
      (value.current !== null ||
        value.previous !== null ||
        value.comparison !== null ||
        value.unknownReasons.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'An unknown metric must contain only explicit unknown reasons.',
      });
    }
    if (
      value.status === 'PARTIAL' &&
      (value.current === null || value.unknownReasons.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A partial metric requires a current observation and an unknown reason.',
      });
    }
  });

export const financialMetricSnapshotSchema = z
  .object({
    metrics: z.array(financialMetricResultSchema).length(4),
    schemaVersion: z.literal(FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION),
  })
  .strict()
  .superRefine((value, context) => {
    const actual = new Set(value.metrics.map(({ metric }) => metric));
    for (const expected of FINANCIAL_METRIC_KEYS) {
      if (!actual.has(expected)) {
        context.addIssue({
          code: 'custom',
          message: `Missing financial metric: ${expected}.`,
          path: ['metrics'],
        });
      }
    }
  });

export type FinancialMetricSnapshot = z.infer<
  typeof financialMetricSnapshotSchema
>;
export type FinancialMetricResult = z.infer<typeof financialMetricResultSchema>;
export type FinancialMetricObservation = z.infer<
  typeof financialMetricObservationSchema
>;
export type FinancialMetricPeriod = z.infer<typeof financialMetricPeriodSchema>;
export type FinancialMetricUnknownReason = z.infer<
  typeof financialMetricUnknownReasonSchema
>;
