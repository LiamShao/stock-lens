import { z } from 'zod';

export const analysisStatusSchema = z.enum([
  'DRAFT',
  'UPLOADED',
  'PARSING',
  'CHUNKING',
  'READY_FOR_EMBEDDING',
  'EMBEDDING',
  'EXTRACTING',
  'VALIDATING',
  'READY_FOR_VIEW_GENERATION',
  'COMPLETED',
  'FAILED_PARSING',
  'FAILED_CHUNKING',
  'FAILED_EMBEDDING',
  'FAILED_EXTRACTION',
  'FAILED_VALIDATION',
]);

export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const analysisTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        );
      }),
    {
      message: 'Title must not contain control characters.',
    },
  );

export const createAnalysisRequestSchema = z
  .object({
    companyId: z.uuid().nullable().optional(),
    title: analysisTitleSchema,
  })
  .strict();

export type CreateAnalysisRequest = z.infer<typeof createAnalysisRequestSchema>;

export const renameAnalysisRequestSchema = z
  .object({
    title: analysisTitleSchema,
  })
  .strict();

export type RenameAnalysisRequest = z.infer<typeof renameAnalysisRequestSchema>;

export const analysisPathParamsSchema = z
  .object({
    analysisId: z.uuid(),
  })
  .strict();

export type AnalysisPathParams = z.infer<typeof analysisPathParamsSchema>;

export const analysisListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: analysisStatusSchema.optional(),
  })
  .strict();

export type AnalysisListQuery = z.infer<typeof analysisListQuerySchema>;

export const analysisResourceSchema = z.object({
  companyId: z.uuid().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  id: z.uuid(),
  status: analysisStatusSchema,
  title: z.string(),
  updatedAt: z.iso.datetime(),
});

export type AnalysisResource = z.infer<typeof analysisResourceSchema>;

export const analysisPageResponseSchema = z.object({
  items: z.array(analysisResourceSchema),
  nextCursor: z.string().nullable(),
});

export type AnalysisPageResponse = z.infer<typeof analysisPageResponseSchema>;

export const processAnalysisResponseSchema = z.object({
  acceptedAt: z.iso.datetime(),
  analysisId: z.uuid(),
  executionId: z.uuid(),
  status: z.literal('PARSING'),
});

export type ProcessAnalysisResponse = z.infer<
  typeof processAnalysisResponseSchema
>;
