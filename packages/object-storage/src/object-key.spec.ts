import { createPdfObjectKey } from './object-key';

describe('createPdfObjectKey', () => {
  it('uses ownership IDs and a random nonce without using a filename', () => {
    expect(
      createPdfObjectKey(
        {
          analysisId: 'analysis-id',
          ownerId: 'owner-id',
          uploadId: 'upload-id',
        },
        () => 'random-id',
      ),
    ).toBe(
      'owners/owner-id/analyses/analysis-id/uploads/upload-id/random-id.pdf',
    );
  });

  it('rejects unsafe path segments', () => {
    expect(() =>
      createPdfObjectKey(
        {
          analysisId: '../analysis-id',
          ownerId: 'owner-id',
          uploadId: 'upload-id',
        },
        () => 'random-id',
      ),
    ).toThrow('analysisId must contain only letters, numbers, _ or -.');
  });
});
