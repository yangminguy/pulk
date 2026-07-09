// Founder-owned columns auto-fill (영역/워크플로우 태그/PR·이슈 링크) — fill-if-empty.

import {
  deriveArea,
  deriveWorkflowTags,
  filterFounderProps,
  buildFounderFillProps,
  FOUNDER_PROP,
} from '../index';
import type { NotionDatabaseSchema, NotionPage } from '../index';
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
    acr_branch: undefined,
    acr_pr_url: undefined,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    ...overrides,
  };
}

const FOUNDER_SCHEMA: NotionDatabaseSchema = {
  [FOUNDER_PROP.area]: { type: 'select' },
  [FOUNDER_PROP.workflowTags]: { type: 'multi_select' },
  [FOUNDER_PROP.prLink]: { type: 'url' },
};

function page(properties: NotionPage['properties']): NotionPage {
  return { id: 'page-1', properties };
}

describe('deriveArea', () => {
  it('maps UI/component work to Frontend', () => {
    expect(deriveArea(task({ title: '상태 배지 UI 컴포넌트 개발', rationale: '', expected_output: '' }))).toBe('Frontend');
  });

  it('maps API/endpoint/function work to Backend', () => {
    expect(deriveArea(task({ title: '헬스체크 엔드포인트 구현', rationale: '', expected_output: '' }))).toBe('Backend');
    expect(deriveArea(task({ title: 'Slack 메시지 포맷팅 함수', rationale: '', expected_output: '' }))).toBe('Backend');
  });

  it('maps metrics/aggregation work to Data (wins over Backend 함수)', () => {
    expect(deriveArea(task({ title: '주간 변화 지표 계산 함수', rationale: '', expected_output: '' }))).toBe('Data');
  });

  it('maps launchd/scheduling work to Infra/DevOps', () => {
    expect(deriveArea(task({ title: 'Hermes 주간 스케줄 태스크 추가', rationale: '', expected_output: '' }))).toBe('Infra/DevOps');
  });

  it('falls back to Etc when nothing matches', () => {
    expect(deriveArea(task({ title: '요구사항 정리', rationale: '', expected_output: '' }))).toBe('Etc');
  });

  // Live misclassifications (2026-07-09): detail-text noise must not override the title.
  it('title decides even when rationale/expected_output mention other layers', () => {
    expect(
      deriveArea(task({
        title: 'Slack 메시지 포맷팅 함수',
        rationale: '기존 slack-gateway 메시지 스타일 유지. UI에 표시.',
        expected_output: '',
      })),
    ).toBe('Backend');
    expect(
      deriveArea(task({
        title: '방문자 카운팅 API 구현',
        rationale: '',
        expected_output: 'NocoBase 위젯이 호출할 카운팅 API',
      })),
    ).toBe('Backend');
  });

  it('falls back to detail text only when the title says nothing', () => {
    expect(
      deriveArea(task({ title: '2단계 작업', rationale: '집계 지표 계산', expected_output: '' })),
    ).toBe('Data');
  });
});

describe('deriveWorkflowTags', () => {
  it('defaults to 구현 when nothing specific matches', () => {
    expect(deriveWorkflowTags(task({ title: '헬스체크 엔드포인트', rationale: '', expected_output: '' }))).toEqual(['구현']);
  });

  it('tags 테스트/배포 and keeps 구현 for implementation phrasing', () => {
    const tags = deriveWorkflowTags(
      task({ title: '통합 테스트 및 라이브 전환', rationale: '', expected_output: '' }),
    );
    expect(tags).toContain('테스트');
    expect(tags).toContain('배포');
  });

  it('tags 문서화 and 디버깅 from text', () => {
    expect(deriveWorkflowTags(task({ title: 'README 문서화', rationale: '', expected_output: '' }))).toContain('문서화');
    expect(deriveWorkflowTags(task({ title: '로그인 버그 fix', rationale: '', expected_output: '' }))).toContain('디버깅');
  });
});

describe('filterFounderProps', () => {
  it('keeps only present columns with the expected type', () => {
    expect(filterFounderProps(FOUNDER_SCHEMA)).toEqual(
      new Set([FOUNDER_PROP.area, FOUNDER_PROP.workflowTags, FOUNDER_PROP.prLink]),
    );
    // wrong type → excluded
    expect(filterFounderProps({ [FOUNDER_PROP.area]: { type: 'rich_text' } }).size).toBe(0);
    expect(filterFounderProps({}).size).toBe(0);
  });
});

describe('buildFounderFillProps', () => {
  const avail = filterFounderProps(FOUNDER_SCHEMA);

  it('returns nothing without schema-checked founder columns', () => {
    expect(buildFounderFillProps(task(), undefined, null)).toEqual({});
    expect(buildFounderFillProps(task(), new Set(), null)).toEqual({});
  });

  it('fills all derivable columns on create (page=null)', () => {
    const t = task({
      title: '상태 배지 UI 컴포넌트 개발',
      acr_pr_url: 'https://github.com/yangminguy/pulk/pull/7',
    });
    const props = buildFounderFillProps(t, avail, null);
    expect(props[FOUNDER_PROP.area]).toEqual({ select: { name: 'Frontend' } });
    expect(props[FOUNDER_PROP.workflowTags]).toEqual({
      multi_select: [{ name: '구현' }],
    });
    expect(props[FOUNDER_PROP.prLink]).toEqual({ url: 'https://github.com/yangminguy/pulk/pull/7' });
  });

  it('omits PR/이슈 링크 when the task has no PR', () => {
    const props = buildFounderFillProps(task({ acr_pr_url: undefined }), avail, null);
    expect(props[FOUNDER_PROP.prLink]).toBeUndefined();
  });

  it('never overwrites founder-set values (fill-if-empty)', () => {
    const existing = page({
      [FOUNDER_PROP.area]: { select: { name: 'Mobile' } },
      [FOUNDER_PROP.workflowTags]: { multi_select: [{ name: '설계' }] },
      [FOUNDER_PROP.prLink]: { url: 'https://github.com/x/y/pull/1' },
    });
    const t = task({ title: 'UI 위젯', acr_pr_url: 'https://github.com/x/y/pull/2' });
    expect(buildFounderFillProps(t, avail, existing)).toEqual({});
  });

  it('fills only the empty columns on an existing page', () => {
    const existing = page({
      [FOUNDER_PROP.area]: { select: null },
      [FOUNDER_PROP.workflowTags]: { multi_select: [] },
      [FOUNDER_PROP.prLink]: { url: null },
    });
    const t = task({ title: 'API 구현', acr_pr_url: 'https://github.com/x/y/pull/3' });
    const props = buildFounderFillProps(t, avail, existing);
    expect(props[FOUNDER_PROP.area]).toEqual({ select: { name: 'Backend' } });
    expect(props[FOUNDER_PROP.prLink]).toEqual({ url: 'https://github.com/x/y/pull/3' });
  });
});
