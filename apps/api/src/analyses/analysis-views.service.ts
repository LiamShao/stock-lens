import { HttpStatus, Injectable } from '@nestjs/common';
import {
  analysisViewsGenerationOutputSchema,
  analysisViewsResourceSchema,
  collectAnalysisViewEvidenceIds,
  validateAnalysisViewsCompliance,
  type AnalysisViewEvidence,
  type AnalysisViewsResource,
} from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import {
  AnalysisViewsRepository,
  type AnalysisViewsRecord,
} from '../database/analysis-views.repository';

@Injectable()
export class AnalysisViewsService {
  constructor(private readonly repository: AnalysisViewsRepository) {}

  async get(
    ownerId: string,
    analysisId: string,
  ): Promise<AnalysisViewsResource> {
    const record = await this.repository.findActiveById(ownerId, analysisId);
    if (record === null) throw analysisNotFound();
    if (record.status !== 'COMPLETED') {
      throw new ApiException(
        'ANALYSIS_VIEWS_NOT_READY',
        'Analysis views are not ready.',
        HttpStatus.CONFLICT,
      );
    }

    const output = parsePersistedOutput(record);
    const evidenceIds = collectAnalysisViewEvidenceIds(output).sort();
    const evidenceRecords = await this.repository.findEvidenceProjections(
      ownerId,
      analysisId,
      evidenceIds,
    );
    if (
      evidenceRecords.length !== evidenceIds.length ||
      evidenceRecords.some(
        (evidence) => evidence.pageNumber !== evidence.page.pageNumber,
      )
    ) {
      throw invalidPersistedViews();
    }

    return analysisViewsResourceSchema.parse({
      analysisId: record.id,
      completedAt: record.completedAt?.toISOString(),
      evidences: evidenceRecords.map((evidence): AnalysisViewEvidence => ({
        chunkId: evidence.chunkId,
        documentId: evidence.documentId,
        documentName: evidence.document.originalName,
        excerpt: evidence.excerpt,
        id: evidence.id,
        pageNumber: evidence.page.pageNumber,
      })),
      status: 'COMPLETED',
      views: {
        analyst: output.analystView,
        buffettMunger: output.buffettMunger,
        justTellMe: output.justTellMe,
      },
    });
  }
}

function parsePersistedOutput(record: AnalysisViewsRecord) {
  const parsed = analysisViewsGenerationOutputSchema.safeParse({
    analystView: record.analystViewOutput,
    buffettMunger: record.buffettMungerOutput,
    justTellMe: record.justTellMeOutput,
  });
  if (
    !parsed.success ||
    record.completedAt === null ||
    !validateAnalysisViewsCompliance(parsed.data).valid
  ) {
    throw invalidPersistedViews();
  }
  return parsed.data;
}

function analysisNotFound(): ApiException {
  return new ApiException(
    'ANALYSIS_NOT_FOUND',
    'Analysis was not found.',
    HttpStatus.NOT_FOUND,
  );
}

function invalidPersistedViews(): ApiException {
  return new ApiException(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred.',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
