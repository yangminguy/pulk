import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('@l5/plugin-orchestration app package', () => {
  it('keeps a client entry for NocoBase test discovery', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(testDir, '../../package.json'), 'utf8')
    ) as { name: string; exports?: Record<string, unknown> };
    const clientSource = readFileSync(resolve(testDir, '../client/index.ts'), 'utf8');

    expect(packageJson.name).toBe('@l5/plugin-orchestration');
    expect(packageJson.exports).toHaveProperty('./client');
    expect(clientSource).toContain('PluginOrchestrationClient');
  });
});
