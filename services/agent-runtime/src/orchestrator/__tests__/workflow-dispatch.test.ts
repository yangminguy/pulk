// workflow-dispatch 테스트. buildWorkflowScript는 실제(@l5/core/dist), fs/spawn은 주입 모킹.
// 스크립트 파일이 기록되는지, claude spawn 인자, 실패 graceful을 검증한다.

import type { ACRIntent, CTOPhase } from '@l5/core';
import {
  dispatchToWorkflowOrchestrator,
  type WorkflowDispatchDeps,
} from '../workflow-dispatch.js';

function phase(name: string, over: Partial<CTOPhase> = {}): CTOPhase {
  return {
    name,
    runtime: 'claude',
    prompt_packet: `implement ${name}`,
    expected_output: `${name} done`,
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    ...over,
  };
}

function intent(over: Partial<ACRIntent> = {}): ACRIntent {
  return {
    l5_task_id: 'task42',
    task_title: 'Sample Task',
    phases: [phase('A'), phase('B', { depends_on: ['A'] })],
    created_at: '2026-07-09T00:00:00.000Z',
    project_path: '/abs/repo',
    l5_approved: true,
    ...over,
  };
}

describe('dispatchToWorkflowOrchestrator', () => {
  it('스크립트 파일을 ~/.l5/workflows에 기록하고 그 경로를 반환', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const deps: WorkflowDispatchDeps = {
      writeScript: async (path, content) => {
        writes.push({ path, content });
      },
      runAgent: async () => ({ exitCode: 0, stdout: '{"phases":{}}', stderr: '' }),
      homeDir: '/home/tester',
      nowMs: 1700000000000,
    };
    const res = await dispatchToWorkflowOrchestrator(intent(), deps);
    expect(res.ok).toBe(true);
    expect(res.scriptPath).toBe('/home/tester/.l5/workflows/task42-1700000000000.workflow.mjs');
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(res.scriptPath);
    // 기록된 내용이 실제 Workflow 스크립트(meta 리터럴로 시작).
    expect(writes[0].content.startsWith('export const meta = {')).toBe(true);
    expect(res.output).toBe('{"phases":{}}');
  });

  it('claude spawn 인자 — cmd/cwd/prompt에 스크립트 절대경로 포함', async () => {
    let captured: { cmd: string; args: string[]; cwd: string } | undefined;
    const deps: WorkflowDispatchDeps = {
      writeScript: async () => {},
      runAgent: async (cmd) => {
        captured = { cmd: cmd.cmd, args: cmd.args, cwd: cmd.cwd };
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      },
      homeDir: '/home/tester',
      nowMs: 42,
    };
    await dispatchToWorkflowOrchestrator(intent({ project_path: '/work/repo' }), deps);
    expect(captured?.cmd).toBe('claude');
    expect(captured?.cwd).toBe('/work/repo');
    // 프롬프트(마지막 arg)에 스크립트 절대경로가 실려야 함.
    const prompt = captured?.args.join(' ') ?? '';
    expect(prompt).toContain('/home/tester/.l5/workflows/task42-42.workflow.mjs');
    expect(prompt).toContain('Workflow 도구');
  });

  it('스크립트 기록 실패 시 graceful — ok:false, spawn 미호출', async () => {
    let spawned = false;
    const deps: WorkflowDispatchDeps = {
      writeScript: async () => {
        throw new Error('disk full');
      },
      runAgent: async () => {
        spawned = true;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
      homeDir: '/home/tester',
      nowMs: 1,
    };
    const res = await dispatchToWorkflowOrchestrator(intent(), deps);
    expect(res.ok).toBe(false);
    expect(spawned).toBe(false);
    expect(res.output).toBe('');
  });

  it('spawn이 non-zero exit면 ok:false지만 output은 회수', async () => {
    const deps: WorkflowDispatchDeps = {
      writeScript: async () => {},
      runAgent: async () => ({ exitCode: 1, stdout: 'partial', stderr: 'boom' }),
      homeDir: '/home/tester',
      nowMs: 1,
    };
    const res = await dispatchToWorkflowOrchestrator(intent(), deps);
    expect(res.ok).toBe(false);
    expect(res.output).toBe('partial');
  });
});
