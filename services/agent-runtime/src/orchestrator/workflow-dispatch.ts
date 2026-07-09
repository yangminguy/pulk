// workflow-dispatch.ts — Workflow Orchestrator 진입점.
// ACRIntent를 @l5/core buildWorkflowScript로 Workflow 스크립트(ESM)로 굽고, ~/.l5/workflows/에
// 기록한 뒤 `claude -p`를 1회 spawn해 Claude Code의 Workflow 도구로 그 스크립트를 실행시킨다.
// Native Orchestrator가 phase 실행을 직접 오케스트레이션했다면, 이 경로는 오케스트레이션 자체를
// Claude Code Workflow 런타임에 위임한다(스크립트가 병렬/verify DAG를 담고 있음).
//
// 판단 로직은 @l5/core(cto-native/workflow-script)에 있고, 여기서는 부작용(fs/spawn)만 묶는다.
// 절대 throw하지 않는다 — 실패는 console.warn 후 { ok:false } 반환(CTO 출력 보호).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { ACRIntent } from '@l5/core';
import {
  buildAgentCommand,
  buildWorkflowScript,
} from '@l5/core/dist/functions/cto-native/index.js';

import { runAgentCommand } from './spawn-agent.js';

/** Workflow 스크립트 실행 wall-clock 한계 — 30분(전체 DAG가 한 spawn 안에서 돈다). */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export interface WorkflowDispatchResult {
  /** claude spawn이 exit 0으로 끝났는지. */
  ok: boolean;
  /** claude stdout 전체(Workflow 반환값 JSON이 마지막 출력). */
  output: string;
  /** 기록된 Workflow 스크립트 절대경로. */
  scriptPath: string;
  /** 생성 중 감지된 비치명 경고(depends_on 문제 등). */
  warnings: string[];
}

/** 부작용 주입점(테스트에서 fs/spawn 모킹). 생략 시 실제 구현. */
export interface WorkflowDispatchDeps {
  /** 스크립트 파일 기록. 기본: fs.writeFile(+상위 mkdir). */
  writeScript?: (path: string, content: string) => Promise<void>;
  /** 에이전트 spawn. 기본: runAgentCommand. */
  runAgent?: (
    cmd: ReturnType<typeof buildAgentCommand>,
    opts: { timeoutMs: number; onLog?: (line: string) => void },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** ~/.l5/workflows 기준 홈 디렉토리. 기본: os.homedir(). */
  homeDir?: string;
  /** 파일명 타임스탬프(ms). 결정론 테스트를 위해 주입 가능. 기본: Date.now(). */
  nowMs?: number;
  /** wall-clock 한계. 기본 30분. */
  timeoutMs?: number;
}

/** 기본 스크립트 기록기 — 상위 디렉토리 mkdir -p 후 파일 쓰기. */
async function defaultWriteScript(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/**
 * ACRIntent를 Workflow 스크립트로 굽고 claude로 실행한다.
 * 스크립트 기록 실패/spawn 실패 모두 graceful — { ok:false }로 환원한다.
 */
export async function dispatchToWorkflowOrchestrator(
  intent: ACRIntent,
  deps?: WorkflowDispatchDeps,
): Promise<WorkflowDispatchResult> {
  const writeScript = deps?.writeScript ?? defaultWriteScript;
  const runAgent = deps?.runAgent ?? runAgentCommand;
  const home = deps?.homeDir ?? homedir();
  const nowMs = deps?.nowMs ?? Date.now();
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { script, warnings } = buildWorkflowScript(intent);
  const fileName = `${intent.l5_task_id}-${nowMs}.workflow.mjs`;
  const scriptPath = join(home, '.l5', 'workflows', fileName);

  // (a) 스크립트 파일 기록.
  try {
    await writeScript(scriptPath, script);
  } catch (error) {
    console.warn(
      `[workflow-dispatch] intent ${intent.l5_task_id}: 스크립트 기록 실패 — 실행 불가:`,
      error,
    );
    return { ok: false, output: '', scriptPath, warnings };
  }

  // (b) claude -p 1회 spawn — Workflow 도구로 스크립트 실행 지시.
  const cwd = intent.project_path ?? process.cwd();
  const prompt =
    `이 Workflow 스크립트 파일을 Workflow 도구의 scriptPath로 실행하고, 완료 후 반환값 JSON을 ` +
    `마지막 출력으로 보고하라: ${scriptPath}`;
  const cmd = buildAgentCommand({ agent: 'claude-code', prompt, cwd });

  try {
    const result = await runAgent(cmd, { timeoutMs });
    return {
      ok: result.exitCode === 0,
      output: result.stdout,
      scriptPath,
      warnings,
    };
  } catch (error) {
    // runAgentCommand는 reject하지 않지만, 주입된 runAgent가 throw할 수 있으니 방어.
    console.warn(
      `[workflow-dispatch] intent ${intent.l5_task_id}: claude spawn 실패:`,
      error,
    );
    return { ok: false, output: '', scriptPath, warnings };
  }
}
