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
  planPhaseLevels,
} from '@l5/core/dist/functions/cto-native/index.js';
import type {
  MainAgent,
  AgentPoolState,
  WaitingTask,
  TaskKind,
  ModelId,
} from '@l5/core/dist/functions/cto-native/index.js';

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

/** phase 실행 시작 시 영속화할 레코드(사업별 모니터 입력). */
export interface PhaseRunRecord {
  business_id?: string;
  l5_task_id: string;
  task_title: string;
  phase_name: string;
  agent: MainAgent;
  runtime: RuntimeType;
  started_at: string;
}

/** phase 실행 종료 시 채울 패치. output은 에이전트 stdout 전체(결과 본문 회수). */
export interface PhaseRunPatch {
  status: 'merged' | 'held' | 'failed' | 'waited';
  agent_final: MainAgent;
  output: string;
  diff_summary?: string;
  changed_files?: number;
  verdict?: string;
  ended_at: string;
}

/**
 * native_phase_runs 영속화 싱크. NocoBase 비의존(테스트 가능) — 데몬/플러그인이 구현 주입.
 * 절대 throw하지 말 것(orchestrator가 graceful하게 console.warn 처리하지만, 싱크도 방어적으로).
 */
export interface PhaseRunSink {
  start(rec: PhaseRunRecord): Promise<string | undefined>;
  finish(id: string | undefined, patch: PhaseRunPatch): Promise<void>;
}

export interface NativeOrchestratorDeps {
  /** 토큰 풀 가용 상태. 생략 시 전 에이전트 available로 간주. */
  pools?: AgentPoolState[];
  /** 결정론을 위한 현재 시각(ISO). 생략 시 new Date()로 폴백. */
  nowIso?: string;
  /** phase 실행 내역 영속화 싱크(사업별 모니터). 생략 시 영속화 안 함. */
  persist?: PhaseRunSink;
}

/** dispatchToNativeOrchestrator 실행 요약(데몬 budget 루프 입력). */
export interface NativeRunSummary {
  /** 토큰 소진/풀 불가용으로 보류(wait)된 phase가 있었는지. */
  waited: boolean;
  /** 소진 신호가 감지된 에이전트(데몬이 applyPoolOutcome로 pools 갱신). */
  exhaustedAgents: MainAgent[];
  /** merge까지 성공한 phase 수. */
  mergedPhases: number;
}

/** 단일 phase 실행 결과(merge 이전). */
interface PhaseVerdict {
  phase: CTOPhase;
  wt?: { path: string; branch: string };
  status: 'pass' | 'fail' | 'waited' | 'wt_error';
  agentFinal: MainAgent;
  output: string;
  diff?: { diffSummary?: string; changedFiles?: number };
  verdictReason?: string;
  runId?: string;
  exhausted: boolean;
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
 * 단일 phase를 worktree에서 실행하고 검증까지 수행한다(merge는 하지 않는다).
 * 병렬 실행 안전을 위해 worktree 작업/커밋까지만 하고, base repo로의 merge는
 * 호출부(dispatch)가 레벨 종료 후 순차로 처리한다(동시 merge 충돌 방지).
 * 절대 throw하지 않는다 — 실패는 console.warn으로 로깅하고 graceful PhaseVerdict 반환.
 */
async function runPhaseToVerdict(
  phase: CTOPhase,
  repo: string,
  intent: ACRIntent,
  pools: AgentPoolState[],
  nowIso: string,
  persist?: PhaseRunSink,
): Promise<PhaseVerdict> {
  const label = `phase "${phase.name}"`;
  const primaryAgent = runtimeToAgent(phase.runtime);

  // (b) worktree 생성.
  let wt: { path: string; branch: string };
  try {
    wt = await createPhaseWorktree(repo, phase.name);
  } catch (error) {
    console.warn(`[native-orchestrator] ${label}: worktree 생성 실패 — 보류:`, error);
    return { phase, status: 'wt_error', agentFinal: primaryAgent, output: '', exhausted: false };
  }

  const cwd = wt.path;
  const prompt = buildPhaseExecutionPrompt(phase, {
    cwd,
    allowedFiles: intent.allowed_files,
  });

  // (c) runtime → MainAgent. model은 phase에 명시 없음 → undefined.
  let agent = primaryAgent;
  let model: ModelId | undefined;

  // (c-2) 실행 전 풀 상태로 인계 판단(pools 배선). phase.runtime 풀이 소진/제한이면
  //   spawn 전에 fallback 에이전트로 갈아탄다.
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
      return { phase, wt, status: 'waited', agentFinal: agent, output: '', exhausted: true };
    }
  }

  // (영속화 시작) — 실패해도 실행은 계속(graceful).
  let runId: string | undefined;
  if (persist) {
    try {
      runId = await persist.start({
        business_id: intent.business_id,
        l5_task_id: intent.l5_task_id,
        task_title: intent.task_title,
        phase_name: phase.name,
        agent,
        runtime: phase.runtime,
        started_at: nowIso,
      });
    } catch (error) {
      console.warn(`[native-orchestrator] ${label}: 영속화 start 실패(무시):`, error);
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
  let exhausted = looksLikeTokenExhaustion(logTail());

  // (e) 토큰 소진/실패면 recovery로 fallback 판단 → handoff면 1회 재시도.
  const failed = result.exitCode !== 0 || exhausted;
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
      exhausted = looksLikeTokenExhaustion(logTail());
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

  // pass면 worktree 변경을 커밋(merge는 dispatch가 레벨 종료 후 순차로).
  if (verdict.verdict === 'pass') {
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
  } else {
    console.warn(
      `[native-orchestrator] ${label}: 검증 ${verdict.verdict}(${verdict.reason}) — 병합 보류.`,
    );
  }

  return {
    phase,
    wt,
    status: verdict.verdict === 'pass' ? 'pass' : 'fail',
    agentFinal: agent,
    output: result.stdout,
    diff,
    verdictReason: verdict.reason,
    runId,
    exhausted,
  };
}

/** 레벨 종료 후 한 phase의 merge + 영속화 finish + worktree 정리(순차 호출). */
async function finalizePhase(
  v: PhaseVerdict,
  repo: string,
  persist?: PhaseRunSink,
): Promise<'merged' | 'held' | 'failed' | 'waited'> {
  const label = `phase "${v.phase.name}"`;
  let status: 'merged' | 'held' | 'failed' | 'waited';

  if (v.status === 'pass' && v.wt) {
    try {
      await mergePhaseWorktree(repo, v.wt.branch);
      console.warn(`[native-orchestrator] ${label}: 검증 통과 — 병합 완료.`);
      status = 'merged';
    } catch (error) {
      console.warn(`[native-orchestrator] ${label}: 병합 실패(충돌 등) — 보류:`, error);
      status = 'held';
    }
  } else if (v.status === 'waited') {
    status = 'waited';
  } else {
    status = v.status === 'fail' ? 'failed' : 'held';
  }

  if (persist) {
    try {
      await persist.finish(v.runId, {
        status,
        agent_final: v.agentFinal,
        output: v.output,
        diff_summary: v.diff?.diffSummary,
        changed_files: v.diff?.changedFiles,
        verdict: v.verdictReason,
        ended_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn(`[native-orchestrator] ${label}: 영속화 finish 실패(무시):`, error);
    }
  }

  // worktree 정리(idempotent) + 남은 branch 정리(best-effort).
  if (v.wt) {
    try {
      await removePhaseWorktree(repo, v.wt.path);
    } catch (error) {
      console.warn(`[native-orchestrator] ${label}: worktree 정리 실패:`, error);
    }
    try {
      await exec('git', ['-C', repo, 'branch', '-D', v.wt.branch], {
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      /* 이미 없음/체크아웃 중 — non-fatal */
    }
  }
  return status;
}

/**
 * ACRIntent를 받아 phase들을 depends_on 위상 레벨로 실행한다.
 *  - 같은 레벨(상호 독립) phase는 worktree 작업까지 병렬(Promise.all).
 *  - 레벨 종료 후 merge는 순차(동시 merge 충돌 방지). 충돌은 graceful 보류.
 * 전부 graceful: 어떤 phase 실패도 throw하지 않고 console.warn 후 다음으로 진행한다.
 * 반환 NativeRunSummary는 데몬 budget 루프 입력.
 */
export async function dispatchToNativeOrchestrator(
  intent: ACRIntent,
  deps?: NativeOrchestratorDeps,
): Promise<NativeRunSummary> {
  const pools = deps?.pools ?? ALL_AVAILABLE;
  const nowIso = deps?.nowIso ?? new Date().toISOString();
  const persist = deps?.persist;
  const summary: NativeRunSummary = { waited: false, exhaustedAgents: [], mergedPhases: 0 };

  // (b) repo 미지정이면 실행 불가 — 경고 후 종료.
  const repo = intent.project_path;
  if (!repo) {
    console.warn(
      `[native-orchestrator] intent ${intent.l5_task_id}: project_path 없음 — 실행 불가.`,
    );
    return summary;
  }

  const exhaustedSet = new Set<MainAgent>();

  for (const level of planPhaseLevels(intent.phases)) {
    // (a) 승인 필요 + 미승인 → 그 phase 보류(레벨에서 제외).
    const runnable = level.filter((phase) => {
      if (phase.l5_approval_required && !intent.l5_approved) {
        console.warn(
          `[native-orchestrator] phase "${phase.name}": L5 승인 대기 — 보류.`,
        );
        return false;
      }
      return true;
    });
    if (runnable.length === 0) continue;

    // 레벨 내 병렬 실행(worktree 작업/검증/커밋까지).
    const verdicts = await Promise.all(
      runnable.map((phase) =>
        runPhaseToVerdict(phase, repo, intent, pools, nowIso, persist),
      ),
    );

    // merge는 순차(동시 merge 충돌 방지).
    for (const v of verdicts) {
      if (v.exhausted) exhaustedSet.add(v.agentFinal);
      if (v.status === 'waited') summary.waited = true;
      const status = await finalizePhase(v, repo, persist);
      if (status === 'merged') summary.mergedPhases += 1;
    }
  }

  summary.exhaustedAgents = [...exhaustedSet];
  return summary;
}
