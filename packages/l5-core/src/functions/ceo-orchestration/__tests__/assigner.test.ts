import { assignExecutiveTasks } from '../assigner';
import type { Workstream } from '../types';

function makeWs(over: Partial<Workstream> = {}): Workstream {
  return {
    id: 'ws_1',
    instruction_id: 'fi_1',
    interpretation_id: 'interp_1',
    domain: 'CMO',
    title: 'CMO workstream: launch',
    rationale: 'routed to CMO',
    expected_output: 'message variants',
    approval_required: true,
    risk_level: 'D3',
    phase: 'pmf_diagnosis',
    ...over,
  };
}

describe('assignExecutiveTasks', () => {
  it('creates one AgentTask per workstream with queued status', () => {
    const tasks = assignExecutiveTasks([makeWs(), makeWs({ id: 'ws_2', domain: 'CRO' })]);
    expect(tasks).toHaveLength(2);
    expect(tasks.every(t => t.status === 'queued')).toBe(true);
  });

  it('propagates AGENT_PROTOCOL contract fields', () => {
    const [task] = assignExecutiveTasks([makeWs()]);
    expect(task.instruction_id).toBe('fi_1');
    expect(task.interpretation_id).toBe('interp_1');
    expect(task.assigned_agent).toBe('CMO');
    expect(task.rationale).toBe('routed to CMO');
    expect(task.expected_output).toBe('message variants');
    expect(task.approval_required).toBe(true);
    expect(task.risk_level).toBe('D3');
    expect(task.phase).toBe('pmf_diagnosis');
    expect(task.source_ref).toBe('founder_instruction:fi_1');
  });

  it('stamps created_at and updated_at with the same value', () => {
    const fixed = new Date('2026-05-26T12:00:00Z');
    const [task] = assignExecutiveTasks([makeWs()], { now: () => fixed });
    expect(task.created_at).toBe(fixed.toISOString());
    expect(task.updated_at).toBe(fixed.toISOString());
  });

  it('uses custom id generator when supplied', () => {
    let n = 0;
    const tasks = assignExecutiveTasks(
      [makeWs(), makeWs({ id: 'ws_2', domain: 'CRO' })],
      { idGenerator: () => `t_${++n}` }
    );
    expect(tasks.map(t => t.id)).toEqual(['t_1', 't_2']);
  });
});
