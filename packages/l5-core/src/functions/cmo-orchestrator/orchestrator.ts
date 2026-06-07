import type { RiskLevel } from '../../types/entities';
import type { AgentTask } from '../../types/orchestration';
import type { HandlerResult } from '../executive-runtime/protocol';
import { buildHandoff } from '../executive-runtime/protocol';
import type { SkillRegistry } from './skill-registry';
import type { SkillResult } from './types';

export interface OrchestratorConfig {
  registry: SkillRegistry;
  selection_strategy: 'rule' | 'llm';
}

export interface OrchestratorInput {
  task: AgentTask;
  context?: Record<string, unknown>;
}

export interface OrchestratorResult {
  skill_results: SkillResult[];
  handler_result: HandlerResult;
  pending_skills: string[];
}

const RISK_ORDER: RiskLevel[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

function needsApproval(risk: RiskLevel): boolean {
  return RISK_ORDER.indexOf(risk) >= RISK_ORDER.indexOf('D3');
}

export class CmoOrchestrator {
  constructor(private readonly config: OrchestratorConfig) {}

  async execute(input: OrchestratorInput): Promise<OrchestratorResult> {
    const selectedSkillIds = this.selectSkills(input.task);
    const executionPlan = this.config.registry.resolveDependencies(selectedSkillIds);
    const pendingSkill = executionPlan.find((skillId) => {
      const skill = this.config.registry.get(skillId);
      return skill ? needsApproval(skill.default_risk) : false;
    });

    if (pendingSkill) {
      const pending = executionPlan.slice(executionPlan.indexOf(pendingSkill));
      const risk = this.config.registry.get(pendingSkill)?.default_risk ?? 'D3';

      return {
        skill_results: [],
        pending_skills: pending,
        handler_result: this.buildApprovalGate(input.task, risk),
      };
    }

    const priorResults = new Map<string, SkillResult>();
    const skillResults: SkillResult[] = [];

    for (const skillId of executionPlan) {
      const skill = this.config.registry.get(skillId);
      if (!skill) {
        throw new Error(`Unknown skill: ${skillId}`);
      }

      const result = await skill.run(
        { task: input.task, context: input.context },
        {
          role: 'CMO',
          task_id: input.task.id,
          prior_results: priorResults,
        } as never,
      ) as SkillResult;

      priorResults.set(skillId, result);
      skillResults.push(result);
    }

    return {
      skill_results: skillResults,
      pending_skills: [],
      handler_result: this.buildCompletedResult(input.task, skillResults),
    };
  }

  private selectSkills(task: AgentTask): string[] {
    const text = `${task.title} ${task.expected_output}`.toLowerCase();

    if (text.includes('position') || text.includes('message') || text.includes('pmf') || text.includes('메시지')) {
      return this.config.registry.byCategory('positioning').map((skill) => skill.skill_id);
    }

    if (text.includes('research') || text.includes('market') || text.includes('조사')) {
      return this.config.registry.byCategory('research').map((skill) => skill.skill_id);
    }

    return this.config.registry.all().map((skill) => skill.skill_id);
  }

  private buildCompletedResult(task: AgentTask, skillResults: SkillResult[]): HandlerResult {
    const output = {
      current_situation: `CMO orchestrator completed ${skillResults.length} skill(s) for: ${task.title}`,
      source_instruction: task.rationale,
      goal: task.expected_output,
      why_now: 'CMO task is ready for skill-based execution.',
      bottleneck: 'No active blocker.',
      root_cause: 'The required CMO skills were available and below approval threshold.',
      options: skillResults.map((result) => result.skill_id),
      recommendation: 'Send the synthesized CMO output to CEO for review.',
      action_items: ['Review market research and positioning outputs', 'Decide next CMO execution step'],
      next_owner: 'CEO',
      required_tools: [],
      approval_required: false,
      insight_to_record: skillResults.map((result) => result.insight).filter(Boolean).join(' '),
      workflow_improvement_suggestion: 'Keep CMO skill outputs attached to the originating task.',
      confidence_level: 'medium',
      risk_level: task.risk_level ?? 'D2',
    } as HandlerResult['output'];

    return {
      status: 'completed',
      created_tasks: [],
      approval_required: false,
      blocked: false,
      reason: 'CMO orchestrator completed selected skills.',
      risk_level: task.risk_level ?? 'D2',
      source_ref: task.source_ref,
      output,
      updated_status: 'done',
      handoff: buildHandoff(task, output, {
        what_was_completed: 'CMO skill chain executed successfully.',
        what_remains_open: 'CEO review of synthesized positioning output.',
        why_next_agent_needed: 'CEO owns prioritization and approval of the next business action.',
        must_not_lose: 'Executed skill ids and generated insights.',
      }),
    };
  }

  private buildApprovalGate(task: AgentTask, risk: RiskLevel): HandlerResult {
    const output = {
      current_situation: `CMO skill execution paused for approval: ${task.title}`,
      source_instruction: task.rationale,
      goal: task.expected_output,
      why_now: 'A selected CMO skill meets the D3+ approval threshold.',
      bottleneck: 'Awaiting CEO approval before running higher-risk CMO skill.',
      root_cause: 'CMO orchestrator blocks D3+ skill execution by policy.',
      options: ['Approve skill execution', 'Revise task scope to lower risk'],
      recommendation: 'Request CEO approval before continuing.',
      action_items: ['Review pending CMO skill approval request'],
      next_owner: 'CEO',
      required_tools: [],
      approval_required: true,
      insight_to_record: 'CMO orchestrator inserted approval gate for D3+ skill.',
      workflow_improvement_suggestion: 'Surface skill-level risk before execution starts.',
      confidence_level: 'high',
      risk_level: risk,
    } as HandlerResult['output'];

    return {
      status: 'needs_review',
      created_tasks: [],
      approval_required: true,
      blocked: false,
      reason: 'D3+ CMO skill requires approval before execution.',
      risk_level: risk,
      source_ref: task.source_ref,
      output,
      updated_status: 'needs_review',
      handoff: buildHandoff(task, output, {
        what_was_completed: 'CMO skill approval gate created.',
        what_remains_open: 'Approval decision for pending CMO skill execution.',
        why_next_agent_needed: 'CEO must approve D3+ CMO execution.',
        must_not_lose: 'Pending skill risk level and task context.',
      }),
    };
  }
}
