import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CMO content strategy v3 data model contract', () => {
  it('exports the PRD v3 key/pulling content strategy interfaces from types.ts', () => {
    const typesSource = readFileSync(join(__dirname, '..', 'types.ts'), 'utf8');

    const requiredInterfaces = [
      'KeyContentEntryDecision',
      'KeyContentSearchKeywordSet',
      'KeyContentViewtrapValidation',
      'SalesLogicMap',
      'ApprovedKeyContentTopic',
      'ContentTypePortfolio',
      'HotVideoStructureTemplate',
      'ExposureProbabilityCandidate',
      'LongtailEvergreenCandidate',
      'PullingTopicScore',
      'ConsumerJourneyCoverageReport',
      'ApprovedPullingContentSet',
      'ApprovedContentStrategyPackage',
    ];

    const missingInterfaces = requiredInterfaces.filter(
      (name) => !new RegExp(`export interface ${name}\\b`).test(typesSource),
    );

    expect(missingInterfaces).toEqual([]);
  });
});
