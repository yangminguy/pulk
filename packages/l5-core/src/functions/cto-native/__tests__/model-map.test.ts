import { agentForTaskKind, modelForTask } from '../model-map';

describe('agentForTaskKind', () => {
  it.each([
    ['implementation', 'claude-code'],
    ['architecture',   'claude-code'],
    ['security',       'claude-code'],
    ['release',        'claude-code'],
    ['database',       'claude-code'],
    ['deployment',     'claude-code'],
    ['documentation',  'claude-code'],
    ['unknown',        'claude-code'],
    ['qa',             'codex'],
    ['test',           'codex'],
    ['code_review',    'codex'],
    ['ui',             'antigravity'],
    ['ux_copy',        'antigravity'],
  ] as const)('taskKind=%s → agent=%s', (kind, expected) => {
    expect(agentForTaskKind(kind)).toBe(expected);
  });
});

describe('modelForTask — claude-code', () => {
  it.each([
    ['architecture',  'claude-opus-4-8'],
    ['security',      'claude-opus-4-8'],
    ['release',       'claude-opus-4-8'],
    ['deployment',    'claude-opus-4-8'],
    ['implementation','claude-sonnet-4-6'],
    ['database',      'claude-sonnet-4-6'],
    ['documentation', 'claude-haiku-4-5'],
  ] as const)('(%s) → %s', (kind, expected) => {
    expect(modelForTask('claude-code', kind)).toBe(expected);
  });

  it('returns undefined for unrelated kinds', () => {
    expect(modelForTask('claude-code', 'qa')).toBeUndefined();
    expect(modelForTask('claude-code', 'ui')).toBeUndefined();
    expect(modelForTask('claude-code', 'unknown')).toBeUndefined();
  });
});

describe('modelForTask — codex', () => {
  it.each([
    ['qa',          'gpt-5.5'],
    ['test',        'gpt-5.5'],
    ['code_review', 'gpt-5.5'],
  ] as const)('(%s) → %s', (kind, expected) => {
    expect(modelForTask('codex', kind)).toBe(expected);
  });

  it('returns undefined for unrelated kinds', () => {
    expect(modelForTask('codex', 'implementation')).toBeUndefined();
    expect(modelForTask('codex', 'ui')).toBeUndefined();
  });
});

describe('modelForTask — antigravity', () => {
  it('ui → gemini-3.5-flash-high', () => {
    expect(modelForTask('antigravity', 'ui')).toBe('gemini-3.5-flash-high');
  });

  it('ux_copy → gemini-3.5-flash-medium', () => {
    expect(modelForTask('antigravity', 'ux_copy')).toBe('gemini-3.5-flash-medium');
  });

  it('returns undefined for unrelated kinds', () => {
    expect(modelForTask('antigravity', 'implementation')).toBeUndefined();
    expect(modelForTask('antigravity', 'qa')).toBeUndefined();
  });
});
