import { Injectable } from '@nestjs/common';
import { Prisma, type AnalysisStatus } from '@prisma/client';

import { PrismaService } from './prisma.service';
import { runSerializableTransaction } from './serializable-transaction';

const analysisSelection = {
  companyId: true,
  completedAt: true,
  createdAt: true,
  failureCode: true,
  failureMessage: true,
  id: true,
  ownerId: true,
  status: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.AnalysisSelect;

export type AnalysisRecord = Prisma.AnalysisGetPayload<{
  select: typeof analysisSelection;
}>;

export interface AnalysisListCursor {
  createdAt: Date;
  id: string;
}

@Injectable()
export class AnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    companyId?: string;
    ownerId: string;
    title: string;
  }): Promise<AnalysisRecord> {
    return this.prisma.analysis.create({
      data: input,
      select: analysisSelection,
    });
  }

  findActiveById(ownerId: string, id: string): Promise<AnalysisRecord | null> {
    return this.prisma.analysis.findFirst({
      select: analysisSelection,
      where: { deletedAt: null, id, ownerId },
    });
  }

  async companyExists(id: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      select: { id: true },
      where: { id },
    });
    return company !== null;
  }

  listActive(
    ownerId: string,
    options: {
      cursor?: AnalysisListCursor;
      limit: number;
      status?: AnalysisStatus;
    },
  ): Promise<AnalysisRecord[]> {
    const cursorFilter = options.cursor
      ? {
          OR: [
            { createdAt: { lt: options.cursor.createdAt } },
            {
              createdAt: options.cursor.createdAt,
              id: { lt: options.cursor.id },
            },
          ],
        }
      : {};
    return this.prisma.analysis.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: analysisSelection,
      take: options.limit,
      where: {
        ...cursorFilter,
        deletedAt: null,
        ownerId,
        ...(options.status ? { status: options.status } : {}),
      },
    });
  }

  async rename(ownerId: string, id: string, title: string): Promise<boolean> {
    const result = await this.prisma.analysis.updateMany({
      data: { title },
      where: { deletedAt: null, id, ownerId },
    });
    return result.count === 1;
  }

  renameActive(
    ownerId: string,
    id: string,
    title: string,
  ): Promise<AnalysisRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.analysis.updateMany({
        data: { title },
        where: { deletedAt: null, id, ownerId },
      });
      if (result.count !== 1) {
        return null;
      }
      return transaction.analysis.findFirst({
        select: analysisSelection,
        where: { deletedAt: null, id, ownerId },
      });
    });
  }

  async softDelete(
    ownerId: string,
    id: string,
    deletedAt = new Date(),
  ): Promise<boolean> {
    return runSerializableTransaction(this.prisma, async (transaction) => {
      const analysis = await transaction.analysis.updateMany({
        data: { deletedAt },
        where: { deletedAt: null, id, ownerId },
      });
      if (analysis.count !== 1) {
        return false;
      }
      await transaction.document.updateMany({
        data: { deletedAt },
        where: { analysisId: id, deletedAt: null, ownerId },
      });
      return true;
    });
  }
}
