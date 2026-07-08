// PRD sync round — fake ports, no network.

import { runPrdSyncRound } from '../prd-sync';
import type { PrdNotionPort, PrdNocoBasePort } from '../prd-sync';
import type { NotionDatabaseSchema, PrdDocument, TaskLink } from '@l5/core';
import { NOTION_PRD_PROP } from '@l5/core';

const SCHEMA: NotionDatabaseSchema = {
  이름: { type: 'title' },
  [NOTION_PRD_PROP.status]: { type: 'select' },
  [NOTION_PRD_PROP.messageId]: { type: 'rich_text' },
};

function doc(overrides: Partial<PrdDocument> = {}): PrdDocument {
  return {
    cto_message_id: 'msg-1',
    thread_id: 'slack-C01-100',
    plan: {
      prd: '결제 개선 PRD',
      roadmap_items: [{ title: 'R1', summary: '', objective: '', sequence: 1 }],
      tasks: [{ title: 'T1', rationale: '', expected_output: '', roadmap_sequence: 1 }],
    },
    plan_status: 'approved',
    instruction_id: 'inst-1',
    notion_prd_page_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function taskLink(status: TaskLink['task']['status'], instruction_id = 'inst-1'): TaskLink {
  return {
    task: {
      id: `task-${status}`,
      instruction_id,
      assigned_agent: 'CTO',
      title: 't',
      rationale: '',
      expected_output: '',
      status,
      approval_required: false,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    notionPageId: null,
  };
}

function fakes(docs: PrdDocument[]) {
  const created: Array<{ props: any; opts: any }> = [];
  const updated: Array<{ pageId: string; props: any }> = [];
  const linked: Array<{ id: string; pageId: string }> = [];
  const noco: PrdNocoBasePort = {
    listPrdDocuments: async () => docs,
    setNotionPrdPageId: async (id, pageId) => {
      linked.push({ id, pageId });
    },
  };
  const notion: PrdNotionPort = {
    retrieveDatabaseSchema: async () => SCHEMA,
    createPage: async (props, opts) => {
      created.push({ props, opts });
      return `page-${created.length}`;
    },
    updatePage: async (pageId, props) => {
      updated.push({ pageId, props });
    },
  };
  return { noco, notion, created, updated, linked };
}

describe('runPrdSyncRound', () => {
  it('creates a page with children for a new PRD and links it back', async () => {
    const f = fakes([doc()]);
    const summary = await runPrdSyncRound(f.noco, f.notion, 'prd-db', [taskLink('running')]);
    expect(summary.created).toBe(1);
    expect(f.created[0].opts.databaseId).toBe('prd-db');
    expect(JSON.stringify(f.created[0].opts.children)).toContain('결제 개선 PRD');
    expect(f.linked).toEqual([{ id: 'msg-1', pageId: 'page-1' }]);
    // running task → executing status
    expect(f.created[0].props[NOTION_PRD_PROP.status].select.name).toBe('executing');
    expect(summary.prdPageByInstruction.get('inst-1')).toBe('page-1');
  });

  it('updates properties only (never children) for an already-linked PRD', async () => {
    const f = fakes([doc({ notion_prd_page_id: 'page-9' })]);
    const summary = await runPrdSyncRound(f.noco, f.notion, 'prd-db', [taskLink('done')]);
    expect(summary.updated).toBe(1);
    expect(f.created).toHaveLength(0);
    expect(f.updated[0].pageId).toBe('page-9');
    expect(f.updated[0].props[NOTION_PRD_PROP.status].select.name).toBe('done');
    expect(summary.prdPageByInstruction.get('inst-1')).toBe('page-9');
  });

  it('proposed plan with no tasks projects as draft', async () => {
    const f = fakes([doc({ plan_status: 'proposed', instruction_id: null })]);
    await runPrdSyncRound(f.noco, f.notion, 'prd-db', []);
    expect(f.created[0].props[NOTION_PRD_PROP.status].select.name).toBe('draft');
  });

  it('does nothing when there are no PRD candidates (no schema fetch)', async () => {
    const f = fakes([]);
    const notion: PrdNotionPort = {
      ...f.notion,
      retrieveDatabaseSchema: async () => {
        throw new Error('should not be called');
      },
    };
    const summary = await runPrdSyncRound(f.noco, notion, 'prd-db');
    expect(summary.created + summary.updated).toBe(0);
  });
});
