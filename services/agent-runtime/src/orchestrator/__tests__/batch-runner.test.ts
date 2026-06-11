// batch-runner 테스트. dispatch/gitCheck를 주입해 부작용(spawn/git) 없이
// 그룹핑 디스패치·동시성·위상 순서·pools 갱신·held 보류를 검증한다.

import { buildBatchPlan, type BatchCard } from '@l5/core/dist/functions/cto-native/index.js';
import type { ACRIntent } from '@l5/core';
import { runApprovedBatch } from '../batch-runner.js';
import type { NativeRunSummary } from '../native-orchestrator.js';

function phase(name: string, depends_on?: string[]) {
  return {
    name,
    runtime: 'claude' as const,
    prompt_packet: name,
    expected_output: 'done',
    risk_level: 'D1' as const,
    release_gate_type: 'none' as const,
    l5_approval_required: false,
    auto_execute: true,
    ...(depends_on !== undefined ? { depends_on } : {}),
  };
}

function card(id: string, repo: string, extra?: Partial<BatchCard>): BatchCard {
  return { proposal_id: id, target_repo: repo, phases: [phase('code')], ...extra };
}

const NOW = '2026-06-11T03:00:00.000Z';
const ok: NativeRunSummary = { waited: false, exhaustedAgents: [], mergedPhases: 1 };
const alwaysGit = async () => true;

describe('runApprovedBatch', () => {
  it('repo별 단일 intent로 dispatch(여러 repo 분리 호출)', async () => {
    const plan = buildBatchPlan([card('p1', '/repo/a'), card('p2', '/repo/b')], {
      concurrency: 4,
      nowIso: NOW,
    });
    const seen: string[] = [];
    const res = await runApprovedBatch(plan, undefined, {
      gitCheck: alwaysGit,
      dispatch: async (intent: ACRIntent) => {
        seen.push(intent.project_path!);
        return ok;
      },
    });
    expect(seen.sort()).toEqual(['/repo/a', '/repo/b']);
    expect(res.group_results).toHaveLength(2);
    expect(res.group_results.every((g) => g.status === 'completed')).toBe(true);
  });

  it('git work tree 아니면 held(사유 회수) + dispatch 호출 안 함', async () => {
    const plan = buildBatchPlan([card('p1', '/not/git')], { concurrency: 2, nowIso: NOW });
    const dispatch = jest.fn(async () => ok);
    const res = await runApprovedBatch(plan, undefined, { gitCheck: async () => false, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(res.group_results[0].status).toBe('held');
    expect(res.group_results[0].reason).toContain('not a git work tree');
  });

  it('소진 에이전트는 exhausted_agents로 회수', async () => {
    const plan = buildBatchPlan([card('p1', '/repo/a')], { concurrency: 2, nowIso: NOW });
    const res = await runApprovedBatch(plan, undefined, {
      gitCheck: alwaysGit,
      dispatch: async () => ({ waited: true, exhaustedAgents: ['codex'], mergedPhases: 0 }),
    });
    expect(res.exhausted_agents).toEqual(['codex']);
    expect(res.group_results[0].status).toBe('partial');
  });

  it('depends_on_repos: 선행 그룹(merge 완료) 이후 후행 그룹 dispatch', async () => {
    const plan = buildBatchPlan(
      [
        card('pB', '/repo/b', { depends_on_repos: ['/repo/a'] }),
        card('pA', '/repo/a'),
      ],
      { concurrency: 4, nowIso: NOW },
    );
    const order: string[] = [];
    await runApprovedBatch(plan, undefined, {
      gitCheck: alwaysGit,
      dispatch: async (intent: ACRIntent) => {
        order.push(intent.project_path!);
        return ok;
      },
    });
    // a가 b보다 먼저(위상 순서 + 의존 충족 후 디스패치).
    expect(order.indexOf('/repo/a')).toBeLessThan(order.indexOf('/repo/b'));
  });

  it('dispatch 예외는 전체를 죽이지 않고 해당 그룹만 held', async () => {
    const plan = buildBatchPlan([card('p1', '/repo/a'), card('p2', '/repo/b')], {
      concurrency: 4,
      nowIso: NOW,
    });
    const res = await runApprovedBatch(plan, undefined, {
      gitCheck: alwaysGit,
      dispatch: async (intent: ACRIntent) => {
        if (intent.project_path === '/repo/a') throw new Error('boom');
        return ok;
      },
    });
    const a = res.group_results.find((g) => g.project_path === '/repo/a')!;
    const b = res.group_results.find((g) => g.project_path === '/repo/b')!;
    expect(a.status).toBe('held');
    expect(a.reason).toContain('dispatch error');
    expect(b.status).toBe('completed');
  });

  it('빈 plan → 빈 결과', async () => {
    const plan = buildBatchPlan([], { concurrency: 2, nowIso: NOW });
    const res = await runApprovedBatch(plan, undefined, { gitCheck: alwaysGit, dispatch: async () => ok });
    expect(res.group_results).toEqual([]);
    expect(res.exhausted_agents).toEqual([]);
  });
});
