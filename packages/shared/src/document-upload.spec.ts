import {
  MAX_PDF_SIZE_BYTES,
  startDocumentUploadRequestSchema,
} from './document-upload';

describe('startDocumentUploadRequestSchema (PDF-FR-003, PDF-FR-004)', () => {
  const validRequest = {
    mimeType: 'application/pdf',
    originalName: '決算短信.PDF',
    sha256: 'a'.repeat(64),
    sizeBytes: MAX_PDF_SIZE_BYTES,
  };

  it('normalizes a safe case-insensitive PDF filename and defaults its type', () => {
    expect(
      startDocumentUploadRequestSchema.parse({
        ...validRequest,
        originalName: '  決算短信.PDF  ',
      }),
    ).toEqual({
      ...validRequest,
      documentType: 'UNKNOWN',
    });
  });

  it.each([1, MAX_PDF_SIZE_BYTES])(
    'accepts the inclusive %i-byte size boundary',
    (sizeBytes) => {
      expect(
        startDocumentUploadRequestSchema.parse({
          ...validRequest,
          sizeBytes,
        }).sizeBytes,
      ).toBe(sizeBytes);
    },
  );

  it.each([
    ['zero size', { ...validRequest, sizeBytes: 0 }],
    ['oversize', { ...validRequest, sizeBytes: MAX_PDF_SIZE_BYTES + 1 }],
    ['non-integer size', { ...validRequest, sizeBytes: 1.5 }],
    ['wrong MIME', { ...validRequest, mimeType: 'application/octet-stream' }],
    ['wrong extension', { ...validRequest, originalName: 'results.txt' }],
    ['path separator', { ...validRequest, originalName: '../results.pdf' }],
    ['uppercase SHA-256', { ...validRequest, sha256: 'A'.repeat(64) }],
    ['unknown field', { ...validRequest, ownerId: 'injected-owner' }],
  ])('rejects %s before presigning', (_caseName, request) => {
    expect(startDocumentUploadRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });
});
