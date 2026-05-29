import type {
  CEOInterpretation,
  FounderInstruction,
  LLMClient,
  OrchestrationPhase,
} from './types';
import type { RiskLevel } from '../../types/entities';

const SYSTEM_PROMPT_BASE = `You are the CEO Agent of L5 Business OS.
Follow AGENT_PROTOCOL. Interpret the Founder's instruction into a deterministic JSON object.

Return ONLY valid JSON matching this schema:
{
  "goal": string,
  "phase": "direction_alignment" | "market_pmf_diagnosis" | "offer_workflow_redesign" | "execution_system_build" | "monitoring_optimization",
  "assumptions": string[],
  "success_criteria": string[],
  "risk_level": "D1" | "D2" | "D3" | "D4" | "D5",
  "approval_required": boolean,
  "business_id": string | null,
  "needs_business_clarification": boolean,
  "business_clarification_question": string | null,
  "new_business_proposal": { "title": string, "one_liner": string } | null
}

Return valid JSON only. Use null (never the literal "undefined") for absent optional fields.

Rules:
- goal is one concrete outcome, not a list.
- phase reflects where the Founder is in the L5 orchestration loop.
- risk_level follows D1-D5. External customer messages are D4+.
- approval_required must be true for D4/D5 or any external customer-facing commitment.
- Never invent customer PII. Never include secrets.
- business_id: if active businesses are listed below, pick the id of the best matching one.
  Set to null if the instruction clearly applies to the whole company (not one specific business).
  If ambiguous (could be multiple businesses or unclear), set needs_business_clarification=true and
  provide a short business_clarification_question. Do NOT set business_id when clarification is needed.
- needs_business_clarification: true only when it is genuinely unclear which business applies.
- business_clarification_question: only present when needs_business_clarification is true.
- new_business_proposal: only present when the instruction describes a brand-new business not in the active list.
  Do NOT create or act on it — only surface it.
  If active business list is empty or absent, default business_id to null.`;

export interface FounderMemoryEntry {
  insight: string;
  workflow_improvement?: string;
  phase?: string;
}

export interface ActiveBusiness {
  id: string;
  name: string;
  one_liner?: string;
}

export interface InterpretOptions {
  llm: LLMClient;
  now?: () => Date;
  idGenerator?: () => string;
  memories?: FounderMemoryEntry[];
  activeBusinesses?: ActiveBusiness[];
}

interface ParsedInterpretation {
  goal: string;
  phase: OrchestrationPhase;
  assumptions: string[];
  success_criteria: string[];
  risk_level: RiskLevel;
  approval_required: boolean;
  business_id: string | null;
  needs_business_clarification: boolean;
  business_clarification_question?: string;
  new_business_proposal?: { title: string; one_liner: string };
}

export type InterpretResult = CEOInterpretation & {
  needs_business_clarification: boolean;
  business_clarification_question?: string;
  new_business_proposal?: { title: string; one_liner: string };
};

export async function interpretFounderInstruction(
  instruction: FounderInstruction,
  opts: InterpretOptions
): Promise<InterpretResult> {
  const userPrompt = `Founder instruction (id=${instruction.id}):\n"""\n${instruction.raw_text}\n"""\n\nReturn JSON only.`;

  const memorySection = opts.memories && opts.memories.length > 0
    ? '\n\n## Founder Memory (past insights)\n' +
      opts.memories.map((m) => `- ${m.insight}${m.phase ? ` [${m.phase}]` : ''}`).join('\n')
    : '';

  const businessSection = opts.activeBusinesses && opts.activeBusinesses.length > 0
    ? '\n\n## Active Businesses\n' +
      opts.activeBusinesses
        .map((b) => `- id=${b.id} | name="${b.name}"${b.one_liner ? ` | one_liner="${b.one_liner}"` : ''}`)
        .join('\n')
    : '\n\n## Active Businesses\n(none — default business_id to null)';

  const raw = await opts.llm.complete({
    system: SYSTEM_PROMPT_BASE + businessSection + memorySection,
    user: userPrompt,
    trace_name: 'ceo.interpretFounderInstruction',
    trace_metadata: { instruction_id: instruction.id },
  });

  const parsed = parseInterpretation(raw, opts.activeBusinesses ?? []);
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const id = (opts.idGenerator ?? defaultId)();

  const result: InterpretResult = {
    id,
    instruction_id: instruction.id,
    goal: parsed.goal,
    phase: parsed.phase,
    assumptions: parsed.assumptions,
    success_criteria: parsed.success_criteria,
    risk_level: parsed.risk_level,
    approval_required: parsed.approval_required,
    business_id: parsed.business_id,
    needs_business_clarification: parsed.needs_business_clarification,
    created_at: now,
  };
  if (parsed.business_clarification_question !== undefined) {
    result.business_clarification_question = parsed.business_clarification_question;
  }
  if (parsed.new_business_proposal !== undefined) {
    result.new_business_proposal = parsed.new_business_proposal;
  }
  return result;
}

function parseInterpretation(raw: string, activeBusinesses: ActiveBusiness[]): ParsedInterpretation {
  const json = extractJson(raw);
  // Defensive: some LLMs emit the literal `undefined` (invalid JSON) for absent optional fields.
  const obj = JSON.parse(json.replace(/:\s*undefined\b/g, ': null'));

  const required = ['goal', 'phase', 'assumptions', 'success_criteria', 'risk_level', 'approval_required'];
  for (const key of required) {
    if (!(key in obj)) {
      throw new Error(`CEO interpretation missing field: ${key}`);
    }
  }
  if (!Array.isArray(obj.assumptions) || !Array.isArray(obj.success_criteria)) {
    throw new Error('CEO interpretation: assumptions/success_criteria must be arrays');
  }

  // Safe-degrade: if LLM omits business fields or active list is empty, default to null/false.
  const hasBusinesses = activeBusinesses.length > 0;
  const needsClarification = hasBusinesses ? Boolean(obj.needs_business_clarification) : false;
  const businessId: string | null = !hasBusinesses || needsClarification
    ? null
    : (typeof obj.business_id === 'string' ? obj.business_id : null);

  const parsed: ParsedInterpretation = {
    goal: obj.goal,
    phase: obj.phase,
    assumptions: obj.assumptions,
    success_criteria: obj.success_criteria,
    risk_level: obj.risk_level,
    approval_required: obj.approval_required,
    business_id: businessId,
    needs_business_clarification: needsClarification,
  };
  if (needsClarification && typeof obj.business_clarification_question === 'string') {
    parsed.business_clarification_question = obj.business_clarification_question;
  }
  if (obj.new_business_proposal && typeof obj.new_business_proposal.title === 'string') {
    parsed.new_business_proposal = {
      title: obj.new_business_proposal.title,
      one_liner: obj.new_business_proposal.one_liner ?? '',
    };
  }
  return parsed;
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
