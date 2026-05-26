import type { AgentTask, Workstream } from './types';

export interface AssignOptions {
  now?: () => Date;
  idGenerator?: () => string;
}

export function assignExecutiveTasks(
  workstreams: Workstream[],
  opts: AssignOptions = {}
): AgentTask[] {
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const idGen = opts.idGenerator ?? defaultId;

  return workstreams.map(ws => ({
    id: idGen(),
    instruction_id: ws.instruction_id,
    interpretation_id: ws.interpretation_id,
    assigned_agent: ws.domain,
    title: ws.title,
    rationale: ws.rationale,
    expected_output: ws.expected_output,
    status: 'queued' as const,
    approval_required: ws.approval_required,
    created_at: now,
    updated_at: now,
  }));
}

function defaultId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
