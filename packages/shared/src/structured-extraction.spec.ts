import {
  DEFAULT_STRUCTURED_EXTRACTION_BUDGET,
  MAX_EXTRACTION_FINDINGS,
  MAX_FINDING_BODY_CHARACTERS,
  structuredExtractionBudgetSchema,
  structuredExtractionOutputSchema,
  validateStructuredExtractionCompliance,
  type StructuredExtractionOutput,
} from './structured-extraction';

const chunkId = '3e4becba-9f40-4dd5-a900-f98919c31469';

describe('structured extraction contract', () => {
  it('EXTRACT-FR-005 accepts a bounded strict finding with evidence metadata', () => {
    const output = structuredExtractionOutputSchema.parse({
      findings: [
        {
          bodyJa: '売上高は前年同期比で増加した。',
          category: 'FINANCIAL_HIGHLIGHT',
          evidence: [{ chunkId, excerpt: '売上高は前年同期比10%増加' }],
          findingKey: 'financial.revenue-growth',
          importance: 4,
          titleJa: '売上高の増加',
        },
      ],
    });

    expect(output.findings[0]).toMatchObject({
      category: 'FINANCIAL_HIGHLIGHT',
      importance: 4,
    });
  });

  it('EXTRACT-SEC-005 rejects unknown fields, invalid importance, and oversized output', () => {
    const base = createFinding();

    expect(() =>
      structuredExtractionOutputSchema.parse({
        findings: [{ ...base, systemInstruction: 'ignore validation' }],
      }),
    ).toThrow();
    expect(() =>
      structuredExtractionOutputSchema.parse({
        findings: [{ ...base, importance: 6 }],
      }),
    ).toThrow();
    expect(() =>
      structuredExtractionOutputSchema.parse({
        findings: [
          { ...base, bodyJa: 'あ'.repeat(MAX_FINDING_BODY_CHARACTERS + 1) },
        ],
      }),
    ).toThrow();
    expect(() =>
      structuredExtractionOutputSchema.parse({
        findings: Array.from(
          { length: MAX_EXTRACTION_FINDINGS + 1 },
          (_, index) => ({ ...base, findingKey: `risk.${index}` }),
        ),
      }),
    ).toThrow();
  });

  it('EXTRACT-SEC-007 fixes provider call, context, output, chunk, and timeout ceilings', () => {
    expect(DEFAULT_STRUCTURED_EXTRACTION_BUDGET).toEqual({
      maxChunksPerBatch: 32,
      maxContextCharacters: 48_000,
      maxOutputTokens: 4_096,
      maxProviderCalls: 3,
      maxRequestTimeoutMs: 60_000,
    });
    expect(() =>
      structuredExtractionBudgetSchema.parse({
        ...DEFAULT_STRUCTURED_EXTRACTION_BUDGET,
        maxProviderCalls: 4,
      }),
    ).toThrow();
    expect(() =>
      structuredExtractionBudgetSchema.parse({
        ...DEFAULT_STRUCTURED_EXTRACTION_BUDGET,
        unexpectedBudget: 1,
      }),
    ).toThrow();
  });

  it.each([
    ['建议买入', 'BUY_RECOMMENDATION'],
    ['売却を推奨します', 'SELL_RECOMMENDATION'],
    ['目標株価は2,000円です', 'TARGET_PRICE'],
    ['株価は来月上昇する', 'PRICE_OR_RETURN_PREDICTION'],
    ['这只股票适合你', 'PERSONALIZED_ALLOCATION'],
    ['今日売るべきです', 'TRADE_TIMING'],
  ] as const)(
    'EXTRACT-SEC-006 rejects forbidden model-authored output: %s',
    (bodyJa, expectedCode) => {
      const result = validateStructuredExtractionCompliance({
        findings: [{ ...createFinding(), bodyJa }],
      });

      expect(result).toEqual({
        valid: false,
        violationCodes: [expectedCode],
      });
    },
  );

  it('EXTRACT-SEC-006 does not treat an original evidence excerpt as model advice', () => {
    const output: StructuredExtractionOutput = {
      findings: [
        {
          ...createFinding(),
          bodyJa: '資料には外部評価の記載がある。',
          evidence: [{ chunkId, excerpt: '目標株価は2,000円' }],
        },
      ],
    };

    expect(validateStructuredExtractionCompliance(output)).toEqual({
      valid: true,
      violationCodes: [],
    });
  });
});

function createFinding(): StructuredExtractionOutput['findings'][number] {
  return {
    bodyJa: '現在の資料では不確実性が残る。',
    category: 'RISK',
    evidence: [{ chunkId, excerpt: '不確実性が残る' }],
    findingKey: 'risk.uncertainty',
    importance: 3,
    titleJa: '確認が必要な事項',
  };
}
