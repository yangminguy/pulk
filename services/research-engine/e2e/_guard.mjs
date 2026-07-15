// Shared env guard for the live-integration e2e scripts. These scripts hit real
// external services, so they MUST NOT run inside the jest unit suite (jest only
// matches src/__tests__/**/*.test.ts). Each script exits 1 with a clear message
// when a required credential is missing.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(SERVICE_ROOT, '../..');

/** Exit 1 unless every env var in `names` (any-of groups allowed via `|`) is set. */
export function requireEnv(names) {
  const missing = [];
  for (const name of names) {
    const anyOf = name.split('|');
    if (!anyOf.some((n) => process.env[n])) missing.push(name);
  }
  if (missing.length > 0) {
    console.error(`[e2e] missing required env: ${missing.join(', ')}`);
    console.error('[e2e] this is a LIVE integration script — set the credentials and re-run.');
    process.exit(1);
  }
}

/** YouTube key can come from env OR services/youtube/.credentials.json. */
export function requireYouTubeKey() {
  if (process.env.YOUTUBE_API_KEY) return;
  if (existsSync(resolve(REPO_ROOT, 'services/youtube/.credentials.json'))) return;
  console.error('[e2e] no YouTube key: set YOUTUBE_API_KEY or provide services/youtube/.credentials.json');
  process.exit(1);
}

export function requireBuilt() {
  if (!existsSync(resolve(SERVICE_ROOT, 'dist/cli.js'))) {
    console.error('[e2e] dist not built — run: pnpm --filter @l5/research-engine build');
    process.exit(1);
  }
}
