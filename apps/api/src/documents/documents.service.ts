import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ObjectStorage } from '@stocklens/object-storage';
import {
  presignedDocumentDownloadSchema,
  type DocumentListResponse,
  type PresignedDocumentDownload,
} from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import { DocumentRepository } from '../database/document.repository';
import { toDocumentResource } from './document-resource';
import { ObjectCleanupQueuePublisher } from './object-cleanup-queue';
import { OBJECT_STORAGE, OBJECT_STORAGE_BUCKET } from './object-storage.module';

const MAX_DOCUMENT_DOWNLOAD_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly cleanupPublisher: ObjectCleanupQueuePublisher,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(OBJECT_STORAGE_BUCKET) private readonly storageBucket: string,
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

  async createDownloadUrl(
    ownerId: string,
    analysisId: string,
    documentId: string,
  ): Promise<PresignedDocumentDownload> {
    const result = await this.repository.findFinalizedForDownload(
      ownerId,
      analysisId,
      documentId,
    );
    if (result.kind === 'analysis-not-found') throw analysisNotFound();
    if (result.kind === 'document-not-found') throw documentNotFound();

    try {
      if (result.document.storageBucket !== this.storageBucket) {
        throw new Error('Document storage bucket does not match runtime.');
      }
      const metadata = await this.objectStorage.headObject(
        result.document.storageKey,
      );
      if (metadata === null) throw new Error('Document object is missing.');
      const signed = await this.objectStorage.createPresignedPdfDownload({
        objectKey: result.document.storageKey,
      });
      const expiresAtMs = signed.expiresAt.getTime();
      const nowMs = Date.now();
      if (
        !Number.isFinite(expiresAtMs) ||
        expiresAtMs <= nowMs ||
        expiresAtMs > nowMs + MAX_DOCUMENT_DOWNLOAD_TTL_MS
      ) {
        throw new Error('Document download expiry is outside the boundary.');
      }
      return presignedDocumentDownloadSchema.parse({
        expiresAt: signed.expiresAt.toISOString(),
        url: signed.url,
      });
    } catch {
      throw new ApiException(
        'DOCUMENT_DOWNLOAD_UNAVAILABLE',
        'Document download is temporarily unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
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
