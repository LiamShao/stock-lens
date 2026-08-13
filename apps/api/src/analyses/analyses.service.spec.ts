import type { AnalysisRepository } from '../database/analysis.repository';
import type { AnalysisProcessingRepository } from '../database/analysis-processing.repository';
import type { AnalysisProcessingQueuePublisher } from './analysis-processing.queue';
import { AnalysesService } from './analyses.service';

const ownerId = '2f7cbd41-9fb4-42c6-94b8-e10ee9642947';
const analysisId = '9cd74450-4194-4ce1-a22a-09db7c6f8704';
const companyId = '5de0df6a-b3e7-4b90-a7b8-3067ac8cf501';

const record = {
  companyId: null,
  completedAt: null,
  createdAt: new Date('2026-07-24T12:00:00.000Z'),
  failureCode: null,
  failureMessage: null,
  id: analysisId,
  ownerId,
  status: 'DRAFT' as const,
  title: 'Analysis',
  updatedAt: new Date('2026-07-24T12:00:00.000Z'),
};

describe('AnalysesService', () => {
  const repository = {
    companyExists: jest.fn(),
    create: jest.fn(),
    findActiveById: jest.fn(),
    listActive: jest.fn(),
    renameActive: jest.fn(),
    softDelete: jest.fn(),
  };
  const processingRepository = { start: jest.fn() };
  const processingQueue = { dispatch: jest.fn() };
  let service: AnalysesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AnalysesService(
      repository as unknown as AnalysisRepository,
      processingRepository as unknown as AnalysisProcessingRepository,
      processingQueue as unknown as AnalysisProcessingQueuePublisher,
    );
  });

  it('PROC-AC-001 returns a durable processing execution', async () => {
    processingRepository.start.mockResolvedValue({
      acceptedAt: new Date('2026-08-13T09:00:00.000Z'),
      analysisId,
      executionId: 'df415a37-d409-4d7d-9227-b777948b10f4',
      kind: 'started',
      ownerId,
    });
    processingQueue.dispatch.mockResolvedValue(true);

    await expect(service.process(ownerId, analysisId)).resolves.toEqual({
      acceptedAt: '2026-08-13T09:00:00.000Z',
      analysisId,
      executionId: 'df415a37-d409-4d7d-9227-b777948b10f4',
      status: 'PARSING',
    });
    expect(processingQueue.dispatch).toHaveBeenCalledWith(
      'df415a37-d409-4d7d-9227-b777948b10f4',
    );
  });

  it('PROC-AC-001 rejects an analysis without documents', async () => {
    processingRepository.start.mockResolvedValue({ kind: 'no-documents' });

    await expect(service.process(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_HAS_NO_DOCUMENTS',
    });
    expect(processingQueue.dispatch).not.toHaveBeenCalled();
  });

  it('ANALYSIS-AC-002 rejects an unknown company without creating data', async () => {
    repository.companyExists.mockResolvedValue(false);

    await expect(
      service.create(ownerId, { companyId, title: 'Analysis' }),
    ).rejects.toMatchObject({ code: 'COMPANY_NOT_FOUND' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('ANALYSIS-AC-004 returns an opaque cursor only when another page exists', async () => {
    repository.listActive.mockResolvedValue([
      record,
      {
        ...record,
        createdAt: new Date('2026-07-24T11:00:00.000Z'),
        id: '66835f55-dc16-4b19-a7d7-044ccaaaf20e',
      },
    ]);

    const result = await service.list(ownerId, { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(repository.listActive).toHaveBeenCalledWith(ownerId, {
      limit: 2,
    });
  });

  it('ANALYSIS-AC-006 maps missing, cross-user, and deleted records to one error', async () => {
    repository.findActiveById.mockResolvedValue(null);
    repository.renameActive.mockResolvedValue(null);
    repository.softDelete.mockResolvedValue(false);

    await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_NOT_FOUND',
    });
    await expect(
      service.rename(ownerId, analysisId, { title: 'Renamed' }),
    ).rejects.toMatchObject({ code: 'ANALYSIS_NOT_FOUND' });
    await expect(service.delete(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_NOT_FOUND',
    });
  });
});
