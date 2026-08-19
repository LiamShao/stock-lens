import { createHash } from 'node:crypto';

import {
  structuredExtractionOutputSchema,
  validateStructuredExtractionCompliance,
  type ExtractionFindingCategory,
  type StructuredExtractionOutput,
} from '@stocklens/shared';
import { z } from 'zod';

const evidenceSourceChunkSchema = z
  .object({
    chunkId: z.uuid(),
    content: z.string().min(1),
    contentSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    documentId: z.uuid(),
    pageId: z.uuid(),
    pageNumber: z.number().int().positive(),
    pageText: z.string(),
  })
  .strict();

export type EvidenceSourceChunk = Readonly<
  z.infer<typeof evidenceSourceChunkSchema>
>;

export type EvidenceValidationErrorCode =
  | 'EVIDENCE_SOURCE_SET_INVALID'
  | 'EVIDENCE_CHUNK_NOT_FOUND'
  | 'EVIDENCE_EXCERPT_NOT_FOUND'
  | 'EXTRACTION_COMPLIANCE_VIOLATION';

export class EvidenceValidationError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: EvidenceValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EvidenceValidationError';
  }
}

export interface ValidatedEvidence {
  readonly chunkId: string;
  readonly documentId: string;
  readonly endOffset: number;
  readonly excerpt: string;
  readonly excerptSha256: string;
  readonly pageId: string;
  readonly pageNumber: number;
  readonly startOffset: number;
}

export interface ValidatedFinding {
  readonly body: string;
  readonly category: ExtractionFindingCategory;
  readonly evidence: readonly ValidatedEvidence[];
  readonly findingKey: string;
  readonly importance: number;
  readonly status: 'SUPPORTED' | 'INSUFFICIENT_EVIDENCE';
  readonly title: string;
}

export interface ValidatedExtractionSet {
  readonly findings: readonly ValidatedFinding[];
}

/**
 * Resolves every provider-authored evidence pointer against trusted source
 * records. Provider document/page metadata is deliberately not accepted.
 */
export function validateExtractionEvidence(
  output: StructuredExtractionOutput,
  sourceChunks: readonly EvidenceSourceChunk[],
): ValidatedExtractionSet {
  const parsedOutput = structuredExtractionOutputSchema.parse(output);
  const sourceResult = z
    .array(evidenceSourceChunkSchema)
    .min(1)
    .safeParse(sourceChunks);
  if (!sourceResult.success) {
    throw new EvidenceValidationError(
      'EVIDENCE_SOURCE_SET_INVALID',
      'Evidence source set is invalid.',
    );
  }
  const parsedSources = sourceResult.data;
  const sourceById = new Map(
    parsedSources.map((source) => [source.chunkId, source] as const),
  );
  if (sourceById.size !== parsedSources.length) {
    throw new EvidenceValidationError(
      'EVIDENCE_SOURCE_SET_INVALID',
      'Evidence source set is invalid.',
    );
  }

  const compliance = validateStructuredExtractionCompliance(parsedOutput);
  if (!compliance.valid) {
    throw new EvidenceValidationError(
      'EXTRACTION_COMPLIANCE_VIOLATION',
      `Structured extraction violates compliance rules: ${compliance.violationCodes.join(',')}.`,
    );
  }

  return {
    findings: parsedOutput.findings.map((finding) => {
      const evidence = finding.evidence.map((candidate) => {
        const source = sourceById.get(candidate.chunkId);
        if (source === undefined) {
          throw new EvidenceValidationError(
            'EVIDENCE_CHUNK_NOT_FOUND',
            'Evidence chunk is unavailable for this analysis.',
          );
        }
        const startOffset = source.content.indexOf(candidate.excerpt);
        if (startOffset < 0 || !source.pageText.includes(candidate.excerpt)) {
          throw new EvidenceValidationError(
            'EVIDENCE_EXCERPT_NOT_FOUND',
            'Evidence excerpt does not match original document text.',
          );
        }
        return {
          chunkId: source.chunkId,
          documentId: source.documentId,
          endOffset: startOffset + candidate.excerpt.length,
          excerpt: candidate.excerpt,
          excerptSha256: createHash('sha256')
            .update(candidate.excerpt)
            .digest('hex'),
          pageId: source.pageId,
          pageNumber: source.pageNumber,
          startOffset,
        };
      });

      return {
        body: finding.bodyJa,
        category: finding.category,
        evidence,
        findingKey: finding.findingKey,
        importance: finding.importance,
        status: evidence.length === 0 ? 'INSUFFICIENT_EVIDENCE' : 'SUPPORTED',
        title: finding.titleJa,
      };
    }),
  };
}
