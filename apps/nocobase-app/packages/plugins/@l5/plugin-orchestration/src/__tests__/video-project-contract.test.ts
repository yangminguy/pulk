import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginSource = readFileSync(resolve(testDir, '../server/plugin.ts'), 'utf8');

describe('VideoProject plugin contract', () => {
  it('creates and registers the video_projects collection fields', () => {
    expect(pluginSource).toContain('CREATE TABLE IF NOT EXISTS video_projects');
    expect(pluginSource).toContain("name: 'video_projects'");

    for (const fieldName of [
      'business_id',
      'topic',
      'angle',
      'format',
      'status',
      'config_snapshot',
      'output_url',
      'output_metadata',
      'error',
      'job_path',
    ]) {
      expect(pluginSource).toContain(`name: '${fieldName}'`);
    }
  });

  it('registers the video-project REST resource and loggedIn ACL', () => {
    expect(pluginSource).toContain('registerVideoProjectResource(this.app, this.db)');
    expect(pluginSource).toContain("this.app.acl.allow('video-project', ['list', 'create', 'advance', 'complete', 'fail'], 'loggedIn')");
    expect(pluginSource).toContain('function registerVideoProjectResource(app: any, db: any)');

    for (const actionName of ['list', 'create', 'advance', 'complete', 'fail']) {
      expect(pluginSource).toContain(`${actionName}: async`);
    }
  });

  it('uses l5-core transition functions for API state changes', () => {
    for (const functionName of [
      'createVideoProject',
      'advanceToGenerating',
      'completeVideoProject',
      'failVideoProject',
    ]) {
      expect(pluginSource).toContain(functionName);
    }
  });
});
