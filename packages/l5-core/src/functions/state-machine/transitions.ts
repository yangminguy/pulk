export type TransitionResult =
  | { valid: true; reason: string }
  | { valid: false; reason: string };

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'needs_review'
  | 'done'
  | 'killed';

export type FounderInstructionStatus =
  | 'new'
  | 'interpreted'
  | 'in_progress'
  | 'needs_clarification'
  | 'synthesized'
  | 'closed';

export type ToolRequestStatus =
  | 'candidate'
  | 'proposed'
  | 'approved'
  | 'in_development'
  | 'deployed'
  | 'rejected';

export type BusinessIdeaStatus =
  | 'idea'
  | 'scoring'
  | 'pmf_experiment'
  | 'killed'
  | 'converted_to_business';

export function createTransitionValidator<const T extends Record<string, readonly string[]>>(
  transitions: T
): (from: keyof T & string, to: keyof T & string) => TransitionResult {
  const transitionMap = transitions as Record<string, readonly string[]>;

  return (from, to) => {
    if (transitionMap[from]?.includes(to)) {
      return { valid: true, reason: 'Transition is valid' };
    }

    return { valid: false, reason: `Invalid transition: ${from} -> ${to}` };
  };
}

export const AGENT_TASK_TRANSITIONS = {
  queued: ['running', 'killed'],
  running: ['done', 'needs_review', 'blocked', 'killed'],
  blocked: ['queued', 'killed'],
  needs_review: ['queued', 'done', 'killed'],
  done: [],
  killed: [],
} as const satisfies Record<AgentTaskStatus, readonly AgentTaskStatus[]>;

export const FOUNDER_INSTRUCTION_TRANSITIONS = {
  new: ['interpreted', 'needs_clarification'],
  needs_clarification: ['interpreted'],
  interpreted: ['in_progress'],
  in_progress: ['synthesized', 'closed'],
  synthesized: [],
  closed: [],
} as const satisfies Record<FounderInstructionStatus, readonly FounderInstructionStatus[]>;

export const TOOL_REQUEST_TRANSITIONS = {
  candidate: ['proposed'],
  proposed: ['approved', 'rejected'],
  approved: ['in_development'],
  in_development: ['deployed', 'rejected'],
  deployed: [],
  rejected: ['candidate'],
} as const satisfies Record<ToolRequestStatus, readonly ToolRequestStatus[]>;

export const BUSINESS_IDEA_TRANSITIONS = {
  idea: ['scoring'],
  scoring: ['pmf_experiment', 'killed'],
  pmf_experiment: ['converted_to_business', 'killed'],
  killed: [],
  converted_to_business: [],
} as const satisfies Record<BusinessIdeaStatus, readonly BusinessIdeaStatus[]>;

export const validateAgentTaskTransition = createTransitionValidator(AGENT_TASK_TRANSITIONS);

export const validateFounderInstructionTransition =
  createTransitionValidator(FOUNDER_INSTRUCTION_TRANSITIONS);

export const validateToolRequestTransition = createTransitionValidator(TOOL_REQUEST_TRANSITIONS);

export const validateBusinessIdeaTransition = createTransitionValidator(BUSINESS_IDEA_TRANSITIONS);
