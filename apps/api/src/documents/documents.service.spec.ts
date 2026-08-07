import type {
  DeleteDocumentResult,
  DocumentRecord,
  DocumentRepository,
} from '../database/document.repository';
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
      'deleteFinalizedForAnalysis' | 'listFinalizedForAnalysis'
    >
  > = {
    deleteFinalizedForAnalysis: jest.fn(),
    listFinalizedForAnalysis: jest.fn(),
  };
  const cleanupPublisher: jest.Mocked<
    Pick<ObjectCleanupQueuePublisher, 'enqueue'>
  > = {
    enqueue: jest.fn(),
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
