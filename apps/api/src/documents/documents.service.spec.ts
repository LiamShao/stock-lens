import type {
  DeleteDocumentResult,
  DocumentRecord,
  DocumentRepository,
} from '../database/document.repository';
import type { ObjectStorage } from '@stocklens/object-storage';
import type { ObjectCleanupQueuePublisher } from './object-cleanup-queue';
import { DocumentsService } from './documents.service';

const ownerId = '84728d4e-96c5-4d87-907d-cb572322bb0a';
const analysisId = '3e4becba-9f40-4dd5-a900-f98919c31469';
const documentId = 'a26225c9-623a-43d6-898d-0d5144e422b1';
const fixedNow = new Date('2026-08-06T06:00:00.000Z');

const documentRecord: DocumentRecord = {
  analysisId,
  createdAt: fixedNow,
  documentType: 'EARNINGS_SUMMARY',
  id: documentId,
  mimeType: 'application/pdf',
  originalName: 'results.pdf',
  ownerId,
  pageCount: null,
  sha256: 'a'.repeat(64),
  sizeBytes: 1024n,
  storageBucket: 'private-test',
  storageKey: 'owners/private/object.pdf',
  updatedAt: fixedNow,
  uploadedAt: fixedNow,
};

describe('DocumentsService (PDF-TASK-009)', () => {
  const repository: jest.Mocked<
    Pick<
      DocumentRepository,
      | 'deleteFinalizedForAnalysis'
      | 'findFinalizedForDownload'
      | 'listFinalizedForAnalysis'
    >
  > = {
    deleteFinalizedForAnalysis: jest.fn(),
    findFinalizedForDownload: jest.fn(),
    listFinalizedForAnalysis: jest.fn(),
  };
  const cleanupPublisher: jest.Mocked<
    Pick<ObjectCleanupQueuePublisher, 'enqueue'>
  > = {
    enqueue: jest.fn(),
  };
  const objectStorage: jest.Mocked<
    Pick<ObjectStorage, 'createPresignedPdfDownload' | 'headObject'>
  > = {
    createPresignedPdfDownload: jest.fn(),
    headObject: jest.fn(),
  };
  let service: DocumentsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    jest.resetAllMocks();
    cleanupPublisher.enqueue.mockResolvedValue({
      dispatched: true,
      jobExecutionId: 'b65f49d8-d9cd-4144-b6b8-d89d2fd308dc',
    });
    service = new DocumentsService(
      repository as unknown as DocumentRepository,
      cleanupPublisher as unknown as ObjectCleanupQueuePublisher,
      objectStorage as unknown as ObjectStorage,
      'private-test',
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('PDF-FR-008 lists only storage-safe finalized document metadata', async () => {
    repository.listFinalizedForAnalysis.mockResolvedValue({
      documents: [documentRecord],
      kind: 'found',
    });

    const result = await service.list(ownerId, analysisId);

    expect(result).toEqual({
      items: [
        {
          analysisId,
          createdAt: fixedNow.toISOString(),
          documentType: 'EARNINGS_SUMMARY',
          id: documentId,
          mimeType: 'application/pdf',
          originalName: 'results.pdf',
          sha256: 'a'.repeat(64),
          sizeBytes: 1024,
          updatedAt: fixedNow.toISOString(),
          uploadedAt: fixedNow.toISOString(),
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('ownerId');
    expect(result.items[0]).not.toHaveProperty('storageBucket');
    expect(result.items[0]).not.toHaveProperty('storageKey');
  });

  it('returns an empty list for an owned analysis without documents', async () => {
    repository.listFinalizedForAnalysis.mockResolvedValue({
      documents: [],
      kind: 'found',
    });

    await expect(service.list(ownerId, analysisId)).resolves.toEqual({
      items: [],
    });
  });

  it('VIEW-FR-015 returns a bounded read URL after owner lineage and object checks', async () => {
    repository.findFinalizedForDownload.mockResolvedValue({
      document: documentRecord,
      kind: 'found',
    });
    objectStorage.headObject.mockResolvedValue({
      checksumSha256: null,
      contentLength: 1024,
      contentType: 'application/pdf',
      eTag: null,
      lastModified: fixedNow,
      metadata: {},
    });
    objectStorage.createPresignedPdfDownload.mockResolvedValue({
      expiresAt: new Date('2026-08-06T06:05:00.000Z'),
      url: 'https://storage.test/private.pdf?signature=secret',
    });

    await expect(
      service.createDownloadUrl(ownerId, analysisId, documentId),
    ).resolves.toEqual({
      expiresAt: '2026-08-06T06:05:00.000Z',
      url: 'https://storage.test/private.pdf?signature=secret',
    });
    expect(objectStorage.headObject).toHaveBeenCalledWith(
      documentRecord.storageKey,
    );
    expect(objectStorage.createPresignedPdfDownload).toHaveBeenCalledWith({
      objectKey: documentRecord.storageKey,
    });
  });

  it.each([
    ['analysis', { kind: 'analysis-not-found' }, 'ANALYSIS_NOT_FOUND'],
    ['document', { kind: 'document-not-found' }, 'DOCUMENT_NOT_FOUND'],
  ] as const)(
    'VIEW-SEC-001 hides a missing or cross-user %s before storage access',
    async (_label, result, code) => {
      repository.findFinalizedForDownload.mockResolvedValue(result);

      await expect(
        service.createDownloadUrl(ownerId, analysisId, documentId),
      ).rejects.toMatchObject({ code });
      expect(objectStorage.headObject).not.toHaveBeenCalled();
      expect(objectStorage.createPresignedPdfDownload).not.toHaveBeenCalled();
    },
  );

  it('VIEW-AC-015 sanitizes a read-presign provider failure', async () => {
    repository.findFinalizedForDownload.mockResolvedValue({
      document: documentRecord,
      kind: 'found',
    });
    objectStorage.headObject.mockResolvedValue({
      checksumSha256: null,
      contentLength: 1024,
      contentType: 'application/pdf',
      eTag: null,
      lastModified: fixedNow,
      metadata: {},
    });
    objectStorage.createPresignedPdfDownload.mockRejectedValue(
      new Error('secret signing endpoint'),
    );

    await expect(
      service.createDownloadUrl(ownerId, analysisId, documentId),
    ).rejects.toMatchObject({
      code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
      message: 'Document download is temporarily unavailable.',
      status: 503,
    });
  });

  it.each([
    ['missing object', null],
    ['provider failure', new Error('secret provider endpoint')],
  ])(
    'VIEW-AC-015 maps %s to a sanitized unavailable error',
    async (_label, storageResult) => {
      repository.findFinalizedForDownload.mockResolvedValue({
        document: documentRecord,
        kind: 'found',
      });
      if (storageResult instanceof Error) {
        objectStorage.headObject.mockRejectedValue(storageResult);
      } else {
        objectStorage.headObject.mockResolvedValue(storageResult);
      }

      await expect(
        service.createDownloadUrl(ownerId, analysisId, documentId),
      ).rejects.toMatchObject({
        code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
        message: 'Document download is temporarily unavailable.',
        status: 503,
      });
      expect(objectStorage.createPresignedPdfDownload).not.toHaveBeenCalled();
    },
  );

  it('fails closed when persisted and runtime storage buckets diverge', async () => {
    repository.findFinalizedForDownload.mockResolvedValue({
      document: { ...documentRecord, storageBucket: 'unexpected-private' },
      kind: 'found',
    });

    await expect(
      service.createDownloadUrl(ownerId, analysisId, documentId),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE' });
    expect(objectStorage.headObject).not.toHaveBeenCalled();
  });

  it('VIEW-SEC-007 rejects a provider expiry beyond five minutes', async () => {
    repository.findFinalizedForDownload.mockResolvedValue({
      document: documentRecord,
      kind: 'found',
    });
    objectStorage.headObject.mockResolvedValue({
      checksumSha256: null,
      contentLength: 1024,
      contentType: 'application/pdf',
      eTag: null,
      lastModified: fixedNow,
      metadata: {},
    });
    objectStorage.createPresignedPdfDownload.mockResolvedValue({
      expiresAt: new Date(fixedNow.getTime() + 300_001),
      url: 'https://storage.test/private.pdf?signature=secret',
    });

    await expect(
      service.createDownloadUrl(ownerId, analysisId, documentId),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE' });
  });

  it('PDF-SEC-006 maps a missing or cross-user analysis list to ANALYSIS_NOT_FOUND', async () => {
    repository.listFinalizedForAnalysis.mockResolvedValue({
      kind: 'analysis-not-found',
    });

    await expect(service.list(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_NOT_FOUND',
    });
  });

  it('soft-deletes transactionally before dispatching durable cleanup', async () => {
    repository.deleteFinalizedForAnalysis.mockResolvedValue({
      kind: 'deleted',
    });

    await expect(
      service.delete(ownerId, analysisId, documentId),
    ).resolves.toBeUndefined();
    expect(repository.deleteFinalizedForAnalysis).toHaveBeenCalledWith({
      analysisId,
      deletedAt: fixedNow,
      id: documentId,
      ownerId,
    });
    expect(cleanupPublisher.enqueue).toHaveBeenCalledWith({
      analysisId,
      ownerId,
      target: { id: documentId, kind: 'document' },
    });
  });

  it.each([
    ['analysis', { kind: 'analysis-not-found' }, 'ANALYSIS_NOT_FOUND'],
    ['document', { kind: 'document-not-found' }, 'DOCUMENT_NOT_FOUND'],
  ] as Array<[string, DeleteDocumentResult, string]>)(
    'PDF-SEC-006 maps a missing or cross-user %s without dispatching cleanup',
    async (_name, result, code) => {
      repository.deleteFinalizedForAnalysis.mockResolvedValue(result);

      await expect(
        service.delete(ownerId, analysisId, documentId),
      ).rejects.toMatchObject({ code });
      expect(cleanupPublisher.enqueue).not.toHaveBeenCalled();
    },
  );

  it('keeps delete successful when Redis dispatch fails after durable persistence', async () => {
    repository.deleteFinalizedForAnalysis.mockResolvedValue({
      kind: 'deleted',
    });
    cleanupPublisher.enqueue.mockRejectedValue(
      new Error('secret Redis connection detail'),
    );

    await expect(
      service.delete(ownerId, analysisId, documentId),
    ).resolves.toBeUndefined();
  });
});
