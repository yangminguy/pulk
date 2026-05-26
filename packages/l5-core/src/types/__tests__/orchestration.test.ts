import type {
  FounderInstruction,
  CEOInterpretation,
  AgentTask,
  AgentHandoff,
  AgentRole,
  OrchestrationPhase,
} from '../orchestration';
import type { RiskLevel } from '../entities';

describe('Orchestration type compatibility', () => {
  it('FounderInstruction accepts all valid sources and statuses', () => {
    const instruction: FounderInstruction = {
      id: 'fi-1',
      raw_text: 'Focus on B2B SaaS market this quarter',
      source: 'chat',
      intent: 'market focus shift',
      constraints: ['budget < 500k', 'no hiring'],
      requested_phase: 'market_pmf_diagnosis',
      status: 'new',
      created_at: new Date().toISOString(),
    };
    expect(instruction.id).toBe('fi-1');
    expect(instruction.source).toBe('chat');
    expect(instruction.status).toBe('new');
  });

  it('FounderInstruction works without optional fields', () => {
    const minimal: FounderInstruction = {
      id: 'fi-2',
      raw_text: 'Kill the CRM project',
      source: 'manual',
      status: 'closed',
      created_at: new Date().toISOString(),
    };
    expect(minimal.intent).toBeUndefined();
    expect(minimal.constraints).toBeUndefined();
  });

  it('CEOInterpretation links to instruction and carries risk level', () => {
    const interpretation: CEOInterpretation = {
      id: 'ci-1',
      instruction_id: 'fi-1',
      goal: 'Validate B2B SaaS PMF within 60 days',
      assumptions: ['ICP is mid-market ops teams', 'budget constraint limits paid ads'],
      phase: 'market_pmf_diagnosis',
      success_criteria: ['3 paid pilots', 'NPS > 40'],
      risk_level: 'D2',
      approval_required: false,
      created_at: new Date().toISOString(),
    };
    expect(interpretation.instruction_id).toBe('fi-1');
    expect(interpretation.risk_level).toBe('D2');
    expect(interpretation.phase).toBe('market_pmf_diagnosis');
  });

  it('CEOInterpretation approval_required is boolean', () => {
    const highRisk: CEOInterpretation = {
      id: 'ci-2',
      instruction_id: 'fi-1',
      goal: 'Launch external paid campaign',
      assumptions: [],
      phase: 'execution_system_build',
      success_criteria: ['100 signups'],
      risk_level: 'D4',
      approval_required: true,
      created_at: new Date().toISOString(),
    };
    expect(highRisk.approval_required).toBe(true);
  });

  it('AgentTask accepts all valid agent roles', () => {
    const roles: AgentRole[] = [
      'CEO', 'ChiefOfStaff', 'CMO', 'CRO', 'CPO', 'CTO', 'COO', 'CFO', 'RiskQA', 'Culture',
    ];
    roles.forEach(role => {
      const task: AgentTask = {
        id: `task-${role}`,
        instruction_id: 'fi-1',
        assigned_agent: role,
        title: `${role} task`,
        rationale: 'Needed for execution',
        expected_output: 'Report',
        status: 'queued',
        approval_required: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(task.assigned_agent).toBe(role);
    });
  });

  it('AgentTask tracks blocker and interpretation_id as optional', () => {
    const blocked: AgentTask = {
      id: 'task-1',
      instruction_id: 'fi-1',
      interpretation_id: 'ci-1',
      assigned_agent: 'CMO',
      title: 'Run outbound campaign',
      rationale: 'Drive early pipeline',
      expected_output: '10 qualified leads',
      status: 'blocked',
      approval_required: false,
      blocker: 'Waiting for ICP definition from CPO',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(blocked.status).toBe('blocked');
    expect(blocked.blocker).toBeTruthy();
    expect(blocked.interpretation_id).toBe('ci-1');
  });

  it('AgentHandoff links task and agents with required fields', () => {
    const handoff: AgentHandoff = {
      id: 'hf-1',
      task_id: 'task-1',
      from_agent: 'CMO',
      to_agent: 'CRO',
      context: 'Campaign assets ready, 50 leads generated',
      next_action: 'Begin qualification calls',
      approval_required: false,
      what_was_completed: 'Campaign assets created',
      what_remains_open: 'Lead qualification',
      why_next_agent_needed: 'CRO owns sales workflow',
      must_not_lose: 'Lead list and campaign assets',
      created_at: new Date().toISOString(),
    };
    expect(handoff.from_agent).toBe('CMO');
    expect(handoff.to_agent).toBe('CRO');
    expect(handoff.approval_required).toBe(false);
  });

  it('AgentHandoff works without to_agent and blocker', () => {
    const terminalHandoff: AgentHandoff = {
      id: 'hf-2',
      task_id: 'task-2',
      from_agent: 'CTO',
      context: 'Infrastructure setup complete',
      next_action: 'Founder review required',
      approval_required: true,
      what_was_completed: 'Infrastructure setup complete',
      what_remains_open: 'Founder review',
      why_next_agent_needed: 'Founder approval required for next step',
      must_not_lose: 'Infrastructure configuration details',
      created_at: new Date().toISOString(),
    };
    expect(terminalHandoff.to_agent).toBeUndefined();
    expect(terminalHandoff.blocker).toBeUndefined();
    expect(terminalHandoff.approval_required).toBe(true);
  });

  it('all OrchestrationPhase values are valid strings', () => {
    const phases: OrchestrationPhase[] = [
      'direction_alignment',
      'market_pmf_diagnosis',
      'offer_workflow_redesign',
      'execution_system_build',
      'monitoring_optimization',
    ];
    expect(phases).toHaveLength(5);
    phases.forEach(p => expect(typeof p).toBe('string'));
  });

  it('RiskLevel from entities is compatible with CEOInterpretation', () => {
    const riskLevels: RiskLevel[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
    riskLevels.forEach(risk => {
      const interp: CEOInterpretation = {
        id: `ci-${risk}`,
        instruction_id: 'fi-1',
        goal: 'test',
        assumptions: [],
        phase: 'direction_alignment',
        success_criteria: [],
        risk_level: risk,
        approval_required: risk === 'D4' || risk === 'D5',
        created_at: new Date().toISOString(),
      };
      expect(interp.risk_level).toBe(risk);
    });
  });
});
