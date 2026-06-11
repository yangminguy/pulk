// native-orchestrator 스케줄러 테스트. worktree/spawn/verify는 mock, planPhaseLevels·
// decideRecovery는 실제(@l5/core/dist) — 레벨 순서·순차 merge·영속화·요약을 검증한다.

import type { ACRIntent, CTOPhase } from '@l5/core';
import {
  dispatchToNativeOrchestrator,
  type PhaseRunSink,
} from '../native-orchestrator.js';
import * as worktree from '../worktree.js';
import * as spawn from '../spawn-agent.js';

jest.mock('../worktree.js', () => ({
  createPhaseWorktree: jest.fn(async (_repo: string, phaseId: string) => ({
    path: `/fake/wt-${phaseId}`,
    branch: `l5/phase-${phaseId}`,
  })),
  mergePhaseWorktree: jest.fn(async () => {}),
  removePhaseWorktree: jest.fn(async () => {}),
}));

jest.mock('../spawn-agent.js', () => ({
  runAgentCommand: jest.fn(async () => ({ exitCode: 0, stdout: 'FULL REPORT BODY', stderr: '' })),
  runShellCommand: jest.fn(async () => ({ exitCode: 0, outputTail: '' })),
}));

jest.mock('@l5/core', () => ({
  verifyCTOPhaseDeterministic: jest.fn(() => ({ verdict: 'pass', reason: 'ok' })),
}));

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
    ...(depends_on ? { depends_on } : {}),
  };
}

function intent(phases: CTOPhase[], over: Partial<ACRIntent> = {}): ACRIntent {
  return {
    l5_task_id: 't1',
    task_title: 'T',
    phases,
    created_at: '2026-06-10T09:00:00.000Z',
    project_path: '/fake/repo',
    l5_approved: true,
    business_id: 'biz9',
    ...over,
  };
}

const NOW = '2026-06-10T09:00:00.000Z';

beforeEach(() => jest.clearAllMocks());

describe('dispatchToNativeOrchestrator', () => {
  it('project_path 없으면 graceful 종료(요약 빈 값)', async () => {
    const s = await dispatchToNativeOrchestrator(intent([phase('A')], { project_path: undefined }), {
      nowIso: NOW,
    });
    expect(s.mergedPhases).toBe(0);
    expect(spawn.runAgentCommand).not.toHaveBeenCalled();
  });

  it('병렬 두 phase는 공통 선행 후 실행, merge는 phase마다 호출', async () => {
    const phases = [phase('root'), phase('A', ['root']), phase('B', ['root'])];
    const s = await dispatchToNativeOrchestrator(intent(phases), { nowIso: NOW });

    // 세 phase 모두 실행.
    expect(spawn.runAgentCommand).toHaveBeenCalledTimes(3);
    // level 순서: root가 먼저 worktree 생성(level0 종료 후 level1).
    const order = (worktree.createPhaseWorktree as jest.Mock).mock.calls.map((c) => c[1]);
    expect(order[0]).toBe('root');
    expect(order.slice(1).sort()).toEqual(['A', 'B']);
    // 모두 pass → merge 3회, 요약 mergedPhases=3.
    expect(worktree.mergePhaseWorktree).toHaveBeenCalledTimes(3);
    expect(s.mergedPhases).toBe(3);
    expect(s.waited).toBe(false);
  });

  it('영속화 싱크 start/finish 호출 + business_id·output 본문 전달', async () => {
    const starts: any[] = [];
    const finishes: any[] = [];
    const sink: PhaseRunSink = {
      start: jest.fn(async (rec) => { starts.push(rec); return `run-${rec.phase_name}`; }),
      finish: jest.fn(async (id, patch) => { finishes.push({ id, patch }); }),
    };
    await dispatchToNativeOrchestrator(intent([phase('A')]), { nowIso: NOW, persist: sink });

    expect(starts).toHaveLength(1);
    expect(starts[0].business_id).toBe('biz9');
    expect(starts[0].phase_name).toBe('A');
    expect(finishes).toHaveLength(1);
    expect(finishes[0].id).toBe('run-A');
    expect(finishes[0].patch.status).toBe('merged');
    expect(finishes[0].patch.output).toBe('FULL REPORT BODY'); // 결과 본문 회수
  });

  it('verify_command 실패면 merge 안 함(실제 빌드/테스트 게이트)', async () => {
    (spawn.runShellCommand as jest.Mock).mockResolvedValueOnce({ exitCode: 1, outputTail: 'tsc error' });
    const p = { ...phase('A'), verify_command: 'corepack pnpm exec tsc --noEmit' };
    const s = await dispatchToNativeOrchestrator(intent([p]), { nowIso: NOW });
    expect(spawn.runShellCommand).toHaveBeenCalledWith(
      'corepack pnpm exec tsc --noEmit', expect.any(String), expect.any(Number),
    );
    expect(worktree.mergePhaseWorktree).not.toHaveBeenCalled();
    expect(s.mergedPhases).toBe(0);
  });

  it('verify_command 통과면 정상 merge', async () => {
    (spawn.runShellCommand as jest.Mock).mockResolvedValueOnce({ exitCode: 0, outputTail: '' });
    const p = { ...phase('A'), verify_command: 'corepack pnpm exec jest' };
    const s = await dispatchToNativeOrchestrator(intent([p]), { nowIso: NOW });
    expect(worktree.mergePhaseWorktree).toHaveBeenCalledTimes(1);
    expect(s.mergedPhases).toBe(1);
  });

  it('승인 미충족 phase는 보류(실행/merge 안 함)', async () => {
    const gated = { ...phase('A'), l5_approval_required: true };
    await dispatchToNativeOrchestrator(intent([gated], { l5_approved: false }), { nowIso: NOW });
    expect(spawn.runAgentCommand).not.toHaveBeenCalled();
    expect(worktree.mergePhaseWorktree).not.toHaveBeenCalled();
  });
});
