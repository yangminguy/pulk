import type { TaskClass, DevPhaseKind } from '../dev-workflow-spec';
import {
  MODEL_ROSTER,
  selectModelTier,
  resolveModel,
  type ModelTier,
  type QuotaState,
} from '../model-routing';

const ALL_CLASSES: TaskClass[] = [
  'TINY',
  'SMALL_FIX',
  'FEATURE',
  'BIG_CHANGE',
  'OPS',
  'RESEARCH',
  'REFACTOR',
];

// Phase kinds that actually appear across the SOP templates.
const ALL_PHASES: DevPhaseKind[] = [
  'spec',
  'test',
  'implement',
  'review',
  'commit',
  'repro',
  'fix',
  'regress',
  'research',
  'rfc',
  'refactor',
  'backup',
  'smoke',
];

describe('MODEL_ROSTER', () => {
  it('defines exactly the three tiers with public model identifiers', () => {
    const tiers: ModelTier[] = ['T1', 'T2', 'T3'];
    for (const tier of tiers) {
      expect(MODEL_ROSTER[tier].tier).toBe(tier);
      expect(typeof MODEL_ROSTER[tier].model).toBe('string');
      expect(MODEL_ROSTER[tier].model.length).toBeGreaterThan(0);
      expect(MODEL_ROSTER[tier].label.length).toBeGreaterThan(0);
    }
  });

  it('contains no obvious secret/api-key material', () => {
    for (const entry of Object.values(MODEL_ROSTER)) {
      expect(entry.model).not.toMatch(/sk-|api[_-]?key|secret|bearer/i);
    }
  });
});

describe('selectModelTier — matrix', () => {
  it('returns a valid tier for every TaskClass × phase combination', () => {
    for (const cls of ALL_CLASSES) {
      for (const phase of ALL_PHASES) {
        const tier = selectModelTier(cls, phase);
        expect(['T1', 'T2', 'T3']).toContain(tier);
      }
    }
  });

  it('routes reasoning/design phases to T1 by default', () => {
    expect(selectModelTier('FEATURE', 'research')).toBe('T1');
    expect(selectModelTier('FEATURE', 'spec')).toBe('T1');
    expect(selectModelTier('FEATURE', 'review')).toBe('T1');
    expect(selectModelTier('BIG_CHANGE', 'rfc')).toBe('T1');
  });

  it('routes cheap mechanical phases to T3 by default', () => {
    expect(selectModelTier('FEATURE', 'commit')).toBe('T3');
    expect(selectModelTier('SMALL_FIX', 'regress')).toBe('T3');
  });

  it('routes balanced implementation phases to T2 by default', () => {
    expect(selectModelTier('FEATURE', 'implement')).toBe('T2');
    expect(selectModelTier('FEATURE', 'test')).toBe('T2');
  });

  it('applies SMALL_FIX downshift overrides', () => {
    expect(selectModelTier('SMALL_FIX', 'fix')).toBe('T3');
    expect(selectModelTier('SMALL_FIX', 'repro')).toBe('T3');
  });

  it('applies BIG_CHANGE escalation overrides', () => {
    expect(selectModelTier('BIG_CHANGE', 'implement')).toBe('T1');
    expect(selectModelTier('BIG_CHANGE', 'test')).toBe('T1');
    // unrelated phase still uses default
    expect(selectModelTier('BIG_CHANGE', 'commit')).toBe('T3');
  });

  it('applies OPS override and keeps others at default', () => {
    expect(selectModelTier('OPS', 'backup')).toBe('T3');
    expect(selectModelTier('OPS', 'implement')).toBe('T2');
  });
});

describe('resolveModel — no quota state (all available)', () => {
  it('returns the selected tier model with fellBack=false', () => {
    const r = resolveModel('FEATURE', 'spec');
    expect(r.selectedTier).toBe('T1');
    expect(r.tier).toBe('T1');
    expect(r.model).toBe(MODEL_ROSTER.T1.model);
    expect(r.fellBack).toBe(false);
  });

  it('treats undefined quotaState identically to empty quotaState', () => {
    const a = resolveModel('FEATURE', 'implement', undefined);
    const b = resolveModel('FEATURE', 'implement', {});
    expect(a).toEqual(b);
  });

  it('resolves every TaskClass × phase to a roster model', () => {
    const rosterModels = Object.values(MODEL_ROSTER).map((e) => e.model);
    for (const cls of ALL_CLASSES) {
      for (const phase of ALL_PHASES) {
        const r = resolveModel(cls, phase);
        expect(rosterModels).toContain(r.model);
        expect(r.fellBack).toBe(false);
      }
    }
  });
});

describe('resolveModel — fallback on exhausted quota', () => {
  it('falls back T1 → T2 when T1 is exhausted', () => {
    const quota: QuotaState = { tiers: { T1: { available: false } } };
    const r = resolveModel('FEATURE', 'spec', quota); // selects T1
    expect(r.selectedTier).toBe('T1');
    expect(r.tier).toBe('T2');
    expect(r.model).toBe(MODEL_ROSTER.T2.model);
    expect(r.fellBack).toBe(true);
  });

  it('falls back T1 → T3 when both T1 and T2 are exhausted', () => {
    const quota: QuotaState = {
      tiers: { T1: { available: false }, T2: { available: false } },
    };
    const r = resolveModel('FEATURE', 'spec', quota);
    expect(r.tier).toBe('T3');
    expect(r.fellBack).toBe(true);
  });

  it('T2 selection prefers cheaper T3 before escalating to T1', () => {
    const quota: QuotaState = { tiers: { T2: { available: false } } };
    const r = resolveModel('FEATURE', 'implement', quota); // selects T2
    expect(r.selectedTier).toBe('T2');
    expect(r.tier).toBe('T3');
    expect(r.fellBack).toBe(true);
  });

  it('T2 selection escalates to T1 when T2 and T3 both exhausted', () => {
    const quota: QuotaState = {
      tiers: { T2: { available: false }, T3: { available: false } },
    };
    const r = resolveModel('FEATURE', 'implement', quota);
    expect(r.tier).toBe('T1');
    expect(r.fellBack).toBe(true);
  });

  it('T3 selection escalates to T2 when T3 exhausted', () => {
    const quota: QuotaState = { tiers: { T3: { available: false } } };
    const r = resolveModel('FEATURE', 'commit', quota); // selects T3
    expect(r.selectedTier).toBe('T3');
    expect(r.tier).toBe('T2');
    expect(r.fellBack).toBe(true);
  });

  it('does not fall back when the selected tier is still available', () => {
    const quota: QuotaState = { tiers: { T2: { available: false } } };
    const r = resolveModel('FEATURE', 'spec', quota); // selects T1, unaffected
    expect(r.tier).toBe('T1');
    expect(r.fellBack).toBe(false);
  });

  it('returns the selected tier (fellBack=false) when all tiers exhausted', () => {
    const quota: QuotaState = {
      tiers: {
        T1: { available: false },
        T2: { available: false },
        T3: { available: false },
      },
    };
    const r = resolveModel('FEATURE', 'spec', quota);
    expect(r.tier).toBe('T1');
    expect(r.selectedTier).toBe('T1');
    expect(r.fellBack).toBe(false);
  });

  it('treats a missing tier entry as available', () => {
    const quota: QuotaState = { tiers: { T1: { available: true } } };
    const r = resolveModel('FEATURE', 'spec', quota);
    expect(r.tier).toBe('T1');
    expect(r.fellBack).toBe(false);
  });

  it('ignores extra quota metadata (remaining/resetAt) during routing', () => {
    const quota: QuotaState = {
      tiers: { T1: { available: false, remaining: 0, resetAt: '2026-01-01T00:00:00Z' } },
    };
    const r = resolveModel('BIG_CHANGE', 'rfc', quota); // selects T1
    expect(r.tier).toBe('T2');
    expect(r.fellBack).toBe(true);
  });
});
