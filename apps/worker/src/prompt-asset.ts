import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

export interface PromptAsset {
  contentSha256: string;
  name: string;
  schemaVersion: string;
  template: string;
  version: number;
}

interface PromptManifest {
  name: string;
  schemaVersion: string;
  templateFile: string;
  version: number;
}

const MANIFEST_KEYS = [
  'name',
  'schemaVersion',
  'templateFile',
  'version',
] as const;
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SCHEMA_VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export async function loadPromptAsset(
  manifestPath: string,
): Promise<PromptAsset> {
  const absoluteManifestPath = resolve(manifestPath);
  const rawManifest = await readFile(absoluteManifestPath, 'utf8');
  const manifest = parseManifest(rawManifest);
  const assetDirectory = dirname(absoluteManifestPath);
  const templatePath = resolve(assetDirectory, manifest.templateFile);
  if (isInvalidRelativePath(relative(assetDirectory, templatePath))) {
    throw invalidTemplatePath();
  }
  let realAssetDirectory: string;
  let realTemplatePath: string;
  try {
    [realAssetDirectory, realTemplatePath] = await Promise.all([
      realpath(assetDirectory),
      realpath(templatePath),
    ]);
  } catch {
    throw new PromptAssetError(
      'PROMPT_ASSET_TEMPLATE_INVALID',
      'Prompt template could not be read.',
    );
  }
  const relativeTemplatePath = relative(realAssetDirectory, realTemplatePath);
  if (isInvalidRelativePath(relativeTemplatePath)) throw invalidTemplatePath();
  const templateBytes = await readFile(realTemplatePath);
  const template = templateBytes.toString('utf8');
  if (template.length < 1 || template.length > 50_000) {
    throw new PromptAssetError(
      'PROMPT_ASSET_TEMPLATE_INVALID',
      'Prompt template length is invalid.',
    );
  }
  return {
    contentSha256: createHash('sha256').update(templateBytes).digest('hex'),
    name: manifest.name,
    schemaVersion: manifest.schemaVersion,
    template,
    version: manifest.version,
  };
}

function isInvalidRelativePath(path: string): boolean {
  return path.startsWith('..') || path === '' || path.includes('\0');
}

function invalidTemplatePath(): PromptAssetError {
  return new PromptAssetError(
    'PROMPT_ASSET_PATH_INVALID',
    'Prompt template must be a file inside the manifest directory.',
  );
}

function parseManifest(rawManifest: string): PromptManifest {
  let value: unknown;
  try {
    value = JSON.parse(rawManifest);
  } catch {
    throw new PromptAssetError(
      'PROMPT_ASSET_MANIFEST_INVALID',
      'Prompt manifest is not valid JSON.',
    );
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidManifest();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== MANIFEST_KEYS.length ||
    MANIFEST_KEYS.some((key) => !(key in record)) ||
    typeof record.name !== 'string' ||
    !NAME_PATTERN.test(record.name) ||
    typeof record.version !== 'number' ||
    !Number.isInteger(record.version) ||
    record.version < 1 ||
    typeof record.schemaVersion !== 'string' ||
    !SCHEMA_VERSION_PATTERN.test(record.schemaVersion) ||
    typeof record.templateFile !== 'string' ||
    record.templateFile.length < 1
  ) {
    throw invalidManifest();
  }
  return {
    name: record.name,
    schemaVersion: record.schemaVersion,
    templateFile: record.templateFile,
    version: record.version,
  };
}

function invalidManifest(): PromptAssetError {
  return new PromptAssetError(
    'PROMPT_ASSET_MANIFEST_INVALID',
    'Prompt manifest fields are invalid.',
  );
}

export class PromptAssetError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PromptAssetError';
  }
}
