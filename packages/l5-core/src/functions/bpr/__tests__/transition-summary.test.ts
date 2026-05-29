import { buildPhaseTransitionSummary } from '../transition-summary';

describe('buildPhaseTransitionSummary', () => {
  const baseTasks = [
    {
      id: 't1',
      title: 'PMF 메시지 실험',
      expected_output: '응답률 5%',
      status: 'done',
      phase: 'pmf_diagnosis',
      assigned_agent: 'CMO',
      insight_to_record: '응답률은 첫 줄 카피에 가장 민감',
    },
    {
      id: 't2',
      title: '리드 콜드 메일',
      expected_output: '5건 발송',
      status: 'blocked',
      phase: 'pmf_diagnosis',
      blocker: '개인정보 정책 확인 중',
    },
    {
      id: 't3',
      title: '결과 분석',
      status: 'needs_review',
      phase: 'pmf_diagnosis',
      insight_to_record: '응답률은 첫 줄 카피에 가장 민감', // duplicate dedup
    },
    {
      id: 't4',
      title: '관련 없는 phase',
      status: 'done',
      phase: 'direction_alignment',
    },
  ];

  test('counts only tasks in from_phase', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'pmf_diagnosis',
      to_phase: 'execution_build',
      tasks: baseTasks,
      now: '2026-05-29T00:00:00Z',
    });
    expect(s.completed_count).toBe(1);
    expect(s.blocked_count).toBe(1);
    expect(s.needs_review_count).toBe(1);
  });

  test('aggregates success criteria from done tasks', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'pmf_diagnosis',
      to_phase: 'execution_build',
      tasks: baseTasks,
    });
    expect(s.success_criteria_met).toEqual([
      { title: 'PMF 메시지 실험', outcome: '응답률 5%' },
    ]);
  });

  test('lists outstanding items with blocker reason', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'pmf_diagnosis',
      to_phase: 'execution_build',
      tasks: baseTasks,
    });
    expect(s.outstanding_items).toHaveLength(2);
    expect(s.outstanding_items[0]).toMatchObject({
      title: '리드 콜드 메일',
      status: 'blocked',
      reason: '개인정보 정책 확인 중',
    });
    expect(s.outstanding_items[1].status).toBe('needs_review');
  });

  test('dedupes key_learnings from insight_to_record', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'pmf_diagnosis',
      to_phase: 'execution_build',
      tasks: baseTasks,
    });
    expect(s.key_learnings).toEqual(['응답률은 첫 줄 카피에 가장 민감']);
  });

  test('populates next_phase_plan from PHASE_FOCUS', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'pmf_diagnosis',
      to_phase: 'execution_build',
      tasks: baseTasks,
    });
    expect(s.next_phase_plan.primary_owners).toContain('CTO');
    expect(s.next_phase_plan.success_criteria.length).toBeGreaterThan(0);
    expect(s.next_phase_plan.expected_outcome).toBeTruthy();
  });

  test('requires_approval is always true', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'direction_alignment',
      to_phase: 'pmf_diagnosis',
      tasks: [],
    });
    expect(s.requires_approval).toBe(true);
  });

  test('backward transition produces warning message', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'execution_build',
      to_phase: 'pmf_diagnosis',
      tasks: [],
    });
    expect(s.message).toContain('Founder 승인');
  });

  test('multi-step jump produces explicit reject message', () => {
    const s = buildPhaseTransitionSummary({
      from_phase: 'direction_alignment',
      to_phase: 'execution_build',
      tasks: [],
    });
    expect(s.message).toContain('점프');
  });
});
