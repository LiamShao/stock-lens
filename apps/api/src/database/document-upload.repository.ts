import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
}
