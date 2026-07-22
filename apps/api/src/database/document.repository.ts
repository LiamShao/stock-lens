import { Injectable } from '@nestjs/common';
import { Prisma, type DocumentType } from '@prisma/client';

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
