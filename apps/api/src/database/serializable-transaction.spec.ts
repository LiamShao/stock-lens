import { Prisma } from '@prisma/client';

import type { PrismaService } from './prisma.service';
import {
  runSerializableTransaction,
  SERIALIZABLE_TRANSACTION_ATTEMPTS,
} from './serializable-transaction';

describe('runSerializableTransaction', () => {
  it('OWN-DEV-003 retries P2034 conflicts with serializable isolation', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(createConflict())
      .mockResolvedValueOnce('completed');

    await expect(
      runSerializableTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        jest.fn(),
      ),
    ).resolves.toBe('completed');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('OWN-DEV-003 stops after the bounded retry limit', async () => {
    const transaction = jest.fn().mockRejectedValue(createConflict());

    await expect(
      runSerializableTransaction(
        { $transaction: transaction } as unknown as PrismaService,
        jest.fn(),
      ),
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(transaction).toHaveBeenCalledTimes(
      SERIALIZABLE_TRANSACTION_ATTEMPTS,
    );
  });
});

function createConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction write conflict',
    { clientVersion: '6.19.3', code: 'P2034' },
  );
}
