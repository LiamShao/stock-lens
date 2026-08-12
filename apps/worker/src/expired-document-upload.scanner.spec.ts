import type { PrismaClient } from '@prisma/client';

import { ExpiredDocumentUploadScanner } from './expired-document-upload.scanner';

describe('ExpiredDocumentUploadScanner (PDF-Q-005, PDF-TASK-015)', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
  const candidate = {
    analysisId: '764b8cb4-f3b4-4553-ae31-dbc27d811481',
    id: '499e227f-ac30-446c-853c-89ac60e67590',
    ownerId: '9770327c-23ce-4706-acf4-58e2e215120c',
  };

  it('expires an active orphan and persists one stable cleanup execution atomically', async () => {
    const updateMany = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockResolvedValue({ count: 1 });
    const upsert = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
    const prisma = createPrismaMock({ updateMany, upsert });
    const scanner = new ExpiredDocumentUploadScanner(prisma);

    await expect(scanner.scan(now, 25)).resolves.toBe(1);
    expect(prisma.documentUpload.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: {
          expiresAt: { lte: now },
          status: { in: ['PENDING', 'VALIDATING'] },
        },
      }),
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'EXPIRED' },
      where: { id: candidate.id },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      create: {
        documentUploadId: candidate.id,
        idempotencyKey: `object-cleanup:document-upload:${candidate.id}:v1`,
        status: 'QUEUED',
        step: 'OBJECT_CLEANUP',
      },
    });
  });

  it('does not enqueue cleanup when a concurrent operation already changed the status', async () => {
    const upsert = jest.fn<Promise<unknown>, [unknown]>();
    const prisma = createPrismaMock({
      updateMany: jest
        .fn<Promise<{ count: number }>, [unknown]>()
        .mockResolvedValue({ count: 0 }),
      upsert,
    });

    await expect(
      new ExpiredDocumentUploadScanner(prisma).scan(now),
    ).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  function createPrismaMock(input: {
    updateMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
    upsert: jest.Mock<Promise<unknown>, [unknown]>;
  }): PrismaClient & {
    documentUpload: { findMany: jest.Mock };
  } {
    const transaction = {
      documentUpload: { updateMany: input.updateMany },
      jobExecution: { upsert: input.upsert },
    };
    return {
      $transaction: jest.fn(
        async (callback: (value: unknown) => Promise<unknown>) =>
          callback(transaction),
      ),
      documentUpload: { findMany: jest.fn().mockResolvedValue([candidate]) },
    } as unknown as PrismaClient & {
      documentUpload: { findMany: jest.Mock };
    };
  }
});
