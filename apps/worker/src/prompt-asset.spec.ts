import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { loadPromptAsset, PromptAssetError } from './prompt-asset';

describe('prompt asset (EXTRACT-FR-004)', () => {
  it('loads the tracked asset and derives a stable content hash', async () => {
    const path = resolve(
      process.cwd(),
      '../../prompts/structured-extraction/v1.json',
    );
    const first = await loadPromptAsset(path);
    const second = await loadPromptAsset(path);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      name: 'structured-extraction',
      schemaVersion: 'structured-finding-v1',
      version: 1,
    });
    expect(first.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.template).toContain('売買推奨');
  });

  it('VIEW-FR-017 loads the versioned three-view prompt with its safety policy', async () => {
    const path = resolve(process.cwd(), '../../prompts/analysis-views/v1.json');

    const asset = await loadPromptAsset(path);

    expect(asset).toMatchObject({
      name: 'analysis-views',
      schemaVersion: 'analysis-views-v1',
      version: 1,
    });
    expect(asset.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.template).toContain('信頼できない引用データ');
    expect(asset.template).toContain('Buffett-Munger Lens');
    expect(asset.template).toContain('売買推奨');
  });

  it('rejects unknown manifest fields and path traversal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stocklens-prompt-'));
    try {
      const manifest = join(directory, 'invalid.json');
      await writeFile(
        manifest,
        JSON.stringify({
          name: 'structured-extraction',
          schemaVersion: 'v1',
          templateFile: '../outside.md',
          version: 1,
        }),
      );
      await expect(rejectedAssetCode(loadPromptAsset(manifest))).resolves.toBe(
        'PROMPT_ASSET_PATH_INVALID',
      );

      await writeFile(
        manifest,
        JSON.stringify({
          extra: true,
          name: 'structured-extraction',
          schemaVersion: 'v1',
          templateFile: 'system.md',
          version: 1,
        }),
      );
      await expect(rejectedAssetCode(loadPromptAsset(manifest))).resolves.toBe(
        'PROMPT_ASSET_MANIFEST_INVALID',
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

async function rejectedAssetCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof PromptAssetError) return error.code;
    throw error;
  }
  throw new Error('Expected prompt asset loading to fail.');
}
