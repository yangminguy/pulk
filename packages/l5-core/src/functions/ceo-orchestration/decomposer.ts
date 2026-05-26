import type { RiskLevel } from '../../types/entities';
import type {
  CEOInterpretation,
  ExecutiveRole,
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
}

export function decomposeIntoWorkstreams(
  interpretation: CEOInterpretation,
  opts: DecomposeOptions = {}
): Workstream[] {
  const haystack = [
    interpretation.goal,
    ...interpretation.assumptions,
    ...interpretation.success_criteria,
  ].join(' ');

  const matched = DOMAIN_RULES.filter(rule => rule.keywords.test(haystack));
  const rules = matched.length > 0 ? matched : [findRule(opts.fallback_role ?? 'CPO')];

  const idGen = opts.idGenerator ?? defaultIdGen;

  return rules.map(rule => buildWorkstream(rule, interpretation, idGen(rule.role)));
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
