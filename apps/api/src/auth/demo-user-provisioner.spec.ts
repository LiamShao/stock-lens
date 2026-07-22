import { Prisma } from '@prisma/client';

import type { PrismaService } from '../database/prisma.service';
import {
  DeletedDemoUserError,
  DemoUserConflictError,
  DemoUserProvisioner,
} from './demo-user-provisioner';

const config = {
  displayName: 'StockLens Demo',
  email: 'demo@example.com',
  password: 'demo-password-123',
};

const existingDemoUser = {
  deletedAt: null,
  displayName: config.displayName,
  email: config.email,
  id: '2f7cbd41-9fb4-42c6-94b8-e10ee9642947',
  isDemo: true,
  passwordHash: 'stored-password-hash',
};

describe('DemoUserProvisioner', () => {
  let refreshTokenUpdateArguments: unknown;
  const user = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const refreshToken = {
    updateMany: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(),
    user,
  };
  const passwordHasher = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const provisioner = new DemoUserProvisioner(
    prisma as unknown as PrismaService,
    passwordHasher,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    refreshTokenUpdateArguments = undefined;
    refreshToken.updateMany.mockImplementation((arguments_: unknown) => {
      refreshTokenUpdateArguments = arguments_;
      return Promise.resolve({ count: 1 });
    });
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ refreshToken, user }),
    );
  });

  it('creates a demo user when the email is unused', async () => {
    user.findUnique.mockResolvedValue(null);
    passwordHasher.hash.mockResolvedValue('new-password-hash');
    user.create.mockResolvedValue({
      displayName: config.displayName,
      email: config.email,
      id: existingDemoUser.id,
    });

    await expect(provisioner.provision(config)).resolves.toEqual({
      action: 'created',
      user: {
        displayName: config.displayName,
        email: config.email,
        id: existingDemoUser.id,
      },
    });
    expect(user.create).toHaveBeenCalledWith({
      data: {
        displayName: config.displayName,
        email: config.email,
        isDemo: true,
        passwordHash: 'new-password-hash',
      },
      select: {
        displayName: true,
        email: true,
        id: true,
      },
    });
  });

  it('does not write when the existing demo user already matches', async () => {
    user.findUnique.mockResolvedValue(existingDemoUser);
    passwordHasher.verify.mockResolvedValue(true);

    await expect(provisioner.provision(config)).resolves.toMatchObject({
      action: 'unchanged',
    });
    expect(user.update).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('updates only changed demo credentials and profile fields', async () => {
    user.findUnique.mockResolvedValue({
      ...existingDemoUser,
      displayName: 'Old Demo Name',
    });
    passwordHasher.verify.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue('rotated-password-hash');
    user.update.mockResolvedValue({
      displayName: config.displayName,
      email: config.email,
      id: existingDemoUser.id,
    });

    await expect(provisioner.provision(config)).resolves.toMatchObject({
      action: 'updated',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          displayName: config.displayName,
          passwordHash: 'rotated-password-hash',
        },
      }),
    );
    expect(refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(refreshTokenUpdateArguments).toMatchObject({
      where: { revokedAt: null, userId: existingDemoUser.id },
    });
    if (
      typeof refreshTokenUpdateArguments !== 'object' ||
      refreshTokenUpdateArguments === null ||
      !('data' in refreshTokenUpdateArguments) ||
      typeof refreshTokenUpdateArguments.data !== 'object' ||
      refreshTokenUpdateArguments.data === null ||
      !('revokedAt' in refreshTokenUpdateArguments.data)
    ) {
      throw new Error('Expected refresh token revocation arguments.');
    }
    expect(refreshTokenUpdateArguments.data.revokedAt).toBeInstanceOf(Date);
  });

  it('DEMO-DEV-002 does not revoke sessions for a display-name-only update', async () => {
    user.findUnique.mockResolvedValue({
      ...existingDemoUser,
      displayName: 'Old Demo Name',
    });
    passwordHasher.verify.mockResolvedValue(true);
    user.update.mockResolvedValue({
      displayName: config.displayName,
      email: config.email,
      id: existingDemoUser.id,
    });

    await expect(provisioner.provision(config)).resolves.toMatchObject({
      action: 'updated',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('DEMO-DEV-003 converges after a concurrent create wins', async () => {
    user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingDemoUser);
    passwordHasher.hash.mockResolvedValue('new-password-hash');
    user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        clientVersion: '6.19.3',
        code: 'P2002',
      }),
    );
    passwordHasher.verify.mockResolvedValue(true);

    await expect(provisioner.provision(config)).resolves.toMatchObject({
      action: 'unchanged',
    });
    expect(user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('refuses to overwrite a non-demo account', async () => {
    user.findUnique.mockResolvedValue({
      ...existingDemoUser,
      isDemo: false,
    });

    await expect(provisioner.provision(config)).rejects.toBeInstanceOf(
      DemoUserConflictError,
    );
    expect(passwordHasher.verify).not.toHaveBeenCalled();
  });

  it('does not silently restore a soft-deleted demo account', async () => {
    user.findUnique.mockResolvedValue({
      ...existingDemoUser,
      deletedAt: new Date('2026-07-22T00:00:00.000Z'),
    });

    await expect(provisioner.provision(config)).rejects.toBeInstanceOf(
      DeletedDemoUserError,
    );
    expect(user.update).not.toHaveBeenCalled();
  });
});
