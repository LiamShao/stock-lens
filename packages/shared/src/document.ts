import { z } from 'zod';

import { documentTypeSchema, MAX_PDF_SIZE_BYTES } from './document-upload';

export const documentResourceSchema = z.object({
  analysisId: z.uuid(),
  createdAt: z.iso.datetime(),
  documentType: documentTypeSchema,
  id: z.uuid(),
  mimeType: z.literal('application/pdf'),
  originalName: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().min(1).max(MAX_PDF_SIZE_BYTES),
  uploadedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DocumentResource = z.infer<typeof documentResourceSchema>;

export const documentPathParamsSchema = z
  .object({ analysisId: z.uuid() })
  .strict();

export type DocumentPathParams = z.infer<typeof documentPathParamsSchema>;

export const documentItemPathParamsSchema = z
  .object({ analysisId: z.uuid(), documentId: z.uuid() })
  .strict();

export type DocumentItemPathParams = z.infer<
  typeof documentItemPathParamsSchema
>;

export const documentListResponseSchema = z.object({
  items: z.array(documentResourceSchema).max(3),
});

export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
