import { transitionPhase } from '../bpr-phase-manager';

describe('bpr-phase-manager', () => {
  it('should transition correctly without approval', () => {
    const transition = transitionPhase('direction_alignment', 'pmf_diagnosis', 'Reason', 'CEO', false);
    expect(transition.to_phase).toBe('pmf_diagnosis');
    expect(transition.approval_required).toBe(false);
  });

  it('should require approval for productization_review', () => {
    const transition = transitionPhase('execution_build', 'productization_review', 'Reason', 'CEO', false);
    expect(transition.approval_required).toBe(true);
  });

  it('should throw error if blocked by RiskQA', () => {
    expect(() => {
      transitionPhase('direction_alignment', 'pmf_diagnosis', 'Risk too high', 'CEO', true);
    }).toThrow('Transition blocked by RiskQA.');
  });
});
