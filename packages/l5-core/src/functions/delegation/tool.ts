// M6 — ask_executive tool factory.
// Pure l5-core — no I/O. The `propose` callback is injected by the plugin layer
// (persists the delegation record + pauses the requesting task).

import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';
import {
  DEFAULT_MAX_ROUNDS,
  validateDelegationRequest,
  type DelegationRequest,
} from './index';
import type { AgentRole } from '../../types/orchestration';

export interface AskExecutiveToolOptions {
  /**
   * Plugin-injected: persists the delegation record + marks the requesting task
   * needs_review (blocker=awaiting_delegation:<id>). Returns a ToolResult with
   * data.delegation_opened=true on success.
   */
  propose: (req: DelegationRequest) => Promise<ToolResult>;
}

/**
 * Create the ask_executive tool.
 *
 * An executive calls this when it needs another executive's work before it can
 * finish its own deliverable. The tool-loop detects data.delegation_opened=true
 * and the plugin pauses the run; the CEO orchestration creates the target task
 * and drives the verification loop (see EXECUTIVE_DELEGATION_SPEC.md).
 */
export function createAskExecutiveTool(opts: AskExecutiveToolOptions): ExecutiveTool {
  const { propose } = opts;

  return {
    name: 'ask_executive',
    description:
      '다른 임원에게 작업을 위임합니다(CEO 오케스트레이션 경유). ' +
      '산출물을 내기 전에 다른 역할의 결과물이 필요할 때 사용하세요. ' +
      '인자: to_agent(필수, 예 "CTO"), objective(필수, 위임 목표), ' +
      'acceptance_criteria(필수, 통과 판정 기준 문자열 배열), max_rounds(선택, 1~5, 기본 3).',
    parameters: {
      to_agent: { type: 'string', description: '위임받을 임원 역할 (필수)' },
      objective: { type: 'string', description: '위임 목표 (필수)' },
      acceptance_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: '통과 판정 기준 (필수, 1개 이상)',
      },
      max_rounds: { type: 'number', description: '검증 반복 예산 1~5 (선택, 기본 3)' },
    },
    allowed_roles: 'all',
    permission: 'write',
    async run(args, ctx) {
      if (!ctx?.task_id) {
        return { ok: false, error: 'ask_executive: task_id 컨텍스트가 필요합니다.' };
      }

      const acceptance_criteria =
        Array.isArray(args.acceptance_criteria) &&
        args.acceptance_criteria.every((c: unknown) => typeof c === 'string')
          ? (args.acceptance_criteria as string[]).map((c) => c.trim()).filter(Boolean)
          : [];

      const req: DelegationRequest = {
        from_agent: ctx.role,
        to_agent: args.to_agent as AgentRole,
        origin_task_id: ctx.task_id,
        objective: typeof args.objective === 'string' ? args.objective.trim() : '',
        acceptance_criteria,
        max_rounds:
          typeof args.max_rounds === 'number' ? Math.trunc(args.max_rounds) : DEFAULT_MAX_ROUNDS,
      };

      const v = validateDelegationRequest(req);
      if (!v.ok) {
        return { ok: false, error: `ask_executive: ${v.error}` };
      }

      return propose(req);
    },
  };
}
