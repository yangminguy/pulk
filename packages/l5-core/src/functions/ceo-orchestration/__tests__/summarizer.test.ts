import { summarizeAgentStatus } from '../summarizer';
import type { AgentTask } from '../types';

function task(over: Partial<AgentTask>): AgentTask {
  return {
    id: 't1',
    instruction_id: 'fi_1',
    interpretation_id: 'interp_1',
    assigned_agent: 'CMO',
    title: 't',
    rationale: 'r',
    expected_output: 'o',
    status: 'queued',
    approval_required: false,
    created_at: '2026-05-26T00:00:00Z',
    updated_at: '2026-05-26T00:00:00Z',
    ...over,
  };
}

describe('summarizeAgentStatus', () => {
  it('counts tasks by status and agent', () => {
    const sum = summarizeAgentStatus({
      tasks: [
        task({ id: 'a', status: 'running', assigned_agent: 'CMO' }),
        task({ id: 'b', status: 'running', assigned_agent: 'CRO' }),
        task({ id: 'c', status: 'done', assigned_agent: 'CMO' }),
      ],
    });
    expect(sum.total_tasks).toBe(3);
    expect(sum.by_status.running).toBe(2);
    expect(sum.by_status.done).toBe(1);
    expect(sum.by_agent.CMO).toBe(2);
    expect(sum.by_agent.CRO).toBe(1);
  });

  it('counts pending approvals (queued/needs_review with approval_required)', () => {
    const sum = summarizeAgentStatus({
      tasks: [
        task({ id: 'a', approval_required: true, status: 'queued' }),
        task({ id: 'b', approval_required: true, status: 'needs_review' }),
        task({ id: 'c', approval_required: true, status: 'done' }),
        task({ id: 'd', approval_required: false, status: 'queued' }),
      ],
    });
    expect(sum.pending_approvals).toBe(2);
  });

  it('collects blockers with reason from blocker field', () => {
    const sum = summarizeAgentStatus({
      tasks: [task({ id: 'b1', status: 'blocked', blocker: 'awaiting data' })],
    });
    expect(sum.blockers).toEqual([{ task_id: 'b1', reason: 'awaiting data' }]);
  });

  it('uses fallback reason for blockers without blocker text', () => {
    const sum = summarizeAgentStatus({
      tasks: [task({ id: 'b1', status: 'blocked' })],
    });
    expect(sum.blockers[0].reason).toBe('no reason recorded');
  });

  it('renders a Founder-facing brief string', () => {
    const sum = summarizeAgentStatus({
      tasks: [
        task({ status: 'running', assigned_agent: 'CMO' }),
        task({ id: 't2', status: 'queued', assigned_agent: 'CRO', approval_required: true }),
      ],
    });
    expect(sum.brief).toMatch(/Running 1/);
    expect(sum.brief).toMatch(/CMO:1/);
    expect(sum.brief).toMatch(/1 approval/);
  });

  it('ignores non-executive roles like CEO in by_agent counts', () => {
    const sum = summarizeAgentStatus({
      tasks: [task({ assigned_agent: 'CEO' as any })],
    });
    expect(sum.by_agent.CMO).toBe(0);
    expect(sum.total_tasks).toBe(1);
  });
});
