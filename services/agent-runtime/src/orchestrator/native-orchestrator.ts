// native-orchestrator.ts — Native Orchestrator 진입점.
// ACR(별도 Next.js 앱)을 대체해, CTO가 phase로 나눈 ACRIntent를 로컬에서 직접 실행한다.
// 흐름(전부 graceful, throw 금지, console.warn 로깅):
//   intent.phases를 의존순(배열순)으로 순회하며 각 phase마다
//     승인게이트 → worktree → buildAgentCommand → runAgentCommand → (실패 시) recovery handoff
//     → verifyCTOPhaseDeterministic → pass면 merge, 아니면 보류 → worktree 정리.
//
// 판단 로직은 @l5/core(cto-native/cto-verification)에 있고, 여기서는 부작용(spawn/git)만 묶는다.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ACRIntent, CTOPhase, RuntimeType } from '@l5/core';
import { verifyCTOPhaseDeterministic } from '@l5/core';
import {
  buildAgentCommand,
  decideRecovery,
} from '@l5/core/dist/functions/cto-native';
import type {
  MainAgent,
  AgentPoolState,
  WaitingTask,
  TaskKind,
  ModelId,
} from '@l5/core/dist/functions/cto-native';

import { runAgentCommand } from './spawn-agent.js';
import {
  createPhaseWorktree,
  mergePhaseWorktree,
  removePhaseWorktree,
} from './worktree.js';
import { buildPhaseExecutionPrompt } from './phase-prompt.js';

const exec = promisify(execFile);

/** 기본 phase wall-clock 한계 — 15분. */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/** 로그 tail로 보관할 최대 길이(verifier 입력). */
const LOG_TAIL_MAX = 8 * 1024;

export interface NativeOrchestratorDeps {
  /** 토큰 풀 가용 상태. 생략 시 전 에이전트 available로 간주. */
  pools?: AgentPoolState[];
  /** 결정론을 위한 현재 시각(ISO). 생략 시 new Date()로 폴백. */
  nowIso?: string;
}

/** phase.runtime → 실행 MainAgent. omc는 실행자가 아니라 claude-code로 매핑. */
function runtimeToAgent(runtime: RuntimeType): MainAgent {
  switch (runtime) {
    case 'codex':
      return 'codex';
    case 'antigravity':
      return 'antigravity';
    case 'claude':
    case 'omc':
    default:
      return 'claude-code';
  }
}

/** MainAgent → recovery 판단용 TaskKind(모델 선택에 쓰이지만 여기선 model 미지정이라 영향 적음). */
function agentToTaskKind(agent: MainAgent): TaskKind {
  switch (agent) {
    case 'codex':
      return 'qa';
    case 'antigravity':
      return 'ui';
    case 'claude-code':
    default:
      return 'implementation';
  }
}

/** 전 에이전트 available 기본 풀. */
const ALL_AVAILABLE: AgentPoolState[] = [
  { agent: 'claude-code', quotaStatus: 'available' },
  { agent: 'codex', quotaStatus: 'available' },
  { agent: 'antigravity', quotaStatus: 'available' },
];

/** 토큰 소진/실패 신호 감지(로그 휴리스틱 + 비정상 종료). */
function looksLikeTokenExhaustion(log: string): boolean {
  return /quota|rate.?limit|exhaust|usage limit|429|insufficient/i.test(log);
}

/** worktree에서 diff stat과 변경 파일 수를 수집(graceful — 실패 시 undefined). */
async function collectDiff(
  worktreePath: string,
): Promise<{ diffSummary?: string; changedFiles?: number }> {
  try {
    // 신규(untracked) 파일은 `git diff HEAD`에 안 잡혀 stat이 빈 문자열이 된다.
    // intent-to-add(`add -N`)로 신규 파일을 diff 대상에 올려 stat에 포함시킨다
    // (내용은 staging하지 않음 — 아래 verdict pass 경로의 `add -A`가 실제 커밋 담당).
    try {
      await exec('git', ['-C', worktreePath, 'add', '-N', '--', '.'], {
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      // intent-to-add 실패는 비치명 — stat이 비어도 changedFiles 카운트로 보강된다.
    }
    const { stdout: stat } = await exec('git', ['-C', worktreePath, 'diff', 'HEAD', '--stat'], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const { stdout: names } = await exec(
      'git',
      ['-C', worktreePath, 'diff', 'HEAD', '--name-only'],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const { stdout: untracked } = await exec(
      'git',
      ['-C', worktreePath, 'ls-files', '--others', '--exclude-standard'],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const tracked = names.split('\n').map((s) => s.trim()).filter(Boolean);
    const others = untracked.split('\n').map((s) => s.trim()).filter(Boolean);
    const changedFiles = new Set([...tracked, ...others]).size;
    return { diffSummary: stat.trim(), changedFiles };
  } catch {
    return {};
  }
}

/**
 * 단일 phase를 worktree에서 실행하고 검증까지 수행한다(부작용 묶음).
 * 절대 throw하지 않는다 — 실패는 console.warn으로 로깅하고 graceful 종료.
 */
async function runPhase(
  phase: CTOPhase,
  repo: string,
  intent: ACRIntent,
  pools: AgentPoolState[],
  nowIso: string,
): Promise<void> {
  const label = `phase "${phase.name}"`;

  // (b) worktree 생성.
  let wt: { path: string; branch: string };
  try {
    wt = await createPhaseWorktree(repo, phase.name);
  } catch (error) {
    console.warn(`[native-orchestrator] ${label}: worktree 생성 실패 — 보류:`, error);
    return;
  }

  try {
    const cwd = wt.path;
    const prompt = buildPhaseExecutionPrompt(phase, {
      cwd,
      allowedFiles: intent.allowed_files,
    });

    // (c) runtime → MainAgent. model은 phase에 명시 없음 → undefined.
    const primaryAgent = runtimeToAgent(phase.runtime);
    let agent = primaryAgent;
    let model: ModelId | undefined;

    // (c-2) 실행 전 풀 상태로 인계 판단(pools 배선). phase.runtime 풀이 소진/제한이면
    //   spawn 전에 fallback 에이전트로 갈아탄다. 실패-후-handoff(e)는 그대로 유지(런타임 실패 대비).
    {
      const preTask: WaitingTask = {
        id: `${intent.l5_task_id}:${phase.name}`,
        taskKind: agentToTaskKind(primaryAgent),
        primaryAgent,
        reason: 'pre-dispatch pool check',
      };
      const preDecision = decideRecovery({ task: preTask, pools, nowIso });
      if (preDecision.action === 'handoff') {
        console.warn(
          `[native-orchestrator] ${label}: ${primaryAgent} 풀 소진 — 실행 전 ${preDecision.agent}로 인계. ${preDecision.reason}`,
        );
        agent = preDecision.agent;
        model = preDecision.model;
      } else if (preDecision.action === 'wait') {
        console.warn(
          `[native-orchestrator] ${label}: 가용 풀 없음 — 보류(${preDecision.reason}).`,
        );
        return;
      }
    }

    const logBuf: string[] = [];
    const onLog = (line: string) => {
      logBuf.push(line);
    };
    const logTail = () => logBuf.join('\n').slice(-LOG_TAIL_MAX);

    // (d) 실행.
    let result = await runAgentCommand(
      buildAgentCommand({ agent, prompt, cwd, model }),
      { timeoutMs: DEFAULT_TIMEOUT_MS, onLog },
    );

    // (e) 토큰 소진/실패면 recovery로 fallback 판단 → handoff면 1회 재시도.
    const failed = result.exitCode !== 0 || looksLikeTokenExhaustion(logTail());
    if (failed) {
      const waiting: WaitingTask = {
        id: `${intent.l5_task_id}:${phase.name}`,
        taskKind: agentToTaskKind(agent),
        primaryAgent: agent,
        reason: `phase failed (exit ${result.exitCode})`,
      };
      const decision = decideRecovery({ task: waiting, pools, nowIso });
      if (decision.action === 'handoff') {
        console.warn(
          `[native-orchestrator] ${label}: ${agent} 실패 — ${decision.agent}로 인계 후 재시도. ${decision.reason}`,
        );
        agent = decision.agent;
        result = await runAgentCommand(
          buildAgentCommand({ agent, prompt, cwd, model: decision.model }),
          { timeoutMs: DEFAULT_TIMEOUT_MS, onLog },
        );
      } else if (decision.action === 'wait') {
        console.warn(
          `[native-orchestrator] ${label}: 가용 풀 없음 — 보류(${decision.reason}).`,
        );
      }
    }

    // (f) 검증.
    const diff = await collectDiff(cwd);
    const verdict = verifyCTOPhaseDeterministic({
      task_title: phase.name,
      expected_output: phase.expected_output,
      exit_code: result.exitCode,
      log_tail: logTail(),
      diff_summary: diff.diffSummary,
      changed_files: diff.changedFiles,
    });

    if (verdict.verdict === 'pass') {
      // worktree의 변경을 커밋해야 base에서 병합 가능.
      try {
        await exec('git', ['-C', cwd, 'add', '-A'], { maxBuffer: 16 * 1024 * 1024 });
        await exec(
          'git',
          ['-C', cwd, 'commit', '--no-verify', '-m', `l5 phase: ${phase.name}`],
          { maxBuffer: 16 * 1024 * 1024 },
        );
      } catch {
        // 변경 없음(nothing to commit) 등 — 병합 시도는 그대로 진행.
      }
      try {
        await mergePhaseWorktree(repo, wt.branch);
        console.warn(`[native-orchestrator] ${label}: 검증 통과 — 병합 완료.`);
      } catch (error) {
        console.warn(`[native-orchestrator] ${label}: 병합 실패 — 보류:`, error);
      }
    } else {
      console.warn(
        `[native-orchestrator] ${label}: 검증 ${verdict.verdict}(${verdict.reason}) — 병합 보류.`,
      );
    }
  } finally {
    // 끝에 worktree 정리(idempotent).
    try {
      await removePhaseWorktree(repo, wt.path);
    } catch (error) {
      console.warn(`[native-orchestrator] ${label}: worktree 정리 실패:`, error);
    }
    // 병합 후 남은 phase 브랜치 정리(best-effort).
    try {
      await exec('git', ['-C', repo, 'branch', '-D', wt.branch], {
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      /* 이미 없음/체크아웃 중 — non-fatal */
    }
  }
}

/**
 * ACRIntent를 받아 phase들을 의존순(배열순)으로 로컬 실행한다.
 * 전부 graceful: 어떤 phase 실패도 throw하지 않고 console.warn 후 다음으로 진행한다.
 */
export async function dispatchToNativeOrchestrator(
  intent: ACRIntent,
  deps?: NativeOrchestratorDeps,
): Promise<void> {
  const pools = deps?.pools ?? ALL_AVAILABLE;
  const nowIso = deps?.nowIso ?? new Date().toISOString();

  // (b) repo 미지정이면 실행 불가 — 경고 후 종료.
  const repo = intent.project_path;
  if (!repo) {
    console.warn(
      `[native-orchestrator] intent ${intent.l5_task_id}: project_path 없음 — 실행 불가.`,
    );
    return;
  }

  for (const phase of intent.phases) {
    // (a) 승인 필요 + 미승인 → 그 phase 보류(다음으로).
    if (phase.l5_approval_required && !intent.l5_approved) {
      console.warn(
        `[native-orchestrator] phase "${phase.name}": L5 승인 대기 — 보류(다음 phase로).`,
      );
      continue;
    }
    await runPhase(phase, repo, intent, pools, nowIso);
  }
}
