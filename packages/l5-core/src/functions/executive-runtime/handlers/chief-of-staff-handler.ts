import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';

export function chiefOfStaffHandler(input: HandlerInput): HandlerResult {
  const { task } = input;
  const ctx = (input.context ?? {}) as {
    currentTasks?: { task_id: string; title: string; assigned_agent: string }[];
    blockedTasks?: { task_id: string; title: string; assigned_agent: string; blocker?: string }[];
    approvalQueue?: { task_id: string; title: string; assigned_agent: string; risk_level?: string }[];
  };

  const currentTasks = ctx.currentTasks ?? [];
  const blockedTasks = ctx.blockedTasks ?? [];
  const approvalQueue = ctx.approvalQueue ?? [];

  const recommendations: string[] = [];
  if (blockedTasks.length > 0) recommendations.push('CEO 검토 필요: blocked task 존재');
  if (approvalQueue.length > 0) recommendations.push('Founder 승인 대기 항목 처리 필요');

  const briefSummary =
    `Daily Brief — active: ${currentTasks.length}, blocked: ${blockedTasks.length}, ` +
    `approval_pending: ${approvalQueue.length}. ` +
    (recommendations.length > 0 ? recommendations.join('; ') : '특이사항 없음');

  const output = {
    current_situation: `ChiefOfStaff task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Aggregate agent task status and generate daily operating brief for CEO and Founder',
    why_now: 'Daily operating cadence requires consolidated status before CEO morning review',
    bottleneck: blockedTasks.length > 0 ? `${blockedTasks.length}개 blocked task 해결 필요` : '',
    root_cause: blockedTasks.length > 0 ? 'Agent execution blocked — CEO intervention required' : '',
    options: [
      'CEO가 blocked task를 직접 검토하고 해제',
      'Founder가 approval queue 항목을 처리',
      '현 상태 유지 및 다음 daily brief 대기',
    ],
    recommendation:
      recommendations.length > 0
        ? recommendations.join('; ')
        : '현재 정상 운영 중. 특별한 조치 불필요',
    action_items: [
      `Active tasks: ${currentTasks.length}개`,
      `Blocked tasks: ${blockedTasks.length}개`,
      `Approval pending: ${approvalQueue.length}개`,
      ...recommendations,
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: briefSummary,
    workflow_improvement_suggestion: 'ChiefOfStaff brief를 Hermes daily-brief-generator와 연동하여 자동 생성',
    confidence_level: 'high' as const,
    risk_level: 'D1' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: `Daily brief 생성 완료 — active ${currentTasks.length}, blocked ${blockedTasks.length}, approval ${approvalQueue.length}`,
    what_remains_open: approvalQueue.length > 0 ? 'Founder approval queue 항목 처리' : '',
    why_next_agent_needed: 'CEO가 brief를 검토하고 blocked/approval 항목에 대해 결정',
    must_not_lose: briefSummary,
  });

  return {
    status: 'completed',
    created_tasks: [],
    approval_required: false,
    blocked: false,
    reason: 'Daily brief aggregation is read-only. No approval required.',
    risk_level: 'D1',
    source_ref: task.source_ref,
    output,
    updated_status: 'done',
    handoff,
  };
}
