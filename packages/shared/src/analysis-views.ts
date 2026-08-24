import { z } from 'zod';

import {
  extractionComplianceViolationCodeSchema,
  findInvestmentAdviceComplianceViolations,
} from './structured-extraction';

export const ANALYSIS_VIEW_SCHEMA_VERSION = '1.0.0';
export const MAX_ANALYSIS_VIEW_BLOCKS_PER_SECTION = 3;
export const MAX_ANALYSIS_VIEW_BLOCK_TEXT_CHARACTERS = 800;
export const MAX_ANALYSIS_VIEW_BLOCK_CITATIONS = 5;
export const MAX_ANALYSIS_VIEW_SECTION_TITLE_CHARACTERS = 80;
export const MAX_ANALYSIS_VIEW_TOTAL_AUTHORED_CHARACTERS = 18_000;
export const MAX_ANALYSIS_VIEW_REPAIR_ATTEMPTS = 2;
export const MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT = 3;

const STABLE_VIEW_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const JAPANESE_TEXT_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export const justTellMeSectionKeySchema = z.enum([
  'HOW_THE_COMPANY_MAKES_MONEY',
  'RECENT_CHANGES',
  'POSITIVES',
  'RISKS',
  'WATCH_ITEMS',
  'MISSING_INFORMATION',
]);

export const analystViewSectionKeySchema = z.enum([
  'BUSINESS_OVERVIEW',
  'FINANCIAL_HIGHLIGHTS',
  'MANAGEMENT_GUIDANCE',
  'POSITIVE_FINDINGS',
  'RISKS',
  'UNCERTAINTIES',
  'WATCH_ITEMS',
  'SOURCES',
]);

export const buffettMungerSectionKeySchema = z.enum([
  'BUSINESS_UNDERSTANDABILITY',
  'COMPETITIVE_ADVANTAGE',
  'CASH_GENERATION',
  'CAPITAL_ALLOCATION',
  'MANAGEMENT_INCENTIVES',
  'LONG_TERM_RISKS',
  'MISSING_INFORMATION',
]);

const analysisViewBlockSchema = z
  .object({
    evidenceIds: z.array(z.uuid()).max(MAX_ANALYSIS_VIEW_BLOCK_CITATIONS),
    isMissingInformation: z.boolean(),
    key: z.string().regex(STABLE_VIEW_KEY_PATTERN),
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_ANALYSIS_VIEW_BLOCK_TEXT_CHARACTERS)
      .refine((value) => JAPANESE_TEXT_PATTERN.test(value), {
        message: 'View block text must contain Japanese text.',
      }),
  })
  .strict()
  .superRefine((block, context) => {
    if (!block.isMissingInformation && block.evidenceIds.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A supported view block requires at least one evidence ID.',
        path: ['evidenceIds'],
      });
    }
    if (new Set(block.evidenceIds).size !== block.evidenceIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence IDs must be unique within a view block.',
        path: ['evidenceIds'],
      });
    }
  });

function sectionSchema<Key extends string>(key: Key) {
  return z
    .object({
      blocks: z
        .array(analysisViewBlockSchema)
        .min(1)
        .max(MAX_ANALYSIS_VIEW_BLOCKS_PER_SECTION),
      key: z.literal(key),
      title: z
        .string()
        .trim()
        .min(1)
        .max(MAX_ANALYSIS_VIEW_SECTION_TITLE_CHARACTERS)
        .refine((value) => JAPANESE_TEXT_PATTERN.test(value), {
          message: 'View section title must contain Japanese text.',
        }),
    })
    .strict()
    .superRefine((section, context) => {
      const keys = section.blocks.map((block) => block.key);
      if (new Set(keys).size !== keys.length) {
        context.addIssue({
          code: 'custom',
          message: 'View block keys must be unique within a section.',
          path: ['blocks'],
        });
      }
    });
}

export const justTellMeViewSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_VIEW_SCHEMA_VERSION),
    sections: z.tuple([
      sectionSchema('HOW_THE_COMPANY_MAKES_MONEY'),
      sectionSchema('RECENT_CHANGES'),
      sectionSchema('POSITIVES'),
      sectionSchema('RISKS'),
      sectionSchema('WATCH_ITEMS'),
      sectionSchema('MISSING_INFORMATION'),
    ]),
  })
  .strict();

export const analystViewSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_VIEW_SCHEMA_VERSION),
    sections: z.tuple([
      sectionSchema('BUSINESS_OVERVIEW'),
      sectionSchema('FINANCIAL_HIGHLIGHTS'),
      sectionSchema('MANAGEMENT_GUIDANCE'),
      sectionSchema('POSITIVE_FINDINGS'),
      sectionSchema('RISKS'),
      sectionSchema('UNCERTAINTIES'),
      sectionSchema('WATCH_ITEMS'),
      sectionSchema('SOURCES'),
    ]),
  })
  .strict();

export const buffettMungerViewSchema = z
  .object({
    schemaVersion: z.literal(ANALYSIS_VIEW_SCHEMA_VERSION),
    sections: z.tuple([
      sectionSchema('BUSINESS_UNDERSTANDABILITY'),
      sectionSchema('COMPETITIVE_ADVANTAGE'),
      sectionSchema('CASH_GENERATION'),
      sectionSchema('CAPITAL_ALLOCATION'),
      sectionSchema('MANAGEMENT_INCENTIVES'),
      sectionSchema('LONG_TERM_RISKS'),
      sectionSchema('MISSING_INFORMATION'),
    ]),
  })
  .strict();

export const analysisViewsGenerationOutputSchema = z
  .object({
    analystView: analystViewSchema,
    buffettMunger: buffettMungerViewSchema,
    justTellMe: justTellMeViewSchema,
  })
  .strict()
  .superRefine((output, context) => {
    const totalCharacters = authoredStrings(output).reduce(
      (total, value) => total + Array.from(value).length,
      0,
    );
    if (totalCharacters > MAX_ANALYSIS_VIEW_TOTAL_AUTHORED_CHARACTERS) {
      context.addIssue({
        code: 'custom',
        message: 'Analysis view output exceeds the total authored text limit.',
      });
    }
  });

export type AnalysisViewsGenerationOutput = z.infer<
  typeof analysisViewsGenerationOutputSchema
>;

export const analysisViewsGenerationBudgetSchema = z
  .object({
    maxContextCharacters: z.number().int().min(1_000).max(100_000),
    maxEstimatedInputTokens: z.number().int().min(1_000).max(100_000),
    maxOutputTokens: z.number().int().min(128).max(8_192),
    maxProviderCallsPerJobAttempt: z.number().int().min(1).max(3),
    maxRequestTimeoutMs: z.number().int().min(1_000).max(120_000),
    maxTotalAuthoredCharacters: z.number().int().min(1_000).max(30_000),
  })
  .strict();

export type AnalysisViewsGenerationBudget = Readonly<
  z.infer<typeof analysisViewsGenerationBudgetSchema>
>;

export const DEFAULT_ANALYSIS_VIEWS_GENERATION_BUDGET =
  analysisViewsGenerationBudgetSchema.parse({
    maxContextCharacters: 48_000,
    maxEstimatedInputTokens: 48_000,
    maxOutputTokens: 8_192,
    maxProviderCallsPerJobAttempt:
      MAX_ANALYSIS_VIEW_PROVIDER_CALLS_PER_JOB_ATTEMPT,
    maxRequestTimeoutMs: 60_000,
    maxTotalAuthoredCharacters: MAX_ANALYSIS_VIEW_TOTAL_AUTHORED_CHARACTERS,
  });

export const analysisViewComplianceViolationCodeSchema =
  extractionComplianceViolationCodeSchema.or(
    z.enum(['BUFFETT_MUNGER_IMPERSONATION', 'FALSE_ENDORSEMENT']),
  );

export type AnalysisViewComplianceViolationCode = z.infer<
  typeof analysisViewComplianceViolationCodeSchema
>;

export interface AnalysisViewComplianceResult {
  readonly valid: boolean;
  readonly violationCodes: readonly AnalysisViewComplianceViolationCode[];
}

const VIEW_FRAMEWORK_VIOLATION_PATTERNS: ReadonlyArray<{
  code: AnalysisViewComplianceViolationCode;
  pattern: RegExp;
}> = [
  {
    code: 'BUFFETT_MUNGER_IMPERSONATION',
    pattern:
      /(?:私は.{0,8})?(?:ウォーレン[・\s]?バフェット|チャーリー[・\s]?マンガー|Warren Buffett|Charlie Munger).{0,20}(?:として|になりき|の口調で|なら.{0,8}(?:言|考)|曰く|と述べ|と語)/iu,
  },
  {
    code: 'FALSE_ENDORSEMENT',
    pattern:
      /(?:ウォーレン[・\s]?バフェット|チャーリー[・\s]?マンガー|バークシャー[・\s]?ハサウェイ|Warren Buffett|Charlie Munger|Berkshire Hathaway).{0,30}(?:推奨|推薦|お墨付き|承認|endorse|recommend)/iu,
  },
];

export function validateAnalysisViewsCompliance(
  output: AnalysisViewsGenerationOutput,
): AnalysisViewComplianceResult {
  const parsed = analysisViewsGenerationOutputSchema.parse(output);
  const authoredText = authoredStrings(parsed).join('\n');
  const violationCodes: AnalysisViewComplianceViolationCode[] = [
    ...findInvestmentAdviceComplianceViolations(authoredText),
    ...VIEW_FRAMEWORK_VIOLATION_PATTERNS.filter(({ pattern }) =>
      pattern.test(authoredText),
    ).map(({ code }) => code),
  ];

  return {
    valid: violationCodes.length === 0,
    violationCodes,
  };
}

function authoredStrings(output: AnalysisViewsGenerationOutput): string[] {
  return [output.justTellMe, output.analystView, output.buffettMunger].flatMap(
    (view) =>
      view.sections.flatMap((section) => [
        section.title,
        ...section.blocks.map((block) => block.text),
      ]),
  );
}
