import { CmoOrchestrator } from '../orchestrator';
import { createSkillRegistry } from '../skill-registry';
import { createMarketResearchSkill } from '../skills/market-research';
import { createPositioningMessageSkill } from '../skills/positioning-message';
import type { AgentTask } from '../../../types/orchestration';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-cmo-orch-001',
    instruction_id: 'instr-cmo-orch-001',
    assigned_agent: 'CMO',
    title: '시장 조사 기반 PMF 메시지 변형을 만들어라',
    rationale: 'Phase 1 CMO orchestrator red test',
    expected_output: 'Market research pack and positioning message variants',
    status: 'queued',
    approval_required: false,
    risk_level: 'D2',
    created_at: '2026-06-07T00:00:00Z',
    updated_at: '2026-06-07T00:00:00Z',
    ...overrides,
  };
}

describe('CmoOrchestrator', () => {
  it('runs the Phase 1 PoC skills in dependency order and returns an OrchestratorResult', async () => {
    const registry = createSkillRegistry([
      createPositioningMessageSkill(),
      createMarketResearchSkill(),
    ]);
    const orchestrator = new CmoOrchestrator({
      registry,
      selection_strategy: 'rule',
    });

    const result = await orchestrator.execute({
      task: makeTask(),
      context: { business_title: 'L5 Business OS' },
    });

    expect(result.pending_skills).toEqual([]);
    expect(result.skill_results.map((skillResult) => skillResult.skill_id)).toEqual([
      'cmo.research.market',
      'cmo.positioning.message',
    ]);
    expect(result.handler_result.status).toBe('completed');
    expect(result.handler_result.updated_status).toBe('done');
    expect(result.handler_result.output.next_owner).toBe('CEO');
  });

  it('inserts an approval gate instead of running D3+ skills', async () => {
    const marketResearchSkill = createMarketResearchSkill({
      default_risk: 'D3',
    });
    const registry = createSkillRegistry([marketResearchSkill]);
    const orchestrator = new CmoOrchestrator({
      registry,
      selection_strategy: 'rule',
    });

    const result = await orchestrator.execute({
      task: makeTask({
        title: '시장 조사를 실행하라',
        expected_output: 'Market research pack',
      }),
    });

    expect(result.skill_results).toEqual([]);
    expect(result.pending_skills).toEqual(['cmo.research.market']);
    expect(result.handler_result.status).toBe('needs_review');
    expect(result.handler_result.approval_required).toBe(true);
    expect(result.handler_result.risk_level).toBe('D3');
  });
});
