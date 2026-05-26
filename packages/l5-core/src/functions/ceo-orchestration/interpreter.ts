import type {
  CEOInterpretation,
  FounderInstruction,
  LLMClient,
  OrchestrationPhase,
} from './types';
import type { RiskLevel } from '../../types/entities';

const SYSTEM_PROMPT = `You are the CEO Agent of L5 Business OS.
Follow AGENT_PROTOCOL. Interpret the Founder's instruction into a deterministic JSON object.

Return ONLY valid JSON matching this schema:
{
  "goal": string,
  "phase": "direction_alignment" | "market_pmf_diagnosis" | "offer_workflow_redesign" | "execution_system_build" | "monitoring_optimization",
  "assumptions": string[],
  "success_criteria": string[],
  "risk_level": "D1" | "D2" | "D3" | "D4" | "D5",
  "approval_required": boolean
}

Rules:
- goal is one concrete outcome, not a list.
- phase reflects where the Founder is in the L5 orchestration loop.
- risk_level follows D1-D5. External customer messages are D4+.
- approval_required must be true for D4/D5 or any external customer-facing commitment.
- Never invent customer PII. Never include secrets.`;

export interface InterpretOptions {
  llm: LLMClient;
  now?: () => Date;
  idGenerator?: () => string;
}

interface ParsedInterpretation {
  goal: string;
  phase: OrchestrationPhase;
  assumptions: string[];
  success_criteria: string[];
  risk_level: RiskLevel;
  approval_required: boolean;
}

export async function interpretFounderInstruction(
  instruction: FounderInstruction,
  opts: InterpretOptions
): Promise<CEOInterpretation> {
  const userPrompt = `Founder instruction (id=${instruction.id}):\n"""\n${instruction.raw_text}\n"""\n\nReturn JSON only.`;

  const raw = await opts.llm.complete({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    trace_name: 'ceo.interpretFounderInstruction',
    trace_metadata: { instruction_id: instruction.id },
  });

  const parsed = parseInterpretation(raw);
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const id = (opts.idGenerator ?? defaultId)();

  return {
    id,
    instruction_id: instruction.id,
    goal: parsed.goal,
    phase: parsed.phase,
    assumptions: parsed.assumptions,
    success_criteria: parsed.success_criteria,
    risk_level: parsed.risk_level,
    approval_required: parsed.approval_required,
    created_at: now,
  };
}

function parseInterpretation(raw: string): ParsedInterpretation {
  const json = extractJson(raw);
  const obj = JSON.parse(json);

  const required = ['goal', 'phase', 'assumptions', 'success_criteria', 'risk_level', 'approval_required'];
  for (const key of required) {
    if (!(key in obj)) {
      throw new Error(`CEO interpretation missing field: ${key}`);
    }
  }
  if (!Array.isArray(obj.assumptions) || !Array.isArray(obj.success_criteria)) {
    throw new Error('CEO interpretation: assumptions/success_criteria must be arrays');
  }
  return obj;
}

// LLMs sometimes wrap JSON in prose or fences; extract the first JSON object.
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('CEO interpretation: no JSON object found in LLM output');
  }
  return raw.slice(start, end + 1);
}

function defaultId(): string {
  return `interp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
