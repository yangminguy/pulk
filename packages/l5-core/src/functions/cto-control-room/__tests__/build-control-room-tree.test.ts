import {
  buildControlRoomTree,
  BuildControlRoomArgs,
  ControlRoomTaskInput,
  AcrExecTask,
} from '../build-control-room-tree';

function task(over: Partial<ControlRoomTaskInput>): ControlRoomTaskInput {
  return {
    id: 't1',
    title: 'dev task',
    assigned_agent: 'CTO',
    status: 'running',
    risk_level: 'D2',
    phase: 'build',
    blocker: null,
    business_id: 'b1',
    project_id: 'p1',
    approval_required: false,
    updated_at: '2026-06-02T00:00:00.000Z',
    ...over,
  };
}

const baseArgs = (): BuildControlRoomArgs => ({
  businesses: [{ id: 'b1', name: 'Biz One' }],
  projects: [{ id: 'p1', business_id: 'b1', name: 'Proj One', status: 'active' }],
  ctoTasks: [],
  acrByTaskId: {},
});

describe('buildControlRoomTree', () => {
  it('groups tasks under business and project', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' }), task({ id: 't2' })];
    const tree = buildControlRoomTree(args);
    expect(tree).toHaveLength(1);
    expect(tree[0].business_name).toBe('Biz One');
    expect(tree[0].projects).toHaveLength(1);
    expect(tree[0].projects[0].project_name).toBe('Proj One');
    expect(tree[0].projects[0].dev_tasks.map((t) => t.task_id)).toEqual(['t1', 't2']);
  });

  it('places null project_id under (프로젝트 없음)', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1', project_id: null })];
    const tree = buildControlRoomTree(args);
    expect(tree[0].projects[0].project_id).toBeNull();
    expect(tree[0].projects[0].project_name).toBe('(프로젝트 없음)');
  });

  it('places null business_id under top-level (공통)', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1', business_id: null, project_id: null })];
    const tree = buildControlRoomTree(args);
    expect(tree[0].business_id).toBeNull();
    expect(tree[0].business_name).toBe('(공통)');
  });

  it('merges ACR exec fields when present', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' })];
    const acr: AcrExecTask = {
      acr_task_id: 't1',
      branch: 'task-t1-ws-abc',
      phase_index: 3,
      phase_total: 8,
      workspace_status: 'running',
      plan_status: 'running',
      changed_files: 4,
      log_tail: 'last lines',
    };
    args.acrByTaskId = { t1: acr };
    const dt = buildControlRoomTree(args)[0].projects[0].dev_tasks[0];
    expect(dt.branch).toBe('task-t1-ws-abc');
    expect(dt.phase_label).toBe('3 / 8');
    expect(dt.exec_status).toBe('running');
    expect(dt.changed_files).toBe(4);
    expect(dt.log_tail).toBe('last lines');
  });

  it('echoes CTO Harness complexity when ACR reports it; null otherwise', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' }), task({ id: 't2', project_id: 'p1', business_id: 'b1' })];
    args.acrByTaskId = { t1: { acr_task_id: 't1', complexity: 'C3' } };
    const tasks = buildControlRoomTree(args)[0].projects[0].dev_tasks;
    const dt1 = tasks.find((d) => d.task_id === 't1')!;
    const dt2 = tasks.find((d) => d.task_id === 't2')!;
    expect(dt1.complexity).toBe('C3');
    expect(dt2.complexity).toBeNull(); // ACR record absent → degraded
  });

  it('merges measured token usage + cost when ACR reports it', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' })];
    args.acrByTaskId = {
      t1: { acr_task_id: 't1', total_tokens: 42000, estimated_cost_usd: 0.31 },
    };
    const dt = buildControlRoomTree(args)[0].projects[0].dev_tasks[0];
    expect(dt.actual_total_tokens).toBe(42000);
    expect(dt.actual_cost_usd).toBe(0.31);
    // estimate is still present alongside the actual
    expect(dt.est_tokens_low).toBeGreaterThan(0);
  });

  it('leaves actual tokens null when ACR omits them', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' })];
    args.acrByTaskId = { t1: { acr_task_id: 't1', branch: 'b' } };
    const dt = buildControlRoomTree(args)[0].projects[0].dev_tasks[0];
    expect(dt.actual_total_tokens).toBeNull();
    expect(dt.actual_cost_usd).toBeNull();
  });

  it('leaves ACR fields null and keeps task when ACR absent (degraded)', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1', status: 'blocked', blocker: 'merge_conflict' })];
    const dt = buildControlRoomTree(args)[0].projects[0].dev_tasks[0];
    expect(dt.branch).toBeNull();
    expect(dt.phase_label).toBeNull();
    expect(dt.exec_status).toBeNull();
    expect(dt.l5_status).toBe('blocked');
    expect(dt.blocker).toBe('merge_conflict');
  });

  it('falls back to plan_status when workspace_status missing', () => {
    const args = baseArgs();
    args.ctoTasks = [task({ id: 't1' })];
    args.acrByTaskId = {
      t1: { acr_task_id: 't1', plan_status: 'planned', phase_index: null, phase_total: null },
    };
    const dt = buildControlRoomTree(args)[0].projects[0].dev_tasks[0];
    expect(dt.exec_status).toBe('planned');
    expect(dt.phase_label).toBeNull();
  });

  it('handles multiple businesses', () => {
    const args = baseArgs();
    args.businesses.push({ id: 'b2', name: 'Biz Two' });
    args.ctoTasks = [task({ id: 't1', business_id: 'b1' }), task({ id: 't2', business_id: 'b2', project_id: null })];
    const tree = buildControlRoomTree(args);
    expect(tree.map((b) => b.business_name)).toEqual(['Biz One', 'Biz Two']);
  });
});
