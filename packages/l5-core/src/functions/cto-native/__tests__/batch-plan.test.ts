import { buildBatchPlan, type BatchCard } from '../batch-plan';
import { planPhaseLevels } from '../parallelize';
import type { CTOPhase } from '../../../types/acr-intent';

function phase(name: string, depends_on?: string[]): CTOPhase {
  return {
    name,
    runtime: 'claude',
    prompt_packet: `do ${name}`,
    expected_output: 'done',
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    ...(depends_on !== undefined ? { depends_on } : {}),
  };
}

function card(proposal_id: string, target_repo: string, phases: CTOPhase[], extra?: Partial<BatchCard>): BatchCard {
  return { proposal_id, target_repo, phases, ...extra };
}

const NOW = '2026-06-11T03:00:00.000Z';
const opts = { concurrency: 4, nowIso: NOW };

describe('buildBatchPlan', () => {
  it('빈 입력 → 빈 그룹', () => {
    expect(buildBatchPlan([], opts).groups).toEqual([]);
    expect(buildBatchPlan(null as unknown as BatchCard[], opts).groups).toEqual([]);
  });

  it('단일 repo의 단일 카드 → 1 그룹, l5_approved + project_path 세팅', () => {
    const plan = buildBatchPlan([card('p1', '/repo/a', [phase('code'), phase('qa')])], opts);
    expect(plan.groups).toHaveLength(1);
    const g = plan.groups[0];
    expect(g.project_path).toBe('/repo/a');
    expect(g.card_ids).toEqual(['p1']);
    expect(g.intent.l5_approved).toBe(true);
    expect(g.intent.project_path).toBe('/repo/a');
    expect(g.intent.created_at).toBe(NOW);
    expect(g.intent.l5_task_id).toBe('tiger:a');
    // phase name은 카드 prefix.
    expect(g.intent.phases.map((p) => p.name)).toEqual(['p1:code', 'p1:qa']);
  });

  it('다중 repo → repo별 별도 intent(별도 project_path)', () => {
    const plan = buildBatchPlan(
      [card('p1', '/repo/a', [phase('x')]), card('p2', '/repo/b', [phase('y')])],
      opts,
    );
    expect(plan.groups.map((g) => g.project_path)).toEqual(['/repo/a', '/repo/b']);
    expect(plan.groups.map((g) => g.card_ids)).toEqual([['p1'], ['p2']]);
  });

  it('같은 repo 다중 카드 → 1 intent로 합치고 phase 이름 충돌 없이 prefix', () => {
    const plan = buildBatchPlan(
      [card('pA', '/repo/a', [phase('code')]), card('pB', '/repo/a', [phase('code')])],
      opts,
    );
    expect(plan.groups).toHaveLength(1);
    const names = plan.groups[0].intent.phases.map((p) => p.name);
    expect(names).toEqual(['pA:code', 'pB:code']);
    expect(plan.groups[0].card_ids).toEqual(['pA', 'pB']);
  });

  it('서로 다른 카드는 독립 레벨(병렬), 카드 내부 순차는 보존', () => {
    // pA: a1 → a2(암묵 순차), pB: b1 단독. planPhaseLevels로 검증.
    const plan = buildBatchPlan(
      [card('pA', '/repo/a', [phase('a1'), phase('a2')]), card('pB', '/repo/a', [phase('b1')])],
      opts,
    );
    const levels = planPhaseLevels(plan.groups[0].intent.phases).map((l) => l.map((p) => p.name));
    // level0: 카드 첫 phase(병렬), level1: a2(a1 의존). b1은 root라 level0.
    expect(levels[0].sort()).toEqual(['pA:a1', 'pB:b1']);
    expect(levels[1]).toEqual(['pA:a2']);
  });

  it('카드 내부 명시적 depends_on은 prefix로 재배선', () => {
    const plan = buildBatchPlan(
      [card('pA', '/repo/a', [phase('build', []), phase('test', ['build'])])],
      opts,
    );
    const phases = plan.groups[0].intent.phases;
    expect(phases[0]).toMatchObject({ name: 'pA:build', depends_on: [] });
    expect(phases[1]).toMatchObject({ name: 'pA:test', depends_on: ['pA:build'] });
  });

  it('repo 간 depends_on_repos → 위상정렬(선행 그룹 먼저)', () => {
    // b가 a에 의존 → a 먼저. 선언 순서는 b,a여도 결과는 a,b.
    const plan = buildBatchPlan(
      [
        card('pB', '/repo/b', [phase('y')], { depends_on_repos: ['/repo/a'] }),
        card('pA', '/repo/a', [phase('x')]),
      ],
      opts,
    );
    expect(plan.groups.map((g) => g.project_path)).toEqual(['/repo/a', '/repo/b']);
    expect(plan.groups[1].depends_on_repos).toEqual(['/repo/a']);
  });

  it('phase 없는 카드는 그룹 미생성(graceful)', () => {
    const plan = buildBatchPlan([card('p1', '/repo/a', [])], opts);
    expect(plan.groups).toEqual([]);
  });

  it('business_id 전파(첫 값)', () => {
    const plan = buildBatchPlan(
      [card('p1', '/repo/a', [phase('x')], { business_id: 'biz-1' })],
      opts,
    );
    expect(plan.groups[0].intent.business_id).toBe('biz-1');
  });

  it('concurrency는 최소 1로 클램프', () => {
    expect(buildBatchPlan([], { concurrency: 0, nowIso: NOW }).concurrency).toBe(1);
    expect(buildBatchPlan([], { concurrency: 8, nowIso: NOW }).concurrency).toBe(8);
  });

  it('순환 depends_on_repos는 데드락 없이 모든 그룹 반환(graceful)', () => {
    const plan = buildBatchPlan(
      [
        card('pA', '/repo/a', [phase('x')], { depends_on_repos: ['/repo/b'] }),
        card('pB', '/repo/b', [phase('y')], { depends_on_repos: ['/repo/a'] }),
      ],
      opts,
    );
    expect(plan.groups.map((g) => g.project_path).sort()).toEqual(['/repo/a', '/repo/b']);
  });
});
