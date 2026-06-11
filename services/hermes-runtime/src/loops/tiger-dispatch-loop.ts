// tiger-dispatch-loop — 호랑이 일괄 승인분 → repo별 병렬 CTO 실행 + 학습축적.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (CTO repo별 병렬 §6 배선 / 학습 폐회로).
//
// 흐름(전부 graceful, never-throw):
//   1. 승인분 proposal 조회(deps.fetchApproved) — status=approved + self_mod 전송분
//   2. proposalsToBatchCards(source_ref→target_id→resolveRepoAbsPath) → BatchCard[]
//   3. buildBatchPlan(repo별 그룹핑) → runApprovedBatch(repo별 병렬 → merge → verify 게이트)
//   4. 그룹 결과 → 카드별 CardRunResult 집계 → buildBatchLearning
//   5. memories(createMemoryEntry) + proposal status 패치 영속화 + 텔레그램 요약
//
// 디스패치(코딩 시작)는 "승인 후"에만 일어난다(승인 전 코딩 금지 게이트 보존 — fetchApproved가
// 승인분만 반환). 판단 로직(매핑/그룹핑/학습)은 전부 @l5/core. 이 파일은 배선+IO만.

import {
  proposalsToBatchCards,
  buildBatchPlan,
  buildBatchLearning,
  cardResultToMemoryEntry,
  cardResultToProposalPatch,
  type ApprovedProposalInput,
  type CardPhaseBuilder,
  type CardRunResult,
  type CardPhaseOutcome,
  type BatchPlan,
  type RepoGroup,
  type TigerExecutiveRole,
} from "@l5/core";
import type { CTOPhase } from "@l5/core";
import { createMemoryEntry } from "../api/nocobase-client.js";
import { createTelegramClient } from "../notifier/telegram.js";
import type { TelegramClient } from "../notifier/telegram.js";
import type { LoopContext, LoopResult } from "./types.js";

/** runApprovedBatch 반환(부분 구조만 소비 — agent-runtime 비의존 테스트). */
export interface BatchRunResultShape {
  group_results: Array<{
    project_path: string;
    card_ids: string[];
    status: "completed" | "partial" | "held";
    reason?: string;
  }>;
  exhausted_agents: string[];
}

/** dispatch deps(테스트 주입형). 모든 IO/실행기는 여기로 주입 → 결정론 단위테스트. */
export interface TigerDispatchDeps {
  /** 승인 + 자가수정 전송분 proposal 조회. executive/target_id 동반(결과 회수용). */
  fetchApproved: () => Promise<
    Array<ApprovedProposalInput & { executive: TigerExecutiveRole; target_id: string }>
  >;
  /** 카드별 CTO phase 빌더. 기본 defaultCardPhaseBuilder. */
  buildPhases?: CardPhaseBuilder;
  /** repo별 병렬 실행기(agent-runtime runApprovedBatch). */
  runBatch: (plan: BatchPlan) => Promise<BatchRunResultShape>;
  /** MemoryEntry 적재. 기본 createMemoryEntry. */
  createMemory?: (payload: ReturnType<typeof cardResultToMemoryEntry>) => Promise<string>;
  /** proposal status 패치. 기본 no-op(NocoBase 헬퍼 부재 — 회수부가 별도 배선). */
  patchProposal?: (patch: ReturnType<typeof cardResultToProposalPatch>) => Promise<void>;
  pulkRoot?: string;
  telegram?: TelegramClient;
  now?: string;
  concurrency?: number;
}

export interface TigerDispatchResult {
  run_at: string;
  approved_loaded: number;
  cards_built: number;
  skipped: number;
  groups: number;
  merged: number;
  held: number;
  failed: number;
  waited: number;
  memories_written: number;
  errors: string[];
}

/**
 * 기본 카드 phase 빌더: 코딩 phase(claude) + QA phase(codex, 직전 의존).
 * verify_command는 repo 타입에 무관한 보수적 기본(typecheck). CTO Brain이 더 정교하게 채우면 교체.
 */
export const defaultCardPhaseBuilder: CardPhaseBuilder = ({ proposal_id }) => {
  const code: CTOPhase = {
    name: "code",
    runtime: "claude",
    prompt_packet: `[호랑이 자가개선] proposal ${proposal_id}의 개선안을 구현한다.`,
    expected_output: "수정된 코드 + 통과하는 검증",
    risk_level: "D1",
    release_gate_type: "none",
    l5_approval_required: false,
    auto_execute: true,
    depends_on: [],
    verify_command: "npx tsc --noEmit",
  };
  const qa: CTOPhase = {
    name: "qa",
    runtime: "codex",
    prompt_packet: `[호랑이 자가개선] proposal ${proposal_id} 변경의 QA를 수행한다.`,
    expected_output: "QA 통과",
    risk_level: "D1",
    release_gate_type: "none",
    l5_approval_required: false,
    auto_execute: true,
    depends_on: ["code"],
  };
  return [code, qa];
};

/** 그룹 status → 그룹 내 카드 종착(집계). completed=merged, partial=waited, held=held. */
function groupStatusToOutcome(status: "completed" | "partial" | "held"): CardPhaseOutcome {
  if (status === "completed") return "merged";
  if (status === "held") return "held";
  return "waited";
}

/**
 * 호랑이 디스패치 본체(deps 주입형). never-throw — 모든 IO try/guard, errors 누적.
 */
export async function runTigerDispatch(deps: TigerDispatchDeps): Promise<TigerDispatchResult> {
  const runAt = deps.now ?? new Date().toISOString();
  const errors: string[] = [];
  const pulkRoot = deps.pulkRoot ?? process.env.PULK_ROOT ?? process.cwd();
  const buildPhases = deps.buildPhases ?? defaultCardPhaseBuilder;
  const persistMemory = deps.createMemory ?? ((p) => createMemoryEntry(p));

  const base: TigerDispatchResult = {
    run_at: runAt,
    approved_loaded: 0,
    cards_built: 0,
    skipped: 0,
    groups: 0,
    merged: 0,
    held: 0,
    failed: 0,
    waited: 0,
    memories_written: 0,
    errors,
  };

  // 1. 승인분 조회.
  let approved: Array<ApprovedProposalInput & { executive: TigerExecutiveRole; target_id: string }>;
  try {
    approved = await deps.fetchApproved();
  } catch (err) {
    errors.push(`fetchApproved: ${(err as Error).message}`);
    return base;
  }
  base.approved_loaded = approved.length;
  if (approved.length === 0) return base;

  // 2. 카드 빌드(skipped는 사유 회수).
  const { cards, skipped } = proposalsToBatchCards(approved, buildPhases, pulkRoot);
  base.cards_built = cards.length;
  base.skipped = skipped.length;
  if (cards.length === 0) {
    if (skipped.length > 0) errors.push(`all ${skipped.length} proposals skipped`);
    return base;
  }

  // proposal_id → {executive,target_id} 역참조(결과 회수에 필요).
  const meta = new Map<string, { executive: TigerExecutiveRole; target_id: string }>();
  for (const a of approved) meta.set(a.proposal_id, { executive: a.executive, target_id: a.target_id });

  // 3. 그룹핑 + repo별 병렬 실행.
  const plan = buildBatchPlan(cards, { concurrency: deps.concurrency ?? 4, nowIso: runAt });
  base.groups = plan.groups.length;
  let runRes: BatchRunResultShape;
  try {
    runRes = await deps.runBatch(plan);
  } catch (err) {
    errors.push(`runBatch: ${(err as Error).message}`);
    return base;
  }

  // 4. 그룹 결과 → 카드별 CardRunResult.
  const cardResults: CardRunResult[] = [];
  const byPath = new Map<string, RepoGroup>();
  for (const g of plan.groups) byPath.set(g.project_path, g);
  for (const gr of runRes.group_results) {
    const outcome = groupStatusToOutcome(gr.status);
    for (const cid of gr.card_ids) {
      const m = meta.get(cid) ?? { executive: "CTO" as TigerExecutiveRole, target_id: "" };
      cardResults.push({
        proposal_id: cid,
        target_id: m.target_id,
        executive: m.executive,
        outcome,
        reason: gr.reason,
      });
    }
  }

  // 5. 학습축적(memory + proposal 패치) + 카운트.
  const learning = buildBatchLearning(cardResults);
  base.merged = learning.summary.merged;
  base.held = learning.summary.held;
  base.failed = learning.summary.failed;
  base.waited = learning.summary.waited;

  for (const mem of learning.memories) {
    try {
      await persistMemory(mem);
      base.memories_written += 1;
    } catch (err) {
      errors.push(`createMemory: ${(err as Error).message}`);
    }
  }
  if (deps.patchProposal) {
    for (const patch of learning.patches) {
      try {
        await deps.patchProposal(patch);
      } catch (err) {
        errors.push(`patchProposal(${patch.proposal_id}): ${(err as Error).message}`);
      }
    }
  }

  // 6. 텔레그램 요약 1건.
  const tg = deps.telegram ?? createTelegramClient();
  const date = runAt.slice(0, 10);
  await tg.send({
    title: `🐯 호랑이 실행 결과: merge ${learning.summary.merged} / 보류 ${learning.summary.held + learning.summary.waited} / 실패 ${learning.summary.failed}`,
    body: `${plan.groups.length}개 repo 병렬 실행 완료. 학습 ${base.memories_written}건 축적.`,
    level: learning.summary.failed > 0 ? "warn" : "info",
    dedupKey: `tiger-dispatch:${date}`,
  });

  return base;
}

/**
 * launchd/dispatcher 진입점. 실제 어댑터로 runTigerDispatch를 호출하고 LoopResult로 환원.
 * runBatch(agent-runtime runApprovedBatch)와 fetchApproved는 Live 래퍼(runner.ts)가 주입한다.
 * never-throw.
 */
export async function runTigerDispatchLoop(
  context: LoopContext,
  deps: TigerDispatchDeps,
): Promise<LoopResult> {
  void context;
  let result: TigerDispatchResult;
  try {
    result = await runTigerDispatch(deps);
  } catch (err) {
    return {
      loop: "tiger-dispatch",
      status: "error",
      summary: `호랑이 디스패치 예외: ${(err as Error).message}`,
      actions: [],
    };
  }
  const ran = result.merged + result.held + result.failed + result.waited;
  const status: LoopResult["status"] =
    ran > 0 ? "ok" : result.errors.length > 0 ? "error" : "skipped";
  const summary =
    ran > 0
      ? `repo ${result.groups}개 실행: merge ${result.merged}, 보류 ${result.held + result.waited}, 실패 ${result.failed}. 학습 ${result.memories_written}건.`
      : result.approved_loaded === 0
        ? "승인 대기 카드 없음 — skip."
        : `실행 0건(errors ${result.errors.length}).`;
  return {
    loop: "tiger-dispatch",
    status,
    summary,
    actions: result.held + result.waited > 0 ? ["retry-next-night"] : [],
  };
}
