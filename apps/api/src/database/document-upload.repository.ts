import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createObjectCleanupIdempotencyKey } from '@stocklens/shared';

import { PrismaService } from './prisma.service';
import { runSerializableTransaction } from './serializable-transaction';

const uploadSelection = {
  analysisId: true,
  claimedSha256: true,
  createdAt: true,
  declaredMimeType: true,
  declaredSizeBytes: true,
  documentType: true,
  expiresAt: true,
  id: true,
  originalName: true,
  ownerId: true,
  status: true,
  storageBucket: true,
  storageKey: true,
} satisfies Prisma.DocumentUploadSelect;

export type DocumentUploadRecord = Prisma.DocumentUploadGetPayload<{
  select: typeof uploadSelection;
}>;

export type CreatePendingDocumentUploadResult =
  | { kind: 'analysis-not-found' }
  | { kind: 'created'; upload: DocumentUploadRecord }
  | { kind: 'limit-exceeded' };

const finalizedDocumentSelection = {
  analysisId: true,
  createdAt: true,
  documentType: true,
  id: true,
  mimeType: true,
  originalName: true,
  sha256: true,
  sizeBytes: true,
  updatedAt: true,
  uploadedAt: true,
} satisfies Prisma.DocumentSelect;

export type FinalizedDocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof finalizedDocumentSelection;
}>;

export type ClaimDocumentUploadResult =
  | { kind: 'claimed'; upload: DocumentUploadRecord }
  | { document: FinalizedDocumentRecord; kind: 'completed' }
  | { kind: 'expired' }
  | { kind: 'inactive' }
  | { kind: 'not-found' };

export type CompleteDocumentUploadResult =
  | { document: FinalizedDocumentRecord; kind: 'completed' }
  | { kind: 'duplicate' }
  | { kind: 'inactive' }
  | { kind: 'limit-exceeded' }
  | { kind: 'not-found' };

@Injectable()
export class DocumentUploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPending(input: {
    analysisId: string;
    claimedSha256: string;
    declaredMimeType: string;
    declaredSizeBytes: number;
    documentType: DocumentUploadRecord['documentType'];
    expiresAt: Date;
    id: string;
    now: Date;
    originalName: string;
    ownerId: string;
    storageBucket: string;
    storageKey: string;
  }): Promise<CreatePendingDocumentUploadResult> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const analysis = await transaction.analysis.findFirst({
        select: { id: true },
        where: {
          deletedAt: null,
          id: input.analysisId,
          ownerId: input.ownerId,
        },
      });
      if (analysis === null) {
        return { kind: 'analysis-not-found' };
      }

      const activeDocumentCount = await transaction.document.count({
        where: {
          analysisId: input.analysisId,
          deletedAt: null,
          ownerId: input.ownerId,
        },
      });
      const reservedUploadCount = await transaction.documentUpload.count({
        where: {
          analysisId: input.analysisId,
          ownerId: input.ownerId,
          OR: [
            { expiresAt: { gt: input.now }, status: 'PENDING' },
            { status: 'VALIDATING' },
          ],
        },
      });
      if (activeDocumentCount + reservedUploadCount >= 3) {
        return { kind: 'limit-exceeded' };
      }

      const upload = await transaction.documentUpload.create({
        data: {
          analysisId: input.analysisId,
          claimedSha256: input.claimedSha256,
          declaredMimeType: input.declaredMimeType,
          declaredSizeBytes: BigInt(input.declaredSizeBytes),
          documentType: input.documentType,
          expiresAt: input.expiresAt,
          id: input.id,
          originalName: input.originalName,
          ownerId: input.ownerId,
          storageBucket: input.storageBucket,
          storageKey: input.storageKey,
        },
        select: uploadSelection,
      });
      return { kind: 'created', upload };
    });
  }

  findForOwner(
    ownerId: string,
    analysisId: string,
    id: string,
  ): Promise<DocumentUploadRecord | null> {
    return this.prisma.documentUpload.findFirst({
      select: uploadSelection,
      where: {
        analysis: { deletedAt: null },
        analysisId,
        id,
        ownerId,
      },
    });
  }

  async rejectPendingPresignFailure(
    ownerId: string,
    analysisId: string,
    id: string,
  ): Promise<boolean> {
    const result = await this.prisma.documentUpload.updateMany({
      data: {
        failureCode: 'OBJECT_STORAGE_UNAVAILABLE',
        failureMessage: 'Object storage could not issue an upload URL.',
        status: 'REJECTED',
      },
      where: { analysisId, id, ownerId, status: 'PENDING' },
    });
    return result.count === 1;
  }

  claimForFinalize(input: {
    analysisId: string;
    id: string;
    now: Date;
    ownerId: string;
  }): Promise<ClaimDocumentUploadResult> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const upload = await transaction.documentUpload.findFirst({
        select: { ...uploadSelection, finalizedDocumentId: true },
        where: {
          analysisId: input.analysisId,
          id: input.id,
          ownerId: input.ownerId,
        },
      });
      if (upload === null) {
        return { kind: 'not-found' };
      }
      const analysis = await transaction.analysis.findFirst({
        select: { id: true },
        where: {
          deletedAt: null,
          id: input.analysisId,
          ownerId: input.ownerId,
        },
      });
      if (analysis === null) {
        if (upload.status === 'PENDING' || upload.status === 'VALIDATING') {
          await rejectWithCleanup(transaction, upload, {
            code: 'ANALYSIS_NOT_FOUND',
            message: 'The parent analysis is no longer active.',
          });
        }
        return { kind: 'not-found' };
      }
      if (upload.status === 'COMPLETED') {
        const document = await findFinalizedDocument(
          transaction,
          input.ownerId,
          input.analysisId,
          upload.finalizedDocumentId,
        );
        return { document, kind: 'completed' };
      }
      if (upload.status === 'EXPIRED') {
        return { kind: 'expired' };
      }
      if (
        (upload.status === 'PENDING' || upload.status === 'VALIDATING') &&
        upload.expiresAt.getTime() <= input.now.getTime()
      ) {
        await transaction.documentUpload.update({
          data: { status: 'EXPIRED' },
          where: { id: upload.id },
        });
        await persistUploadCleanup(transaction, upload);
        return { kind: 'expired' };
      }
      if (upload.status !== 'PENDING') {
        return { kind: 'inactive' };
      }

      await transaction.documentUpload.update({
        data: { status: 'VALIDATING' },
        where: { id: upload.id },
      });
      return { kind: 'claimed', upload: { ...upload, status: 'VALIDATING' } };
    });
  }

  async releaseFinalizeClaim(
    ownerId: string,
    analysisId: string,
    id: string,
  ): Promise<boolean> {
    const result = await this.prisma.documentUpload.updateMany({
      data: { status: 'PENDING' },
      where: { analysisId, id, ownerId, status: 'VALIDATING' },
    });
    return result.count === 1;
  }

  rejectInvalidFinalize(input: {
    analysisId: string;
    failureCode: string;
    failureMessage: string;
    id: string;
    ownerId: string;
  }): Promise<boolean> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const upload = await transaction.documentUpload.findFirst({
        select: uploadSelection,
        where: {
          analysisId: input.analysisId,
          id: input.id,
          ownerId: input.ownerId,
          status: 'VALIDATING',
        },
      });
      if (upload === null) {
        return false;
      }
      await rejectWithCleanup(transaction, upload, {
        code: input.failureCode,
        message: input.failureMessage,
      });
      return true;
    });
  }

  async completeFinalize(input: {
    analysisId: string;
    id: string;
    now: Date;
    ownerId: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<CompleteDocumentUploadResult> {
    try {
      return await runSerializableTransaction(
        this.prisma,
        async (transaction) => {
          const upload = await transaction.documentUpload.findFirst({
            select: { ...uploadSelection, finalizedDocumentId: true },
            where: {
              analysisId: input.analysisId,
              id: input.id,
              ownerId: input.ownerId,
            },
          });
          if (upload === null) {
            return { kind: 'not-found' };
          }
          const analysis = await transaction.analysis.findFirst({
            select: { id: true },
            where: {
              deletedAt: null,
              id: input.analysisId,
              ownerId: input.ownerId,
            },
          });
          if (analysis === null) {
            if (upload.status === 'VALIDATING') {
              await rejectWithCleanup(transaction, upload, {
                code: 'ANALYSIS_NOT_FOUND',
                message: 'The parent analysis is no longer active.',
              });
            }
            return { kind: 'not-found' };
          }
          if (upload.status === 'COMPLETED') {
            const document = await findFinalizedDocument(
              transaction,
              input.ownerId,
              input.analysisId,
              upload.finalizedDocumentId,
            );
            return { document, kind: 'completed' };
          }
          if (upload.status !== 'VALIDATING') {
            return { kind: 'inactive' };
          }

          const duplicate = await transaction.document.findFirst({
            select: { id: true },
            where: {
              analysisId: input.analysisId,
              deletedAt: null,
              ownerId: input.ownerId,
              sha256: input.sha256,
            },
          });
          if (duplicate !== null) {
            await rejectWithCleanup(transaction, upload, {
              code: 'DUPLICATE_DOCUMENT',
              message:
                'An active document with the same SHA-256 already exists.',
            });
            return { kind: 'duplicate' };
          }

          const activeDocumentCount = await transaction.document.count({
            where: {
              analysisId: input.analysisId,
              deletedAt: null,
              ownerId: input.ownerId,
            },
          });
          if (activeDocumentCount >= 3) {
            await rejectWithCleanup(transaction, upload, {
              code: 'DOCUMENT_LIMIT_EXCEEDED',
              message:
                'An analysis can contain at most three active documents.',
            });
            return { kind: 'limit-exceeded' };
          }

          const document = await transaction.document.create({
            data: {
              analysisId: input.analysisId,
              documentType: upload.documentType,
              mimeType: upload.declaredMimeType,
              originalName: upload.originalName,
              ownerId: input.ownerId,
              sha256: input.sha256,
              sizeBytes: BigInt(input.sizeBytes),
              storageBucket: upload.storageBucket,
              storageKey: upload.storageKey,
              uploadedAt: input.now,
            },
            select: finalizedDocumentSelection,
          });
          await transaction.documentUpload.update({
            data: {
              completedAt: input.now,
              finalizedDocumentId: document.id,
              status: 'COMPLETED',
            },
            where: { id: upload.id },
          });
          await transaction.analysis.updateMany({
            data: { status: 'UPLOADED' },
            where: {
              deletedAt: null,
              id: input.analysisId,
              ownerId: input.ownerId,
              status: 'DRAFT',
            },
          });
          return { document, kind: 'completed' };
        },
      );
    } catch (error: unknown) {
      if (!isUniqueConflict(error)) {
        throw error;
      }

      const upload = await this.prisma.documentUpload.findFirst({
        select: { finalizedDocumentId: true, status: true },
        where: {
          analysisId: input.analysisId,
          id: input.id,
          ownerId: input.ownerId,
        },
      });
      if (
        upload?.status !== 'COMPLETED' ||
        upload.finalizedDocumentId === null
      ) {
        throw error;
      }
      const document = await this.prisma.document.findFirst({
        select: finalizedDocumentSelection,
        where: {
          analysisId: input.analysisId,
          id: upload.finalizedDocumentId,
          ownerId: input.ownerId,
        },
      });
      if (document === null || document.uploadedAt === null) {
        throw error;
      }
      return { document, kind: 'completed' };
    }
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

async function findFinalizedDocument(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  analysisId: string,
  documentId: string | null,
): Promise<FinalizedDocumentRecord> {
  if (documentId === null) {
    throw new Error('Completed document upload is missing its document.');
  }
  const document = await transaction.document.findFirst({
    select: finalizedDocumentSelection,
    where: { analysisId, id: documentId, ownerId },
  });
  if (document === null || document.uploadedAt === null) {
    throw new Error(
      'Completed document upload references an invalid document.',
    );
  }
  return document;
}

async function rejectWithCleanup(
  transaction: Prisma.TransactionClient,
  upload: DocumentUploadRecord,
  failure: { code: string; message: string },
): Promise<void> {
  await transaction.documentUpload.update({
    data: {
      failureCode: failure.code,
      failureMessage: failure.message,
      status: 'REJECTED',
    },
    where: { id: upload.id },
  });
  await persistUploadCleanup(transaction, upload);
}

async function persistUploadCleanup(
  transaction: Prisma.TransactionClient,
  upload: DocumentUploadRecord,
): Promise<void> {
  const target = { id: upload.id, kind: 'document-upload' as const };
  await transaction.jobExecution.upsert({
    create: {
      analysisId: upload.analysisId,
      documentUploadId: upload.id,
      idempotencyKey: createObjectCleanupIdempotencyKey(target),
      ownerId: upload.ownerId,
      status: 'QUEUED',
      step: 'OBJECT_CLEANUP',
    },
    update: {},
    where: { idempotencyKey: createObjectCleanupIdempotencyKey(target) },
  });
}
