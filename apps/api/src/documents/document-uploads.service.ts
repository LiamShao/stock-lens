import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  createPdfObjectKey,
  type ObjectStorage,
  type PresignedUpload,
} from '@stocklens/object-storage';
import type {
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
import { OBJECT_STORAGE, OBJECT_STORAGE_BUCKET } from './object-storage.module';

const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DocumentUploadsService {
  constructor(
    private readonly repository: DocumentUploadRepository,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @Inject(OBJECT_STORAGE_BUCKET) private readonly storageBucket: string,
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
