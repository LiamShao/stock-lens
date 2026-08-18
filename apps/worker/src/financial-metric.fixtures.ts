import type { FinancialMetricChunkInput } from './financial-metric-parser';

export const knownAnnualFinancialMetricFixture: readonly FinancialMetricChunkInput[] =
  [
    {
      chunkId: '11111111-1111-4111-8111-111111111111',
      content: [
        '2026年3月期 2025年3月期 連結 （単位：百万円）',
        '売上高 12,000 10,000 20.0%',
        '営業利益 1,500 1,000 50.0%',
        '親会社株主に帰属する当期純利益 900 600 50.0%',
        '営業活動によるキャッシュ・フロー △200 300',
      ].join('\n'),
      documentId: '22222222-2222-4222-8222-222222222222',
      documentName: '2026年3月期 決算短信.pdf',
      pageNumber: 12,
    },
  ];

export const missingAndAmbiguousFinancialMetricFixture: readonly FinancialMetricChunkInput[] =
  [
    {
      chunkId: '33333333-3333-4333-8333-333333333333',
      content: [
        '2026年3月期 2025年3月期 連結 （単位：百万円） （単位：千円）',
        '売上高 12,000 10,000',
        '純利益 900 600',
      ].join('\n'),
      documentId: '44444444-4444-4444-8444-444444444444',
      documentName: '単位不明資料.pdf',
      pageNumber: 3,
    },
  ];
