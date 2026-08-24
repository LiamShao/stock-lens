import { z } from 'zod';

const AI_AUDIT_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

export const aiUsageAuditInputSchema = z
  .object({
    analysisId: z.uuid().nullable(),
    embeddingTokens: z.number().int().nonnegative().nullable(),
    estimatedCostMicros: z.bigint().nonnegative().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    jobExecutionId: z.uuid().nullable(),
    latencyMs: z.number().int().nonnegative(),
    model: z.string().trim().min(1).max(128).regex(AI_AUDIT_IDENTIFIER_PATTERN),
    operation: z.enum(['STRUCTURED_GENERATION', 'EMBEDDING']),
    outputTokens: z.number().int().nonnegative().nullable(),
    ownerId: z.uuid(),
    promptVersionId: z.uuid().nullable(),
    provider: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(AI_AUDIT_IDENTIFIER_PATTERN),
    providerRequestId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(AI_AUDIT_IDENTIFIER_PATTERN)
      .nullable(),
    requestId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(AI_AUDIT_IDENTIFIER_PATTERN)
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.jobExecutionId !== null && value.analysisId === null) {
      context.addIssue({
        code: 'custom',
        message: 'analysisId is required when jobExecutionId is present.',
        path: ['analysisId'],
      });
    }
    if (
      value.operation === 'STRUCTURED_GENERATION' &&
      value.promptVersionId === null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'promptVersionId is required for structured generation usage.',
        path: ['promptVersionId'],
      });
    }
  });

export type AiUsageAuditInput = z.infer<typeof aiUsageAuditInputSchema>;

export const MAX_EXTRACTION_FINDINGS = 24;
export const MAX_EVIDENCE_CANDIDATES_PER_FINDING = 5;
export const MAX_FINDING_TITLE_CHARACTERS = 120;
export const MAX_FINDING_BODY_CHARACTERS = 2_000;
export const MAX_EVIDENCE_EXCERPT_CHARACTERS = 800;

export const extractionFindingCategorySchema = z.enum([
  'BUSINESS_OVERVIEW',
  'FINANCIAL_HIGHLIGHT',
  'MANAGEMENT_GUIDANCE',
  'POSITIVE',
  'RISK',
  'UNCERTAINTY',
  'WATCH_ITEM',
  'MISSING_INFORMATION',
]);

export type ExtractionFindingCategory = z.infer<
  typeof extractionFindingCategorySchema
>;

export const evidenceCandidateSchema = z
  .object({
    chunkId: z.uuid(),
    excerpt: z.string().trim().min(1).max(MAX_EVIDENCE_EXCERPT_CHARACTERS),
  })
  .strict();

export type EvidenceCandidate = z.infer<typeof evidenceCandidateSchema>;

export const structuredFindingCandidateSchema = z
  .object({
    bodyJa: z.string().trim().min(1).max(MAX_FINDING_BODY_CHARACTERS),
    category: extractionFindingCategorySchema,
    evidence: z
      .array(evidenceCandidateSchema)
      .max(MAX_EVIDENCE_CANDIDATES_PER_FINDING),
    findingKey: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
    importance: z.number().int().min(1).max(5),
    titleJa: z.string().trim().min(1).max(MAX_FINDING_TITLE_CHARACTERS),
  })
  .strict();

export type StructuredFindingCandidate = z.infer<
  typeof structuredFindingCandidateSchema
>;

export const structuredExtractionOutputSchema = z
  .object({
    findings: z
      .array(structuredFindingCandidateSchema)
      .max(MAX_EXTRACTION_FINDINGS),
  })
  .strict();

export type StructuredExtractionOutput = z.infer<
  typeof structuredExtractionOutputSchema
>;

export const structuredExtractionBudgetSchema = z
  .object({
    maxContextCharacters: z.number().int().min(1_000).max(100_000),
    maxEstimatedInputTokens: z.number().int().min(1_000).max(100_000),
    maxOutputTokens: z.number().int().min(128).max(8_192),
    maxProviderCalls: z.number().int().min(1).max(3),
    maxRequestTimeoutMs: z.number().int().min(1_000).max(120_000),
    maxChunksPerBatch: z.number().int().min(1).max(50),
  })
  .strict();

export type StructuredExtractionBudget = Readonly<
  z.infer<typeof structuredExtractionBudgetSchema>
>;

export const DEFAULT_STRUCTURED_EXTRACTION_BUDGET =
  structuredExtractionBudgetSchema.parse({
    maxChunksPerBatch: 32,
    maxContextCharacters: 48_000,
    maxEstimatedInputTokens: 48_000,
    maxOutputTokens: 4_096,
    maxProviderCalls: 3,
    maxRequestTimeoutMs: 60_000,
  });

export const MAX_EXTRACTION_REPAIR_ATTEMPTS = 2;
export const MAX_EXTRACTION_PROVIDER_CALLS_PER_JOB_ATTEMPT = 3;

export const extractionComplianceViolationCodeSchema = z.enum([
  'BUY_RECOMMENDATION',
  'SELL_RECOMMENDATION',
  'TARGET_PRICE',
  'PRICE_OR_RETURN_PREDICTION',
  'PERSONALIZED_ALLOCATION',
  'TRADE_TIMING',
]);

export type ExtractionComplianceViolationCode = z.infer<
  typeof extractionComplianceViolationCodeSchema
>;

export interface ExtractionComplianceResult {
  readonly valid: boolean;
  readonly violationCodes: readonly ExtractionComplianceViolationCode[];
}

const FORBIDDEN_OUTPUT_PATTERNS: ReadonlyArray<{
  code: ExtractionComplianceViolationCode;
  pattern: RegExp;
}> = [
  {
    code: 'BUY_RECOMMENDATION',
    pattern:
      /建议买入|强烈推荐|強烈推薦|買い推奨|購入を推奨|buy recommendation/iu,
  },
  {
    code: 'SELL_RECOMMENDATION',
    pattern: /建议卖出|売り推奨|売却を推奨|sell recommendation/iu,
  },
  {
    code: 'TARGET_PRICE',
    pattern: /目标价为|目標株価|target price/iu,
  },
  {
    code: 'PRICE_OR_RETURN_PREDICTION',
    pattern:
      /未来一个月将上涨|株価.{0,16}(?:上昇|下落)する|(?:price|return).{0,20}will (?:rise|fall|increase|decrease)/iu,
  },
  {
    code: 'PERSONALIZED_ALLOCATION',
    pattern:
      /这只股票适合你|あなた(?:の|には).{0,20}(?:適して|向いて)|portfolio allocation/iu,
  },
  {
    code: 'TRADE_TIMING',
    pattern: /(?:今|今日|直ちに).{0,12}(?:買う|売る)べき|trade (?:now|today)/iu,
  },
];

export function findInvestmentAdviceComplianceViolations(
  authoredText: string,
): ExtractionComplianceViolationCode[] {
  return FORBIDDEN_OUTPUT_PATTERNS.filter(({ pattern }) =>
    pattern.test(authoredText),
  ).map(({ code }) => code);
}

/**
 * Checks model-authored finding prose only. Evidence excerpts are original
 * source data and may legitimately contain otherwise forbidden language.
 */
export function validateStructuredExtractionCompliance(
  output: StructuredExtractionOutput,
): ExtractionComplianceResult {
  const parsed = structuredExtractionOutputSchema.parse(output);
  const authoredText = parsed.findings
    .flatMap((finding) => [finding.titleJa, finding.bodyJa])
    .join('\n');
  const violationCodes = findInvestmentAdviceComplianceViolations(authoredText);
  return {
    valid: violationCodes.length === 0,
    violationCodes,
  };
}
