import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CMO orchestrator v3 data model contract', () => {
  it('exports the CMO v3 workflow data model from types.ts', () => {
    const typesSource = readFileSync(join(__dirname, '..', 'types.ts'), 'utf8');

    const requiredExports = [
      'ApprovedContentStrategyPackage',
      'MarketResearchPack',
      'ScriptMaterialPack',
      'CmoVideoStrategyBrief',
      'VoiceMatchedScript',
      'ScriptQaReport',
      'VideoExecutionBrief',
      'CmoContentCard',
      'ResearchStatus',
      'StrategyBriefStatus',
      'ScriptStatus',
      'VideoGenStatus',
    ];

    const missingExports = requiredExports.filter((name) => {
      const exportPattern = new RegExp(
        `export\\s+(?:interface|type|enum)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`,
        'm',
      );

      return !exportPattern.test(typesSource);
    });

    expect(missingExports).toEqual([]);
  });
});
