import { runSyncRound } from '../sync';
import type { NotionPort, NocoBasePort } from '../sync';
import type { AgentTask, TaskLink, NotionPage, TaskStatus } from '@l5/core';
import { NOTION_PROP } from '@l5/core';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    instruction_id: 'inst-1',
    assigned_agent: 'CTO',
    title: 'T',
    rationale: 'R',
    expected_output: 'E',
    status: 'queued',
    approval_required: false,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

class FakeNotion implements NotionPort {
  pages: NotionPage[];
  created: any[] = [];
  updated: Array<{ pageId: string; properties: any }> = [];
  nextId = 100;
  constructor(pages: NotionPage[] = []) {
    this.pages = pages;
  }
  async queryDatabase() {
    return this.pages;
  }
  async createPage(properties: any) {
    const id = `new-${this.nextId++}`;
    this.created.push({ id, properties });
    return id;
  }
  async updatePage(pageId: string, properties: any) {
    this.updated.push({ pageId, properties });
  }
}

class FakeNoco implements NocoBasePort {
  links: TaskLink[];
  pageIdSets: Array<{ taskId: string; pageId: string }> = [];
  statusSets: Array<{ taskId: string; status: TaskStatus }> = [];
  constructor(links: TaskLink[]) {
    this.links = links;
  }
  async listTaskLinks() {
    return this.links;
  }
  async setNotionPageId(taskId: string, pageId: string) {
    this.pageIdSets.push({ taskId, pageId });
  }
  async setStatus(taskId: string, status: TaskStatus) {
    this.statusSets.push({ taskId, status });
  }
}

describe('runSyncRound', () => {
  it('creates a Notion row for an unlinked task and stores the page id', async () => {
    const noco = new FakeNoco([{ task: task(), notionPageId: null }]);
    const notion = new FakeNotion([]);
    const summary = await runSyncRound(noco, notion);
    expect(summary.created).toBe(1);
    expect(notion.created).toHaveLength(1);
    expect(noco.pageIdSets).toEqual([{ taskId: 'task-1', pageId: 'new-100' }]);
  });

  it('pulls a newer Notion status back into pulk', async () => {
    const links: TaskLink[] = [
      { task: task({ status: 'queued', updated_at: '2026-07-01T00:00:00.000Z' }), notionPageId: 'page-1' },
    ];
    const pages: NotionPage[] = [
      {
        id: 'page-1',
        last_edited_time: '2026-07-06T00:00:00.000Z',
        properties: {
          [NOTION_PROP.status]: { select: { name: 'Done' } },
          [NOTION_PROP.pulkTaskId]: { rich_text: [{ plain_text: 'task-1' }] },
        },
      },
    ];
    const noco = new FakeNoco(links);
    const notion = new FakeNotion(pages);
    const summary = await runSyncRound(noco, notion);
    expect(summary.pulledBack).toBe(1);
    expect(noco.statusSets).toEqual([{ taskId: 'task-1', status: 'done' }]);
    // update still runs but must NOT include Status
    expect(notion.updated[0].properties[NOTION_PROP.status]).toBeUndefined();
  });

  it('pushes pulk Status when pulk is the newer writer', async () => {
    const links: TaskLink[] = [
      { task: task({ status: 'done', updated_at: '2026-07-10T00:00:00.000Z' }), notionPageId: 'page-1' },
    ];
    const pages: NotionPage[] = [
      {
        id: 'page-1',
        last_edited_time: '2026-07-02T00:00:00.000Z',
        properties: { [NOTION_PROP.status]: { select: { name: 'Queued' } } },
      },
    ];
    const noco = new FakeNoco(links);
    const notion = new FakeNotion(pages);
    await runSyncRound(noco, notion);
    expect(noco.statusSets).toHaveLength(0);
    expect(notion.updated[0].properties[NOTION_PROP.status].select.name).toBe('Done');
  });
});
