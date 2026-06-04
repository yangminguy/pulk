import type { AgentOutput } from "./agents/types.js";
import { runCMOAgent } from "./agents/cmo.js";
import { runCROAgent } from "./agents/cro.js";
import { runCPOAgent } from "./agents/cpo.js";
import { runCTOAgent } from "./agents/cto.js";
import { runCOOAgent } from "./agents/coo.js";
import { runCFOAgent } from "./agents/cfo.js";
import { runRiskQAAgent } from "./agents/risk-qa.js";
import { runChiefOfStaffAgent } from "./agents/chief-of-staff.js";
import { callHaikuJson } from "./llm/haiku-llm.js";

// Self-healing loop for failed executive-agent tasks.
//
// Founder's rule (verbatim intent):
//   - 개발적인 에러(technical) → CTO 가 진단하고 고쳐서 다시 진행
//   - 기획 방향/권한 문제(planning/permission) → CEO 가 검토하고 대부분 승인하고 진행
//   - 단, 결제 / 외부로 나가는 문서·메시지 는 무조건 founder 승인
//
// The loop is single-shot and bounded: one healer pass (CTO or CEO) + one retry of the
// original agent. No recursion. Anything that survives this is a genuine block.

export type FailureKind = "technical" | "planning";

export interface HealInput {
  agent: string;
  task: { id?: string; title: string; rationale: string; expected_output: string; phase?: string; risk_level?: string; project_path?: string };
}

export interface HealOutcome {
  resolved: boolean;
  escalateToFounder: boolean;
  healer: "CTO" | "CEO";
  kind: FailureKind;
  guidance: AgentOutput;
  retryOutput?: AgentOutput;
  retryError?: string;
}

type AgentRunner = (input: { task: HealInput["task"]; context?: unknown }) => Promise<AgentOutput>;

const AGENT_MAP: Record<string, AgentRunner> = {
  CMO: runCMOAgent as AgentRunner,
  CRO: runCROAgent as AgentRunner,
  CPO: runCPOAgent as AgentRunner,
  CTO: runCTOAgent as AgentRunner,
  COO: runCOOAgent as AgentRunner,
  CFO: runCFOAgent as AgentRunner,
  RiskQA: runRiskQAAgent as AgentRunner,
  ChiefOfStaff: runChiefOfStaffAgent as AgentRunner,
};

// Planning/permission signals route to the CEO. Everything else (JSON parse failures,
// LLM call errors, runtime/type errors) is a technical failure and routes to the CTO.
const PLANNING_SIGNALS = [
  "permission",
  "approval",
  "scope",
  "unclear",
  "direction",
  "ambiguous",
  "not allowed",
  "forbidden",
  "policy",
  "권한",
  "승인",
  "범위",
  "방향",
  "정책",
];

export function classifyFailure(errorMessage: string): FailureKind {
  const m = (errorMessage || "").toLowerCase();
  if (PLANNING_SIGNALS.some((s) => m.includes(s))) return "planning";
  return "technical";
}

// CTO healer — diagnose a technical failure and propose a corrected approach.
async function ctoHeal(input: HealInput, errorMessage: string): Promise<AgentOutput> {
  return (runCTOAgent as AgentRunner)({
    task: {
      id: input.task.id ?? input.task.title,
      title: `[Recovery] ${input.task.title}`,
      rationale:
        `The ${input.agent} agent failed this task with a technical error: "${errorMessage}". ` +
        `As CTO, diagnose the root cause and produce a corrected technical approach the original ` +
        `agent can execute on retry. Original rationale: ${input.task.rationale}`,
      expected_output:
        `A concrete corrected decision and next_action the original agent can follow. ` +
        `Original expected output: ${input.task.expected_output}`,
      phase: input.task.phase,
      risk_level: input.task.risk_level,
      project_path: input.task.project_path,
    },
  });
}

const CEO_HEAL_SYSTEM = `You are the CEO of L5 Business OS reviewing a task that an executive agent could not complete because of a planning, direction, scope, or permission problem.

Decide whether the task may proceed and how. You hold broad authority: for internal planning, research, prototyping, restructuring, and sub-task direction you decide autonomously and SHOULD usually approve a corrected direction so work continues.

[FOUNDER APPROVAL GATE — MANDATORY]
You may NOT auto-approve these. Set requires_founder_approval=true and risk_level >= D4 if the task involves:
  1. Payments / spending money / signing contracts / committing budget
  2. Outbound messages or documents leaving the company to a customer / partner / public
  3. Onboarding or removing a team member, vendor, or external collaborator
  4. Public changes to brand, pricing, terms, or legal posture
For everything else, requires_founder_approval=false and give a clear corrected direction in next_action.

Return ONLY JSON: { "decision": string, "reasoning": string, "next_action": string, "risk_level": "D1".."D5", "requires_founder_approval": boolean }`;

// CEO healer — review a planning/permission block. Korean output is enforced by callHaikuJson.
async function ceoHeal(input: HealInput, errorMessage: string): Promise<AgentOutput> {
  const userPrompt =
    `Blocked task: ${input.task.title}\n` +
    `Rationale: ${input.task.rationale}\n` +
    `Expected output: ${input.task.expected_output}\n` +
    `Why the ${input.agent} agent blocked: "${errorMessage}"\n\n` +
    `Decide whether and how this may proceed. Return JSON only.`;
  return callHaikuJson<AgentOutput>(CEO_HEAL_SYSTEM, userPrompt);
}

export async function healFailedTask(input: HealInput, errorMessage: string): Promise<HealOutcome> {
  const kind = classifyFailure(errorMessage);
  const healer: "CTO" | "CEO" = kind === "technical" ? "CTO" : "CEO";

  const guidance = kind === "technical" ? await ctoHeal(input, errorMessage) : await ceoHeal(input, errorMessage);

  // Payment / external / permission → escalate to founder, do NOT auto-retry.
  if (guidance.requires_founder_approval) {
    return { resolved: false, escalateToFounder: true, healer, kind, guidance };
  }

  // Retry the original agent with the healer's corrected direction injected as context.
  const runner = AGENT_MAP[input.agent];
  if (!runner) {
    return { resolved: false, escalateToFounder: false, healer, kind, guidance, retryError: `no runner for agent ${input.agent}` };
  }

  try {
    const retryOutput = await runner({
      task: input.task,
      context: { recovery_guidance: `[${healer}] ${guidance.decision} — ${guidance.next_action}` },
    });
    return { resolved: true, escalateToFounder: false, healer, kind, guidance, retryOutput };
  } catch (retryErr) {
    return { resolved: false, escalateToFounder: false, healer, kind, guidance, retryError: (retryErr as Error).message };
  }
}
