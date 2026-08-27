import { randomUUID } from 'node:crypto';

import { analysisViewsGenerationOutputSchema } from '@stocklens/shared';

import type { AnalysisViewsSource } from './ai/analysis-views-orchestrator';
import {
  AnalysisViewsCitationError,
  validateAnalysisViewsCitations,
} from './analysis-views-citation-validator';

describe('VIEW-FR-007 analysis view citation validation', () => {
  it('accepts only Evidence IDs present in the exact finding-linked input', () => {
    const evidenceId = randomUUID();
    const source = createSource(evidenceId);
    const output = createOutput(evidenceId);

    expect(validateAnalysisViewsCitations(output, source)).toEqual(output);

    const unknownId = randomUUID();
    const invalid = createOutput(unknownId);
    const validateUnknown = () =>
      validateAnalysisViewsCitations(invalid, source);
    expect(validateUnknown).toThrow(AnalysisViewsCitationError);
    try {
      validateUnknown();
    } catch (error: unknown) {
      if (!(error instanceof AnalysisViewsCitationError)) throw error;
      expect(error.code).toBe('VIEW_CITATION_EVIDENCE_INVALID');
    }
  });
});

function createSource(evidenceId: string): AnalysisViewsSource {
  return {
    analysisId: randomUUID(),
    analysisTitle: '分析',
    companyNameJa: 'テスト株式会社',
    financialMetrics: {
      metrics: [
        'REVENUE',
        'OPERATING_PROFIT',
        'NET_INCOME',
        'OPERATING_CASH_FLOW',
      ].map((metric) => ({
        comparison: null,
        current: null,
        metric,
        previous: null,
        status: 'UNKNOWN',
        unknownReasons: ['MISSING_VALUE'],
      })) as AnalysisViewsSource['financialMetrics']['metrics'],
      schemaVersion: '1.0.0',
    },
    findings: [
      {
        body: '売上高が増加した。',
        category: 'FINANCIAL_HIGHLIGHT',
        evidences: [
          {
            chunkId: randomUUID(),
            documentId: randomUUID(),
            documentName: 'results.pdf',
            excerpt: '売上高が増加した',
            id: evidenceId,
            pageNumber: 1,
          },
        ],
        findingKey: 'financial.revenue',
        id: randomUUID(),
        importance: 4,
        status: 'SUPPORTED',
        title: '売上高',
      },
    ],
  };
}

function createOutput(evidenceId: string) {
  const view = (keys: readonly string[]) => ({
    schemaVersion: '1.0.0',
    sections: keys.map((key) => ({
      blocks: [
        {
          evidenceIds: [evidenceId],
          isMissingInformation: false,
          key: `${key.toLowerCase()}.fact`,
          text: '資料に基づく事実です。',
        },
      ],
      key,
      title: '概要',
    })),
  });
  return analysisViewsGenerationOutputSchema.parse({
    analystView: view([
      'BUSINESS_OVERVIEW',
      'FINANCIAL_HIGHLIGHTS',
      'MANAGEMENT_GUIDANCE',
      'POSITIVE_FINDINGS',
      'RISKS',
      'UNCERTAINTIES',
      'WATCH_ITEMS',
      'SOURCES',
    ]),
    buffettMunger: view([
      'BUSINESS_UNDERSTANDABILITY',
      'COMPETITIVE_ADVANTAGE',
      'CASH_GENERATION',
      'CAPITAL_ALLOCATION',
      'MANAGEMENT_INCENTIVES',
      'LONG_TERM_RISKS',
      'MISSING_INFORMATION',
    ]),
    justTellMe: view([
      'HOW_THE_COMPANY_MAKES_MONEY',
      'RECENT_CHANGES',
      'POSITIVES',
      'RISKS',
      'WATCH_ITEMS',
      'MISSING_INFORMATION',
    ]),
  });
}
