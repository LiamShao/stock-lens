import {
  ANALYSIS_VIEW_SCHEMA_VERSION,
  analysisViewsResourceSchema,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

import type { AnalysisViewsRepository } from '../database/analysis-views.repository';
import { AnalysisViewsService } from './analysis-views.service';

const ownerId = '2f7cbd41-9fb4-42c6-94b8-e10ee9642947';
const analysisId = '9cd74450-4194-4ce1-a22a-09db7c6f8704';
const evidenceId = '3e4becba-9f40-4dd5-a900-f98919c31469';
const completedAt = new Date('2026-08-30T02:00:00.000Z');

describe('AnalysisViewsService', () => {
  const repository = {
    findActiveById: jest.fn(),
    findEvidenceProjections: jest.fn(),
  };
  let service: AnalysisViewsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AnalysisViewsService(
      repository as unknown as AnalysisViewsRepository,
    );
  });

  it('VIEW-FR-012 returns a strict completed aggregate with one evidence projection', async () => {
    repository.findActiveById.mockResolvedValue(completedRecord());
    repository.findEvidenceProjections.mockResolvedValue([evidenceRecord()]);

    const result = await service.get(ownerId, analysisId);

    expect(analysisViewsResourceSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      analysisId,
      completedAt: completedAt.toISOString(),
      evidences: [{ id: evidenceId, pageNumber: 3 }],
      status: 'COMPLETED',
    });
    expect(repository.findEvidenceProjections).toHaveBeenCalledWith(
      ownerId,
      analysisId,
      [evidenceId],
    );
  });

  it('VIEW-SEC-001 maps missing and cross-owner analyses to ANALYSIS_NOT_FOUND', async () => {
    repository.findActiveById.mockResolvedValue(null);

    await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_NOT_FOUND',
      status: 404,
    });
    expect(repository.findEvidenceProjections).not.toHaveBeenCalled();
  });

  it('VIEW-FR-011 returns ANALYSIS_VIEWS_NOT_READY without reading evidence', async () => {
    repository.findActiveById.mockResolvedValue({
      ...completedRecord(),
      completedAt: null,
      status: 'VALIDATING',
    });

    await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
      code: 'ANALYSIS_VIEWS_NOT_READY',
      status: 409,
    });
    expect(repository.findEvidenceProjections).not.toHaveBeenCalled();
  });

  it.each([
    ['missing completedAt', { completedAt: null }],
    ['corrupt view JSONB', { analystViewOutput: { unexpected: true } }],
  ])(
    'VIEW-SEC-003 rejects %s without reading evidence',
    async (_case, patch) => {
      repository.findActiveById.mockResolvedValue({
        ...completedRecord(),
        ...patch,
      });

      await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        status: 500,
      });
      expect(repository.findEvidenceProjections).not.toHaveBeenCalled();
    },
  );

  it('VIEW-FR-012 fails closed when referenced evidence is missing or has inconsistent page lineage', async () => {
    repository.findActiveById.mockResolvedValue(completedRecord());
    repository.findEvidenceProjections
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...evidenceRecord(), page: { pageNumber: 4 } },
      ]);

    await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    await expect(service.get(ownerId, analysisId)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });
});

function completedRecord() {
  const output = validOutput();
  return {
    analystViewOutput: output.analystView,
    buffettMungerOutput: output.buffettMunger,
    completedAt,
    id: analysisId,
    justTellMeOutput: output.justTellMe,
    status: 'COMPLETED' as const,
  };
}

function evidenceRecord() {
  return {
    chunkId: '4aedb1d7-b0aa-42cf-a1eb-8ac5043643f2',
    document: { originalName: '決算短信.pdf' },
    documentId: 'fab6a43e-e2bd-4887-b878-886f56dd650a',
    excerpt: '売上高は前年同期比で増加しました。',
    id: evidenceId,
    page: { pageNumber: 3 },
    pageNumber: 3,
  };
}

function validOutput(): AnalysisViewsGenerationOutput {
  return {
    analystView: view([
      'BUSINESS_OVERVIEW',
      'FINANCIAL_HIGHLIGHTS',
      'MANAGEMENT_GUIDANCE',
      'POSITIVE_FINDINGS',
      'RISKS',
      'UNCERTAINTIES',
      'WATCH_ITEMS',
      'SOURCES',
    ]),
    buffettMunger: view([
      'BUSINESS_UNDERSTANDABILITY',
      'COMPETITIVE_ADVANTAGE',
      'CASH_GENERATION',
      'CAPITAL_ALLOCATION',
      'MANAGEMENT_INCENTIVES',
      'LONG_TERM_RISKS',
      'MISSING_INFORMATION',
    ]),
    justTellMe: view([
      'HOW_THE_COMPANY_MAKES_MONEY',
      'RECENT_CHANGES',
      'POSITIVES',
      'RISKS',
      'WATCH_ITEMS',
      'MISSING_INFORMATION',
    ]),
  } as AnalysisViewsGenerationOutput;
}

function view(sectionKeys: readonly string[]) {
  return {
    schemaVersion: ANALYSIS_VIEW_SCHEMA_VERSION,
    sections: sectionKeys.map((key, index) => ({
      blocks: [
        {
          evidenceIds: [evidenceId],
          isMissingInformation: false,
          key: `block.${index}`,
          text: '現在の資料に基づく確認事項です。',
        },
      ],
      key,
      title: `確認項目${index + 1}`,
    })),
  };
}
