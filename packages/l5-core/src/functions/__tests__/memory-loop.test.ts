import { proposeMemoryCandidate } from '../memory-loop';
import { AgentTask } from '../../types/orchestration';

describe('memory-loop', () => {
  const mockTask: AgentTask = {
    id: 't-1',
    instruction_id: 'i-1',
    assigned_agent: 'CEO',
    title: 'Analyze market',
    rationale: 'Needed for PMF',
    expected_output: 'Market analysis report',
    status: 'done',
    approval_required: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it('should create a memory candidate with pending status', () => {
    const memory = proposeMemoryCandidate(mockTask, undefined, { hasPii: false });
    expect(memory.approval_status).toBe('pending');
    expect(memory.contains_pii).toBe(false);
    expect(memory.pii_level).toBe('none');
    expect(memory.source_task_id).toBe('t-1');
  });

  it('should mark high pii level if hasPii is true', () => {
    const memory = proposeMemoryCandidate(mockTask, undefined, { hasPii: true, notes: 'Contains email' });
    expect(memory.contains_pii).toBe(true);
    expect(memory.pii_level).toBe('high');
    expect(memory.pii_notes).toBe('Contains email');
  });
});
