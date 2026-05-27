import { executeAgentTask } from '../index';
import type { AgentTask } from '../../../types/orchestration';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-ar-001',
    instruction_id: 'instr-ar-001',
    assigned_agent: 'CMO',
    title: 'Test task for approval routing',
    rationale: 'Approval routing test',
    expected_output: 'Routing result',
    status: 'queued',
    approval_required: false,
    created_at: '2026-05-27T00:00:00Z',
    updated_at: '2026-05-27T00:00:00Z',
    ...overrides,
  };
}

describe('approval routing — D3/D4/D5 auto-routing', () => {
  it('D3 handler result → approval_routing=D3_auto_24h, approval_required=true', () => {
    // CMO produces D3
    const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
    expect(result.risk_level).toBe('D3');
    expect(result.approval_routing).toBe('D3_auto_24h');
    expect(result.approval_required).toBe(true);
  });

  it('D3 task → updated_status forced to needs_review (not blocked)', () => {
    const result = executeAgentTask(makeTask({ assigned_agent: 'CMO' }));
    expect(result.risk_level).toBe('D3');
    expect(result.updated_status).toBe('needs_review');
  });

  it('D4 handler result → approval_routing=D4_manual, approval_required=true', () => {
    // RiskQA: externalSend=true (send/publish matches), hasPii=false → D4
    const result = executeAgentTask(makeTask({
      assigned_agent: 'RiskQA',
      title: 'Send proposal to lead',
      approval_required: false,
      risk_level: 'D4',
    }));
    // RiskQA handler: hasPii=false (no pii/personal data/email/phone keywords), externalSend=true → D4
    expect(result.risk_level).toBe('D4');
    expect(result.approval_routing).toBe('D4_manual');
    expect(result.approval_required).toBe(true);
  });

  it('D5 handler result → approval_routing=D5_double_gate, approval_required=true, blocked=true', () => {
    // CFO scaling task produces D5
    const result = executeAgentTask(makeTask({
      assigned_agent: 'CFO',
      title: 'Scale paid acquisition budget',
    }));
    expect(result.risk_level).toBe('D5');
    expect(result.approval_routing).toBe('D5_double_gate');
    expect(result.approval_required).toBe(true);
    expect(result.blocked).toBe(true);
  });

  it('D5 task → updated_status forced to needs_review', () => {
    const result = executeAgentTask(makeTask({
      assigned_agent: 'CFO',
      title: 'Scale paid acquisition budget',
    }));
    expect(result.risk_level).toBe('D5');
    expect(result.updated_status).toBe('needs_review');
  });

  it('D1 result → approval_routing=null', () => {
    // Unknown agent falls back to D1
    const result = executeAgentTask(makeTask({ assigned_agent: 'Culture' as AgentTask['assigned_agent'] }));
    expect(result.risk_level).toBe('D1');
    expect(result.approval_routing).toBeNull();
  });

  it('D2 result → approval_routing=null', () => {
    // COO typically produces D2
    const result = executeAgentTask(makeTask({ assigned_agent: 'COO' }));
    expect(result.approval_routing).toBeNull();
  });

  it('CFO handler (D5) → D5_double_gate routing applies automatically', () => {
    const result = executeAgentTask(makeTask({
      assigned_agent: 'CFO',
      title: 'Scale paid acquisition budget',
    }));
    expect(result.approval_routing).toBe('D5_double_gate');
    expect(result.approval_required).toBe(true);
    expect(result.blocked).toBe(true);
  });

  it('CPO productization block (D4 or higher) preserves blocked=true', () => {
    const result = executeAgentTask(makeTask({
      assigned_agent: 'CPO',
      title: 'Productize the workflow into a platform',
      expected_output: 'Productization plan',
    }));
    // CPO blocks when PMF evidence is missing — blocked should remain true
    expect(result.blocked).toBe(true);
    expect(result.updated_status).toBe('blocked');
  });
});
