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
} from "@l5/core";
import {
  buildDevWorkflowSystemPrompt,
  validateDevWorkflowPhases,
  buildDeterministicDevPhases,
  classifyTask,
  createDefaultLLMClient,
  selectModelTier,
} from "@l5/core";

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

/** Map a SOP-validated phase (LLM or template) into a downstream CTOPhase. */
function toCTOPhase(p: LLMDevPhase, taskTitle: string, taskClass: TaskClass = "FEATURE"): CTOPhase {
  // Default to 'spec' only as a last resort — new phase kinds pass through as-is
  // because DevPhaseKind now covers all class-specific kinds.
  const kind = (p.kind ?? "spec") as DevPhaseKind;
  const runtime = (p.runtime ?? "claude") as CTOPhase["runtime"];
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
  const modelLocked = selectModelTier(taskClass, kind) === "T1";

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

function buildDeterministicIntent(task: CTOAgentInput["task"], taskClass: TaskClass = "FEATURE"): ACRIntent {
  const taskId = task?.id ?? "unknown";
  const taskTitle = task?.title ?? "Unknown Task";
  const devPhases = buildDeterministicDevPhases(taskTitle, taskClass);
  const phases: CTOPhase[] = devPhases.map((p) => toCTOPhase(p as LLMDevPhase, taskTitle, taskClass));
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
  "SMALL_FIX", "FEATURE", "BIG_CHANGE", "OPS", "RESEARCH", "REFACTOR",
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

  // CTO is the sole authority on task classification. Keyword heuristic runs
  // first; if the LLM is available it may override via task_class in its response.
  const inferredClass: TaskClass = classifyTask(taskTitle, taskRationale);

  let acrIntent: ACRIntent | null = null;
  let clarifyingQuestions: string[] | undefined;
  let resolvedTaskClass: TaskClass = inferredClass;

  if (llm) {
    const llmResult = await callLLMForDevWorkflow(llm, taskTitle, taskRationale, inferredClass);
    if (llmResult?.clarifying_questions) {
      clarifyingQuestions = llmResult.clarifying_questions;
    } else if (llmResult?.phases) {
      resolvedTaskClass = llmResult.taskClass ?? inferredClass;
      const projectPath = resolveProjectPath(input.task);
      acrIntent = {
        l5_task_id: taskId,
        task_title: taskTitle,
        phases: llmResult.phases.map((p) => toCTOPhase(p, taskTitle, resolvedTaskClass)),
        created_at: new Date().toISOString(),
        // See buildDeterministicIntent: dispatcher only forwards approved tasks.
        l5_approved: true,
        ...(projectPath ? { project_path: projectPath } : {}),
      };
    }
  }

  // Clarification short-circuit: do NOT dispatch to ACR, surface questions to Founder.
  if (clarifyingQuestions) {
    const deterministicIntent = buildDeterministicIntent(input.task, resolvedTaskClass);
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
    acrIntent = buildDeterministicIntent(input.task, resolvedTaskClass);
  }

  await registerWithACR(input.task);
  await dispatchToACR(acrIntent);

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
