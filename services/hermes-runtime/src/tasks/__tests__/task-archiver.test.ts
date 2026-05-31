import { runTaskArchiver } from '../task-archiver.js';
import type { AgentTask } from '@l5/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function makeTask(overrides: Partial<AgentTask>): AgentTask {
  const now = Date.now();
  return {
    id: 'task-' + Math.random().toString(36).slice(2),
    assigned_agent: 'CTO',
    title: 'sample task',
    rationale: 'because',
    status: 'done',
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    ...overrides,
  } as AgentTask;
}

function makeSink() {
  const archived: AgentTask[] = [];
  const deleted: string[] = [];
  return {
    archived,
    deleted,
    archiveTask: async (t: AgentTask) => {
      archived.push(t);
    },
    deleteTask: async (id: string) => {
      deleted.push(id);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runTaskArchiver', () => {
  it('archives done/killed tasks older than 7 days', async () => {
    const old = new Date(Date.now() - EIGHT_DAYS_MS).toISOString();
    const tasks = [
      makeTask({ id: 'a', status: 'done', updated_at: old }),
      makeTask({ id: 'b', status: 'killed', updated_at: old }),
    ];
    const sink = makeSink();

    const result = await runTaskArchiver(tasks, sink.archiveTask, sink.deleteTask);

    expect(result.archived_count).toBe(2);
    expect(result.deleted_task_ids.sort()).toEqual(['a', 'b']);
    expect(sink.deleted.sort()).toEqual(['a', 'b']);
    expect(result.archived_at).toBeTruthy();
  });

  it('skips tasks updated within the last 7 days', async () => {
    const recent = new Date(Date.now() - ONE_DAY_MS).toISOString();
    const tasks = [makeTask({ id: 'fresh', status: 'done', updated_at: recent })];
    const sink = makeSink();

    const result = await runTaskArchiver(tasks, sink.archiveTask, sink.deleteTask);

    expect(result.archived_count).toBe(0);
    expect(sink.deleted).toEqual([]);
  });

  it('skips tasks whose status is not done/killed even if old', async () => {
    const old = new Date(Date.now() - EIGHT_DAYS_MS).toISOString();
    const tasks = [
      makeTask({ id: 'q', status: 'queued', updated_at: old }),
      makeTask({ id: 'r', status: 'running', updated_at: old }),
      makeTask({ id: 'n', status: 'needs_review', updated_at: old }),
      makeTask({ id: 'bk', status: 'blocked', updated_at: old }),
    ];
    const sink = makeSink();

    const result = await runTaskArchiver(tasks, sink.archiveTask, sink.deleteTask);

    expect(result.archived_count).toBe(0);
    expect(sink.archived).toEqual([]);
  });

  it('falls back to created_at when updated_at is missing', async () => {
    const old = new Date(Date.now() - EIGHT_DAYS_MS).toISOString();
    const tasks = [
      makeTask({ id: 'c', status: 'done', updated_at: undefined as unknown as string, created_at: old }),
    ];
    const sink = makeSink();

    const result = await runTaskArchiver(tasks, sink.archiveTask, sink.deleteTask);

    expect(result.archived_count).toBe(1);
    expect(sink.deleted).toEqual(['c']);
  });

  it('does not delete a task when archiving it throws, and continues with the rest', async () => {
    const old = new Date(Date.now() - EIGHT_DAYS_MS).toISOString();
    const tasks = [
      makeTask({ id: 'boom', status: 'done', updated_at: old }),
      makeTask({ id: 'ok', status: 'done', updated_at: old }),
    ];
    const deleted: string[] = [];
    const archiveTask = async (t: AgentTask) => {
      if (t.id === 'boom') throw new Error('archive failed');
    };
    const deleteTask = async (id: string) => {
      deleted.push(id);
    };

    const result = await runTaskArchiver(tasks, archiveTask, deleteTask);

    expect(result.archived_count).toBe(1);
    expect(result.deleted_task_ids).toEqual(['ok']);
    expect(deleted).toEqual(['ok']);
  });
});
