import { describe, expect, it } from 'vitest';

import {
  ANALYSIS_STATUS_POLL_INTERVAL_MS,
  getAnalysisPollingInterval,
  getHistoryPollingInterval,
  MAX_ANALYSIS_STATUS_POLL_DURATION_MS,
} from './analysis-polling';

const analysis = {
  companyId: null,
  completedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  failureCode: null,
  failureMessage: null,
  id: '8d445ae8-d886-4ee3-a250-fd56cc10597b',
  status: 'PARSING' as const,
  title: '任天堂 決算分析',
  updatedAt: '2026-09-01T01:00:00.000Z',
};

describe('bounded analysis polling VIEW-SEC-009', () => {
  it('polls processing statuses every five seconds and stops at five minutes', () => {
    expect(getAnalysisPollingInterval(analysis, 1_000, 1_001)).toBe(
      ANALYSIS_STATUS_POLL_INTERVAL_MS,
    );
    expect(
      getAnalysisPollingInterval(
        analysis,
        1_000,
        1_000 + MAX_ANALYSIS_STATUS_POLL_DURATION_MS,
      ),
    ).toBe(false);
  });

  it.each(['DRAFT', 'UPLOADED', 'COMPLETED', 'FAILED_VALIDATION'] as const)(
    'does not poll terminal or user-action status %s',
    (status) => {
      expect(
        getAnalysisPollingInterval({ ...analysis, status }, 1_000, 1_001),
      ).toBe(false);
    },
  );

  it('polls history only while at least one listed analysis is processing', () => {
    expect(
      getHistoryPollingInterval(
        {
          items: [
            {
              ...analysis,
              status: 'COMPLETED',
              completedAt: analysis.updatedAt,
            },
            analysis,
          ],
          nextCursor: null,
        },
        1_000,
        1_001,
      ),
    ).toBe(ANALYSIS_STATUS_POLL_INTERVAL_MS);
    expect(
      getHistoryPollingInterval(
        {
          items: [
            {
              ...analysis,
              status: 'COMPLETED',
              completedAt: analysis.updatedAt,
            },
          ],
          nextCursor: null,
        },
        1_000,
        1_001,
      ),
    ).toBe(false);
  });
});
