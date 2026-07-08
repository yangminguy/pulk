import {
  derivePrdTitle,
  derivePrdStatus,
  findTitleProp,
  mapPrdToProperties,
  buildPrdChildren,
  NOTION_PRD_PROP,
} from '../index';
import type { PrdDocument, NotionDatabaseSchema } from '../index';

function doc(overrides: Partial<PrdDocument> = {}): PrdDocument {
  return {
    cto_message_id: 'msg-1234abcd',
    thread_id: 'slack-C01-1720000000.000100',
    plan: {
      prd: '# 회원 가입 개선\n\n이메일 가입 흐름을 단순화한다.',
      roadmap_items: [
        { title: '가입 흐름', summary: '이메일 가입 단순화', objective: '가입 완료율 상승', sequence: 1 },
      ],
      tasks: [
        {
          title: '가입 폼 리팩토링',
          rationale: '단계 축소',
          expected_output: '2-step 가입 폼',
          roadmap_sequence: 1,
        },
      ],
      project_proposal: null,
    },
    plan_status: 'proposed',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

const FULL_SCHEMA: NotionDatabaseSchema = {
  이름: { type: 'title' },
  [NOTION_PRD_PROP.status]: { type: 'select' },
  [NOTION_PRD_PROP.thread]: { type: 'rich_text' },
  [NOTION_PRD_PROP.messageId]: { type: 'rich_text' },
  [NOTION_PRD_PROP.updatedAt]: { type: 'date' },
};

describe('derivePrdTitle', () => {
  it('prefers the new-project title', () => {
    const d = doc();
    d.plan.project_proposal = {
      is_new_project: true,
      business_id: null,
      suggested_project_title: '새 결제 서비스',
      rationale: '',
    };
    expect(derivePrdTitle(d)).toBe('새 결제 서비스');
  });

  it('falls back to the first PRD line (markdown heading stripped)', () => {
    expect(derivePrdTitle(doc())).toBe('회원 가입 개선');
  });

  it('falls back to a message-id stub when the plan is empty', () => {
    const d = doc();
    d.plan = { prd: '', roadmap_items: [], tasks: [] };
    expect(derivePrdTitle(d)).toContain('msg-1234');
  });
});

describe('derivePrdStatus', () => {
  it('proposed → draft', () => {
    expect(derivePrdStatus('proposed', [])).toBe('draft');
  });
  it('approved with no tasks → approved', () => {
    expect(derivePrdStatus('approved', [])).toBe('approved');
  });
  it('approved with only queued tasks → approved', () => {
    expect(derivePrdStatus('approved', ['queued', 'queued'])).toBe('approved');
  });
  it('approved with a running task → executing', () => {
    expect(derivePrdStatus('approved', ['queued', 'running'])).toBe('executing');
  });
  it('approved with all tasks done → done', () => {
    expect(derivePrdStatus('approved', ['done', 'done'])).toBe('done');
  });
});

describe('mapPrdToProperties (schema adapter)', () => {
  it('discovers the title property by type and writes all managed columns', () => {
    const props = mapPrdToProperties(doc(), FULL_SCHEMA);
    expect((props['이름'] as any).title[0].text.content).toBe('회원 가입 개선');
    expect((props[NOTION_PRD_PROP.status] as any).select.name).toBe('draft');
    expect((props[NOTION_PRD_PROP.thread] as any).rich_text[0].text.content).toContain('slack-C01');
    expect((props[NOTION_PRD_PROP.messageId] as any).rich_text[0].text.content).toBe('msg-1234abcd');
    expect((props[NOTION_PRD_PROP.updatedAt] as any).date.start).toBe('2026-07-02T00:00:00.000Z');
  });

  it('skips managed columns that are missing or wrongly typed', () => {
    const schema: NotionDatabaseSchema = {
      Name: { type: 'title' },
      [NOTION_PRD_PROP.status]: { type: 'rich_text' }, // wrong type → skip
    };
    const props = mapPrdToProperties(doc(), schema);
    expect(Object.keys(props)).toEqual(['Name']);
  });

  it('writes nothing when the schema has no title property', () => {
    expect(findTitleProp({})).toBeNull();
    expect(Object.keys(mapPrdToProperties(doc(), {}))).toHaveLength(0);
  });
});

describe('buildPrdChildren', () => {
  it('renders PRD body, roadmap, tasks, and source sections', () => {
    const blocks = buildPrdChildren(doc());
    const flat = JSON.stringify(blocks);
    expect(flat).toContain('회원 가입 개선');
    expect(flat).toContain('로드맵');
    expect(flat).toContain('태스크 (1개)');
    expect(flat).toContain('slack-C01-1720000000.000100');
  });

  it('chunks long PRD text under Notion 2000-char cap and caps total blocks', () => {
    const d = doc();
    d.plan.prd = 'A'.repeat(5000);
    d.plan.tasks = Array.from({ length: 200 }, (_, i) => ({
      title: `t${i}`,
      rationale: '',
      expected_output: '',
      roadmap_sequence: 1,
    }));
    const blocks = buildPrdChildren(d);
    expect(blocks.length).toBeLessThanOrEqual(95);
    for (const b of blocks) {
      const rich = (b as any)[b.type]?.rich_text ?? [];
      for (const r of rich) expect(r.text.content.length).toBeLessThanOrEqual(2000);
    }
  });
});
