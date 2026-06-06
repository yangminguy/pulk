// CTO Agent
// Owns technical execution proposals, tooling decisions, and Agent Control Tower operations.
//
// The CTO classifies every task into one of six TaskClass values
// (SMALL_FIX/FEATURE/BIG_CHANGE/OPS/RESEARCH/REFACTOR) and then enforces the
// corresponding phase set. Classification is the CTO's sole responsibility —
// neither the CEO nor the decomposer participates.
//
// Phase decomposition is driven by `dev-workflow-spec` in @l5/core. The LLM is
// forced into the SOP via `buildDevWorkflowSystemPrompt` and its output is
// gated by `validateDevWorkflowPhases`. A single retry is attempted on
// validation failure; if both attempts fail (or the LLM is unavailable) the
// deterministic SOP templates are used so downstream ACR always receives
// well-formed phases.

import type { AgentInput, AgentOutput } from "./types.js";
import type {
  ACRIntent,
  CTOPhase,
  ReleaseGateType,
  LLMClient,
  DevPhaseKind,
  DevWorkflowPhaseLike,
  TaskClass,
  ModelTier,
  RuntimeType,
  QuotaState,
} from "@l5/core";
import {
  buildDevWorkflowSystemPrompt,
  validateDevWorkflowPhases,
  buildDeterministicDevPhases,
  classifyTask,
  createDefaultLLMClient,
  resolveModel,
  applyHarnessMetadata,
  taskClassToComplexity,
  complexityToMode,
  DEFAULT_BLOCKED,
  planTeamRun,
} from "@l5/core";
import type {
  Complexity,
  HarnessRiskLevel,
  WorkPackageDomain,
  TeamFeatureInput,
  PlannedExecutionRun,
} from "@l5/core";
import { createExecutionRun } from "./acr-execution-client.js";
import { readFileSync } from "node:fs";

export type CTOAgentInput = AgentInput;

export interface CTOAgentOutput extends AgentOutput {
  acr_intent: ACRIntent;
  clarifying_questions?: string[];
}

/** Subset of dev-workflow phase fields the LLM must additionally provide
 * so the runtime can hand the phase off to ACR.
 */
interface LLMDevPhase extends DevWorkflowPhaseLike {
  prompt_packet?: string;
  expected_output?: string;
  risk_level?: CTOPhase["risk_level"];
}

interface LLMDevWorkflowResponse {
  task_class?: string;
  clarifying_questions?: string[];
  phases?: LLMDevPhase[];
}

/** Allow tests to inject a fake LLM. Defaults to the role-based factory. */
export interface CTOAgentDeps {
  llm?: LLMClient | null;
}

function gateFromRisk(risk: CTOPhase["risk_level"]): {
  release_gate_type: ReleaseGateType;
  l5_approval_required: boolean;
  auto_execute: boolean;
} {
  if (risk === "D1" || risk === "D2") {
    return { release_gate_type: "none", l5_approval_required: false, auto_execute: true };
  }
  if (risk === "D3") {
    return { release_gate_type: "auto_24h", l5_approval_required: false, auto_execute: false };
  }
  return { release_gate_type: "manual_founder", l5_approval_required: true, auto_execute: false };
}

function resolveProjectPath(task: CTOAgentInput["task"]): string | undefined {
  const meta = task as unknown as { project_path?: string; cwd?: string } | undefined;
  return (
    meta?.project_path ?? meta?.cwd ?? process.env["L5_DEFAULT_PROJECT_PATH"] ?? undefined
  );
}

/** M9.3 — 모델 tier → CLI(runtime) 배정. 모든 phase가 claude/codex/agy 셋에 분산된다. */
function tierToRuntime(tier: ModelTier): RuntimeType {
  switch (tier) {
    case "T1":
      return "claude"; // 최상위 추론(opus급)
    case "T2":
      return "codex"; // 균형 구현(gpt-4o급)
    case "T3":
      return "antigravity"; // 경량/기계적(agy)
    default:
      return "claude";
  }
}

/** Map a SOP-validated phase (LLM or template) into a downstream CTOPhase. */
function toCTOPhase(
  p: LLMDevPhase,
  taskTitle: string,
  taskClass: TaskClass = "FEATURE",
  quotaState?: QuotaState,
): CTOPhase {
  // Default to 'spec' only as a last resort — new phase kinds pass through as-is
  // because DevPhaseKind now covers all class-specific kinds.
  const kind = (p.kind ?? "spec") as DevPhaseKind;
  // M9.3 — 모델 tier가 CLI를 결정한다(시스템 정책, LLM이 아님). T1(추론)=claude(opus급),
  // T2(균형 구현)=codex(gpt-4o급), T3(경량/기계적)=antigravity(agy). 이렇게 해야 창업자가
  // 지시한 "에이전트별 모델 배정"대로 phase가 claude/codex/agy 셋에 분산된다.
  // B5 — 쿼터 인지: resolveModel이 소진된 tier를 건너뛰어 죽은 에이전트로의
  // 디스패치를 막는다(quotaState 미주입 시 전 tier 가용 = 기존 동작과 동일).
  const resolved = resolveModel(taskClass, kind, quotaState);
  const runtime = tierToRuntime(resolved.tier);
  const riskLevel: CTOPhase["risk_level"] = p.risk_level ?? (p.read_only ? "D1" : "D2");
  const promptPacket =
    p.prompt_packet ??
    [
      `[${kind}] ${p.name ?? kind} — task: ${taskTitle}`,
      "acceptance:",
      ...(Array.isArray(p.acceptance_criteria)
        ? (p.acceptance_criteria as string[]).map((c) => `- ${c}`)
        : []),
      `verifier_hint: ${typeof p.verifier_hint === "string" ? p.verifier_hint : ""}`,
    ].join("\n");
  const expectedOutput =
    p.expected_output ??
    (Array.isArray(p.acceptance_criteria)
      ? (p.acceptance_criteria as string[]).join("; ")
      : "");

  // T1 (top-tier reasoning, e.g. architecture/spec/research) phases are pinned to
  // their big model: ACR must wait for that agent to recover rather than downgrade.
  // Based on the RESOLVED tier — if quota already forced a fallback off T1, we
  // accept the lower tier rather than telling ACR to wait.
  const modelLocked = resolved.tier === "T1";

  return {
    name: p.name ?? kind,
    runtime,
    prompt_packet: promptPacket,
    expected_output: expectedOutput,
    risk_level: riskLevel,
    ...gateFromRisk(riskLevel),
    model_locked: modelLocked,
  };
}

/**
 * Load ACR's quota-tracker.json (path from ACR_QUOTA_TRACKER_PATH) so model
 * routing can skip exhausted tiers. Returns undefined when unset/missing/invalid
 * — that means "all tiers available", i.e. identical to the pre-B5 behavior.
 */
function loadQuotaState(): QuotaState | undefined {
  const path = process.env.ACR_QUOTA_TRACKER_PATH;
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as QuotaState;
  } catch {
    return undefined;
  }
}

function buildDeterministicIntent(
  task: CTOAgentInput["task"],
  taskClass: TaskClass = "FEATURE",
  quotaState?: QuotaState,
): ACRIntent {
  const taskId = task?.id ?? "unknown";
  const taskTitle = task?.title ?? "Unknown Task";
  const devPhases = buildDeterministicDevPhases(taskTitle, taskClass);
  const phases: CTOPhase[] = devPhases.map((p) => toCTOPhase(p as LLMDevPhase, taskTitle, taskClass, quotaState));
  const intent: ACRIntent = {
    l5_task_id: taskId,
    task_title: taskTitle,
    phases,
    created_at: new Date().toISOString(),
    // Reaching dispatch means the Hermes dispatcher picked this task up, which it
    // only does for approval_required=false tasks — i.e. L5's approval gate is
    // already satisfied. ACR uses this to clear its manual_founder gate.
    l5_approved: true,
  };
  const projectPath = resolveProjectPath(task);
  if (projectPath) intent.project_path = projectPath;
  return intent;
}

function parseLLMResponse(raw: string): LLMDevWorkflowResponse | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip accidental markdown fences (LLMs occasionally still emit them).
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(stripped) as LLMDevWorkflowResponse;
  } catch {
    return null;
  }
}

const VALID_TASK_CLASSES = new Set<string>([
  "TINY", "SMALL_FIX", "FEATURE", "BIG_CHANGE", "OPS", "RESEARCH", "REFACTOR",
]);

function parseTaskClass(raw: string | undefined): TaskClass | null {
  if (typeof raw !== "string") return null;
  // Normalize separators so LLM variants ("small fix", "small-fix") still match.
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_TASK_CLASSES.has(normalized)) {
    return normalized as TaskClass;
  }
  return null;
}

/** Returns either { phases, taskClass } (validated SOP) or { clarifying_questions }.
 * Returns null if the LLM call fails twice or the response is unrecoverable.
 * The CTO LLM decides task_class; if absent, falls back to classifyTask().
 */
async function callLLMForDevWorkflow(
  llm: LLMClient,
  taskTitle: string,
  taskRationale: string,
  taskClass: TaskClass,
): Promise<{ phases?: LLMDevPhase[]; taskClass?: TaskClass; clarifying_questions?: string[] } | null> {
  const system = buildDevWorkflowSystemPrompt(taskTitle, taskRationale, taskClass);
  const baseUser = `Task: ${taskTitle}\nRationale: ${taskRationale}`;

  let lastErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nPhase 생성이 SOP를 위반했습니다. 다음 오류를 수정하여 다시 출력하세요:\n${lastErrors
            .map((e) => `- ${e}`)
            .join("\n")}`;

    let raw: string;
    try {
      raw = await llm.complete({ system, user, trace_name: "cto-design.dev-workflow" });
    } catch (err) {
      console.warn(
        `[CTO] dev-workflow LLM attempt ${attempt + 1} threw —`,
        (err as Error).message,
      );
      return null;
    }

    const parsed = parseLLMResponse(raw);
    if (!parsed) {
      lastErrors = ["response was not valid JSON"];
      continue;
    }

    if (Array.isArray(parsed.clarifying_questions) && parsed.clarifying_questions.length > 0) {
      const questions = parsed.clarifying_questions.filter(
        (q): q is string => typeof q === "string" && q.trim().length > 0,
      );
      if (questions.length > 0) {
        return { clarifying_questions: questions };
      }
    }

    // CTO LLM is authoritative for task_class; fall back to the pre-computed value.
    const resolvedClass = parseTaskClass(parsed.task_class) ?? taskClass;
    const validation = validateDevWorkflowPhases(parsed.phases, resolvedClass);
    if (validation.ok && parsed.phases) {
      return { phases: parsed.phases, taskClass: resolvedClass };
    }
    lastErrors = validation.errors;
    console.warn(
      `[CTO] dev-workflow LLM attempt ${attempt + 1} violated SOP:`,
      validation.errors.join("; "),
    );
  }

  return null;
}

const ACR_BASE_URL = process.env["ACR_BASE_URL"] ?? "http://localhost:3001";

interface ACRRegistrationPayload {
  project_id: string;
  title: string;
  one_liner: string;
  l5_business_id: string;
  project_path?: string;
}

function buildRegistrationPayload(
  task: CTOAgentInput["task"],
  overridePath?: string,
): ACRRegistrationPayload {
  const projectPath = overridePath ?? resolveProjectPath(task);
  return {
    project_id: task?.id ?? "unknown",
    title: task?.title ?? "Unknown Task",
    one_liner: task?.rationale ?? "",
    l5_business_id: "",
    ...(projectPath ? { project_path: projectPath } : {}),
  };
}

async function postRegistration(payload: ACRRegistrationPayload): Promise<Response | null> {
  try {
    return await fetch(`${ACR_BASE_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[CTO] ACR project registration request failed —", (err as Error).message);
    return null;
  }
}

async function bootstrapProjectIfMissing(task: CTOAgentInput["task"]): Promise<boolean> {
  const fallbackPath = process.env["L5_DEFAULT_PROJECT_PATH"];
  if (!fallbackPath) {
    console.warn(
      "[CTO] bootstrapProjectIfMissing: L5_DEFAULT_PROJECT_PATH not set — cannot bootstrap",
    );
    return false;
  }
  const payload = buildRegistrationPayload(task, fallbackPath);
  const response = await postRegistration(payload);
  if (!response) return false;
  if (!response.ok) {
    console.warn(`[CTO] bootstrap retry returned ${response.status}`);
    return false;
  }
  return true;
}

async function registerWithACR(task: CTOAgentInput["task"]): Promise<void> {
  const payload = buildRegistrationPayload(task);
  const response = await postRegistration(payload);
  if (!response) return;
  if (response.ok) return;
  console.warn(
    `[CTO] ACR project registration returned ${response.status} — attempting bootstrap`,
  );
  await bootstrapProjectIfMissing(task);
}

async function dispatchToACR(intent: ACRIntent): Promise<void> {
  try {
    const response = await fetch(`${ACR_BASE_URL}/api/workbench/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
    if (!response.ok) {
      console.warn(`[CTO] ACR dispatch returned ${response.status} — continuing`);
    }
  } catch (err) {
    console.warn(
      "[CTO] ACR dispatch failed (server may not be running) —",
      (err as Error).message,
    );
  }
}

// ── Execution-Runs 레일 (PRD §9/§29) ────────────────────────────────────────
// 기존 workbench dispatch 와 별개의 *추가* 레일. ACR_EXECUTION_RUNS=on 일 때만
// 활성화되며, 비파괴(점진 활성화)다. CTO가 작업을 분류해 큰 작업(C5 또는 다중
// feature)은 MainAgentWorkPackage[] 로 분해 → 각 패키지마다 POST /api/execution-runs
// 를 호출(다중 run = 팀런). 소형은 단일 run. C0/C1 팀 금지 가드는 team-router/
// team-orchestrator 에 이미 들어 있어 재사용한다.

/** harness 복잡도(C0~C5) → HarnessRiskLevel(D0~D4). 위험 영역일수록 높게. */
function complexityToHarnessRisk(c: Complexity): HarnessRiskLevel {
  switch (c) {
    case "C0":
      return "D0";
    case "C1":
    case "C2":
      return "D1";
    case "C3":
      return "D2";
    case "C4":
      return "D3";
    case "C5":
      return "D4";
  }
}

/** 단일 task → feature 도메인 추론(결정적, 키워드 기반). UI 신호가 있으면 ui. */
function inferDomains(taskTitle: string, taskClass: TaskClass): WorkPackageDomain[] {
  const t = taskTitle.toLowerCase();
  if (/\b(ui|page|component|screen|버튼|화면|컴포넌트|렌더)\b/.test(t)) {
    return ["ui"];
  }
  if (taskClass === "RESEARCH") return ["docs"];
  if (/\b(test|테스트|spec)\b/.test(t)) return ["test"];
  return ["api"];
}

/**
 * Execution-runs 레일을 실행한다(플래그 ON 일 때만 호출됨).
 * 단일 task 를 1개 feature 로 분해해 planTeamRun → 각 run 마다 createExecutionRun.
 * 모든 호출은 graceful — 실패해도 throw 하지 않는다.
 */
async function dispatchExecutionRuns(
  task: CTOAgentInput["task"],
  complexity: Complexity,
  taskClass: TaskClass,
  blockedFiles: string[],
): Promise<void> {
  const repoPath = resolveProjectPath(task);
  if (!repoPath) {
    console.warn(
      "[CTO] execution-runs rail: no repo_path (project_path/cwd/L5_DEFAULT_PROJECT_PATH) — skipping",
    );
    return;
  }

  const taskId = task?.id ?? "unknown";
  const taskTitle = task?.title ?? "Unknown Task";

  const feature: TeamFeatureInput = {
    objective: taskTitle,
    domains: inferDomains(taskTitle, taskClass),
    allowedFiles: [],
    blockedFiles,
    complexity,
    riskLevel: complexityToHarnessRisk(complexity),
    acceptanceCriteria: task?.rationale ? [task.rationale] : [],
  };

  const plan = planTeamRun({
    parentTaskId: taskId,
    parentPlanId: `${taskId}-plan`,
    repoPath,
    baseBranch: process.env["ACR_BASE_BRANCH"] ?? "main",
    features: [feature],
  });

  console.warn(
    `[CTO] execution-runs rail (${plan.kind}): dispatching ${plan.runs.length} run(s) for "${taskTitle}"`,
  );

  for (const run of plan.runs as PlannedExecutionRun[]) {
    const created = await createExecutionRun(run.request);
    if (created) {
      console.warn(
        `[CTO] execution-run created: ${created.run_id} (${created.status}) for package ${run.package.packageId}`,
      );
    }
  }
}

function resolveLLMClient(deps?: CTOAgentDeps): LLMClient | null {
  if (deps && Object.prototype.hasOwnProperty.call(deps, "llm")) {
    return deps.llm ?? null;
  }
  try {
    return createDefaultLLMClient("cto-design");
  } catch (err) {
    console.warn("[CTO] no LLM client available —", (err as Error).message);
    return null;
  }
}

export async function runCTOAgent(
  input: CTOAgentInput,
  deps?: CTOAgentDeps,
): Promise<CTOAgentOutput> {
  const taskTitle = input.task?.title ?? "Unknown Task";
  const taskRationale = input.task?.rationale ?? "";
  const taskId = input.task?.id ?? "unknown";

  const llm = resolveLLMClient(deps);

  // Quota-aware routing: load once and thread into every phase mapping so model
  // resolution skips exhausted tiers (undefined = all available = legacy behavior).
  const quotaState = loadQuotaState();

  // Phase generation is deterministic by default (ACR_DETERMINISTIC_PHASES≠"0"):
  // classifyTask + template-driven phases skip the LLM round-trip entirely,
  // eliminating the 2-attempt retry loop and the LLM clarifying-question
  // escalation that stalled the pipeline. Set ACR_DETERMINISTIC_PHASES=0 to
  // restore the LLM phase planner (fallback/experimental).
  const deterministicPhases = process.env.ACR_DETERMINISTIC_PHASES !== "0";

  // CTO is the sole authority on task classification — the deterministic keyword
  // heuristic is authoritative and the LLM may NOT override it.
  const inferredClass: TaskClass = classifyTask(taskTitle, taskRationale);

  let acrIntent: ACRIntent | null = null;
  let clarifyingQuestions: string[] | undefined;
  const resolvedTaskClass: TaskClass = inferredClass;

  if (llm && !deterministicPhases) {
    const llmResult = await callLLMForDevWorkflow(llm, taskTitle, taskRationale, inferredClass);
    if (llmResult?.clarifying_questions) {
      clarifyingQuestions = llmResult.clarifying_questions;
    } else if (llmResult?.phases) {
      // Classification stays deterministic; the LLM only fills phase detail.
      const projectPath = resolveProjectPath(input.task);
      acrIntent = {
        l5_task_id: taskId,
        task_title: taskTitle,
        phases: llmResult.phases.map((p) => toCTOPhase(p, taskTitle, resolvedTaskClass, quotaState)),
        created_at: new Date().toISOString(),
        // See buildDeterministicIntent: dispatcher only forwards approved tasks.
        l5_approved: true,
        ...(projectPath ? { project_path: projectPath } : {}),
      };
    }
  }

  // Clarification short-circuit: do NOT dispatch to ACR, surface questions to Founder.
  if (clarifyingQuestions) {
    const deterministicIntent = buildDeterministicIntent(input.task, resolvedTaskClass, quotaState);
    return {
      decision: `CTO requires clarification before planning: ${clarifyingQuestions.length} question(s)`,
      reasoning: clarifyingQuestions.map((q, i) => `Q${i + 1}: ${q}`).join("; "),
      next_action: "Founder must answer clarifying questions before CTO continues",
      risk_level: "D3",
      requires_founder_approval: true,
      acr_intent: deterministicIntent,
      clarifying_questions: clarifyingQuestions,
    };
  }

  if (!acrIntent) {
    acrIntent = buildDeterministicIntent(input.task, resolvedTaskClass, quotaState);
  }

  // CTO orchestration: 복잡도·하드 경계를 dispatch payload에 실어 ACR이 격리 범위와
  // 검증 강도를 정하게 한다. ACR은 "무엇을 할지" 판단하지 않는다(PRD §5.2) — 복잡도
  // (taskClass→C0~C5), 실행모드, blocked_files(.env·lockfile 등)는 모두 CTO가 결정.
  const harnessComplexity = taskClassToComplexity(resolvedTaskClass);
  acrIntent = applyHarnessMetadata(acrIntent, {
    complexity: harnessComplexity,
    mode: complexityToMode(harnessComplexity),
    blockedFiles: DEFAULT_BLOCKED,
  });

  await registerWithACR(input.task);
  await dispatchToACR(acrIntent);

  // 추가 레일(비파괴): ACR_EXECUTION_RUNS=on 일 때만 execution-runs 로도 디스패치.
  // 기존 workbench dispatch 는 그대로 유지된다. 분해/팀런 판단은 team-orchestrator.
  if (process.env["ACR_EXECUTION_RUNS"] === "on") {
    await dispatchExecutionRuns(
      input.task,
      harnessComplexity,
      resolvedTaskClass,
      DEFAULT_BLOCKED,
    );
  }

  const riskOrder: CTOPhase["risk_level"][] = ["D1", "D2", "D3", "D4", "D5"];
  const highestRisk = acrIntent.phases.reduce<CTOPhase["risk_level"]>(
    (max, p) => (riskOrder.indexOf(p.risk_level) > riskOrder.indexOf(max) ? p.risk_level : max),
    "D1",
  );

  const requiresApproval = acrIntent.phases.some((p) => p.l5_approval_required);

  return {
    decision: `CTO execution plan created: ${acrIntent.phases.length} phases for "${acrIntent.task_title}"`,
    reasoning: acrIntent.phases
      .map((p) => `[${p.runtime}] ${p.name} (${p.risk_level})`)
      .join("; "),
    next_action: `Begin phase 1: ${acrIntent.phases[0]?.name ?? "스펙 작성"}`,
    risk_level: highestRisk,
    requires_founder_approval: requiresApproval,
    acr_intent: acrIntent,
  };
}
