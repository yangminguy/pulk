import { executeAgentTask } from '../index';
import type { AgentTask } from '../../../types/orchestration';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-001',
    instruction_id: 'instr-001',
    assigned_agent: 'CMO',
    title: 'Create PMF message experiment plan',
    rationale: 'CEO identified need for PMF message validation',
    expected_output: 'PMF message experiment plan with two positioning variants',
    status: 'queued',
    approval_required: true,
    created_at: '2026-05-26T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...overrides,
  };
}

describe('executeAgentTask', () => {
  describe('task status transitions', () => {
    it('transitions queued task to needs_review for CMO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for CRO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CRO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for CPO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CPO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for CTO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CTO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for COO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'COO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for CFO', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CFO' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('transitions queued task to needs_review for RiskQA', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'RiskQA' }));
      expect(result.updated_status).toBe('needs_review');
    });

    it('blocks unknown agent role', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'Culture' as AgentTask['assigned_agent'] }));
      expect(result.updated_status).toBe('blocked');
    });
  });

  describe('protocol output format', () => {
    it('CMO output includes all required protocol fields', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
      const { output } = result;
      expect(output.current_situation).toBeTruthy();
      expect(output.goal).toBeTruthy();
      expect(output.recommendation).toBeTruthy();
      expect(output.next_owner).toBeTruthy();
      expect(output.action_items.length).toBeGreaterThan(0);
    });

    it('CFO sets approval_required true and next_owner to founder', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CFO' }));
      expect(result.output.approval_required).toBe(true);
      expect(result.output.next_owner).toBe('founder');
    });

    it('RiskQA sets next_owner to ceo', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'RiskQA' }));
      expect(result.output.next_owner).toBe('ceo');
    });

    it('CPO does not require approval for internal draft', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CPO' }));
      expect(result.output.approval_required).toBe(false);
    });

    it('CMO sets risk_level to D3 (external draft requires approval)', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
      expect(result.output.risk_level).toBe('D3');
    });
  });

  describe('handoff generation', () => {
    it('CMO generates a handoff with correct from_agent', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
      expect(result.handoff).toBeDefined();
      expect(result.handoff?.from_agent).toBe('CMO');
    });

    it('handoff includes task_id', () => {
      const task = makeTask({ assigned_agent: 'CRO', id: 'task-cro-001' });
      const result = executeAgentTask(task);
      expect(result.handoff?.task_id).toBe('task-cro-001');
    });

    it('handoff includes what_was_completed and what_remains_open', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CTO' }));
      expect(result.handoff?.what_was_completed).toBeTruthy();
      expect(result.handoff?.what_remains_open).toBeTruthy();
    });

    it('CFO handoff sets approval_required true', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CFO' }));
      expect(result.handoff?.approval_required).toBe(true);
    });
  });

  describe('output validation', () => {
    it('returns no validation errors for well-formed CMO output', () => {
      const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
      expect(result.validation_errors).toHaveLength(0);
    });

    it('returns task_id in result', () => {
      const task = makeTask({ id: 'task-validation-001' });
      const result = executeAgentTask(task);
      expect(result.task_id).toBe('task-validation-001');
    });
  });
});
