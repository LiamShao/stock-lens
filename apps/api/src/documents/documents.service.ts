import { HttpStatus, Injectable } from '@nestjs/common';
import type { DocumentListResponse } from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import { DocumentRepository } from '../database/document.repository';
import { toDocumentResource } from './document-resource';
import { ObjectCleanupQueuePublisher } from './object-cleanup-queue';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly cleanupPublisher: ObjectCleanupQueuePublisher,
  ) {}

  async list(
    ownerId: string,
    analysisId: string,
  ): Promise<DocumentListResponse> {
    const result = await this.repository.listFinalizedForAnalysis(
      ownerId,
      analysisId,
    );
    if (result.kind === 'analysis-not-found') {
      throw analysisNotFound();
    }
    return { items: result.documents.map(toDocumentResource) };
  }

  async delete(
    ownerId: string,
    analysisId: string,
    documentId: string,
  ): Promise<void> {
    const result = await this.repository.deleteFinalizedForAnalysis({
      analysisId,
      deletedAt: new Date(),
      id: documentId,
      ownerId,
    });
    if (result.kind === 'analysis-not-found') {
      throw analysisNotFound();
    }
    if (result.kind === 'document-not-found') {
      throw documentNotFound();
    }
    await this.dispatchCleanupSafely(ownerId, analysisId, documentId);
  }

  private async dispatchCleanupSafely(
    ownerId: string,
    analysisId: string,
    documentId: string,
  ): Promise<void> {
    try {
      await this.cleanupPublisher.enqueue({
        analysisId,
        ownerId,
        target: { id: documentId, kind: 'document' },
      });
    } catch {
      // Delete persists the durable QUEUED cleanup execution transactionally.
      // The worker's pending scan recovers a failed dispatch attempt.
    }
  }
}

function analysisNotFound(): ApiException {
  return new ApiException(
    'ANALYSIS_NOT_FOUND',
    'Analysis was not found.',
    HttpStatus.NOT_FOUND,
  );
}

function documentNotFound(): ApiException {
  return new ApiException(
    'DOCUMENT_NOT_FOUND',
    'Document was not found.',
    HttpStatus.NOT_FOUND,
  );
}
