import {
  DocumentUploadStatus,
  JobStatus,
  JobStep,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { createObjectCleanupIdempotencyKey } from '@stocklens/shared';

const DEFAULT_SCAN_LIMIT = 100;
const SERIALIZABLE_ATTEMPTS = 3;

export class ExpiredDocumentUploadScanner {
  constructor(private readonly prisma: PrismaClient) {}

  async scan(now = new Date(), limit = DEFAULT_SCAN_LIMIT): Promise<number> {
    const candidates = await this.prisma.documentUpload.findMany({
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      select: { analysisId: true, id: true, ownerId: true },
      take: limit,
      where: {
        expiresAt: { lte: now },
        status: {
          in: [DocumentUploadStatus.PENDING, DocumentUploadStatus.VALIDATING],
        },
      },
    });

    let expiredCount = 0;
    for (const candidate of candidates) {
      if (await this.expireCandidate(candidate, now)) {
        expiredCount += 1;
      }
    }
    return expiredCount;
  }

  private async expireCandidate(
    candidate: { analysisId: string; id: string; ownerId: string },
    now: Date,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const expired = await transaction.documentUpload.updateMany({
              data: { status: DocumentUploadStatus.EXPIRED },
              where: {
                expiresAt: { lte: now },
                id: candidate.id,
                status: {
                  in: [
                    DocumentUploadStatus.PENDING,
                    DocumentUploadStatus.VALIDATING,
                  ],
                },
              },
            });
            if (expired.count === 0) {
              return false;
            }

            const target = {
              id: candidate.id,
              kind: 'document-upload' as const,
            };
            const idempotencyKey = createObjectCleanupIdempotencyKey(target);
            await transaction.jobExecution.upsert({
              create: {
                analysisId: candidate.analysisId,
                documentUploadId: candidate.id,
                idempotencyKey,
                ownerId: candidate.ownerId,
                status: JobStatus.QUEUED,
                step: JobStep.OBJECT_CLEANUP,
              },
              update: {},
              where: { idempotencyKey },
            });
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        if (!isRetryableConflict(error) || attempt === SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
      }
    }
    throw new Error('Expired document upload scan retry loop exhausted.');
  }
}

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}
