import {
  getCurrentPhase,
  validateTransition,
  buildTransitionResult,
  derivePhaseFromTasks,
} from '../phase-manager';
import type { BPRPhaseState } from '../types';

function makePhaseState(over: Partial<BPRPhaseState> = {}): BPRPhaseState {
  return {
    id: 'phase-1',
    phase: 'direction_alignment',
    started_at: new Date().toISOString(),
    success_criteria: [],
    is_current: false,
    requires_founder_approval: true,
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe('getCurrentPhase', () => {
  it('returns null for empty array', () => {
    expect(getCurrentPhase([])).toBeNull();
  });

  it('returns phase where is_current is true', () => {
    const phases = [
      makePhaseState({ phase: 'direction_alignment', is_current: false }),
      makePhaseState({ phase: 'pmf_diagnosis', is_current: true }),
    ];
    expect(getCurrentPhase(phases)).toBe('pmf_diagnosis');
  });

  it('returns null when no phase is current', () => {
    const phases = [
      makePhaseState({ phase: 'direction_alignment', is_current: false }),
      makePhaseState({ phase: 'pmf_diagnosis', is_current: false }),
    ];
    expect(getCurrentPhase(phases)).toBeNull();
  });
});

describe('validateTransition', () => {
  it('allows forward transition by one step', () => {
    const result = validateTransition('direction_alignment', 'pmf_diagnosis');
    expect(result.valid).toBe(true);
  });

  it('rejects backward transition', () => {
    const result = validateTransition('execution_build', 'direction_alignment');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('founder approval');
  });

  it('rejects skipping phases', () => {
    const result = validateTransition('direction_alignment', 'execution_build');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('one phase at a time');
  });

  it('allows all consecutive forward transitions', () => {
    expect(validateTransition('pmf_diagnosis', 'execution_build').valid).toBe(true);
    expect(validateTransition('execution_build', 'sales_distribution_test').valid).toBe(true);
    expect(validateTransition('sales_distribution_test', 'productization_review').valid).toBe(true);
    expect(validateTransition('productization_review', 'scale_automation').valid).toBe(true);
  });
});

describe('buildTransitionResult', () => {
  it('always requires approval', () => {
    const result = buildTransitionResult({
      from_phase: 'direction_alignment',
      to_phase: 'pmf_diagnosis',
      reason: 'PMF signal received',
      triggered_by: 'ceo',
    });
    expect(result.requires_approval).toBe(true);
  });

  it('returns ok=true for valid forward transition', () => {
    const result = buildTransitionResult({
      from_phase: 'direction_alignment',
      to_phase: 'pmf_diagnosis',
      reason: 'test',
      triggered_by: 'founder',
    });
    expect(result.ok).toBe(true);
    expect(result.from_phase).toBe('direction_alignment');
    expect(result.to_phase).toBe('pmf_diagnosis');
  });

  it('returns ok=false for backward transition', () => {
    const result = buildTransitionResult({
      from_phase: 'execution_build',
      to_phase: 'direction_alignment',
      reason: 'reset',
      triggered_by: 'founder',
    });
    expect(result.ok).toBe(false);
    expect(result.requires_approval).toBe(true);
  });
});

describe('derivePhaseFromTasks', () => {
  it('returns direction_alignment for empty array', () => {
    expect(derivePhaseFromTasks([])).toBe('direction_alignment');
  });

  it('returns most frequent phase', () => {
    const tasks = [
      { phase: 'pmf_diagnosis' },
      { phase: 'pmf_diagnosis' },
      { phase: 'execution_build' },
    ];
    expect(derivePhaseFromTasks(tasks)).toBe('pmf_diagnosis');
  });

  it('returns direction_alignment when tasks have no phase', () => {
    const tasks = [{ phase: undefined }, {}];
    expect(derivePhaseFromTasks(tasks)).toBe('direction_alignment');
  });

  it('returns direction_alignment when phase is unknown string', () => {
    const tasks = [{ phase: 'unknown_phase' }];
    expect(derivePhaseFromTasks(tasks)).toBe('direction_alignment');
  });
});
