import {
  documentItemPathParamsSchema,
  documentListResponseSchema,
  documentPathParamsSchema,
  documentResourceSchema,
} from './document';

const analysisId = '3e4becba-9f40-4dd5-a900-f98919c31469';
const documentId = 'a26225c9-623a-43d6-898d-0d5144e422b1';

const resource = {
  analysisId,
  createdAt: '2026-08-06T00:00:00.000Z',
  documentType: 'EARNINGS_SUMMARY' as const,
  id: documentId,
  mimeType: 'application/pdf' as const,
  originalName: 'results.pdf',
  sha256: 'a'.repeat(64),
  sizeBytes: 1024,
  updatedAt: '2026-08-06T00:00:00.000Z',
  uploadedAt: '2026-08-06T00:00:00.000Z',
};

describe('document API contract (PDF-TASK-009)', () => {
  it('accepts strict analysis and document UUID path parameters', () => {
    expect(documentPathParamsSchema.parse({ analysisId })).toEqual({
      analysisId,
    });
    expect(
      documentItemPathParamsSchema.parse({ analysisId, documentId }),
    ).toEqual({ analysisId, documentId });
    expect(
      documentItemPathParamsSchema.safeParse({
        analysisId,
        documentId,
        ownerId: analysisId,
      }).success,
    ).toBe(false);
  });

  it('requires finalized storage-safe document metadata', () => {
    expect(documentResourceSchema.parse(resource)).toEqual(resource);
    expect(
      documentResourceSchema.safeParse({ ...resource, uploadedAt: null })
        .success,
    ).toBe(false);
    expect(
      documentResourceSchema.safeParse({
        ...resource,
        mimeType: 'application/octet-stream',
      }).success,
    ).toBe(false);
  });

  it('caps the list response at the approved three-document limit', () => {
    expect(
      documentListResponseSchema.parse({ items: [resource, resource] }),
    ).toEqual({ items: [resource, resource] });
    expect(
      documentListResponseSchema.safeParse({
        items: [resource, resource, resource, resource],
      }).success,
    ).toBe(false);
  });
});
