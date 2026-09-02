import {
  analysisViewsGenerationOutputSchema,
  structuredExtractionOutputSchema,
} from '@stocklens/shared';

import { E2eDeterministicLlmProvider } from './e2e-deterministic-llm-provider';

const chunkId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';

describe('E2eDeterministicLlmProvider', () => {
  const provider = new E2eDeterministicLlmProvider();

  it('creates schema-valid extraction with the persisted chunk lineage', async () => {
    const result = await provider.generateStructured({
      maxOutputTokens: 1024,
      schema: structuredExtractionOutputSchema,
      schemaName: 'structured_extraction_map_v1',
      systemPrompt: 'Extract supported facts.',
      timeoutMs: 10_000,
      userContext: [
        '<untrusted_pdf_content>',
        `<document_chunk document_id="33333333-3333-4333-8333-333333333333" document_name="test.pdf" document_type="UNKNOWN" page_number="1" section="" chunk_id="${chunkId}">`,
        'StockLens Evidence Page 1',
        '</document_chunk>',
        '</untrusted_pdf_content>',
      ].join('\n'),
    });

    expect(result.value.findings[0]?.evidence[0]).toEqual({
      chunkId,
      excerpt: 'StockLens Evidence Page 1',
    });
  });

  it('creates schema-valid Japanese views with the persisted evidence ID', async () => {
    const source = JSON.stringify({
      findings: [{ evidences: [{ id: evidenceId }] }],
    });
    const result = await provider.generateStructured({
      maxOutputTokens: 4096,
      schema: analysisViewsGenerationOutputSchema,
      schemaName: 'analysis_views_v1',
      systemPrompt: 'Generate views.',
      timeoutMs: 10_000,
      userContext: `<untrusted_analysis_source>\n${source}\n</untrusted_analysis_source>`,
    });

    expect(result.value.justTellMe.sections[0].blocks[0]?.evidenceIds).toEqual([
      evidenceId,
    ]);
  });
});
