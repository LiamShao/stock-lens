import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  createPdfObjectKey,
  type ObjectStorage,
  type PresignedUpload,
} from '@stocklens/object-storage';
import type {
  DocumentResource,
  DocumentUploadResource,
  PresignedPdfUploadResponse,
  StartDocumentUploadRequest,
  StartDocumentUploadResponse,
} from '@stocklens/shared';

import { ApiException } from '../common/api-exception';
import {
  DocumentUploadRepository,
  type DocumentUploadRecord,
} from '../database/document-upload.repository';
import { toDocumentResource } from './document-resource';
import { ObjectCleanupQueuePublisher } from './object-cleanup-queue';
import { OBJECT_STORAGE, OBJECT_STORAGE_BUCKET } from './object-storage.module';
import { PdfObjectValidator } from './pdf-object-validator';

const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DocumentUploadsService {
  constructor(
    private readonly repository: DocumentUploadRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(OBJECT_STORAGE_BUCKET) private readonly storageBucket: string,
    private readonly validator: PdfObjectValidator,
    private readonly cleanupPublisher: ObjectCleanupQueuePublisher,
  ) {}

  async start(
    ownerId: string,
    analysisId: string,
    input: StartDocumentUploadRequest,
  ): Promise<StartDocumentUploadResponse> {
    const now = new Date();
    const uploadId = randomUUID();
    const storageKey = createPdfObjectKey({ analysisId, ownerId, uploadId });
    const result = await this.repository.createPending({
      analysisId,
      claimedSha256: input.sha256,
      declaredMimeType: input.mimeType,
      declaredSizeBytes: input.sizeBytes,
      documentType: input.documentType,
      expiresAt: new Date(now.getTime() + UPLOAD_SESSION_TTL_MS),
      id: uploadId,
      now,
      originalName: input.originalName,
      ownerId,
      storageBucket: this.storageBucket,
      storageKey,
    });

    if (result.kind === 'analysis-not-found') {
      throw new ApiException(
        'ANALYSIS_NOT_FOUND',
        'Analysis was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (result.kind === 'limit-exceeded') {
      throw new ApiException(
        'DOCUMENT_LIMIT_EXCEEDED',
        'An analysis can contain at most three active documents or uploads.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      return {
        upload: await this.presign(result.upload),
        uploadSession: toUploadResource(result.upload),
      };
    } catch (error: unknown) {
      await this.repository.rejectPendingPresignFailure(
        ownerId,
        analysisId,
        result.upload.id,
      );
      throw error;
    }
  }

  async presignAgain(
    ownerId: string,
    analysisId: string,
    uploadId: string,
  ): Promise<PresignedPdfUploadResponse> {
    const upload = await this.repository.findForOwner(
      ownerId,
      analysisId,
      uploadId,
    );
    if (upload === null) {
      throw uploadNotFound();
    }
    if (upload.expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        'UPLOAD_EXPIRED',
        'Document upload session has expired.',
        HttpStatus.CONFLICT,
      );
    }
    if (upload.status !== 'PENDING') {
      throw new ApiException(
        'DOCUMENT_UPLOAD_NOT_ACTIVE',
        'Document upload session is not active.',
        HttpStatus.CONFLICT,
      );
    }
    return this.presign(upload);
  }

  async finalize(
    ownerId: string,
    analysisId: string,
    uploadId: string,
  ): Promise<DocumentResource> {
    const claim = await this.repository.claimForFinalize({
      analysisId,
      id: uploadId,
      now: new Date(),
      ownerId,
    });
    if (claim.kind === 'not-found') {
      throw uploadNotFound();
    }
    if (claim.kind === 'completed') {
      return toDocumentResource(claim.document);
    }
    if (claim.kind === 'expired') {
      await this.dispatchCleanupSafely(ownerId, analysisId, uploadId);
      throw new ApiException(
        'UPLOAD_EXPIRED',
        'Document upload session has expired.',
        HttpStatus.CONFLICT,
      );
    }
    if (claim.kind === 'inactive') {
      throw uploadNotActive();
    }

    const validation = await this.validator.validate({
      expectedSha256: claim.upload.claimedSha256,
      expectedSizeBytes: Number(claim.upload.declaredSizeBytes),
      objectKey: claim.upload.storageKey,
    });
    if (validation.kind === 'storage-failure') {
      await this.repository.releaseFinalizeClaim(ownerId, analysisId, uploadId);
      throw new ApiException(
        'STORAGE_VALIDATION_FAILED',
        'Uploaded object could not be validated. Retry finalization later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (validation.kind === 'invalid') {
      await this.repository.rejectInvalidFinalize({
        analysisId,
        failureCode: validation.reason,
        failureMessage: 'Uploaded object did not pass trusted PDF validation.',
        id: uploadId,
        ownerId,
      });
      await this.dispatchCleanupSafely(ownerId, analysisId, uploadId);
      throw new ApiException(
        'INVALID_PDF',
        'Uploaded object did not pass PDF validation.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const completed = await this.repository.completeFinalize({
      analysisId,
      id: uploadId,
      now: new Date(),
      ownerId,
      sha256: validation.sha256,
      sizeBytes: validation.sizeBytes,
    });
    if (completed.kind === 'completed') {
      return toDocumentResource(completed.document);
    }
    if (completed.kind === 'not-found') {
      throw uploadNotFound();
    }
    if (completed.kind === 'inactive') {
      throw uploadNotActive();
    }

    await this.dispatchCleanupSafely(ownerId, analysisId, uploadId);
    if (completed.kind === 'duplicate') {
      throw new ApiException(
        'DUPLICATE_DOCUMENT',
        'An active document with the same SHA-256 already exists.',
        HttpStatus.CONFLICT,
      );
    }
    throw new ApiException(
      'DOCUMENT_LIMIT_EXCEEDED',
      'An analysis can contain at most three active documents.',
      HttpStatus.CONFLICT,
    );
  }

  private async presign(
    upload: DocumentUploadRecord,
  ): Promise<PresignedPdfUploadResponse> {
    let signed: PresignedUpload;
    try {
      signed = await this.objectStorage.createPresignedPdfUpload({
        contentLength: Number(upload.declaredSizeBytes),
        objectKey: upload.storageKey,
        sha256: upload.claimedSha256,
      });
    } catch {
      throw new ApiException(
        'OBJECT_STORAGE_UNAVAILABLE',
        'Object storage is temporarily unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      expiresAt: signed.expiresAt.toISOString(),
      headers: { ...signed.headers },
      url: signed.url,
    };
  }

  private async dispatchCleanupSafely(
    ownerId: string,
    analysisId: string,
    uploadId: string,
  ): Promise<void> {
    try {
      await this.cleanupPublisher.enqueue({
        analysisId,
        ownerId,
        target: { id: uploadId, kind: 'document-upload' },
      });
    } catch {
      // Finalize transactions persist QUEUED cleanup before returning. The
      // worker's periodic dispatcher recovers delivery if this attempt fails.
    }
  }
}

function toUploadResource(
  upload: DocumentUploadRecord,
): DocumentUploadResource {
  return {
    analysisId: upload.analysisId,
    createdAt: upload.createdAt.toISOString(),
    documentType: upload.documentType,
    expiresAt: upload.expiresAt.toISOString(),
    id: upload.id,
    mimeType: 'application/pdf',
    originalName: upload.originalName,
    sha256: upload.claimedSha256,
    sizeBytes: Number(upload.declaredSizeBytes),
    status: upload.status,
  };
}

function uploadNotFound(): ApiException {
  return new ApiException(
    'DOCUMENT_UPLOAD_NOT_FOUND',
    'Document upload session was not found.',
    HttpStatus.NOT_FOUND,
  );
}

function uploadNotActive(): ApiException {
  return new ApiException(
    'DOCUMENT_UPLOAD_NOT_ACTIVE',
    'Document upload session is not active.',
    HttpStatus.CONFLICT,
  );
}
