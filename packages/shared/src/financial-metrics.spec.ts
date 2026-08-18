import { financialMetricSnapshotSchema } from './financial-metrics';

const unknownMetric = (metric: string) => ({
  comparison: null,
  current: null,
  metric,
  previous: null,
  status: 'UNKNOWN',
  unknownReasons: ['MISSING_VALUE'],
});

describe('financial metric snapshot schema', () => {
  const validSnapshot = {
    metrics: [
      unknownMetric('REVENUE'),
      unknownMetric('OPERATING_PROFIT'),
      unknownMetric('NET_INCOME'),
      unknownMetric('OPERATING_CASH_FLOW'),
    ],
    schemaVersion: '1.0.0',
  };

  it('EXTRACT-FR-006 accepts exactly one result for every P0 metric', () => {
    expect(financialMetricSnapshotSchema.parse(validSnapshot)).toEqual(
      validSnapshot,
    );
  });

  it('EXTRACT-FR-006 rejects unknown fields and duplicate metric keys', () => {
    expect(() =>
      financialMetricSnapshotSchema.parse({ ...validSnapshot, rawText: 'x' }),
    ).toThrow();
    expect(() =>
      financialMetricSnapshotSchema.parse({
        ...validSnapshot,
        metrics: [
          unknownMetric('REVENUE'),
          unknownMetric('REVENUE'),
          unknownMetric('NET_INCOME'),
          unknownMetric('OPERATING_CASH_FLOW'),
        ],
      }),
    ).toThrow();
  });
});
