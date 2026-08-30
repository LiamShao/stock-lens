import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';

const analysisViewsSelection = {
  analystViewOutput: true,
  buffettMungerOutput: true,
  completedAt: true,
  id: true,
  justTellMeOutput: true,
  status: true,
} satisfies Prisma.AnalysisSelect;

export type AnalysisViewsRecord = Prisma.AnalysisGetPayload<{
  select: typeof analysisViewsSelection;
}>;

const evidenceProjectionSelection = {
  chunkId: true,
  document: { select: { originalName: true } },
  documentId: true,
  excerpt: true,
  id: true,
  page: { select: { pageNumber: true } },
  pageNumber: true,
} satisfies Prisma.EvidenceSelect;

export type AnalysisViewEvidenceRecord = Prisma.EvidenceGetPayload<{
  select: typeof evidenceProjectionSelection;
}>;

@Injectable()
export class AnalysisViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveById(
    ownerId: string,
    analysisId: string,
  ): Promise<AnalysisViewsRecord | null> {
    return this.prisma.analysis.findFirst({
      select: analysisViewsSelection,
      where: { deletedAt: null, id: analysisId, ownerId },
    });
  }

  findEvidenceProjections(
    ownerId: string,
    analysisId: string,
    evidenceIds: readonly string[],
  ): Promise<AnalysisViewEvidenceRecord[]> {
    return this.prisma.evidence.findMany({
      orderBy: { id: 'asc' },
      select: evidenceProjectionSelection,
      where: {
        analysis: {
          deletedAt: null,
          id: analysisId,
          ownerId,
          status: 'COMPLETED',
        },
        analysisId,
        document: { deletedAt: null },
        findingLinks: { some: { analysisId, ownerId } },
        id: { in: [...evidenceIds] },
        ownerId,
      },
    });
  }
}
