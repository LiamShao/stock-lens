import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisViewsGenerationOutputSchema,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

const SECTION_TITLES: Readonly<Record<string, string>> = {
  BUSINESS_OVERVIEW: '事業概要',
  BUSINESS_UNDERSTANDABILITY: '事業の理解しやすさ',
  CAPITAL_ALLOCATION: '資本配分',
  CASH_GENERATION: 'キャッシュ創出力',
  COMPETITIVE_ADVANTAGE: '競争優位性',
  FINANCIAL_HIGHLIGHTS: '財務ハイライト',
  HOW_THE_COMPANY_MAKES_MONEY: '会社の稼ぎ方',
  LONG_TERM_RISKS: '長期リスク',
  MANAGEMENT_GUIDANCE: '経営方針',
  MANAGEMENT_INCENTIVES: '経営陣のインセンティブ',
  MISSING_INFORMATION: '不足している情報',
  POSITIVE_FINDINGS: 'ポジティブな所見',
  POSITIVES: '良い変化',
  RECENT_CHANGES: '最近の変化',
  RISKS: 'リスク',
  SOURCES: '参照資料',
  UNCERTAINTIES: '不確実性',
  WATCH_ITEMS: '今後の確認事項',
};

export function createAnalysisViewsOutput(
  evidenceId: string,
): AnalysisViewsGenerationOutput {
  return analysisViewsGenerationOutputSchema.parse({
    analystView: createView(
      [
        'BUSINESS_OVERVIEW',
        'FINANCIAL_HIGHLIGHTS',
        'MANAGEMENT_GUIDANCE',
        'POSITIVE_FINDINGS',
        'RISKS',
        'UNCERTAINTIES',
        'WATCH_ITEMS',
        'SOURCES',
      ],
      evidenceId,
    ),
    buffettMunger: createView(
      [
        'BUSINESS_UNDERSTANDABILITY',
        'COMPETITIVE_ADVANTAGE',
        'CASH_GENERATION',
        'CAPITAL_ALLOCATION',
        'MANAGEMENT_INCENTIVES',
        'LONG_TERM_RISKS',
        'MISSING_INFORMATION',
      ],
      evidenceId,
    ),
    justTellMe: createView(
      [
        'HOW_THE_COMPANY_MAKES_MONEY',
        'RECENT_CHANGES',
        'POSITIVES',
        'RISKS',
        'WATCH_ITEMS',
        'MISSING_INFORMATION',
      ],
      evidenceId,
    ),
  });
}

function createView(sectionKeys: readonly string[], evidenceId: string) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => {
      const isMissingInformation = key === 'MISSING_INFORMATION';
      return {
        blocks: [
          {
            evidenceIds: isMissingInformation ? [] : [evidenceId],
            isMissingInformation,
            key: `e2e-block-${index + 1}`,
            text: isMissingInformation
              ? '現在の資料だけでは海外事業の詳細を判断できません。'
              : `${SECTION_TITLES[key]}について、現在の資料から確認できる内容です。`,
          },
        ],
        key,
        title: SECTION_TITLES[key],
      };
    }),
  };
}
