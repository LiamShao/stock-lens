import { Injectable } from '@nestjs/common';
import { Prisma, type DocumentType } from '@prisma/client';
import { createObjectCleanupIdempotencyKey } from '@stocklens/shared';

import { PrismaService } from './prisma.service';
import { runSerializableTransaction } from './serializable-transaction';

const documentSelection = {
  analysisId: true,
  createdAt: true,
  documentType: true,
  id: true,
  mimeType: true,
  originalName: true,
  ownerId: true,
  pageCount: true,
  sha256: true,
  sizeBytes: true,
  storageBucket: true,
  storageKey: true,
  updatedAt: true,
  uploadedAt: true,
} satisfies Prisma.DocumentSelect;

export type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelection;
}>;

export interface CreateDocumentInput {
  analysisId: string;
  documentType?: DocumentType;
  mimeType: string;
  originalName: string;
  ownerId: string;
  sha256: string;
  sizeBytes: bigint;
  storageBucket: string;
  storageKey: string;
}

export type ListFinalizedDocumentsResult =
  | { documents: DocumentRecord[]; kind: 'found' }
  | { kind: 'analysis-not-found' };

export type DeleteDocumentResult =
  | { kind: 'analysis-not-found' }
  | { kind: 'deleted' }
  | { kind: 'document-not-found' };

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  createForAnalysis(
    input: CreateDocumentInput,
  ): Promise<DocumentRecord | null> {
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
        return null;
      }

      return transaction.document.create({
        data: input,
        select: documentSelection,
      });
    });
  }

  findActiveById(ownerId: string, id: string): Promise<DocumentRecord | null> {
    return this.prisma.document.findFirst({
      select: documentSelection,
      where: { deletedAt: null, id, ownerId },
    });
  }

  listActiveForAnalysis(
    ownerId: string,
    analysisId: string,
  ): Promise<DocumentRecord[]> {
    return this.prisma.document.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: documentSelection,
      where: { analysisId, deletedAt: null, ownerId },
    });
  }

  listFinalizedForAnalysis(
    ownerId: string,
    analysisId: string,
  ): Promise<ListFinalizedDocumentsResult> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const analysis = await transaction.analysis.findFirst({
        select: { id: true },
        where: { deletedAt: null, id: analysisId, ownerId },
      });
      if (analysis === null) {
        return { kind: 'analysis-not-found' };
      }
      const documents = await transaction.document.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: documentSelection,
        where: {
          analysisId,
          deletedAt: null,
          ownerId,
          uploadedAt: { not: null },
        },
      });
      return { documents, kind: 'found' };
    });
  }

  deleteFinalizedForAnalysis(input: {
    analysisId: string;
    deletedAt: Date;
    id: string;
    ownerId: string;
  }): Promise<DeleteDocumentResult> {
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
      const document = await transaction.document.findFirst({
        select: documentSelection,
        where: {
          analysisId: input.analysisId,
          deletedAt: null,
          id: input.id,
          ownerId: input.ownerId,
          uploadedAt: { not: null },
        },
      });
      if (document === null) {
        return { kind: 'document-not-found' };
      }

      await transaction.document.update({
        data: { deletedAt: input.deletedAt },
        where: { id: document.id },
      });
      const target = { id: document.id, kind: 'document' as const };
      await transaction.jobExecution.upsert({
        create: {
          analysisId: document.analysisId,
          documentId: document.id,
          idempotencyKey: createObjectCleanupIdempotencyKey(target),
          ownerId: document.ownerId,
          status: 'QUEUED',
          step: 'OBJECT_CLEANUP',
        },
        update: {},
        where: { idempotencyKey: createObjectCleanupIdempotencyKey(target) },
      });
      return { kind: 'deleted' };
    });
  }

  async markUploaded(
    ownerId: string,
    id: string,
    uploadedAt = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.document.updateMany({
      data: { uploadedAt },
      where: { deletedAt: null, id, ownerId },
    });
    return result.count === 1;
  }

  async softDelete(
    ownerId: string,
    id: string,
    deletedAt = new Date(),
  ): Promise<boolean> {
    const result = await this.prisma.document.updateMany({
      data: { deletedAt },
      where: { deletedAt: null, id, ownerId },
    });
    return result.count === 1;
  }
}
