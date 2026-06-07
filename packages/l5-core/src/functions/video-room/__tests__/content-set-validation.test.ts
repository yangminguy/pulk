// Tests for content-set-validation.ts
// PRD §8, §9 Gate 2, PRD §1.2, §1.11, §1.12

import type { ContentSetEntry } from '../types';
import { validateContentSet, evaluateContentSetGate } from '../content-set-validation';

// ── helpers ──────────────────────────────────────────────────────────────────

function makePulling(
  id: string,
  covered_stages: ContentSetEntry['covered_stages'],
  bridge_to_key = 'See key content for the full solution.',
): ContentSetEntry {
  return {
    content_id: id,
    content_type: 'pulling',
    title: `Pulling ${id}`,
    covered_stages,
    primary_stage: covered_stages[0],
    bridge_to_key,
  };
}

function makeKey(
  id: string,
  covered_stages: ContentSetEntry['covered_stages'],
): ContentSetEntry {
  return {
    content_id: id,
    content_type: 'key',
    title: `Key ${id}`,
    covered_stages,
    primary_stage: covered_stages[0],
    bridge_to_key: '',
  };
}

// ── Full valid set (Gate 2 pass) ──────────────────────────────────────────────

describe('validateContentSet — full valid set', () => {
  // 5 pulling + 1 key, all 5 stages covered, all pulling have bridge_to_key
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon', 'desire']),
    makePulling('p2', ['desire', 'plan']),
    makePulling('p3', ['plan']),
    makePulling('p4', ['action']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['plan', 'action', 'reward']),
  ];

  const result = validateContentSet({ contents });

  it('stage_coverage includes all 5 stages', () => {
    expect(result.stage_coverage.phenomenon).toContain('p1');
    expect(result.stage_coverage.desire).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(result.stage_coverage.plan).toEqual(expect.arrayContaining(['p2', 'p3', 'k1']));
    expect(result.stage_coverage.action).toEqual(expect.arrayContaining(['p4', 'k1']));
    expect(result.stage_coverage.reward).toEqual(expect.arrayContaining(['p5', 'k1']));
  });

  it('missing_stages is empty', () => {
    expect(result.missing_stages).toHaveLength(0);
  });

  it('revision_needed is false', () => {
    expect(result.revision_needed).toBe(false);
  });

  it('Gate 2 passes', () => {
    const gate = evaluateContentSetGate(result);
    expect(gate.passed).toBe(true);
    expect(gate.reasons).toHaveLength(0);
  });
});

// ── Test 1: covered_stages 고정 배정 금지 — 자유 배열 지원 ───────────────────
// PRD §1.2: each content CAN have covered_stages=['phenomenon'] (1:1 machine assignment is
// allowed structurally), AND multi-stage free arrays must also work.

describe('Test 1 — free covered_stages assignment (no fixed mapping enforced)', () => {
  // 1:1 single-stage assignment (structurally permitted)
  const single: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon']),
    makePulling('p2', ['desire']),
    makePulling('p3', ['plan']),
    makePulling('p4', ['action']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['plan', 'action', 'reward']),
  ];
  const singleResult = validateContentSet({ contents: single });

  it('1:1 assignment: all stages covered, revision_needed false', () => {
    expect(singleResult.missing_stages).toHaveLength(0);
    expect(singleResult.revision_needed).toBe(false);
  });

  // Multi-stage free array assignment
  const multi: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon', 'desire', 'plan']),
    makePulling('p2', ['phenomenon', 'desire']),
    makePulling('p3', ['desire', 'plan', 'action']),
    makePulling('p4', ['action', 'reward']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['desire', 'plan', 'action', 'reward']),
  ];
  const multiResult = validateContentSet({ contents: multi });

  it('multi-stage array: all stages covered, revision_needed false', () => {
    expect(multiResult.missing_stages).toHaveLength(0);
    expect(multiResult.revision_needed).toBe(false);
  });

  it('stage_coverage maps each stage to correct content_ids in multi-stage set', () => {
    expect(multiResult.stage_coverage.phenomenon).toEqual(
      expect.arrayContaining(['p1', 'p2']),
    );
    expect(multiResult.stage_coverage.action).toEqual(
      expect.arrayContaining(['p3', 'p4', 'k1']),
    );
  });
});

// ── Test 2: 키 콘텐츠 covered_stages=['desire','reward']여도 valid ────────────
// PRD §1.11: key content is NOT required to cover plan/action.

describe('Test 2 — key content covered_stages=[desire, reward] is valid', () => {
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon']),
    makePulling('p2', ['desire']),
    makePulling('p3', ['plan']),
    makePulling('p4', ['action']),
    makePulling('p5', ['plan', 'action']),
    makeKey('k1', ['desire', 'reward']),  // no plan/action in key — still valid
  ];

  const result = validateContentSet({ contents });

  it('all 5 stages covered even though key only covers desire+reward', () => {
    expect(result.missing_stages).toHaveLength(0);
  });

  it('revision_needed is false', () => {
    expect(result.revision_needed).toBe(false);
  });

  it('Gate 2 passes', () => {
    const gate = evaluateContentSetGate(result);
    expect(gate.passed).toBe(true);
  });
});

// ── Test 3: action 누락 → missing_stages=['action'], revision_needed=true ────

describe('Test 3 — missing action stage', () => {
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon']),
    makePulling('p2', ['desire']),
    makePulling('p3', ['plan']),
    makePulling('p4', ['phenomenon', 'desire']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['desire', 'reward']),  // no action anywhere
  ];

  const result = validateContentSet({ contents });

  it('missing_stages contains action', () => {
    expect(result.missing_stages).toContain('action');
  });

  it('missing_stages does not contain other stages', () => {
    expect(result.missing_stages).not.toContain('phenomenon');
    expect(result.missing_stages).not.toContain('desire');
    expect(result.missing_stages).not.toContain('plan');
    expect(result.missing_stages).not.toContain('reward');
  });

  it('revision_needed is true', () => {
    expect(result.revision_needed).toBe(true);
  });

  it('Gate 2 fails with missing stage reason', () => {
    const gate = evaluateContentSetGate(result);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('action'))).toBe(true);
  });
});

// ── Test 4: pulling missing bridge_to_key → revision_needed=true, Gate 2 fails ─

describe('Test 4 — pulling without bridge_to_key', () => {
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon'], 'Watch key for full breakdown.'),
    makePulling('p2', ['desire'], 'Key content explains how.'),
    makePulling('p3', ['plan'], ''),          // missing bridge
    makePulling('p4', ['action'], 'Key is next.'),
    makePulling('p5', ['reward'], 'See key.'),
    makeKey('k1', ['plan', 'action', 'reward']),
  ];

  const result = validateContentSet({ contents });

  it('revision_needed is true because p3 lacks bridge_to_key', () => {
    expect(result.revision_needed).toBe(true);
  });

  it('Gate 2 fails mentioning p3', () => {
    const gate = evaluateContentSetGate(result);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some((r) => r.includes('p3'))).toBe(true);
  });
});

// ── Test 5: multiple missing stages ───────────────────────────────────────────

describe('Test 5 — multiple missing stages (plan and action both absent)', () => {
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon']),
    makePulling('p2', ['desire']),
    makePulling('p3', ['phenomenon']),
    makePulling('p4', ['desire']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['desire', 'reward']),
  ];

  const result = validateContentSet({ contents });

  it('missing_stages includes plan and action', () => {
    expect(result.missing_stages).toContain('plan');
    expect(result.missing_stages).toContain('action');
  });

  it('revision_needed is true', () => {
    expect(result.revision_needed).toBe(true);
  });
});

// ── Test 6: overlap_risk detection ────────────────────────────────────────────
// Entry whose covered_stages is a strict subset of another is flagged.

describe('Test 6 — overlap_risk', () => {
  // p2=[desire] is a strict subset of p1=[phenomenon,desire] → p2 is flagged
  const contents: ContentSetEntry[] = [
    makePulling('p1', ['phenomenon', 'desire']),
    makePulling('p2', ['desire']),            // subset of p1 → overlap risk
    makePulling('p3', ['plan']),
    makePulling('p4', ['action']),
    makePulling('p5', ['reward']),
    makeKey('k1', ['plan', 'action', 'reward']),
  ];

  const result = validateContentSet({ contents });

  it('overlap_risk contains p2', () => {
    expect(result.overlap_risk).toContain('p2');
  });

  it('overlap_risk does not flag non-subset entries', () => {
    expect(result.overlap_risk).not.toContain('p1');
    expect(result.overlap_risk).not.toContain('k1');
  });

  it('revision_needed is false (overlap is a warning, not a blocker)', () => {
    // All stages covered, all pulling have bridge_to_key → no revision required
    expect(result.missing_stages).toHaveLength(0);
    expect(result.revision_needed).toBe(false);
  });
});
