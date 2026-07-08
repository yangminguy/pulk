// Optional pulk-managed metadata columns (schema-aware) — 코딩 워크플로우 로그 확장.

import {
  mapTaskToProperties,
  mapTaskToUpdateProperties,
  filterManagedProps,
  NOTION_OPTIONAL_PROP,
  NOTION_PROP,
} from '../index';
import type { NotionDatabaseSchema } from '../index';
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
    risk_level: 'D2',
    phase: 'build' as any,
    blocker: undefined,
    acr_branch: 'agent/task-1-run-9',
    acr_pr_url: 'https://github.com/yangminguy/pulk/pull/42',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

const FULL_SCHEMA: NotionDatabaseSchema = Object.fromEntries([
  [NOTION_OPTIONAL_PROP.assignedAgent, { type: 'select' }],
  [NOTION_OPTIONAL_PROP.phase, { type: 'select' }],
  [NOTION_OPTIONAL_PROP.riskLevel, { type: 'select' }],
  [NOTION_OPTIONAL_PROP.expectedOutput, { type: 'rich_text' }],
  [NOTION_OPTIONAL_PROP.blocker, { type: 'rich_text' }],
  [NOTION_OPTIONAL_PROP.acrBranch, { type: 'rich_text' }],
  [NOTION_OPTIONAL_PROP.acrPrUrl, { type: 'url' }],
  [NOTION_OPTIONAL_PROP.updatedAt, { type: 'date' }],
  [NOTION_OPTIONAL_PROP.sourcePrd, { type: 'rich_text' }],
]);

describe('filterManagedProps', () => {
  it('keeps only existing columns with the expected type', () => {
    const schema: NotionDatabaseSchema = {
      [NOTION_OPTIONAL_PROP.assignedAgent]: { type: 'select' },
      [NOTION_OPTIONAL_PROP.acrPrUrl]: { type: 'rich_text' }, // wrong type → drop
      메모: { type: 'rich_text' }, // founder column → never managed
    };
    const avail = filterManagedProps(schema);
    expect(avail.has(NOTION_OPTIONAL_PROP.assignedAgent)).toBe(true);
    expect(avail.has(NOTION_OPTIONAL_PROP.acrPrUrl)).toBe(false);
    expect(avail.has('메모')).toBe(false);
  });
});

describe('mapTaskToProperties with extras', () => {
  it('writes core columns only when no availableProps given (backward compatible)', () => {
    const props = mapTaskToProperties(task());
    expect(Object.keys(props).sort()).toEqual(
      [NOTION_PROP.title, NOTION_PROP.status, NOTION_PROP.rationale, NOTION_PROP.date, NOTION_PROP.pulkTaskId].sort(),
    );
  });

  it('includes metadata for every available column', () => {
    const avail = filterManagedProps(FULL_SCHEMA);
    const props = mapTaskToProperties(task(), { availableProps: avail, sourcePrdPageId: 'prd-page-7' });
    expect((props[NOTION_OPTIONAL_PROP.assignedAgent] as any).select.name).toBe('CTO');
    expect((props[NOTION_OPTIONAL_PROP.riskLevel] as any).select.name).toBe('D2');
    expect((props[NOTION_OPTIONAL_PROP.acrBranch] as any).rich_text[0].text.content).toBe('agent/task-1-run-9');
    expect((props[NOTION_OPTIONAL_PROP.acrPrUrl] as any).url).toContain('/pull/42');
    expect((props[NOTION_OPTIONAL_PROP.updatedAt] as any).date.start).toBe('2026-07-03T00:00:00.000Z');
    expect((props[NOTION_OPTIONAL_PROP.sourcePrd] as any).rich_text[0].text.content).toBe('prd-page-7');
  });

  it('writes only the intersection when the DB has a subset of columns', () => {
    const avail = new Set([NOTION_OPTIONAL_PROP.acrBranch]);
    const props = mapTaskToProperties(task(), { availableProps: avail });
    expect(props[NOTION_OPTIONAL_PROP.acrBranch]).toBeDefined();
    expect(props[NOTION_OPTIONAL_PROP.acrPrUrl]).toBeUndefined();
    expect(props[NOTION_OPTIONAL_PROP.assignedAgent]).toBeUndefined();
  });

  it('clears blocker (empty rich_text) once resolved, but skips absent PR/branch', () => {
    const avail = filterManagedProps(FULL_SCHEMA);
    const props = mapTaskToProperties(
      task({ blocker: undefined, acr_branch: undefined, acr_pr_url: undefined }),
      { availableProps: avail },
    );
    expect((props[NOTION_OPTIONAL_PROP.blocker] as any).rich_text[0].text.content).toBe('');
    expect(props[NOTION_OPTIONAL_PROP.acrBranch]).toBeUndefined();
    expect(props[NOTION_OPTIONAL_PROP.acrPrUrl]).toBeUndefined();
  });

  it('update payload still excludes Status but carries metadata', () => {
    const avail = filterManagedProps(FULL_SCHEMA);
    const props = mapTaskToUpdateProperties(task(), { availableProps: avail });
    expect(props[NOTION_PROP.status]).toBeUndefined();
    expect(props[NOTION_OPTIONAL_PROP.phase]).toBeDefined();
  });
});
