import fs from 'fs';
import path from 'path';

describe('QA automation contract', () => {
  const repoRoot = path.resolve(__dirname, '../../../../..');

  it('defines root QA scripts for architecture and guardrail checks', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    );

    expect(packageJson.scripts).toHaveProperty('qa:arch');
    expect(packageJson.scripts).toHaveProperty('qa:guardrail');
  });

  it('defines l5-core architecture QA script', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'packages/l5-core/package.json'), 'utf8'),
    );

    expect(packageJson.scripts).toHaveProperty('qa:arch');
  });

  it('provides dependency-cruiser architecture rules', () => {
    const configPath = path.join(repoRoot, '.dependency-cruiser.cjs');

    expect(fs.existsSync(configPath)).toBe(true);

    const config = fs.readFileSync(configPath, 'utf8');
    expect(config).toContain('no-core-to-nocobase');
    expect(config).toContain('plugin-must-use-core');
    expect(config).toContain('no-agent-in-shell');
    expect(config).toContain('no-hermes-in-shell');
    expect(config).toContain('no-cross-runtime');
  });

  it('provides OSS guardrail checks for banned dependencies, analytics, and licenses', () => {
    const scriptPath = path.join(repoRoot, 'scripts/qa-guardrail.sh');

    expect(fs.existsSync(scriptPath)).toBe(true);

    const script = fs.readFileSync(scriptPath, 'utf8');
    expect(script).toContain('nocobase-commercial');
    expect(script).toContain('activepieces-enterprise');
    expect(script).toContain('trigger.dev-pro');
    expect(script).toContain('posthog');
    expect(script).toContain('openpanel');
    expect(script).toContain('license-checker');
  });
});
