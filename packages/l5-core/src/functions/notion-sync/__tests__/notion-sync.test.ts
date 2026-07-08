import {
  mapTaskToProperties,
  mapTaskToUpdateProperties,
  mapPageToStatusUpdate,
  readPulkTaskId,
  statusToNotionLabel,
  notionLabelToStatus,
  NOTION_STATUS_OPTIONS,
  reconcile,
  NOTION_PROP,
} from '../index';
import type { NotionPage, TaskLink } from '../index';
import type { AgentTask } from '../../../types/orchestration';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    instruction_id: 'inst-1',
    assigned_agent: 'CTO',
    title: 'Ship notion sync',
    rationale: 'Track CtoPlan tasks in Notion',
    expected_output: 'A synced database',
    status: 'queued',
    approval_required: false,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(props: Partial<Record<string, any>>, overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    id: 'page-1',
    last_edited_time: '2026-07-02T00:00:00.000Z',
    properties: props,
    ...overrides,
  };
}

describe('status-map', () => {
  it('round-trips every pulk status', () => {
    const statuses: AgentTask['status'][] = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
    for (const s of statuses) {
      expect(notionLabelToStatus(statusToNotionLabel(s))).toBe(s);
    }
  });

  it('returns null for unknown / empty Notion labels (skip, not guess)', () => {
    expect(notionLabelToStatus('Whatever')).toBeNull();
    expect(notionLabelToStatus(null)).toBeNull();
    expect(notionLabelToStatus(undefined)).toBeNull();
  });

  it('exposes all option labels for schema creation', () => {
    expect(NOTION_STATUS_OPTIONS).toContain('In Progress');
    expect(NOTION_STATUS_OPTIONS).toHaveLength(6);
  });
});

describe('mapTaskToProperties', () => {
  it('maps core fields and stores the pulk task id', () => {
    const props = mapTaskToProperties(task());
    expect((props[NOTION_PROP.title] as any).title[0].text.content).toBe('Ship notion sync');
    expect((props[NOTION_PROP.status] as any).select.name).toBe('Queued');
    expect((props[NOTION_PROP.date] as any).date.start).toBe('2026-07-01T00:00:00.000Z');
    expect((props[NOTION_PROP.pulkTaskId] as any).rich_text[0].text.content).toBe('task-1');
  });

  it('nulls the date when created_at is empty', () => {
    const props = mapTaskToProperties(task({ created_at: '' }));
    expect((props[NOTION_PROP.date] as any).date).toBeNull();
  });

  it('truncates text beyond Notion 2000-char cap', () => {
    const props = mapTaskToProperties(task({ rationale: 'x'.repeat(5000) }));
    expect((props[NOTION_PROP.rationale] as any).rich_text[0].text.content).toHaveLength(2000);
  });

  it('update payload omits Status so Notion-side edits survive', () => {
    const props = mapTaskToUpdateProperties(task());
    expect(props[NOTION_PROP.status]).toBeUndefined();
    expect(props[NOTION_PROP.title]).toBeDefined();
  });
});

describe('mapPageToStatusUpdate', () => {
  it('reads a status write-back linked to a pulk task', () => {
    const p = page({
      [NOTION_PROP.pulkTaskId]: { rich_text: [{ plain_text: 'task-9' }] },
      [NOTION_PROP.status]: { select: { name: 'Done' } },
    });
    expect(mapPageToStatusUpdate(p)).toEqual({ task_id: 'task-9', status: 'done' });
  });

  it('returns null without a pulk task id', () => {
    const p = page({ [NOTION_PROP.status]: { select: { name: 'Done' } } });
    expect(mapPageToStatusUpdate(p)).toBeNull();
  });

  it('returns null for an unrecognized status label', () => {
    const p = page({
      [NOTION_PROP.pulkTaskId]: { rich_text: [{ plain_text: 'task-9' }] },
      [NOTION_PROP.status]: { select: { name: 'Parked' } },
    });
    expect(mapPageToStatusUpdate(p)).toBeNull();
  });

  it('readPulkTaskId joins rich_text parts', () => {
    const p = page({ [NOTION_PROP.pulkTaskId]: { rich_text: [{ plain_text: 'ab' }, { plain_text: 'cd' }] } });
    expect(readPulkTaskId(p)).toBe('abcd');
  });
});

describe('reconcile', () => {
  it('queues unlinked tasks for creation', () => {
    const links: TaskLink[] = [{ task: task(), notionPageId: null }];
    const r = reconcile(links, []);
    expect(r.toCreate).toHaveLength(1);
    expect(r.toUpdate).toHaveLength(0);
    expect(r.toPullBack).toHaveLength(0);
  });

  it('updates without touching Status when statuses agree', () => {
    const links: TaskLink[] = [{ task: task({ status: 'running' }), notionPageId: 'page-1' }];
    const pages = [page({ [NOTION_PROP.status]: { select: { name: 'In Progress' } } })];
    const r = reconcile(links, pages);
    expect(r.toUpdate).toEqual([{ pageId: 'page-1', task: expect.anything(), includeStatus: false }]);
    expect(r.toPullBack).toHaveLength(0);
  });

  it('pulls back when the Notion status edit is newer', () => {
    const links: TaskLink[] = [
      { task: task({ status: 'queued', updated_at: '2026-07-01T00:00:00.000Z' }), notionPageId: 'page-1' },
    ];
    const pages = [
      page(
        { [NOTION_PROP.status]: { select: { name: 'Done' } } },
        { last_edited_time: '2026-07-05T00:00:00.000Z' },
      ),
    ];
    const r = reconcile(links, pages);
    expect(r.toPullBack).toEqual([{ task_id: 'task-1', status: 'done' }]);
    // still pushes pulk-owned fields, but not Status
    expect(r.toUpdate[0].includeStatus).toBe(false);
  });

  it('pushes pulk Status when pulk is the newer writer', () => {
    const links: TaskLink[] = [
      { task: task({ status: 'done', updated_at: '2026-07-09T00:00:00.000Z' }), notionPageId: 'page-1' },
    ];
    const pages = [
      page(
        { [NOTION_PROP.status]: { select: { name: 'Queued' } } },
        { last_edited_time: '2026-07-02T00:00:00.000Z' },
      ),
    ];
    const r = reconcile(links, pages);
    expect(r.toPullBack).toHaveLength(0);
    expect(r.toUpdate[0].includeStatus).toBe(true);
  });

  it('treats a linked-but-missing page as a create', () => {
    const links: TaskLink[] = [{ task: task(), notionPageId: 'gone' }];
    const r = reconcile(links, []);
    expect(r.toCreate).toHaveLength(1);
  });
});
