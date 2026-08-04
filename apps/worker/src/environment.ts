import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

export function loadLocalEnvironment(cwd = process.cwd()): void {
  const candidates = [resolve(cwd, '.env'), resolve(cwd, '../../.env')];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (path) {
    config({ override: false, path, quiet: true });
  }
}
