import { Prisma } from '@prisma/client';

import type { PrismaService } from './prisma.service';

export const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (
        !isRetryableConflict(error) ||
        attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new Error('Serializable transaction retry loop exhausted.');
}

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}
