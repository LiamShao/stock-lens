import type { ObjectStorage } from '@stocklens/object-storage';

import type {
  CreatePendingDocumentUploadResult,
  DocumentUploadRecord,
  DocumentUploadRepository,
} from '../database/document-upload.repository';
import { DocumentUploadsService } from './document-uploads.service';

const ownerId = '84728d4e-96c5-4d87-907d-cb572322bb0a';
const analysisId = '3e4becba-9f40-4dd5-a900-f98919c31469';
const uploadId = '774357a7-dbe0-4b04-a653-65913461d0fc';
const fixedNow = new Date('2026-08-05T00:00:00.000Z');

const uploadRecord: DocumentUploadRecord = {
  analysisId,
  claimedSha256: 'a'.repeat(64),
  createdAt: fixedNow,
  declaredMimeType: 'application/pdf',
  declaredSizeBytes: 1024n,
  documentType: 'EARNINGS_SUMMARY',
  expiresAt: new Date('2026-08-06T00:00:00.000Z'),
  id: uploadId,
  originalName: 'results.pdf',
  ownerId,
  status: 'PENDING',
  storageBucket: 'private-test',
  storageKey: `owners/${ownerId}/analyses/${analysisId}/uploads/${uploadId}/object.pdf`,
};

describe('DocumentUploadsService (PDF-TASK-006)', () => {
  const repository: jest.Mocked<
    Pick<
      DocumentUploadRepository,
      'createPending' | 'findForOwner' | 'rejectPendingPresignFailure'
    >
  > = {
    createPending: jest.fn(),
    findForOwner: jest.fn(),
    rejectPendingPresignFailure: jest.fn(),
  };
  const objectStorage: jest.Mocked<
    Pick<ObjectStorage, 'createPresignedPdfUpload'>
  > = {
    createPresignedPdfUpload: jest.fn(),
  };
  let service: DocumentUploadsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    jest.resetAllMocks();
    objectStorage.createPresignedPdfUpload.mockResolvedValue({
      expiresAt: new Date('2026-08-05T00:05:00.000Z'),
      headers: {
        'content-length': '1024',
        'content-type': 'application/pdf',
        'x-amz-meta-stocklens-sha256': 'a'.repeat(64),
      },
      url: 'https://storage.test/constrained-upload',
    });
    repository.rejectPendingPresignFailure.mockResolvedValue(true);
    service = new DocumentUploadsService(
      repository as unknown as DocumentUploadRepository,
      objectStorage as unknown as ObjectStorage,
      'private-test',
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('PDF-FR-001/005/006 reserves a session before returning a constrained URL', async () => {
    repository.createPending.mockResolvedValue(created(uploadRecord));

    const result = await service.start(ownerId, analysisId, {
      documentType: 'EARNINGS_SUMMARY',
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    });
    expect(result).toEqual({
      upload: {
        expiresAt: '2026-08-05T00:05:00.000Z',
        headers: {
          'content-length': '1024',
          'content-type': 'application/pdf',
          'x-amz-meta-stocklens-sha256': 'a'.repeat(64),
        },
        url: 'https://storage.test/constrained-upload',
      },
      uploadSession: {
        analysisId,
        createdAt: '2026-08-05T00:00:00.000Z',
        documentType: 'EARNINGS_SUMMARY',
        expiresAt: '2026-08-06T00:00:00.000Z',
        id: uploadId,
        mimeType: 'application/pdf',
        originalName: 'results.pdf',
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
        status: 'PENDING',
      },
    });

    const createInput = repository.createPending.mock.calls[0]?.[0];
    expect(createInput).toMatchObject({
      analysisId,
      expiresAt: new Date('2026-08-06T00:00:00.000Z'),
      ownerId,
      storageBucket: 'private-test',
    });
    expect(createInput?.storageKey).toMatch(
      new RegExp(
        `^owners/${ownerId}/analyses/${analysisId}/uploads/[a-f0-9-]+/[a-f0-9-]+\\.pdf$`,
      ),
    );
    expect(objectStorage.createPresignedPdfUpload).toHaveBeenCalledWith({
      contentLength: 1024,
      objectKey: uploadRecord.storageKey,
      sha256: 'a'.repeat(64),
    });
  });

  const rejectedStarts: Array<
    [string, CreatePendingDocumentUploadResult, string]
  > = [
    [
      'cross-user or missing analysis',
      { kind: 'analysis-not-found' },
      'ANALYSIS_NOT_FOUND',
    ],
    [
      'fourth reserved slot',
      { kind: 'limit-exceeded' },
      'DOCUMENT_LIMIT_EXCEEDED',
    ],
  ];

  it.each(rejectedStarts)(
    'rejects %s without presigning',
    async (_name, result, code) => {
      repository.createPending.mockResolvedValue(result);

      await expect(
        service.start(ownerId, analysisId, {
          documentType: 'UNKNOWN',
          mimeType: 'application/pdf',
          originalName: 'results.pdf',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
        }),
      ).rejects.toMatchObject({ code });
      expect(objectStorage.createPresignedPdfUpload).not.toHaveBeenCalled();
    },
  );

  it('PDF-FR-006 reissues a URL only for an owner-scoped pending session', async () => {
    repository.findForOwner.mockResolvedValue(uploadRecord);

    await expect(
      service.presignAgain(ownerId, analysisId, uploadId),
    ).resolves.toMatchObject({
      expiresAt: '2026-08-05T00:05:00.000Z',
      url: 'https://storage.test/constrained-upload',
    });
    expect(repository.findForOwner).toHaveBeenCalledWith(
      ownerId,
      analysisId,
      uploadId,
    );
  });

  it.each([
    ['missing', null, 'DOCUMENT_UPLOAD_NOT_FOUND'],
    ['expired', { ...uploadRecord, expiresAt: fixedNow }, 'UPLOAD_EXPIRED'],
    [
      'non-pending',
      { ...uploadRecord, status: 'VALIDATING' as const },
      'DOCUMENT_UPLOAD_NOT_ACTIVE',
    ],
  ])('rejects a %s session without presigning', async (_name, record, code) => {
    repository.findForOwner.mockResolvedValue(record);

    await expect(
      service.presignAgain(ownerId, analysisId, uploadId),
    ).rejects.toMatchObject({ code });
    expect(objectStorage.createPresignedPdfUpload).not.toHaveBeenCalled();
  });

  it('sanitizes provider failures without returning storage details', async () => {
    repository.findForOwner.mockResolvedValue(uploadRecord);
    objectStorage.createPresignedPdfUpload.mockRejectedValue(
      new Error('secret provider detail'),
    );

    await expect(
      service.presignAgain(ownerId, analysisId, uploadId),
    ).rejects.toMatchObject({
      code: 'OBJECT_STORAGE_UNAVAILABLE',
      message: 'Object storage is temporarily unavailable.',
    });
    expect(repository.rejectPendingPresignFailure).not.toHaveBeenCalled();
  });

  it('releases a newly reserved slot when the first presign fails', async () => {
    repository.createPending.mockResolvedValue(created(uploadRecord));
    objectStorage.createPresignedPdfUpload.mockRejectedValue(
      new Error('secret provider detail'),
    );

    await expect(
      service.start(ownerId, analysisId, {
        documentType: 'UNKNOWN',
        mimeType: 'application/pdf',
        originalName: 'results.pdf',
        sha256: 'a'.repeat(64),
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'OBJECT_STORAGE_UNAVAILABLE' });
    expect(repository.rejectPendingPresignFailure).toHaveBeenCalledWith(
      ownerId,
      analysisId,
      uploadId,
    );
  });
});

function created(
  upload: DocumentUploadRecord,
): CreatePendingDocumentUploadResult {
  return { kind: 'created', upload };
}
