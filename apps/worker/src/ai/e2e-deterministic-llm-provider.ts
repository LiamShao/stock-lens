import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisViewsGenerationOutputSchema,
  structuredExtractionOutputSchema,
  type AnalysisViewsGenerationOutput,
  type StructuredExtractionOutput,
} from '@stocklens/shared';
import { z } from 'zod';

import {
  LlmProviderError,
  type LlmProvider,
  type StructuredGenerationInput,
  type StructuredGenerationResult,
  validateStructuredGenerationInput,
} from './llm-provider';

export const E2E_DETERMINISTIC_MODEL = 'deterministic-e2e-v1';

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

/**
 * Test-only provider whose identifiers are derived from the supplied context.
 * This lets the browser E2E exercise real persisted chunk/evidence lineage.
 */
export class E2eDeterministicLlmProvider implements LlmProvider {
  generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<StructuredGenerationResult<T>> {
    return Promise.resolve().then(() => {
      validateStructuredGenerationInput(input);
      const fixture = createFixture(input.schemaName, input.userContext);
      const parsed = input.schema.safeParse(fixture);
      if (!parsed.success) {
        throw new LlmProviderError(
          'PROVIDER_MALFORMED_OUTPUT',
          false,
          'E2E deterministic output failed schema validation.',
        );
      }
      return {
        usage: {
          inputTokens: null,
          latencyMs: 0,
          model: E2E_DETERMINISTIC_MODEL,
          outputTokens: null,
          provider: 'deterministic',
          providerRequestId: null,
        },
        value: parsed.data,
      };
    });
  }

  embedTexts(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => [1, 0, 0]));
  }
}

function createFixture(schemaName: string, context: string): unknown {
  if (schemaName === 'structured_extraction_map_v1') {
    return createExtractionOutput(readFirstDocumentChunk(context));
  }
  if (schemaName === 'structured_extraction_merge_v1') {
    return readMappedExtractionOutput(context);
  }
  if (schemaName === 'analysis_views_v1') {
    return createAnalysisViewsOutput(readFirstEvidenceId(context));
  }
  throw new LlmProviderError(
    'PROVIDER_INPUT_INVALID',
    false,
    'E2E deterministic provider received an unsupported schema.',
  );
}

function readFirstDocumentChunk(context: string): {
  chunkId: string;
  excerpt: string;
} {
  const match = context.match(
    /<document_chunk\b[^>]*chunk_id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/document_chunk>/u,
  );
  if (!match?.[1] || !match[2]) throw malformedContext();
  const text = decodeMarkup(match[2]).trim();
  if (text.length === 0) throw malformedContext();
  return { chunkId: decodeMarkup(match[1]), excerpt: text.slice(0, 800) };
}

function createExtractionOutput(source: {
  chunkId: string;
  excerpt: string;
}): StructuredExtractionOutput {
  return structuredExtractionOutputSchema.parse({
    findings: [
      {
        bodyJa: '現在の資料から、事業に関する記載を確認できます。',
        category: 'BUSINESS_OVERVIEW',
        evidence: [{ chunkId: source.chunkId, excerpt: source.excerpt }],
        findingKey: 'e2e.business-overview',
        importance: 3,
        titleJa: '資料に記載された事業情報',
      },
    ],
  });
}

function readMappedExtractionOutput(context: string): StructuredExtractionOutput {
  const serialized = readTaggedContent(context, 'untrusted_map_candidates');
  const candidates: unknown = JSON.parse(decodeMarkup(serialized));
  const parsed = structuredExtractionOutputSchema.array().min(1).parse(candidates);
  return structuredExtractionOutputSchema.parse({
    findings: parsed.flatMap(({ findings }) => findings),
  });
}

function readFirstEvidenceId(context: string): string {
  const serialized = readTaggedContent(context, 'untrusted_analysis_source');
  const source = z
    .object({
      findings: z.array(
        z.object({ evidences: z.array(z.object({ id: z.uuid() })) }),
      ),
    })
    .safeParse(JSON.parse(decodeMarkup(serialized)) as unknown);
  const evidenceId = source.success
    ? source.data.findings.flatMap(({ evidences }) => evidences)[0]?.id
    : undefined;
  if (evidenceId === undefined) throw malformedContext();
  return evidenceId;
}

function createAnalysisViewsOutput(
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
            key: `e2e-runtime-block-${index + 1}`,
            text: isMissingInformation
              ? '現在の資料だけでは判断できない情報があります。'
              : '現在の資料から確認できる内容です。',
          },
        ],
        key,
        title: SECTION_TITLES[key],
      };
    }),
  };
}

function readTaggedContent(context: string, tag: string): string {
  const start = `<${tag}>`;
  const end = `</${tag}>`;
  const startIndex = context.indexOf(start);
  const endIndex = context.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex) throw malformedContext();
  return context.slice(startIndex + start.length, endIndex).trim();
}

function decodeMarkup(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function malformedContext(): LlmProviderError {
  return new LlmProviderError(
    'PROVIDER_INPUT_INVALID',
    false,
    'E2E deterministic provider context is invalid.',
  );
}
