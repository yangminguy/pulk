import type {
  AgentHandoff,
  AgentTask,
  CompanyStatusSummary,
  ExecutiveRole,
} from './types';

type TaskStatus = AgentTask['status'];

const ALL_STATUSES: TaskStatus[] = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
const ALL_ROLES: ExecutiveRole[] = ['CMO', 'CRO', 'CPO', 'CTO', 'COO', 'CFO', 'RiskQA'];

export interface SummarizeInput {
  tasks: AgentTask[];
  handoffs?: AgentHandoff[];
  now?: () => Date;
}

export function summarizeAgentStatus(input: SummarizeInput): CompanyStatusSummary {
  const { tasks, handoffs = [] } = input;
  const now = (input.now ?? (() => new Date()))().toISOString();

  const by_status = emptyCounts(ALL_STATUSES);
  const by_agent = emptyCounts(ALL_ROLES);

  for (const t of tasks) {
    by_status[t.status]++;
    if ((ALL_ROLES as string[]).includes(t.assigned_agent)) {
      by_agent[t.assigned_agent as ExecutiveRole]++;
    }
  }

  const pending_approvals = tasks.filter(
    t => t.approval_required && (t.status === 'queued' || t.status === 'needs_review')
  ).length;

  const blockers = tasks
    .filter(t => t.status === 'blocked')
    .map(t => ({ task_id: t.id, reason: t.blocker ?? 'no reason recorded' }));

  const brief = renderBrief({ by_status, by_agent, pending_approvals, blockers, handoffs });

  return {
    generated_at: now,
    total_tasks: tasks.length,
    by_status,
    by_agent,
    pending_approvals,
    blockers,
    brief,
  };
}

function emptyCounts<K extends string>(keys: K[]): Record<K, number> {
  return keys.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<K, number>);
}

function renderBrief(args: {
  by_status: Record<TaskStatus, number>;
  by_agent: Record<ExecutiveRole, number>;
  pending_approvals: number;
  blockers: Array<{ task_id: string; reason: string }>;
  handoffs: AgentHandoff[];
}): string {
  const activeAgents = Object.entries(args.by_agent)
    .filter(([, n]) => n > 0)
    .map(([role, n]) => `${role}:${n}`)
    .join(', ') || 'none';

  return [
    `Running ${args.by_status.running} task(s), ${args.by_status.queued} queued.`,
    `Active executives: ${activeAgents}.`,
    `${args.pending_approvals} approval(s) waiting on Founder.`,
    `${args.blockers.length} blocker(s).`,
    `${args.handoffs.length} handoff(s) in flight.`,
  ].join(' ');
}
