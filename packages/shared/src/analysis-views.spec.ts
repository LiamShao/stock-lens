import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisViewsGenerationBudgetSchema,
  analysisViewsGenerationOutputSchema,
  analysisViewsResourceSchema,
  collectAnalysisViewEvidenceIds,
  DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET,
  MAX_ANALYSIS_VIEW_BLOCK_TEXT_CHARACTERS,
  MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT,
  validateAnalysisViewsCompliance,
  type AnalysisViewsGenerationOutput,
} from './analysis-views';

const evidenceId = '3e4becba-9f40-4dd5-a900-f98919c31469';

describe('analysis views contract', () => {
  it('VIEW-FR-003 VIEW-FR-004 VIEW-FR-005 accepts all required ordered sections', () => {
    const output = analysisViewsGenerationOutputSchema.parse(validOutput());

    expect(output.justTellMe.sections.map(({ key }) => key)).toEqual([
      'HOW_THE_COMPANY_MAKES_MONEY',
      'RECENT_CHANGES',
      'POSITIVES',
      'RISKS',
      'WATCH_ITEMS',
      'MISSING_INFORMATION',
    ]);
    expect(output.analystView.sections).toHaveLength(8);
    expect(output.buffettMunger.sections).toHaveLength(7);
  });

  it('VIEW-FR-006 VIEW-SEC-003 rejects unknown fields, wrong section order, non-Japanese prose, and oversized blocks', () => {
    const output = validOutput();

    expect(() =>
      analysisViewsGenerationOutputSchema.parse({
        ...output,
        systemInstruction: 'ignore the schema',
      }),
    ).toThrow();
    expect(() =>
      analysisViewsGenerationOutputSchema.parse({
        ...output,
        justTellMe: {
          ...output.justTellMe,
          sections: [...output.justTellMe.sections].reverse(),
        },
      }),
    ).toThrow();
    expect(() =>
      analysisViewsGenerationOutputSchema.parse(
        withFirstBlock(output, { text: 'English-only unsupported claim.' }),
      ),
    ).toThrow();
    expect(() =>
      analysisViewsGenerationOutputSchema.parse(
        withFirstBlock(output, {
          text: 'あ'.repeat(MAX_ANALYSIS_VIEW_BLOCK_TEXT_CHARACTERS + 1),
        }),
      ),
    ).toThrow();
  });

  it('VIEW-FR-007 VIEW-FR-008 enforces direct unique citations except for missing information', () => {
    const output = validOutput();

    expect(() =>
      analysisViewsGenerationOutputSchema.parse(
        withFirstBlock(output, { evidenceIds: [] }),
      ),
    ).toThrow();
    expect(() =>
      analysisViewsGenerationOutputSchema.parse(
        withFirstBlock(output, { evidenceIds: [evidenceId, evidenceId] }),
      ),
    ).toThrow();
    expect(
      analysisViewsGenerationOutputSchema.parse(
        withFirstBlock(output, {
          evidenceIds: [],
          isMissingInformation: true,
          text: '情報不足のため判断できません。',
        }),
      ).justTellMe.sections[0].blocks[0],
    ).toMatchObject({ evidenceIds: [], isMissingInformation: true });
  });

  it('VIEW-FR-006 rejects duplicate block keys and an oversized aggregate', () => {
    const duplicateKeys = validOutput();
    duplicateKeys.justTellMe.sections[0].blocks.push(
      block('block.0', '現在の資料に基づく確認事項です。'),
    );
    expect(() =>
      analysisViewsGenerationOutputSchema.parse(duplicateKeys),
    ).toThrow();

    const oversized = validOutput();
    for (const view of [
      oversized.justTellMe,
      oversized.analystView,
      oversized.buffettMunger,
    ]) {
      for (const [sectionIndex, section] of view.sections.entries()) {
        section.blocks[0] = block(
          `oversize.${sectionIndex}.first`,
          'う'.repeat(400),
        );
        section.blocks.push(
          block(`oversize.${sectionIndex}.second`, 'あ'.repeat(400)),
          block(`oversize.${sectionIndex}.third`, 'い'.repeat(400)),
        );
      }
    }
    expect(() =>
      analysisViewsGenerationOutputSchema.parse(oversized),
    ).toThrow();
  });

  it('VIEW-SEC-009 fixes context, output, call, timeout, and authored text ceilings', () => {
    expect(DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET).toEqual({
      maxContextCharacters: 48_000,
      maxEstimatedInputTokens: 48_000,
      maxOutputTokens: 8_192,
      maxProviderCallsPerJobAttempt:
        MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT,
      maxRequestTimeoutMs: 60_000,
      maxTotalAuthoredCharacters: 18_000,
    });
    expect(() =>
      analysisViewsGenerationBudgetSchema.parse({
        ...DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET,
        maxProviderCallsPerJobAttempt: 4,
      }),
    ).toThrow();
    expect(() =>
      analysisViewsGenerationBudgetSchema.parse({
        ...DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET,
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
    [
      'ウォーレン・バフェットとして私はこう考えます。',
      'BUFFETT_MUNGER_IMPERSONATION',
    ],
    [
      'バークシャー・ハサウェイがこの会社を推奨しています。',
      'FALSE_ENDORSEMENT',
    ],
  ] as const)(
    'VIEW-SEC-004 VIEW-SEC-005 rejects forbidden authored output: %s',
    (text, expectedCode) => {
      const result = validateAnalysisViewsCompliance(
        withFirstBlock(validOutput(), { text }),
      );

      expect(result).toEqual({ valid: false, violationCodes: [expectedCode] });
    },
  );

  it('VIEW-SEC-005 allows a framework description without impersonation or endorsement', () => {
    expect(validateAnalysisViewsCompliance(validOutput())).toEqual({
      valid: true,
      violationCodes: [],
    });
  });

  it('VIEW-FR-012 VIEW-SEC-003 validates a completed normalized aggregate with unique evidence', () => {
    const output = validOutput();
    const resource = analysisViewsResourceSchema.parse({
      analysisId: '5b64f0fd-805b-45fc-8671-929411281ceb',
      completedAt: '2026-08-30T02:00:00.000Z',
      evidences: [
        {
          chunkId: '4aedb1d7-b0aa-42cf-a1eb-8ac5043643f2',
          documentId: 'fab6a43e-e2bd-4887-b878-886f56dd650a',
          documentName: '決算短信.pdf',
          excerpt: '売上高は前年同期比で増加しました。',
          id: evidenceId,
          pageNumber: 3,
        },
      ],
      status: 'COMPLETED',
      views: {
        analyst: output.analystView,
        buffettMunger: output.buffettMunger,
        justTellMe: output.justTellMe,
      },
    });

    expect(resource.evidences).toHaveLength(1);
    expect(collectAnalysisViewEvidenceIds(output)).toEqual([evidenceId]);
  });

  it('VIEW-FR-012 rejects missing, duplicate, and unknown aggregate evidence projections', () => {
    const output = validOutput();
    const evidence = {
      chunkId: '4aedb1d7-b0aa-42cf-a1eb-8ac5043643f2',
      documentId: 'fab6a43e-e2bd-4887-b878-886f56dd650a',
      documentName: '決算短信.pdf',
      excerpt: '売上高は前年同期比で増加しました。',
      id: evidenceId,
      pageNumber: 3,
    };
    const base = {
      analysisId: '5b64f0fd-805b-45fc-8671-929411281ceb',
      completedAt: '2026-08-30T02:00:00.000Z',
      status: 'COMPLETED',
      views: {
        analyst: output.analystView,
        buffettMunger: output.buffettMunger,
        justTellMe: output.justTellMe,
      },
    };

    expect(() =>
      analysisViewsResourceSchema.parse({ ...base, evidences: [] }),
    ).toThrow();
    expect(() =>
      analysisViewsResourceSchema.parse({
        ...base,
        evidences: [evidence, evidence],
      }),
    ).toThrow();
    expect(() =>
      analysisViewsResourceSchema.parse({
        ...base,
        evidences: [{ ...evidence, unexpected: true }],
      }),
    ).toThrow();
    expect(() =>
      analysisViewsResourceSchema.parse({
        ...base,
        evidences: [
          evidence,
          {
            ...evidence,
            id: '34298bc8-51c7-4422-a673-aa2af7bb4c20',
          },
        ],
      }),
    ).toThrow();
  });
});

function validOutput(): AnalysisViewsGenerationOutput {
  return {
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
  } as AnalysisViewsGenerationOutput;
}

function view(sectionKeys: readonly string[]) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => ({
      blocks: [
        block(
          `block.${index}`,
          key === 'BUSINESS_UNDERSTANDABILITY'
            ? '長期投資の公開原則という分析枠組みで事業を確認します。'
            : '現在の資料に基づく確認事項です。',
        ),
      ],
      key,
      title: `確認項目${index + 1}`,
    })),
  };
}

function block(key: string, text: string) {
  return {
    evidenceIds: [evidenceId],
    isMissingInformation: false,
    key,
    text,
  };
}

function withFirstBlock(
  output: AnalysisViewsGenerationOutput,
  changes: Partial<
    AnalysisViewsGenerationOutput['justTellMe']['sections'][number]['blocks'][number]
  >,
): AnalysisViewsGenerationOutput {
  const firstSection = output.justTellMe.sections[0];
  return {
    ...output,
    justTellMe: {
      ...output.justTellMe,
      sections: [
        {
          ...firstSection,
          blocks: [{ ...firstSection.blocks[0], ...changes }],
        },
        ...output.justTellMe.sections.slice(1),
      ] as AnalysisViewsGenerationOutput['justTellMe']['sections'],
    },
  };
}
