import { Prisma, type PrismaClient } from '@prisma/client';

import type { PromptAsset } from './prompt-asset';

export type PromptActivationResult = {
  action: 'activated' | 'already-active' | 'created-and-activated';
  contentSha256: string;
  id: string;
  name: string;
  schemaVersion: string;
  version: number;
};

export class PromptVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  activate(asset: PromptAsset): Promise<PromptActivationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${asset.name}))`;
        const existing = await tx.promptVersion.findUnique({
          where: {
            name_version: { name: asset.name, version: asset.version },
          },
        });
        if (existing !== null && !matchesAsset(existing, asset)) {
          throw new PromptActivationError(
            'PROMPT_VERSION_CONFLICT',
            'Prompt name and version already refer to different immutable content.',
          );
        }
        if (existing?.isActive === true)
          return toResult(existing, 'already-active');

        let prompt = existing;
        let created = false;
        if (prompt === null) {
          const hashOwner = await tx.promptVersion.findUnique({
            where: { contentSha256: asset.contentSha256 },
          });
          if (hashOwner !== null) {
            throw new PromptActivationError(
              'PROMPT_CONTENT_CONFLICT',
              'Prompt content hash is already assigned to another version.',
            );
          }
          prompt = await tx.promptVersion.create({
            data: { ...asset, isActive: false },
          });
          created = true;
        }
        await tx.promptVersion.updateMany({
          data: { isActive: false },
          where: { id: { not: prompt.id }, isActive: true, name: asset.name },
        });
        const active = await tx.promptVersion.update({
          data: { isActive: true },
          where: { id: prompt.id },
        });
        return toResult(
          active,
          created ? 'created-and-activated' : 'activated',
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}

function matchesAsset(
  prompt: {
    contentSha256: string;
    name: string;
    schemaVersion: string;
    template: string;
    version: number;
  },
  asset: PromptAsset,
): boolean {
  return (
    prompt.name === asset.name &&
    prompt.version === asset.version &&
    prompt.schemaVersion === asset.schemaVersion &&
    prompt.template === asset.template &&
    prompt.contentSha256 === asset.contentSha256
  );
}

function toResult(
  prompt: {
    contentSha256: string;
    id: string;
    name: string;
    schemaVersion: string;
    version: number;
  },
  action: PromptActivationResult['action'],
): PromptActivationResult {
  return { action, ...prompt };
}

export class PromptActivationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PromptActivationError';
  }
}
