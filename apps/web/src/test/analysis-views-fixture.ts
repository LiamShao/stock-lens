import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisViewsResourceSchema,
  type AnalysisViewsResource,
} from '@stocklens/shared';

const EVIDENCE_ID = '7485d080-51e0-446f-a6aa-5e707691d023';

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

export function createAnalysisViewsFixture(): AnalysisViewsResource {
  return analysisViewsResourceSchema.parse({
    analysisId: '8d445ae8-d886-4ee3-a250-fd56cc10597b',
    completedAt: '2026-09-01T02:00:00.000Z',
    evidences: [
      {
        chunkId: 'a82e5bbc-6941-4a41-b420-f3e403cdcb9c',
        documentId: '8fcbed70-7f45-42bb-a83c-1ee32de7933e',
        documentName: '2026年3月期 決算説明資料.pdf',
        excerpt:
          '<script>alert("ignored")</script> 売上高は前年同期比で増加しました。',
        id: EVIDENCE_ID,
        pageNumber: 12,
      },
    ],
    status: 'COMPLETED',
    views: {
      analyst: createView([
        'BUSINESS_OVERVIEW',
        'FINANCIAL_HIGHLIGHTS',
        'MANAGEMENT_GUIDANCE',
        'POSITIVE_FINDINGS',
        'RISKS',
        'UNCERTAINTIES',
        'WATCH_ITEMS',
        'SOURCES',
      ]),
      buffettMunger: createView([
        'BUSINESS_UNDERSTANDABILITY',
        'COMPETITIVE_ADVANTAGE',
        'CASH_GENERATION',
        'CAPITAL_ALLOCATION',
        'MANAGEMENT_INCENTIVES',
        'LONG_TERM_RISKS',
        'MISSING_INFORMATION',
      ]),
      justTellMe: createView([
        'HOW_THE_COMPANY_MAKES_MONEY',
        'RECENT_CHANGES',
        'POSITIVES',
        'RISKS',
        'WATCH_ITEMS',
        'MISSING_INFORMATION',
      ]),
    },
  });
}

function createView(sectionKeys: readonly string[]) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((sectionKey, index) => {
      const isMissingInformation = sectionKey === 'MISSING_INFORMATION';
      return {
        blocks: [
          {
            evidenceIds: isMissingInformation ? [] : [EVIDENCE_ID],
            isMissingInformation,
            key: `block-${index + 1}`,
            text: isMissingInformation
              ? '現在の資料だけでは海外事業の詳細を判断できません。'
              : `${SECTION_TITLES[sectionKey]}について、現在の資料から確認できる内容です。`,
          },
        ],
        key: sectionKey,
        title: SECTION_TITLES[sectionKey],
      };
    }),
  };
}
