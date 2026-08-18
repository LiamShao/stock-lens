import {
  financialMetricSnapshotSchema,
  type FinancialMetricKey,
} from '@stocklens/shared';

import {
  knownAnnualFinancialMetricFixture,
  missingAndAmbiguousFinancialMetricFixture,
} from './financial-metric.fixtures';
import {
  extractFinancialMetricSnapshot,
  type FinancialMetricChunkInput,
} from './financial-metric-parser';

function metric(
  snapshot: ReturnType<typeof extractFinancialMetricSnapshot>,
  key: FinancialMetricKey,
) {
  return snapshot.metrics.find(({ metric: candidate }) => candidate === key)!;
}

function chunk(
  content: string,
  overrides: Partial<FinancialMetricChunkInput> = {},
): FinancialMetricChunkInput {
  return {
    chunkId: '55555555-5555-4555-8555-555555555555',
    content,
    documentId: '66666666-6666-4666-8666-666666666666',
    documentName: 'fixture.pdf',
    pageNumber: 1,
    ...overrides,
  };
}

describe('deterministic financial metric parser', () => {
  it('EXTRACT-AC-006 extracts four P0 metrics with normalized values, sources, formulas and YoY', () => {
    const snapshot = extractFinancialMetricSnapshot(
      knownAnnualFinancialMetricFixture,
    );

    expect(financialMetricSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.schemaVersion).toBe('1.0.0');
    expect(metric(snapshot, 'REVENUE')).toMatchObject({
      comparison: {
        amountChangeYen: '2000000000',
        ratePercent: '20',
      },
      current: {
        formula: '12,000 × 1000000 JPY',
        normalizedValueYen: '12000000000',
        period: {
          duration: 'ANNUAL',
          normalizedKey: 'FY:2026-03:ANNUAL',
        },
        scope: 'CONSOLIDATED',
        source: {
          chunkId: '11111111-1111-4111-8111-111111111111',
          excerpt: '売上高 12,000 10,000 20.0%',
          pageNumber: 12,
        },
        unit: 'MILLION_JPY',
      },
      previous: { normalizedValueYen: '10000000000' },
      status: 'COMPLETE',
      unknownReasons: [],
    });
    expect(metric(snapshot, 'OPERATING_PROFIT').comparison?.ratePercent).toBe(
      '50',
    );
    expect(metric(snapshot, 'NET_INCOME').current?.normalizedValueYen).toBe(
      '900000000',
    );
    expect(metric(snapshot, 'OPERATING_CASH_FLOW')).toMatchObject({
      comparison: {
        amountChangeYen: '-500000000',
        ratePercent: '-166.67',
      },
      current: { normalizedValueYen: '-200000000' },
      previous: { normalizedValueYen: '300000000' },
      status: 'COMPLETE',
    });
  });

  it('EXTRACT-AC-006 maps values by their period even when the header is oldest first', () => {
    const snapshot = extractFinancialMetricSnapshot([
      chunk(
        [
          '2025年3月期 2026年3月期 個別（単位：億円）',
          '売上収益 10.0 12.5',
        ].join('\n'),
      ),
    ]);

    expect(metric(snapshot, 'REVENUE')).toMatchObject({
      comparison: {
        amountChangeYen: '250000000',
        ratePercent: '25',
      },
      current: {
        normalizedValueYen: '1250000000',
        period: { normalizedKey: 'FY:2026-03:ANNUAL' },
        scope: 'NON_CONSOLIDATED',
        unit: 'HUNDRED_MILLION_JPY',
      },
      previous: { normalizedValueYen: '1000000000' },
      status: 'COMPLETE',
    });
  });

  it('EXTRACT-AC-006 handles quarterly periods, loss labels and a zero previous value without division', () => {
    const snapshot = extractFinancialMetricSnapshot([
      chunk(
        [
          '2026年3月期 第2四半期 2025年3月期 第2四半期 連結 単位：百万円',
          '営業損失 120 0',
        ].join('\n'),
      ),
    ]);

    expect(metric(snapshot, 'OPERATING_PROFIT')).toMatchObject({
      comparison: {
        amountChangeYen: '-120000000',
        rateFormula: null,
        ratePercent: null,
      },
      current: {
        normalizedValueYen: '-120000000',
        period: {
          duration: 'Q2',
          normalizedKey: 'FY:2026-03:Q2',
        },
      },
      previous: { normalizedValueYen: '0' },
      status: 'PARTIAL',
      unknownReasons: ['ZERO_PREVIOUS_VALUE'],
    });
  });

  it('EXTRACT-AC-007 returns unknown instead of guessing missing and ambiguous metrics', () => {
    const snapshot = extractFinancialMetricSnapshot(
      missingAndAmbiguousFinancialMetricFixture,
    );

    expect(metric(snapshot, 'REVENUE')).toEqual({
      comparison: null,
      current: null,
      metric: 'REVENUE',
      previous: null,
      status: 'UNKNOWN',
      unknownReasons: ['AMBIGUOUS_UNIT'],
    });
    expect(metric(snapshot, 'NET_INCOME')).toMatchObject({
      current: null,
      status: 'UNKNOWN',
      unknownReasons: ['AMBIGUOUS_LABEL'],
    });
    expect(metric(snapshot, 'OPERATING_PROFIT')).toMatchObject({
      current: null,
      status: 'UNKNOWN',
      unknownReasons: ['MISSING_VALUE'],
    });
  });

  it('EXTRACT-AC-007 rejects mismatched periods and mixed scope', () => {
    const snapshot = extractFinancialMetricSnapshot([
      chunk(
        [
          '2026年3月期 2024年3月期 連結 個別 単位：百万円',
          '営業利益 △-100 80',
        ].join('\n'),
      ),
    ]);

    expect(metric(snapshot, 'OPERATING_PROFIT')).toMatchObject({
      status: 'UNKNOWN',
      unknownReasons: ['AMBIGUOUS_PERIOD', 'AMBIGUOUS_SCOPE'],
    });
  });

  it('EXTRACT-AC-007 rejects an ambiguous sign instead of silently normalizing it', () => {
    const snapshot = extractFinancialMetricSnapshot([
      chunk(
        ['2026年3月期 2025年3月期 連結 単位：百万円', '営業利益 △-100 80'].join(
          '\n',
        ),
      ),
    ]);

    expect(metric(snapshot, 'OPERATING_PROFIT')).toMatchObject({
      current: null,
      status: 'UNKNOWN',
      unknownReasons: ['AMBIGUOUS_SIGN'],
    });
  });

  it('EXTRACT-AC-007 rejects conflicting values across otherwise valid chunks', () => {
    const first = chunk(
      ['2026年3月期 2025年3月期 連結 単位：百万円', '売上高 120 100'].join(
        '\n',
      ),
    );
    const second = chunk(
      ['2026年3月期 2025年3月期 連結 単位：百万円', '売上高 121 100'].join(
        '\n',
      ),
      { chunkId: '77777777-7777-4777-8777-777777777777', pageNumber: 2 },
    );

    expect(
      metric(extractFinancialMetricSnapshot([first, second]), 'REVENUE'),
    ).toMatchObject({
      current: null,
      status: 'UNKNOWN',
      unknownReasons: ['CONFLICTING_VALUES'],
    });
  });
});
