import { z } from 'zod';

export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export const documentTypeSchema = z.enum([
  'EARNINGS_SUMMARY',
  'EARNINGS_PRESENTATION',
  'ANNUAL_SECURITIES_REPORT',
  'OTHER',
  'UNKNOWN',
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentUploadStatusSchema = z.enum([
  'PENDING',
  'VALIDATING',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
]);

export type DocumentUploadStatus = z.infer<typeof documentUploadStatusSchema>;

export const pdfOriginalNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
        );
      }),
    { message: 'Filename must not contain control characters.' },
  )
  .refine((value) => !value.includes('/') && !value.includes('\\'), {
    message: 'Filename must not contain path separators.',
  })
  .refine((value) => /\.pdf$/i.test(value), {
    message: 'Filename must have a .pdf extension.',
  });

export const startDocumentUploadRequestSchema = z
  .object({
    documentType: documentTypeSchema.optional().default('UNKNOWN'),
    mimeType: z.literal('application/pdf'),
    originalName: pdfOriginalNameSchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'SHA-256 must be lowercase hexadecimal.'),
    sizeBytes: z.number().int().min(1).max(MAX_PDF_SIZE_BYTES),
  })
  .strict();

export type StartDocumentUploadRequest = z.infer<
  typeof startDocumentUploadRequestSchema
>;

export const documentUploadPathParamsSchema = z
  .object({ analysisId: z.uuid() })
  .strict();

export type DocumentUploadPathParams = z.infer<
  typeof documentUploadPathParamsSchema
>;

export const documentUploadItemPathParamsSchema = z
  .object({ analysisId: z.uuid(), uploadId: z.uuid() })
  .strict();

export type DocumentUploadItemPathParams = z.infer<
  typeof documentUploadItemPathParamsSchema
>;

export const presignedPdfUploadSchema = z.object({
  expiresAt: z.iso.datetime(),
  headers: z.record(z.string(), z.string()),
  url: z.url(),
});

export type PresignedPdfUploadResponse = z.infer<
  typeof presignedPdfUploadSchema
>;

export const documentUploadResourceSchema = z.object({
  analysisId: z.uuid(),
  createdAt: z.iso.datetime(),
  documentType: documentTypeSchema,
  expiresAt: z.iso.datetime(),
  id: z.uuid(),
  mimeType: z.literal('application/pdf'),
  originalName: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().min(1).max(MAX_PDF_SIZE_BYTES),
  status: documentUploadStatusSchema,
});

export type DocumentUploadResource = z.infer<
  typeof documentUploadResourceSchema
>;

export const startDocumentUploadResponseSchema = z.object({
  upload: presignedPdfUploadSchema,
  uploadSession: documentUploadResourceSchema,
});

export type StartDocumentUploadResponse = z.infer<
  typeof startDocumentUploadResponseSchema
>;
