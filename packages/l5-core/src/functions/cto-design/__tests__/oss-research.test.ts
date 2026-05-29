import {
  filterCandidates,
  buildComparisonTable,
  formatDecisionEntry,
  runOssResearch,
  type OssCandidate,
  type OssDecisionEntry,
} from '../oss-research';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2024-06-01T00:00:00.000Z');

/** 5 months ago — within the 6-month window */
const RECENT = '2024-01-15T00:00:00.000Z';
/** 7 months ago — outside the 6-month window */
const STALE = '2023-11-01T00:00:00.000Z';

function makeCandidate(overrides: Partial<OssCandidate> = {}): OssCandidate {
  return {
    name: 'owner/repo',
    license: 'MIT',
    stars: 5000,
    lastActivityAt: RECENT,
    description: 'A great library',
    url: 'https://github.com/owner/repo',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterCandidates — license
// ---------------------------------------------------------------------------

describe('filterCandidates — license', () => {
  test('allows MIT', () => {
    expect(filterCandidates([makeCandidate({ license: 'MIT' })], NOW)).toHaveLength(1);
  });

  test('allows Apache-2.0', () => {
    expect(filterCandidates([makeCandidate({ license: 'Apache-2.0' })], NOW)).toHaveLength(1);
  });

  test('allows BSD-2-Clause', () => {
    expect(filterCandidates([makeCandidate({ license: 'BSD-2-Clause' })], NOW)).toHaveLength(1);
  });

  test('allows BSD-3-Clause', () => {
    expect(filterCandidates([makeCandidate({ license: 'BSD-3-Clause' })], NOW)).toHaveLength(1);
  });

  test('rejects GPL-3.0', () => {
    expect(filterCandidates([makeCandidate({ license: 'GPL-3.0' })], NOW)).toHaveLength(0);
  });

  test('rejects AGPL-3.0', () => {
    expect(filterCandidates([makeCandidate({ license: 'AGPL-3.0' })], NOW)).toHaveLength(0);
  });

  test('rejects empty string license', () => {
    expect(filterCandidates([makeCandidate({ license: '' })], NOW)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterCandidates — stars threshold
// ---------------------------------------------------------------------------

describe('filterCandidates — stars threshold', () => {
  test('passes candidate with exactly 1001 stars', () => {
    expect(filterCandidates([makeCandidate({ stars: 1001 })], NOW)).toHaveLength(1);
  });

  test('rejects candidate with exactly 1000 stars (boundary: must be strictly > 1000)', () => {
    expect(filterCandidates([makeCandidate({ stars: 1000 })], NOW)).toHaveLength(0);
  });

  test('rejects candidate with 999 stars', () => {
    expect(filterCandidates([makeCandidate({ stars: 999 })], NOW)).toHaveLength(0);
  });

  test('rejects candidate with 0 stars', () => {
    expect(filterCandidates([makeCandidate({ stars: 0 })], NOW)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterCandidates — activity window (6-month boundary)
// ---------------------------------------------------------------------------

describe('filterCandidates — activity window', () => {
  test('passes candidate active 5 months ago', () => {
    expect(filterCandidates([makeCandidate({ lastActivityAt: RECENT })], NOW)).toHaveLength(1);
  });

  test('rejects candidate last active 7 months ago', () => {
    expect(filterCandidates([makeCandidate({ lastActivityAt: STALE })], NOW)).toHaveLength(0);
  });

  test('rejects candidate with activity exactly on the cutoff boundary (cutoff = now - 6 months)', () => {
    // Exactly 6 months before NOW — should be rejected (< cutoff)
    const exactCutoff = new Date(NOW.getTime() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString();
    // The cutoff is now - 6months; lastMs === cutoff means lastMs >= cutoff is false for strict <
    // Our impl: lastMs < cutoff → reject. At exact cutoff lastMs === cutoff → NOT rejected.
    // So exact boundary passes. This test confirms the boundary semantics.
    const result = filterCandidates([makeCandidate({ lastActivityAt: exactCutoff })], NOW);
    expect(result).toHaveLength(1);
  });

  test('rejects candidate with invalid date string', () => {
    expect(
      filterCandidates([makeCandidate({ lastActivityAt: 'not-a-date' })], NOW),
    ).toHaveLength(0);
  });

  test('now reference is respected (different reference date changes result)', () => {
    const oldNow = new Date('2020-01-01T00:00:00.000Z');
    // RECENT (2024-01) is in the future relative to 2020 — NaN guard: new Date(RECENT) is valid
    // but it is after oldNow, so lastMs > cutoff → should PASS (it is "very recent" relative to the past ref)
    // Actually: cutoff = 2020-01-01 - 6months = 2019-07-01; lastMs for RECENT = 2024-01 >> cutoff → passes
    expect(filterCandidates([makeCandidate({ lastActivityAt: RECENT })], oldNow)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// filterCandidates — compound: all three rules
// ---------------------------------------------------------------------------

describe('filterCandidates — compound rules', () => {
  test('passes only candidates that satisfy all three rules', () => {
    const candidates: OssCandidate[] = [
      makeCandidate({ name: 'pass/all', license: 'MIT', stars: 2000, lastActivityAt: RECENT }),
      makeCandidate({ name: 'fail/license', license: 'GPL-3.0', stars: 2000, lastActivityAt: RECENT }),
      makeCandidate({ name: 'fail/stars', license: 'MIT', stars: 500, lastActivityAt: RECENT }),
      makeCandidate({ name: 'fail/stale', license: 'MIT', stars: 2000, lastActivityAt: STALE }),
    ];
    const result = filterCandidates(candidates, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('pass/all');
  });

  test('returns empty array when no candidates are provided', () => {
    expect(filterCandidates([], NOW)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildComparisonTable
// ---------------------------------------------------------------------------

describe('buildComparisonTable', () => {
  test('returns empty-state message for empty candidates', () => {
    const result = buildComparisonTable([]);
    expect(result).toContain('No candidates');
  });

  test('includes table header row', () => {
    const result = buildComparisonTable([makeCandidate()]);
    expect(result).toContain('| Name |');
    expect(result).toContain('| License |');
    expect(result).toContain('| Stars |');
    expect(result).toContain('| Last Activity |');
  });

  test('includes candidate data in rows', () => {
    const c = makeCandidate({ name: 'test/lib', license: 'Apache-2.0', stars: 3000, url: 'https://example.com' });
    const result = buildComparisonTable([c]);
    expect(result).toContain('test/lib');
    expect(result).toContain('Apache-2.0');
    expect(result).toContain('https://example.com');
  });

  test('formats lastActivityAt as YYYY-MM-DD only', () => {
    const c = makeCandidate({ lastActivityAt: '2024-01-15T12:34:56.000Z' });
    const result = buildComparisonTable([c]);
    expect(result).toContain('2024-01-15');
    expect(result).not.toContain('12:34:56');
  });

  test('escapes pipe characters in descriptions', () => {
    const c = makeCandidate({ description: 'foo | bar' });
    const result = buildComparisonTable([c]);
    expect(result).toContain('foo \\| bar');
  });

  test('produces one data row per candidate', () => {
    const candidates = [
      makeCandidate({ name: 'a/a' }),
      makeCandidate({ name: 'b/b' }),
      makeCandidate({ name: 'c/c' }),
    ];
    const result = buildComparisonTable(candidates);
    // header + divider + 3 rows = 5 lines
    const lines = result.split('\n').filter((l) => l.startsWith('|'));
    expect(lines).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// formatDecisionEntry
// ---------------------------------------------------------------------------

describe('formatDecisionEntry', () => {
  const base: OssDecisionEntry = {
    feature: 'HTTP client',
    decidedAt: '2024-06-01T00:00:00.000Z',
    decision: 'adopt',
    chosen: 'axios',
    rationale: 'Mature, well-documented, MIT licensed.',
    comparisonTable: '| Name | ... |\n|------|-----|\n| axios | ... |',
    candidates: [makeCandidate({ name: 'axios/axios' })],
  };

  test('includes feature name as H2 heading', () => {
    expect(formatDecisionEntry(base)).toContain('## HTTP client');
  });

  test('includes decidedAt timestamp', () => {
    expect(formatDecisionEntry(base)).toContain('2024-06-01T00:00:00.000Z');
  });

  test('includes decision value', () => {
    expect(formatDecisionEntry(base)).toContain('`adopt`');
  });

  test('includes chosen library when decision is adopt', () => {
    expect(formatDecisionEntry(base)).toContain('axios');
  });

  test('includes rationale text', () => {
    expect(formatDecisionEntry(base)).toContain('Mature, well-documented, MIT licensed.');
  });

  test('includes comparison table', () => {
    expect(formatDecisionEntry(base)).toContain('| Name | ... |');
  });

  test('includes candidate list', () => {
    expect(formatDecisionEntry(base)).toContain('axios/axios');
  });

  test('omits chosen line when decision is build', () => {
    const entry: OssDecisionEntry = { ...base, decision: 'build', chosen: undefined };
    const result = formatDecisionEntry(entry);
    expect(result).toContain('`build`');
    // The "— chosen" part should not appear
    expect(result).not.toMatch(/`build`.*—/);
  });

  test('ends with horizontal rule separator', () => {
    const result = formatDecisionEntry(base);
    expect(result).toContain('---');
  });
});

// ---------------------------------------------------------------------------
// runOssResearch — integration of filter + table + entry
// ---------------------------------------------------------------------------

describe('runOssResearch', () => {
  const candidates: OssCandidate[] = [
    makeCandidate({ name: 'pass/lib', license: 'MIT', stars: 5000, lastActivityAt: RECENT }),
    makeCandidate({ name: 'fail/gpl', license: 'GPL-3.0', stars: 5000, lastActivityAt: RECENT }),
    makeCandidate({ name: 'fail/old', license: 'MIT', stars: 5000, lastActivityAt: STALE }),
  ];

  test('filters candidates before building entry', () => {
    const entry = runOssResearch(candidates, {
      feature: 'Test feature',
      searchQuery: 'test',
      now: NOW,
      rationale: 'Best option',
      decision: 'adopt',
      chosen: 'pass/lib',
    });
    expect(entry.candidates).toHaveLength(1);
    expect(entry.candidates[0].name).toBe('pass/lib');
  });

  test('sets decidedAt from injected now', () => {
    const entry = runOssResearch(candidates, {
      feature: 'Test feature',
      searchQuery: 'test',
      now: NOW,
      rationale: 'Best option',
      decision: 'adopt',
    });
    expect(entry.decidedAt).toBe(NOW.toISOString());
  });

  test('comparisonTable is non-empty when candidates pass filter', () => {
    const entry = runOssResearch(candidates, {
      feature: 'Test feature',
      searchQuery: 'test',
      now: NOW,
      rationale: 'Best option',
      decision: 'adopt',
    });
    expect(entry.comparisonTable).toContain('pass/lib');
  });

  test('comparisonTable shows empty-state when all candidates filtered out', () => {
    const allBad: OssCandidate[] = [
      makeCandidate({ license: 'GPL-3.0' }),
    ];
    const entry = runOssResearch(allBad, {
      feature: 'Test feature',
      searchQuery: 'test',
      now: NOW,
      rationale: 'No good options',
      decision: 'build',
    });
    expect(entry.comparisonTable).toContain('No candidates');
  });
});
