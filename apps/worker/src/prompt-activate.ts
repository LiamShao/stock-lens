import { PrismaClient } from '@prisma/client';

import { loadLocalEnvironment } from './environment';
import {
  getPromptActivationConfig,
  PromptActivationConfigError,
} from './prompt-activation.config';
import { loadPromptAsset, PromptAssetError } from './prompt-asset';
import {
  PromptActivationError,
  PromptVersionRepository,
} from './prompt-version.repository';

loadLocalEnvironment();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const assetPath = readArgument(args, '--asset');
  const operatorId = readArgument(args, '--operator-id');
  getPromptActivationConfig(operatorId);
  if (assetPath === null) {
    throw new PromptActivationConfigInputError();
  }
  const asset = await loadPromptAsset(assetPath);
  if (readArgument(args, '--confirm') !== `${asset.name}@${asset.version}`) {
    throw new PromptActivationConfigInputError();
  }
  const prisma = new PrismaClient();
  try {
    const result = await new PromptVersionRepository(prisma).activate(asset);
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        code: 'PROMPT_VERSION_ACTIVATED',
        operatorId,
      })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function readArgument(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

class PromptActivationConfigInputError extends Error {
  readonly code = 'PROMPT_ACTIVATION_INPUT_INVALID';
}

void main().catch((error: unknown) => {
  const code =
    error instanceof PromptAssetError ||
    error instanceof PromptActivationError ||
    error instanceof PromptActivationConfigError ||
    error instanceof PromptActivationConfigInputError
      ? error.code
      : 'PROMPT_ACTIVATION_FAILED';
  process.stderr.write(
    `${JSON.stringify({ code, message: 'Prompt activation failed.' })}\n`,
  );
  process.exitCode = 1;
});
