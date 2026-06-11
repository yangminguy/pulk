// batch-runner.ts — 호랑이 일괄 승인분(여러 repo) repo별 병렬 실행기. 부작용 전담.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (CTO repo별 병렬 §2~§5).
//
// 순수 판단(그룹핑)은 @l5/core buildBatchPlan에 위임. 여기서는:
//   - 그룹 간 동시성 상한(코어수-2 세마포어)으로 RepoGroup 병렬 디스패치
//   - 각 RepoGroup = 단일 ACRIntent → dispatchToNativeOrchestrator(기존 실행기 재사용, 중복 금지)
//   - 공유 pools를 applyPoolOutcome으로 그룹 간 갱신(소진 에이전트 회피)
//   - depends_on_repos 위상 순서(선행 그룹 merge 완료 후 후행 시작)
//   - 외부 repo는 사전 git 점검 후 동일 worktree 격리 경로(추가 분기 없음)
// graceful: 그룹 1개 실패가 전체를 죽이지 않게 try/catch + held로 보류(사유 회수).

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  applyPoolOutcome,
  type BatchPlan,
  type RepoGroup,
} from '@l5/core/dist/functions/cto-native/index.js';
import type { MainAgent, AgentPoolState } from '@l5/core/dist/functions/cto-native/index.js';
import type { ACRIntent } from '@l5/core';
import {
  dispatchToNativeOrchestrator,
  type NativeOrchestratorDeps,
  type NativeRunSummary,
} from './native-orchestrator.js';

const exec = promisify(execFile);

/** 테스트 주입용 override(부작용 격리). 생략 시 실제 dispatch/git을 쓴다. */
export interface BatchRunnerOverrides {
  /** 단일 intent 실행기. 기본 dispatchToNativeOrchestrator. */
  dispatch?: (intent: ACRIntent, deps?: NativeOrchestratorDeps) => Promise<NativeRunSummary>;
  /** repo가 git work tree인지 사전 점검. 기본 git rev-parse. */
  gitCheck?: (repo: string) => Promise<boolean>;
}

export type GroupStatus = 'completed' | 'partial' | 'held';

export interface GroupRunResult {
  project_path: string;
  card_ids: string[];
  summary: NativeRunSummary;
  status: GroupStatus;
  /** held 사유(git 사전점검 실패/예외). */
  reason?: string;
}

export interface BatchRunResult {
  group_results: GroupRunResult[];
  exhausted_agents: MainAgent[];
}

/** 그룹 시작 전 외부/내부 repo 사전 점검 — git work tree인지. graceful(false면 held). */
async function isGitWorkTree(repo: string): Promise<boolean> {
  try {
    const { stdout } = await exec('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/** NativeRunSummary → 그룹 status. merge 있고 wait 없으면 completed, wait 있으면 partial. */
function summaryToStatus(summary: NativeRunSummary): GroupStatus {
  if (summary.waited) return 'partial';
  return summary.mergedPhases > 0 ? 'completed' : 'partial';
}

/**
 * 호랑이 배치 실행. 그룹 간 동시성 = min(plan.concurrency, max(1, coreCount-2)).
 * 공유 pools를 그룹 종료마다 applyPoolOutcome으로 갱신해 다음 그룹이 소진 에이전트를 피한다.
 * depends_on_repos는 선행 그룹 완료 후 후행 시작(세마포어 안에서 의존 충족분만 디스패치).
 */
export async function runApprovedBatch(
  plan: BatchPlan,
  deps?: NativeOrchestratorDeps,
  overrides?: BatchRunnerOverrides,
): Promise<BatchRunResult> {
  const dispatch = overrides?.dispatch ?? dispatchToNativeOrchestrator;
  const gitCheck = overrides?.gitCheck ?? isGitWorkTree;
  const coreCap = Math.max(1, os.cpus().length - 2);
  const concurrency = Math.max(1, Math.min(plan.concurrency || coreCap, coreCap));
  const nowIso = deps?.nowIso ?? new Date().toISOString();

  // 공유 pools(그룹 간 갱신). 입력 deps.pools가 있으면 복제, 없으면 전 에이전트 available 기본 풀.
  // (빈 배열 []을 native에 넘기면 DEFAULT 폴백이 안 돼 "가용 풀 없음"으로 보류되므로 명시 주입.)
  let pools: AgentPoolState[] = deps?.pools
    ? deps.pools.map((p) => ({ ...p }))
    : [
        { agent: 'claude-code', quotaStatus: 'available' },
        { agent: 'codex', quotaStatus: 'available' },
        { agent: 'antigravity', quotaStatus: 'available' },
      ];
  const exhaustedSet = new Set<MainAgent>();
  const results = new Map<string, GroupRunResult>();
  const completedPaths = new Set<string>();

  const groups = plan.groups;
  const dispatched = new Set<string>();

  // 의존 충족 여부: depends_on_repos가 전부 completedPaths에 있어야 시작 가능.
  const ready = (g: RepoGroup): boolean =>
    g.depends_on_repos.every((dep) => completedPaths.has(dep) || !groups.some((x) => x.project_path === dep));

  async function runGroup(g: RepoGroup): Promise<void> {
    // 사전 git 점검(외부 repo 포함 동일 경로).
    const ok = await gitCheck(g.project_path);
    if (!ok) {
      results.set(g.project_path, {
        project_path: g.project_path,
        card_ids: g.card_ids,
        summary: { waited: false, exhaustedAgents: [], mergedPhases: 0 },
        status: 'held',
        reason: `not a git work tree: ${g.project_path}`,
      });
      return;
    }
    let summary: NativeRunSummary;
    try {
      summary = await dispatch(g.intent, {
        ...deps,
        pools,
        nowIso,
      });
    } catch (err) {
      // dispatchToNativeOrchestrator는 graceful 설계지만 방어적으로.
      results.set(g.project_path, {
        project_path: g.project_path,
        card_ids: g.card_ids,
        summary: { waited: false, exhaustedAgents: [], mergedPhases: 0 },
        status: 'held',
        reason: `dispatch error: ${(err as Error).message}`,
      });
      return;
    }
    // 공유 pools 갱신: 소진 에이전트 반영(다음 그룹 회피용).
    for (const agent of summary.exhaustedAgents) {
      pools = applyPoolOutcome(pools, agent, 'exhausted', nowIso);
      exhaustedSet.add(agent);
    }
    const status = summaryToStatus(summary);
    if (status === 'completed') completedPaths.add(g.project_path);
    results.set(g.project_path, {
      project_path: g.project_path,
      card_ids: g.card_ids,
      summary,
      status,
    });
  }

  // 위상 순서 + 동시성 세마포어 루프. 매 라운드: 의존 충족 + 미디스패치 그룹을 동시성만큼 실행.
  // 진전이 없으면(의존 데드락) 남은 그룹을 강제 실행해 멈춤 방지(buildBatchPlan이 순환을 이미 풀지만 방어).
  while (dispatched.size < groups.length) {
    const runnable = groups.filter((g) => !dispatched.has(g.project_path) && ready(g));
    const batch = (runnable.length > 0
      ? runnable
      : groups.filter((g) => !dispatched.has(g.project_path))
    ).slice(0, concurrency);
    for (const g of batch) dispatched.add(g.project_path);
    await Promise.allSettled(batch.map((g) => runGroup(g)));
  }

  return {
    group_results: groups.map(
      (g) =>
        results.get(g.project_path) ?? {
          project_path: g.project_path,
          card_ids: g.card_ids,
          summary: { waited: false, exhaustedAgents: [], mergedPhases: 0 },
          status: 'held' as GroupStatus,
          reason: 'not executed',
        },
    ),
    exhausted_agents: [...exhaustedSet],
  };
}
