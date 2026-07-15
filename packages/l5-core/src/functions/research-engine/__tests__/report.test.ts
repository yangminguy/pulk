import {
  assembleReport,
  renderReportMarkdown,
  requiredSectionHeaders,
  summarizeVerification,
  type AssembleReportInput,
} from '../report';
import { synthesizePrinciples } from '../synthesis';
import type { MethodologySummary, ResearchPurpose } from '../types';
import { makeAtom, makeRequest } from '../__fixtures__';

const METHOD: MethodologySummary = {
  candidateCount: 100,
  analyzedCount: 15,
  skippedNoTranscript: ['x'],
  refillUsed: 1,
  marketBreakdown: { KR: 8, US: 7 },
  queriesUsed: 12,
};

function assembleInput(purpose: ResearchPurpose): AssembleReportInput {
  const atoms = [
    makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1' }),
    makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'c2' }),
  ];
  const principles = synthesizePrinciples(
    [{ clusterId: 'k1', label: '핵심 원칙', atomIds: ['a1', 'a2'], relation: 'common' }],
    atoms,
  );
  return {
    runId: 'r1',
    request: makeRequest({ researchPurpose: purpose }),
    principles,
    unifiedTheory: '통합 이론',
    atoms,
    videoSources: [
      { videoId: 'v1', title: 'T', channelTitle: 'C', market: 'KR', viewCount: 100, durationSeconds: 600, transcriptSource: 'manual', sourceUrl: 'https://y/v1' },
    ],
    methodology: METHOD,
    generatedAt: '2025-07-01T00:00:00Z',
  };
}

const PURPOSES: ResearchPurpose[] = [
  'LEARNING',
  'TECHNICAL_RESEARCH',
  'CONTENT_PLANNING',
  'BUSINESS_RESEARCH',
  'DECISION_SUPPORT',
];

describe('renderReportMarkdown — required sections per purpose', () => {
  for (const purpose of PURPOSES) {
    it(`renders every required section header for ${purpose}`, () => {
      const report = assembleReport(assembleInput(purpose));
      const md = renderReportMarkdown(report);
      for (const header of requiredSectionHeaders(purpose)) {
        expect(md).toContain(header);
      }
    });
  }

  it('renders the topic as the H1 title', () => {
    const md = renderReportMarkdown(assembleReport(assembleInput('LEARNING')));
    expect(md.startsWith('# 유튜브 콘텐츠 전략')).toBe(true);
  });

  it('shows "(없음)" for an empty research question', () => {
    const md = renderReportMarkdown(assembleReport(assembleInput('LEARNING')));
    expect(md).toContain('(없음)');
  });
});

describe('assembleReport', () => {
  it('attaches only the purpose-relevant section', () => {
    const learning = assembleReport(assembleInput('LEARNING'));
    expect(learning.learning).toBeDefined();
    expect(learning.contentPlanning).toBeUndefined();

    const content = assembleReport(assembleInput('CONTENT_PLANNING'));
    expect(content.contentPlanning).toBeDefined();
    expect(content.learning).toBeUndefined();
  });

  it('derives an executive summary from common principles when none provided', () => {
    const report = assembleReport(assembleInput('LEARNING'));
    expect(report.executiveSummary).toContain('핵심 원칙');
  });
});

describe('summarizeVerification', () => {
  it('counts statuses and always warns that mentions are not verification', () => {
    const atoms = [makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1' })];
    const principles = synthesizePrinciples(
      [{ clusterId: 'k', label: 'x', atomIds: ['a1'], relation: 'common' }],
      atoms,
    );
    const summary = summarizeVerification(principles);
    expect(Object.values(summary.byStatus).reduce((a, b) => a + b, 0)).toBe(1);
    expect(summary.notes.join(' ')).toMatch(/검증이 아닙니다/);
  });
});

describe('English rendering', () => {
  it('uses English headers when outputLanguage=en', () => {
    const input = assembleInput('DECISION_SUPPORT');
    input.request = makeRequest({ researchPurpose: 'DECISION_SUPPORT', outputLanguage: 'en' });
    const md = renderReportMarkdown(assembleReport(input));
    for (const header of requiredSectionHeaders('DECISION_SUPPORT', 'en')) {
      expect(md).toContain(header);
    }
  });
});
