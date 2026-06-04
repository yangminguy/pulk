import {
  AGENT_TASK_TRANSITIONS,
  BUSINESS_IDEA_TRANSITIONS,
  FOUNDER_INSTRUCTION_TRANSITIONS,
  TOOL_REQUEST_TRANSITIONS,
  createTransitionValidator,
  validateAgentTaskTransition,
  validateBusinessIdeaTransition,
  validateFounderInstructionTransition,
  validateToolRequestTransition,
} from '../transitions';

const countEdges = <T extends string>(transitions: Record<T, readonly T[]>): number =>
  Object.values(transitions).flat().length;

describe('state-machine transition lookup tables', () => {
  it('defines the spec edge counts for each entity', () => {
    expect(countEdges(AGENT_TASK_TRANSITIONS)).toBe(11);
    expect(countEdges(FOUNDER_INSTRUCTION_TRANSITIONS)).toBe(6);
    expect(countEdges(TOOL_REQUEST_TRANSITIONS)).toBe(7);
    expect(countEdges(BUSINESS_IDEA_TRANSITIONS)).toBe(5);
  });
});

describe('createTransitionValidator', () => {
  const validate = createTransitionValidator({
    draft: ['active'],
    active: ['completed', 'paused'],
    paused: ['active'],
    completed: [],
  } as const);

  it('accepts transitions declared in a lookup table', () => {
    expect(validate('draft', 'active')).toEqual({ valid: true, reason: 'Transition is valid' });
    expect(validate('active', 'paused')).toEqual({ valid: true, reason: 'Transition is valid' });
  });

  it('rejects transitions missing from a lookup table', () => {
    expect(validate('completed', 'active')).toEqual({
      valid: false,
      reason: 'Invalid transition: completed -> active',
    });
  });
});

describe('entity transition validators', () => {
  it('validates AgentTask transitions', () => {
    expect(validateAgentTaskTransition('queued', 'running').valid).toBe(true);
    expect(validateAgentTaskTransition('running', 'done').valid).toBe(true);
    expect(validateAgentTaskTransition('done', 'running')).toEqual({
      valid: false,
      reason: 'Invalid transition: done -> running',
    });
  });

  it('validates FounderInstruction transitions', () => {
    expect(validateFounderInstructionTransition('new', 'interpreted').valid).toBe(true);
    expect(validateFounderInstructionTransition('in_progress', 'closed').valid).toBe(true);
    expect(validateFounderInstructionTransition('closed', 'in_progress')).toEqual({
      valid: false,
      reason: 'Invalid transition: closed -> in_progress',
    });
  });

  it('validates ToolRequest transitions', () => {
    expect(validateToolRequestTransition('candidate', 'proposed').valid).toBe(true);
    expect(validateToolRequestTransition('in_development', 'deployed').valid).toBe(true);
    expect(validateToolRequestTransition('deployed', 'in_development')).toEqual({
      valid: false,
      reason: 'Invalid transition: deployed -> in_development',
    });
  });

  it('validates BusinessIdea transitions', () => {
    expect(validateBusinessIdeaTransition('idea', 'scoring').valid).toBe(true);
    expect(validateBusinessIdeaTransition('pmf_experiment', 'converted_to_business').valid).toBe(true);
    expect(validateBusinessIdeaTransition('converted_to_business', 'pmf_experiment')).toEqual({
      valid: false,
      reason: 'Invalid transition: converted_to_business -> pmf_experiment',
    });
  });
});
