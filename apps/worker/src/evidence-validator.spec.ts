import type { StructuredExtractionOutput } from '@stocklens/shared';

import {
  EvidenceValidationError,
  validateExtractionEvidence,
  type EvidenceSourceChunk,
} from './evidence-validator';

const chunkId = '11111111-1111-4111-8111-111111111111';
const source: EvidenceSourceChunk = {
  chunkId,
  content: '前文。売上高は前年同期比10%増加した。後文。',
  documentId: '22222222-2222-4222-8222-222222222222',
  pageId: '33333333-3333-4333-8333-333333333333',
  pageNumber: 12,
  pageText: '前文。売上高は前年同期比10%増加した。後文。',
};

function output(
  overrides: Partial<StructuredExtractionOutput['findings'][number]> = {},
): StructuredExtractionOutput {
  return {
    findings: [
      {
        bodyJa: '売上高は前年同期比で増加した。',
        category: 'FINANCIAL_HIGHLIGHT',
        evidence: [{ chunkId, excerpt: '売上高は前年同期比10%増加' }],
        findingKey: 'financial.revenue-growth',
        importance: 4,
        titleJa: '売上高の増加',
        ...overrides,
      },
    ],
  };
}

describe('validateExtractionEvidence', () => {
  it('EXTRACT-AC-004 rebuilds trusted lineage and exact offsets from source records', () => {
    const result = validateExtractionEvidence(output(), [source]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.status).toBe('SUPPORTED');
    expect(result.findings[0]?.evidence).toHaveLength(1);
    expect(result.findings[0]?.evidence[0]).toMatchObject({
      chunkId,
      documentId: source.documentId,
      endOffset: 17,
      excerpt: '売上高は前年同期比10%増加',
      pageId: source.pageId,
      pageNumber: 12,
      startOffset: 3,
    });
    expect(result.findings[0]?.evidence[0]?.excerptSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('EXTRACT-FR-008 downgrades a finding with no evidence', () => {
    expect(
      validateExtractionEvidence(output({ evidence: [] }), [source])
        .findings[0],
    ).toMatchObject({ evidence: [], status: 'INSUFFICIENT_EVIDENCE' });
  });

  it('EXTRACT-AC-005 rejects an empty trusted source set', () => {
    expect(
      validationErrorCode(() =>
        validateExtractionEvidence(output({ evidence: [] }), []),
      ),
    ).toBe('EVIDENCE_SOURCE_SET_INVALID');
  });

  it.each([
    [
      'unknown chunk',
      output({
        evidence: [
          {
            chunkId: '99999999-9999-4999-8999-999999999999',
            excerpt: '売上高',
          },
        ],
      }),
      'EVIDENCE_CHUNK_NOT_FOUND',
    ],
    [
      'unsupported excerpt',
      output({ evidence: [{ chunkId, excerpt: '存在しない原文' }] }),
      'EVIDENCE_EXCERPT_NOT_FOUND',
    ],
  ] as const)('EXTRACT-AC-005 rejects %s', (_name, candidate, code) => {
    expect(
      validationErrorCode(() =>
        validateExtractionEvidence(candidate, [source]),
      ),
    ).toBe(code);
  });

  it('EXTRACT-AC-005 rejects text found in a chunk but not its original page', () => {
    expect(
      validationErrorCode(() =>
        validateExtractionEvidence(output(), [
          { ...source, pageText: '異なるページ原文' },
        ]),
      ),
    ).toBe('EVIDENCE_EXCERPT_NOT_FOUND');
  });

  it('EXTRACT-AC-008 rejects forbidden authored language but not source excerpts', () => {
    expect(
      validationErrorCode(() =>
        validateExtractionEvidence(
          output({ bodyJa: '目標株価は2,000円です。' }),
          [source],
        ),
      ),
    ).toBe('EXTRACTION_COMPLIANCE_VIOLATION');

    expect(
      validateExtractionEvidence(
        output({
          bodyJa: '資料には外部評価の記載がある。',
          evidence: [{ chunkId, excerpt: '売上高は前年同期比10%増加' }],
        }),
        [source],
      ).findings[0]?.status,
    ).toBe('SUPPORTED');
  });
});

function validationErrorCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (error instanceof EvidenceValidationError) return error.code;
    throw error;
  }
}
