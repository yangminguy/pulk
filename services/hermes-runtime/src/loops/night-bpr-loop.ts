// Night BPR Loop — 호랑이(Tiger) 분석 엔진 본체.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§3 호랑이 두뇌 / night-bpr-loop 본체).
//
// 수집기(tiger-collector)가 적재한 tiger-candidates.json(=CollectBottlenecksResult)을 입력으로:
//   1. 후보 로드 + 전날 카드 state(knownCardIds) 로드
//   2. prepareCandidates → 새/재발 후보 상위 K개 (없으면 silent skip)
//   3. selectModel(적응형: 어려우면 opus/쉬우면 sonnet) + buildTigerPrompt(JSON-only)
//   4. Claude CLI 실행(claude-cli.ts, MCP off 헤드리스, OpenAI 금지)
//   5. parseTigerOutput → ImprovementCard[] (repo_path/executive는 후보값 override)
//   6. 각 카드: createBPRLog + createWorkflowImprovementProposal + createMemoryEntry
//   7. tiger-cards-<date>.json state 저장(candidate_id↔target_id↔repo_path)
//   8. 텔레그램 요약 1건(dedupKey tiger:<date>)
//
// 위험도 D1: 읽기 + 카드 생성 + 알림. 코드는 한 줄도 바꾸지 않음(승인 게이트 이전).
// never-throw: 어떤 단계 실패해도 죽지 않고 errors 누적 → 다음날 재가동(무인 자율).
//
// 판단 로직(프롬프트/파싱/매핑/모델선택)은 전부 @l5/core tiger. 이 파일은 배선+IO만.

import { promises as fs } from "fs";
import { join } from "path";
import {
  prepareCandidates,
  selectModel,
  buildTigerPrompt,
  parseTigerOutput,
  cardToBPRLog,
  cardToProposal,
  cardToMemoryEntry,
  encodeTargetRef,
  type BottleneckCandidate,
  type CollectBottlenecksResult,
  type ImprovementCard,
  type TigerModel,
} from "@l5/core";
import {
  runClaudeCommand,
  type ClaudeCliCommand,
  type RunClaudeResult,
} from "../api/claude-cli.js";
import {
  createBPRLog,
  createWorkflowImprovementProposal,
  createMemoryEntry,
  fetchAgentTasks,
} from "../api/nocobase-client.js";
import { runTigerCollector } from "../tiger/index.js";
import { createTelegramClient } from "../notifier/telegram.js";
import type { TelegramClient } from "../notifier/telegram.js";
import type { LoopContext, LoopResult } from "./types.js";

const CLAUDE_TIMEOUT_MS = 180_000;

/** night-bpr-loop deps(테스트 주입형). 모든 IO는 여기로 주입해 결정론 단위테스트. */
export interface TigerAnalysisDeps {
  /** 카드 발행 → BPRLog 생성. 반환 id. */
  createBPRLog: (payload: ReturnType<typeof cardToBPRLog> & { source_ref?: string }) => Promise<string>;
  /** 카드 발행 → WorkflowImprovementProposal 생성. 반환 id. */
  createProposal: (
    payload: ReturnType<typeof cardToProposal> & { source_ref?: string },
  ) => Promise<string>;
  /** 카드 발행 사실 → MemoryEntry 생성(학습 폐회로). 반환 id. */
  createMemory: (
    payload: ReturnType<typeof cardToMemoryEntry> & { source_ref?: string },
  ) => Promise<string>;
  /** Claude CLI 실행. 기본은 runClaudeCommand. 테스트는 stub 주입(실제 spawn 금지). */
  runClaude: (cmd: ClaudeCliCommand, timeoutMs: number) => Promise<RunClaudeResult>;
  telegram?: TelegramClient;
  /** state dir override. 기본 HERMES_DIR/.omc/state. */
  stateDir?: string;
  /** 분석 cwd(코드 안 건드림 — 분석 전용). 기본 PULK_ROOT|cwd. */
  cwd?: string;
  /** 결정론용 현재시각. 기본 now. */
  now?: string;
  /** 과거 학습(프롬프트 컨텍스트). 기본 빈 배열. */
  pastLessons?: string[];
}

export interface TigerAnalysisResult {
  run_at: string;
  candidates_loaded: number;
  prepared: number;
  model: TigerModel | null;
  cards_created: number;
  notification_sent: boolean;
  errors: string[];
}

interface CardsSnapshot {
  /** 이미 카드화된 candidate_id(fingerprint) 목록. */
  known_card_ids?: string[];
}

async function loadCandidates(candidatesPath: string): Promise<CollectBottlenecksResult | null> {
  try {
    const raw = await fs.readFile(candidatesPath, "utf-8");
    const parsed = JSON.parse(raw) as CollectBottlenecksResult;
    if (parsed && Array.isArray(parsed.candidates)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function loadKnownCardIds(snapshotPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(snapshotPath, "utf-8");
    const parsed = JSON.parse(raw) as CardsSnapshot;
    return new Set(Array.isArray(parsed.known_card_ids) ? parsed.known_card_ids : []);
  } catch {
    return new Set();
  }
}

function buildClaudeCommand(cwd: string, prompt: string, model: TigerModel): ClaudeCliCommand {
  // @l5/core cto-native buildAgentCommand와 동형(claude-code 규약): claude -p <prompt> --model <m>.
  return {
    cmd: "claude",
    args: ["-p", prompt, "--model", model],
    cwd,
    stdinNull: false,
  };
}

/**
 * 호랑이 분석 본체(deps 주입형). never-throw — 모든 IO try/guard, errors 누적.
 */
export async function runTigerAnalysis(
  deps: TigerAnalysisDeps,
): Promise<TigerAnalysisResult> {
  const runAt = deps.now ?? new Date().toISOString();
  const date = runAt.slice(0, 10);
  const errors: string[] = [];

  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  const stateDir = deps.stateDir ?? join(hermesDir, ".omc", "state");
  const candidatesPath = join(stateDir, "tiger-candidates.json");
  const knownSnapshotPath = join(stateDir, "tiger-known-cards.json");
  const cardsStatePath = join(stateDir, `tiger-cards-${date}.json`);
  const cwd = deps.cwd ?? process.env.PULK_ROOT ?? process.cwd();

  const base: TigerAnalysisResult = {
    run_at: runAt,
    candidates_loaded: 0,
    prepared: 0,
    model: null,
    cards_created: 0,
    notification_sent: false,
    errors,
  };

  // 1. 후보 로드(없으면 graceful skip).
  const collected = await loadCandidates(candidatesPath);
  if (!collected) {
    console.log(`[night-bpr-loop] ${date}: tiger-candidates.json 없음 — skip.`);
    return base;
  }
  const candidates = collected.candidates as BottleneckCandidate[];
  base.candidates_loaded = candidates.length;

  // 2. 전날 카드 known ids 로드 + prepare.
  const knownCardIds = await loadKnownCardIds(knownSnapshotPath);
  const prepared = prepareCandidates(candidates, knownCardIds);
  base.prepared = prepared.length;
  if (prepared.length === 0) {
    console.log(`[night-bpr-loop] ${date}: 새/재발 후보 0건 — 조용히 skip.`);
    return base;
  }

  // 3. 적응형 모델 + 프롬프트.
  const model = selectModel(prepared);
  base.model = model;
  const prompt = buildTigerPrompt(prepared, deps.pastLessons);

  // 4. Claude 실행(never-throw — exitCode로 환원).
  let claudeRes: RunClaudeResult;
  try {
    claudeRes = await deps.runClaude(buildClaudeCommand(cwd, prompt, model), CLAUDE_TIMEOUT_MS);
  } catch (err) {
    errors.push(`claude run failed: ${(err as Error).message}`);
    claudeRes = { exitCode: 1, stdout: "", stderr: (err as Error).message };
  }
  if (claudeRes.exitCode !== 0) {
    errors.push(`claude exit ${claudeRes.exitCode}: ${claudeRes.stderr.slice(0, 200)}`);
    console.log(`[night-bpr-loop] ${date}: claude 실패(exit ${claudeRes.exitCode}) — 카드 0건.`);
    return base;
  }

  // 5. 파싱(repo_path/executive override).
  const { cards, dropped } = parseTigerOutput(claudeRes.stdout, prepared);
  if (dropped > 0) console.log(`[night-bpr-loop] ${date}: ${dropped}건 파싱 drop.`);
  if (cards.length === 0) {
    errors.push("parseTigerOutput produced 0 cards");
    return base;
  }

  // 6. 카드 영속화(각 카드 graceful).
  const persisted: Array<{ card: ImprovementCard; proposal_id: string }> = [];
  for (const card of cards) {
    const sourceRef = encodeTargetRef(card.target_id);
    try {
      await deps.createBPRLog({ ...cardToBPRLog(card), source_ref: sourceRef });
    } catch (err) {
      errors.push(`createBPRLog(${card.candidate_id}): ${(err as Error).message}`);
    }
    let proposalId = "";
    try {
      proposalId = await deps.createProposal({ ...cardToProposal(card), source_ref: sourceRef });
    } catch (err) {
      errors.push(`createProposal(${card.candidate_id}): ${(err as Error).message}`);
      continue; // proposal 없으면 승인 흐름이 못 읽으니 이 카드는 카운트 안 함.
    }
    try {
      await deps.createMemory({ ...cardToMemoryEntry(card), source_ref: sourceRef });
    } catch (err) {
      errors.push(`createMemory(${card.candidate_id}): ${(err as Error).message}`);
    }
    persisted.push({ card, proposal_id: proposalId });
  }
  base.cards_created = persisted.length;

  // 7. state 저장(candidate_id↔target_id↔repo_path + known ids 갱신).
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      cardsStatePath,
      JSON.stringify(
        {
          date,
          generated_at: runAt,
          model,
          cards: persisted.map(({ card, proposal_id }) => ({
            proposal_id,
            candidate_id: card.candidate_id,
            target_id: card.target_id,
            repo_path: card.repo_path,
            executive: card.executive,
            risk_level: card.risk_level,
          })),
        },
        null,
        2,
      ),
      "utf-8",
    );
    // 다음날 dedup용 known ids 누적.
    for (const { card } of persisted) knownCardIds.add(card.candidate_id);
    await fs.writeFile(
      knownSnapshotPath,
      JSON.stringify({ known_card_ids: [...knownCardIds] }, null, 2),
      "utf-8",
    );
  } catch (err) {
    errors.push(`state write failed: ${(err as Error).message}`);
  }

  // 8. 텔레그램 요약 1건.
  if (persisted.length > 0) {
    const tg = deps.telegram ?? createTelegramClient();
    const top = persisted[0].card;
    const tgRes = await tg.send({
      title: `🐯 호랑이 분석: 개선 카드 ${persisted.length}건`,
      body:
        `모델 ${model}. 최우선: [${top.executive}/${top.target_id}] ${top.problem}\n` +
        `🐯 자가개선(/self-improve)에서 체크박스로 일괄 승인하세요.`,
      level: "info",
      dedupKey: `tiger:${date}`,
    });
    base.notification_sent = tgRes.ok;
    if (!tgRes.ok) errors.push(`telegram: ${tgRes.reason}`);
  }

  return base;
}

/**
 * launchd 야간 잡 진입점. 실제 어댑터로 runTigerAnalysis를 호출하고 LoopResult로 환원.
 * 카드 생성=ok, 후보/카드 없음=skipped, 에러 누적=error. never-throw.
 */
export async function runNightBPRLoop(
  context: LoopContext,
): Promise<LoopResult> {
  void context;
  // 무인 자율: 분석 전에 수집기를 먼저 돌려 tiger-candidates.json을 생성한다.
  // (collector가 없으면 candidates 파일이 없어 분석이 항상 skip된다.) graceful.
  try {
    await runTigerCollector({ fetchAgentTasks });
  } catch (cErr) {
    console.log("[night-bpr-loop] collector graceful skip:", (cErr as Error).message);
  }
  let result: TigerAnalysisResult;
  try {
    result = await runTigerAnalysis({
      createBPRLog: (p) => createBPRLog(p),
      createProposal: (p) => createWorkflowImprovementProposal(p),
      createMemory: (p) => createMemoryEntry(p),
      runClaude: (cmd, timeoutMs) =>
        runClaudeCommand(cmd, {
          timeoutMs,
          onLog: (l) => console.log("[tiger]", l),
        }),
    });
  } catch (err) {
    // runTigerAnalysis는 never-throw지만 방어적으로.
    return {
      loop: "night-bpr-loop",
      status: "error",
      summary: `호랑이 분석 예외: ${(err as Error).message}`,
      actions: [],
    };
  }

  const status: LoopResult["status"] =
    result.cards_created > 0 ? "ok" : result.errors.length > 0 ? "error" : "skipped";
  const summary =
    result.cards_created > 0
      ? `개선 카드 ${result.cards_created}건 발행(모델 ${result.model}). 승인 대기.`
      : result.prepared === 0
        ? "새/재발 병목 후보 없음 — skip."
        : `카드 0건(errors ${result.errors.length}).`;

  return {
    loop: "night-bpr-loop",
    status,
    summary,
    actions: result.cards_created > 0 ? ["await-founder-approval"] : [],
  };
}
