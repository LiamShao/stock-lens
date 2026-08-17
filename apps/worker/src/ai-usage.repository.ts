import type { PrismaClient } from '@prisma/client';
import {
  aiUsageAuditInputSchema,
  type AiUsageAuditInput,
} from '@stocklens/shared';

export class AiUsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  record(input: AiUsageAuditInput) {
    const value = aiUsageAuditInputSchema.parse(input);
    return this.prisma.aiUsageLog.create({
      data: value,
    });
  }
}
