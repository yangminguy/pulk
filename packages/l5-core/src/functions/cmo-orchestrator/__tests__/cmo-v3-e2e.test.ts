import { CmoOrchestrator } from '../orchestrator';
import { createSkillRegistry } from '../skill-registry';
import { createCmoSkillRegistry, createCmoSkills } from '../cmo-skill-registry';
import type { AgentSkill, SkillResult } from '../types';
import type { AgentTask } from '../../../types/orchestration';

/**
 * CMO v3 end-to-end integration test.
 *
 * Verifies the two contracts the orchestrator relies on for the full
 * content-strategy chain (PRD v3 §2 / §7 Phase 1):
 *
 *  1. The default SkillRegistry registers all 8 content-strategy skills and
 *     resolveDependencies(['cmo.factory.handoff']) topo-sorts them into the
 *     keycontent..factory order (each skill appears after every dependency).
 *  2. CmoOrchestrator executes skills in that dependency order, and inserts a
 *     D3+ approval gate instead of running a higher-risk skill.
 */

// The 8 content-strategy chain skill ids (research/positioning roots excluded).
const CHAIN_IDS = [
  'cmo.keycontent.plan',
  'cmo.pulling.plan',
  'cmo.strategy.package',
  'cmo.title.thumbnail',
  'cmo.script.write',
  'cmo.voice.brief',
  'cmo.factory.handoff',
];

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-cmo-v3-e2e-001',
    instruction_id: 'instr-cmo-v3-e2e-001',
    assigned_agent: 'CMO',
    title: '상품에서 키/풀링 콘텐츠 전략 패키지를 만들고 영상 공장으로 핸드오프하라',
    rationale: 'CMO v3 e2e: full content-strategy chain',
    expected_output: 'Approved content strategy package handed off to AI Slide Factory',
    status: 'queued',
    approval_required: false,
    risk_level: 'D2',
    created_at: '2026-06-09T00:00:00Z',
    updated_at: '2026-06-09T00:00:00Z',
    ...overrides,
  };
}

/**
 * Stub skill that records its execution order into `order` when run.
 * Mirrors the real skills' depends_on graph so the orchestrator topo-sorts the
 * same way, but does no domain work (the real chain needs caller-assembled
 * args; here we only assert ordering and the approval gate).
 */
function makeStub(
  skillId: string,
  dependsOn: string[],
  order: string[],
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: skillId,
    skill_id: skillId,
    category: 'content',
    depends_on: dependsOn,
    default_risk: 'D2',
    description: `stub ${skillId}`,
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (): Promise<SkillResult> => {
      order.push(skillId);
      return { ok: true, skill_id: skillId, data: {} };
    },
    ...overrides,
  };
}

// Mirror of the real chain graph (kept in sync with cmo-skill-registry wiring).
const CHAIN_GRAPH: Record<string, string[]> = {
  'cmo.keycontent.plan': [],
  'cmo.pulling.plan': ['cmo.keycontent.plan'],
  'cmo.strategy.package': ['cmo.keycontent.plan', 'cmo.pulling.plan'],
  'cmo.title.thumbnail': ['cmo.strategy.package'],
  'cmo.script.write': ['cmo.strategy.package', 'cmo.title.thumbnail'],
  'cmo.voice.brief': ['cmo.script.write'],
  'cmo.factory.handoff': ['cmo.voice.brief'],
};

function makeStubChainRegistry(order: string[]) {
  return createSkillRegistry(
    CHAIN_IDS.map((id) => makeStub(id, CHAIN_GRAPH[id], order)),
  );
}

describe('CMO v3 e2e — content-strategy chain', () => {
  it('registers all 8 content-strategy skills in the default registry', () => {
    const registry = createCmoSkillRegistry();
    const ids = registry.all().map((s) => s.skill_id);

    // 10 default skills total: 8 content-strategy chain skills + viewtrap +
    // the 2 independent research/positioning roots.
    for (const id of CHAIN_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toContain('cmo.viewtrap.validate');
    expect(createCmoSkills()).toHaveLength(10);
  });

  it('topo-sorts cmo.factory.handoff into keycontent..factory order', () => {
    const registry = createCmoSkillRegistry();
    const plan = registry.resolveDependencies(['cmo.factory.handoff']);

    // Exactly the 7-skill chain (viewtrap/research/positioning are not deps).
    expect(plan).toEqual(CHAIN_IDS);

    // Invariant: every dependency precedes the skill that requires it.
    for (const id of plan) {
      const skill = registry.get(id)!;
      for (const dep of skill.depends_on) {
        expect(plan.indexOf(dep)).toBeLessThan(plan.indexOf(id));
      }
    }

    // First is the root (keycontent), last is the leaf (factory).
    expect(plan[0]).toBe('cmo.keycontent.plan');
    expect(plan[plan.length - 1]).toBe('cmo.factory.handoff');
  });

  it('CmoOrchestrator runs the chain in dependency order', async () => {
    const order: string[] = [];
    const registry = makeStubChainRegistry(order);
    const orchestrator = new CmoOrchestrator({ registry, selection_strategy: 'rule' });

    const result = await orchestrator.execute({ task: makeTask() });

    expect(result.pending_skills).toEqual([]);
    expect(result.handler_result.status).toBe('completed');
    // Actual execution order equals the topo-sorted plan.
    expect(order).toEqual(CHAIN_IDS);
    expect(result.skill_results.map((r) => r.skill_id)).toEqual(CHAIN_IDS);
  });

  it('inserts a D3+ approval gate instead of running a higher-risk chain skill', async () => {
    const order: string[] = [];
    const registry = createSkillRegistry(
      CHAIN_IDS.map((id) =>
        makeStub(
          id,
          CHAIN_GRAPH[id],
          order,
          // Promote the package step to D3 to trip the approval gate.
          id === 'cmo.strategy.package' ? { default_risk: 'D3' } : {},
        ),
      ),
    );
    const orchestrator = new CmoOrchestrator({ registry, selection_strategy: 'rule' });

    const result = await orchestrator.execute({ task: makeTask() });

    expect(result.handler_result.status).toBe('needs_review');
    expect(result.handler_result.approval_required).toBe(true);
    expect(result.handler_result.risk_level).toBe('D3');
    // Pending starts at the gated skill and includes everything downstream.
    expect(result.pending_skills).toEqual([
      'cmo.strategy.package',
      'cmo.title.thumbnail',
      'cmo.script.write',
      'cmo.voice.brief',
      'cmo.factory.handoff',
    ]);
    // Nothing ran: the gate blocks before any skill executes.
    expect(result.skill_results).toEqual([]);
    expect(order).toEqual([]);
  });
});
