import type { ObjectStorage } from '@stocklens/object-storage';

import type {
  ClaimDocumentUploadResult,
  CompleteDocumentUploadResult,
  CreatePendingDocumentUploadResult,
  DocumentUploadRecord,
  DocumentUploadRepository,
  FinalizedDocumentRecord,
} from '../database/document-upload.repository';
import { DocumentUploadsService } from './document-uploads.service';
import type { ObjectCleanupQueuePublisher } from './object-cleanup-queue';
import type {
  PdfObjectValidator,
  PdfObjectValidationResult,
} from './pdf-object-validator';

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

const documentRecord: FinalizedDocumentRecord = {
  analysisId,
  createdAt: fixedNow,
  documentType: 'EARNINGS_SUMMARY',
  id: 'a26225c9-623a-43d6-898d-0d5144e422b1',
  mimeType: 'application/pdf',
  originalName: 'results.pdf',
  sha256: 'a'.repeat(64),
  sizeBytes: 1024n,
  updatedAt: fixedNow,
  uploadedAt: fixedNow,
};

describe('DocumentUploadsService (PDF-TASK-006)', () => {
  const repository: jest.Mocked<
    Pick<
      DocumentUploadRepository,
      | 'claimForFinalize'
      | 'completeFinalize'
      | 'createPending'
      | 'findForOwner'
      | 'rejectInvalidFinalize'
      | 'rejectPendingPresignFailure'
      | 'releaseFinalizeClaim'
    >
  > = {
    claimForFinalize: jest.fn(),
    completeFinalize: jest.fn(),
    createPending: jest.fn(),
    findForOwner: jest.fn(),
    rejectInvalidFinalize: jest.fn(),
    rejectPendingPresignFailure: jest.fn(),
    releaseFinalizeClaim: jest.fn(),
  };
  const objectStorage: jest.Mocked<
    Pick<ObjectStorage, 'createPresignedPdfUpload'>
  > = {
    createPresignedPdfUpload: jest.fn(),
  };
  const validator: jest.Mocked<Pick<PdfObjectValidator, 'validate'>> = {
    validate: jest.fn(),
  };
  const cleanupPublisher: jest.Mocked<
    Pick<ObjectCleanupQueuePublisher, 'enqueue'>
  > = {
    enqueue: jest.fn(),
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
    repository.releaseFinalizeClaim.mockResolvedValue(true);
    repository.rejectInvalidFinalize.mockResolvedValue(true);
    cleanupPublisher.enqueue.mockResolvedValue({
      dispatched: true,
      jobExecutionId: 'b65f49d8-d9cd-4144-b6b8-d89d2fd308dc',
    });
    service = new DocumentUploadsService(
      repository as unknown as DocumentUploadRepository,
      objectStorage as unknown as ObjectStorage,
      'private-test',
      validator as unknown as PdfObjectValidator,
      cleanupPublisher as unknown as ObjectCleanupQueuePublisher,
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
      'PDF-SEC-006 cross-user or missing analysis',
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
    ['PDF-SEC-006 missing or cross-user', null, 'DOCUMENT_UPLOAD_NOT_FOUND'],
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

  it('PDF-FR-007 finalizes a trusted object and returns storage-safe document metadata', async () => {
    repository.claimForFinalize.mockResolvedValue({
      kind: 'claimed',
      upload: { ...uploadRecord, status: 'VALIDATING' },
    });
    validator.validate.mockResolvedValue(validObject());
    repository.completeFinalize.mockResolvedValue({
      document: documentRecord,
      kind: 'completed',
    });

    await expect(
      service.finalize(ownerId, analysisId, uploadId),
    ).resolves.toEqual({
      analysisId,
      createdAt: fixedNow.toISOString(),
      documentType: 'EARNINGS_SUMMARY',
      id: documentRecord.id,
      mimeType: 'application/pdf',
      originalName: 'results.pdf',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      updatedAt: fixedNow.toISOString(),
      uploadedAt: fixedNow.toISOString(),
    });
    expect(validator.validate).toHaveBeenCalledWith({
      expectedSha256: 'a'.repeat(64),
      expectedSizeBytes: 1024,
      objectKey: uploadRecord.storageKey,
    });
    expect(repository.completeFinalize).toHaveBeenCalledWith({
      analysisId,
      id: uploadId,
      now: fixedNow,
      ownerId,
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
    });
  });

  it('returns the same document for an already completed session without reading storage', async () => {
    repository.claimForFinalize.mockResolvedValue({
      document: documentRecord,
      kind: 'completed',
    });

    await expect(
      service.finalize(ownerId, analysisId, uploadId),
    ).resolves.toMatchObject({ id: documentRecord.id });
    expect(validator.validate).not.toHaveBeenCalled();
    expect(repository.completeFinalize).not.toHaveBeenCalled();
  });

  it('restores a retryable session after sanitized storage validation failure', async () => {
    repository.claimForFinalize.mockResolvedValue(claimed());
    validator.validate.mockResolvedValue({
      kind: 'storage-failure',
      reason: 'OBJECT_READ_FAILED',
    });

    await expect(
      service.finalize(ownerId, analysisId, uploadId),
    ).rejects.toMatchObject({ code: 'STORAGE_VALIDATION_FAILED' });
    expect(repository.releaseFinalizeClaim).toHaveBeenCalledWith(
      ownerId,
      analysisId,
      uploadId,
    );
    expect(cleanupPublisher.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid object and dispatches its durable cleanup', async () => {
    repository.claimForFinalize.mockResolvedValue(claimed());
    validator.validate.mockResolvedValue({
      kind: 'invalid',
      reason: 'INVALID_PDF_HEADER',
    });

    await expect(
      service.finalize(ownerId, analysisId, uploadId),
    ).rejects.toMatchObject({ code: 'INVALID_PDF' });
    expect(repository.rejectInvalidFinalize).toHaveBeenCalledWith({
      analysisId,
      failureCode: 'INVALID_PDF_HEADER',
      failureMessage: 'Uploaded object did not pass trusted PDF validation.',
      id: uploadId,
      ownerId,
    });
    expect(cleanupPublisher.enqueue).toHaveBeenCalledWith({
      analysisId,
      ownerId,
      target: { id: uploadId, kind: 'document-upload' },
    });
  });

  it.each([
    ['duplicate', { kind: 'duplicate' }, 'DUPLICATE_DOCUMENT'],
    ['fourth document', { kind: 'limit-exceeded' }, 'DOCUMENT_LIMIT_EXCEEDED'],
  ] as Array<[string, CompleteDocumentUploadResult, string]>)(
    'rejects a valid %s object and retains cleanup delivery',
    async (_name, completed, code) => {
      repository.claimForFinalize.mockResolvedValue(claimed());
      validator.validate.mockResolvedValue(validObject());
      repository.completeFinalize.mockResolvedValue(completed);

      await expect(
        service.finalize(ownerId, analysisId, uploadId),
      ).rejects.toMatchObject({ code });
      expect(cleanupPublisher.enqueue).toHaveBeenCalled();
    },
  );

  it.each([
    [
      'PDF-SEC-006 missing or cross-user',
      { kind: 'not-found' },
      'DOCUMENT_UPLOAD_NOT_FOUND',
    ],
    ['expired', { kind: 'expired' }, 'UPLOAD_EXPIRED'],
    ['in progress', { kind: 'inactive' }, 'DOCUMENT_UPLOAD_NOT_ACTIVE'],
  ] as Array<[string, ClaimDocumentUploadResult, string]>)(
    'rejects a %s finalize claim before reading storage',
    async (_name, claim, code) => {
      repository.claimForFinalize.mockResolvedValue(claim);

      await expect(
        service.finalize(ownerId, analysisId, uploadId),
      ).rejects.toMatchObject({ code });
      expect(validator.validate).not.toHaveBeenCalled();
    },
  );
});

function created(
  upload: DocumentUploadRecord,
): CreatePendingDocumentUploadResult {
  return { kind: 'created', upload };
}

function claimed(): ClaimDocumentUploadResult {
  return {
    kind: 'claimed',
    upload: { ...uploadRecord, status: 'VALIDATING' },
  };
}

function validObject(): PdfObjectValidationResult {
  return { kind: 'valid', sha256: 'a'.repeat(64), sizeBytes: 1024 };
}
