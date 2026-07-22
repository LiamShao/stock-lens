import { Prisma } from '@prisma/client';

import type { PrismaService } from '../database/prisma.service';
import type { DemoUserConfig } from './demo-user.config';
import type { PasswordHasher } from './password-hasher';

interface DemoUserRecord {
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  id: string;
  isDemo: boolean;
  passwordHash: string;
}

export type DemoUserProvisionAction = 'created' | 'unchanged' | 'updated';

export interface DemoUserProvisionResult {
  action: DemoUserProvisionAction;
  user: Pick<DemoUserRecord, 'displayName' | 'email' | 'id'>;
}

export class DemoUserConflictError extends Error {
  constructor() {
    super('The configured demo email belongs to a non-demo user.');
    this.name = 'DemoUserConflictError';
  }
}

export class DeletedDemoUserError extends Error {
  constructor() {
    super(
      'The configured demo user is soft-deleted. Use a different email or restore it explicitly.',
    );
    this.name = 'DeletedDemoUserError';
  }
}

export class DemoUserProvisioner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async provision(config: DemoUserConfig): Promise<DemoUserProvisionResult> {
    let existing = await this.findByEmail(config.email);

    if (existing === null) {
      try {
        const created = await this.prisma.user.create({
          data: {
            displayName: config.displayName,
            email: config.email,
            isDemo: true,
            passwordHash: await this.passwordHasher.hash(config.password),
          },
          select: {
            displayName: true,
            email: true,
            id: true,
          },
        });
        return { action: 'created', user: created };
      } catch (error: unknown) {
        if (!this.isUniqueConflict(error)) {
          throw error;
        }
        existing = await this.findByEmail(config.email);
        if (existing === null) {
          throw error;
        }
      }
    }

    this.assertUpdatableDemoUser(existing);

    const passwordMatches = await this.passwordHasher.verify(
      existing.passwordHash,
      config.password,
    );
    if (passwordMatches && existing.displayName === config.displayName) {
      return { action: 'unchanged', user: existing };
    }

    const updated = passwordMatches
      ? await this.prisma.user.update({
          data: { displayName: config.displayName },
          select: {
            displayName: true,
            email: true,
            id: true,
          },
          where: { id: existing.id },
        })
      : await this.updatePasswordAndRevokeSessions(
          existing.id,
          config.displayName,
          await this.passwordHasher.hash(config.password),
        );
    return { action: 'updated', user: updated };
  }

  private findByEmail(email: string): Promise<DemoUserRecord | null> {
    return this.prisma.user.findUnique({
      select: {
        deletedAt: true,
        displayName: true,
        email: true,
        id: true,
        isDemo: true,
        passwordHash: true,
      },
      where: { email },
    });
  }

  private updatePasswordAndRevokeSessions(
    userId: string,
    displayName: string,
    passwordHash: string,
  ): Promise<Pick<DemoUserRecord, 'displayName' | 'email' | 'id'>> {
    const revokedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        data: { displayName, passwordHash },
        select: {
          displayName: true,
          email: true,
          id: true,
        },
        where: { id: userId },
      });
      await transaction.refreshToken.updateMany({
        data: { revokedAt },
        where: { revokedAt: null, userId },
      });
      return user;
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private assertUpdatableDemoUser(user: DemoUserRecord): void {
    if (!user.isDemo) {
      throw new DemoUserConflictError();
    }
    if (user.deletedAt !== null) {
      throw new DeletedDemoUserError();
    }
  }
}
