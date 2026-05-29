import type { RiskLevel } from '../../types/entities';
import type {
  CEOInterpretation,
  ExecutiveRole,
  LLMClient,
  Workstream,
} from './types';

interface DomainRule {
  role: ExecutiveRole;
  keywords: RegExp;
  expected_output: string;
  approval_required: boolean;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    role: 'CMO',
    keywords: /(message|messaging|content|positioning|brand|marketing|campaign|copy|launch|landing|waitlist)/i,
    expected_output: 'Positioning draft, message variants, or content plan with target segment.',
    approval_required: true,
  },
  {
    role: 'CRO',
    keywords: /(sales|revenue|lead|pipeline|proposal|pricing|deal|customer.?outreach|follow.?up)/i,
    expected_output: 'Lead list, sales workflow draft, or proposal draft. Stops before external send.',
    approval_required: true,
  },
  {
    role: 'CPO',
    keywords: /(product|offer|pmf|user|feature|workflow|interview|onboarding|retention)/i,
    expected_output: 'Offer shape, PMF experiment hypothesis, or user workflow definition.',
    approval_required: false,
  },
  {
    role: 'CTO',
    keywords: /(tool|build|infra|technical|automation|integration|api|engineering|stack)/i,
    expected_output: 'Tool request review, technical feasibility note, or build plan. Blocks premature builds.',
    approval_required: false,
  },
  {
    role: 'COO',
    keywords: /(operation|process|sop|delivery|cadence|ops|fulfillment|onboarding.process)/i,
    expected_output: 'Operating cadence, SOP draft, or delivery workflow definition.',
    approval_required: false,
  },
  {
    role: 'CFO',
    keywords: /(cost|budget|finance|pricing|subscription|spend|payment|invoice|admin)/i,
    expected_output: 'Cost analysis, pricing implication, or financial commitment review.',
    approval_required: true,
  },
  {
    role: 'RiskQA',
    keywords: /(risk|compliance|legal|pii|privacy|consent|audit|policy|security)/i,
    expected_output: 'Risk assessment with risk_level, pii_level, approval gate, consent scope check.',
    approval_required: false,
  },
];

export interface DecomposeOptions {
  now?: () => Date;
  idGenerator?: (role: ExecutiveRole) => string;
  fallback_role?: ExecutiveRole;
  llm?: LLMClient;
}

export async function decomposeIntoWorkstreams(
  interpretation: CEOInterpretation,
  opts: DecomposeOptions = {}
): Promise<Workstream[]> {
  const idGen = opts.idGenerator ?? defaultIdGen;

  if (opts.llm) {
    try {
      const roles = await resolveRolesWithLLM(interpretation, opts.llm);
      if (roles.length > 0) {
        return roles.map(({ role, rationale }) => {
          const rule = findRule(role);
          const ws = buildWorkstream(rule, interpretation, idGen(role));
          return { ...ws, rationale };
        });
      }
    } catch {
      // fall through to keyword-based on LLM failure
    }
  }

  const haystack = [
    interpretation.goal,
    ...interpretation.assumptions,
    ...interpretation.success_criteria,
  ].join(' ');

  const matched = DOMAIN_RULES.filter(rule => rule.keywords.test(haystack));
  const rules = matched.length > 0 ? matched : [findRule(opts.fallback_role ?? 'CPO')];

  return rules.map(rule => buildWorkstream(rule, interpretation, idGen(rule.role)));
}

const LLM_SYSTEM = `You are the CEO Agent routing engine for L5 Business OS.
Given a business goal, decide which executive roles should handle it.
Return ONLY valid JSON: { "assignments": [{ "role": "CMO"|"CRO"|"CPO"|"CTO"|"COO"|"CFO"|"RiskQA", "rationale": string }] }
Rules:
- Assign 1-3 roles. Only assign roles with clear work to do.
- CMO: external messaging, brand, marketing, content, campaign
- CRO: sales, revenue, leads, pipeline, customer outreach
- CPO: product, PMF, user research, feature, onboarding
- CTO: technical build, tool, infra, automation, API, engineering
- COO: operations, process, SOP, delivery, cadence
- CFO: budget, cost, pricing, finance, subscription
- RiskQA: any risk/legal/PII/compliance concern (add alongside other roles when relevant)
- If ambiguous, assign CPO only.`;

async function resolveRolesWithLLM(
  interpretation: CEOInterpretation,
  llm: LLMClient
): Promise<{ role: ExecutiveRole; rationale: string }[]> {
  const raw = await llm.complete({
    system: LLM_SYSTEM,
    user: `Goal: ${interpretation.goal}\nPhase: ${interpretation.phase}\nAssumptions: ${interpretation.assumptions.join(', ')}\nSuccess criteria: ${interpretation.success_criteria.join(', ')}`,
    trace_name: 'ceo.decomposeIntoWorkstreams',
    trace_metadata: { interpretation_id: interpretation.id },
  });

  const json = extractJson(raw);
  const obj = JSON.parse(json) as { assignments: Array<{ role: string; rationale: string }> };
  const valid = DOMAIN_RULES.map(r => r.role);
  return obj.assignments
    .filter(a => valid.includes(a.role as ExecutiveRole))
    .map(a => ({ role: a.role as ExecutiveRole, rationale: a.rationale }));
}

function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('no JSON in LLM output');
  return raw.slice(s, e + 1);
}

function buildWorkstream(
  rule: DomainRule,
  interp: CEOInterpretation,
  id: string
): Workstream {
  const ws: Workstream = {
    id,
    instruction_id: interp.instruction_id,
    interpretation_id: interp.id,
    domain: rule.role,
    title: `${rule.role} workstream: ${interp.goal}`,
    rationale: `Routed to ${rule.role} because goal matched ${rule.role} domain. Phase=${interp.phase}.`,
    expected_output: rule.expected_output,
    approval_required:
      rule.approval_required || interp.approval_required || elevatedRisk(interp.risk_level),
    risk_level: interp.risk_level,
    phase: interp.phase,
  };
  return ws;
}

function findRule(role: ExecutiveRole): DomainRule {
  const rule = DOMAIN_RULES.find(r => r.role === role);
  if (!rule) throw new Error(`No domain rule for role ${role}`);
  return rule;
}

function elevatedRisk(level: RiskLevel): boolean {
  return level === 'D3' || level === 'D4' || level === 'D5';
}

function defaultIdGen(role: ExecutiveRole): string {
  return `ws_${role.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
