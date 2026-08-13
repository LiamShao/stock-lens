import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AnalysisListQuery,
  AnalysisPageResponse,
  AnalysisResource,
  CreateAnalysisRequest,
  RenameAnalysisRequest,
  ProcessAnalysisResponse,
} from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import {
  AnalysisRepository,
  type AnalysisRecord,
} from '../database/analysis.repository';
import { AnalysisProcessingRepository } from '../database/analysis-processing.repository';
import { AnalysisProcessingQueuePublisher } from './analysis-processing.queue';
import { decodeAnalysisCursor, encodeAnalysisCursor } from './analysis-cursor';

@Injectable()
export class AnalysesService {
  constructor(
    private readonly repository: AnalysisRepository,
    private readonly processingRepository: AnalysisProcessingRepository,
    private readonly processingQueue: AnalysisProcessingQueuePublisher,
  ) {}

  async process(
    ownerId: string,
    analysisId: string,
  ): Promise<ProcessAnalysisResponse> {
    const result = await this.processingRepository.start(ownerId, analysisId);
    if (result.kind === 'not-found') throw analysisNotFound();
    if (result.kind === 'no-documents') {
      throw new ApiException(
        'ANALYSIS_HAS_NO_DOCUMENTS',
        'Analysis has no documents.',
        HttpStatus.CONFLICT,
      );
    }
    if (result.kind === 'not-processable') {
      throw new ApiException(
        'ANALYSIS_NOT_PROCESSABLE',
        'Analysis cannot be processed in its current status.',
        HttpStatus.CONFLICT,
      );
    }
    await this.processingQueue.dispatch(result.executionId);
    return {
      acceptedAt: result.acceptedAt.toISOString(),
      analysisId: result.analysisId,
      executionId: result.executionId,
      status: 'PARSING',
    };
  }

  async create(
    ownerId: string,
    input: CreateAnalysisRequest,
  ): Promise<AnalysisResource> {
    if (
      input.companyId !== undefined &&
      input.companyId !== null &&
      !(await this.repository.companyExists(input.companyId))
    ) {
      throw new ApiException(
        'COMPANY_NOT_FOUND',
        'Company was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const record = await this.repository.create({
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ownerId,
      title: input.title,
    });
    return toAnalysisResource(record);
  }

  async list(
    ownerId: string,
    query: AnalysisListQuery,
  ): Promise<AnalysisPageResponse> {
    const cursor = query.cursor
      ? decodeAnalysisCursor(query.cursor)
      : undefined;
    if (query.cursor && cursor === null) {
      throw new ApiException(
        'VALIDATION_ERROR',
        'Request validation failed.',
        HttpStatus.BAD_REQUEST,
        {
          issues: [
            {
              code: 'custom',
              message: 'Cursor is invalid.',
              path: 'cursor',
            },
          ],
        },
      );
    }
    const records = await this.repository.listActive(ownerId, {
      ...(cursor ? { cursor } : {}),
      limit: query.limit + 1,
      ...(query.status ? { status: query.status } : {}),
    });
    const hasNextPage = records.length > query.limit;
    const pageRecords = hasNextPage ? records.slice(0, query.limit) : records;
    const lastRecord = pageRecords.at(-1);
    return {
      items: pageRecords.map(toAnalysisResource),
      nextCursor:
        hasNextPage && lastRecord
          ? encodeAnalysisCursor({
              createdAt: lastRecord.createdAt,
              id: lastRecord.id,
            })
          : null,
    };
  }

  async get(ownerId: string, id: string): Promise<AnalysisResource> {
    const record = await this.repository.findActiveById(ownerId, id);
    if (record === null) {
      throw analysisNotFound();
    }
    return toAnalysisResource(record);
  }

  async rename(
    ownerId: string,
    id: string,
    input: RenameAnalysisRequest,
  ): Promise<AnalysisResource> {
    const record = await this.repository.renameActive(ownerId, id, input.title);
    if (record === null) {
      throw analysisNotFound();
    }
    return toAnalysisResource(record);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    if (!(await this.repository.softDelete(ownerId, id))) {
      throw analysisNotFound();
    }
  }
}

function toAnalysisResource(record: AnalysisRecord): AnalysisResource {
  return {
    companyId: record.companyId,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    failureCode: record.failureCode,
    failureMessage: record.failureMessage,
    id: record.id,
    status: record.status,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function analysisNotFound(): ApiException {
  return new ApiException(
    'ANALYSIS_NOT_FOUND',
    'Analysis was not found.',
    HttpStatus.NOT_FOUND,
  );
}
