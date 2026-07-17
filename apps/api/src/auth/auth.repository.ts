import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

export interface UserRecord {
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  id: string;
  isDemo: boolean;
  passwordHash: string;
}

export interface RefreshTokenRecord {
  expiresAt: Date;
  familyId: string;
  id: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  tokenHash: string;
  user: UserRecord;
  userId: string;
}

export class EmailAlreadyExistsError extends Error {}

interface StoredRefreshToken {
  expiresAt: Date;
  familyId: string;
  id: string;
  tokenHash: string;
  userAgentHash: string | null;
  userId?: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithRefreshToken(
    input: {
      displayName?: string;
      email: string;
      passwordHash: string;
    },
    token: StoredRefreshToken,
  ): Promise<UserRecord> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: input,
          select: this.userSelection,
        });
        await transaction.refreshToken.create({
          data: { ...token, userId: user.id },
        });
        return user;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EmailAlreadyExistsError();
      }
      throw error;
    }
  }

  findActiveUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { deletedAt: null, email },
      select: this.userSelection,
    });
  }

  findActiveUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { deletedAt: null, id },
      select: this.userSelection,
    });
  }

  async recordLogin(userId: string, now: Date): Promise<void> {
    await this.prisma.user.update({
      data: { lastLoginAt: now },
      where: { id: userId },
    });
  }

  createRefreshToken(token: StoredRefreshToken): Promise<unknown> {
    return this.prisma.refreshToken.create({ data: token });
  }

  findRefreshToken(id: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({
      include: { user: { select: this.userSelection } },
      where: { id },
    });
  }

  async rotateRefreshToken(
    currentId: string,
    replacement: StoredRefreshToken,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshToken.updateMany({
        data: { lastUsedAt: now, revokedAt: now },
        where: {
          expiresAt: { gt: now },
          id: currentId,
          revokedAt: null,
        },
      });
      if (claimed.count !== 1) {
        return false;
      }
      await transaction.refreshToken.create({ data: replacement });
      await transaction.refreshToken.update({
        data: { replacedByTokenId: replacement.id },
        where: { id: currentId },
      });
      return true;
    });
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      data: { revokedAt: now },
      where: { familyId, revokedAt: null },
    });
  }

  private readonly userSelection = {
    deletedAt: true,
    displayName: true,
    email: true,
    id: true,
    isDemo: true,
    passwordHash: true,
  } satisfies Prisma.UserSelect;
}
