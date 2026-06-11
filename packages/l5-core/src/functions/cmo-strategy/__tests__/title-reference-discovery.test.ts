import {
  discoverTitleReferences,
  fallbackThumbnailDescription,
  normalizeViewtrapGrade,
  type TitleReferenceDiscoveryDeps,
} from '../title-reference-discovery';
import { validateTitleReferences, shouldSwapTitle } from '../title-development';

const INPUT = {
  pulling_topic: '인스타 마케팅 자동화',
  target_audience: '마케팅 팀 없는 대표',
};

function makeDeps(overrides: Partial<TitleReferenceDiscoveryDeps> = {}): TitleReferenceDiscoveryDeps {
  return {
    search: jest.fn(async (query: string) => [
      { video_id: 'v1', title: '인스타 마케팅 자동화로 매출 3배', channel_id: 'c1', channel_title: 'A채널' },
      { video_id: 'v2', title: '마케팅 자동화 이렇게 하면 망합니다', channel_id: 'c2', channel_title: 'B채널' },
      { video_id: 'v3', title: '인스타 마케팅 기초', channel_id: 'c3', channel_title: 'C채널' },
    ]),
    getStats: jest.fn(async () => ({ v1: 250000, v2: 120000, v3: 30000 })),
    ...overrides,
  };
}

describe('normalizeViewtrapGrade', () => {
  it('wow/great → Great, good → Good, 그 외/없음 → null', () => {
    expect(normalizeViewtrapGrade('wow')).toBe('Great');
    expect(normalizeViewtrapGrade('Great')).toBe('Great');
    expect(normalizeViewtrapGrade('GOOD')).toBe('Good');
    expect(normalizeViewtrapGrade('normal')).toBeNull();
    expect(normalizeViewtrapGrade('bad')).toBeNull();
    expect(normalizeViewtrapGrade(null)).toBeNull();
    expect(normalizeViewtrapGrade(undefined)).toBeNull();
  });
});

describe('fallbackThumbnailDescription', () => {
  it('제목 핵심 구절을 비공백 문구로 만들고 미실측을 명시한다', () => {
    const r = fallbackThumbnailDescription('인스타 마케팅 자동화로 매출 3배, 직접 해봤습니다');
    expect(r.thumbnail_text.length).toBeGreaterThan(0);
    expect(r.thumbnail_structure).toContain('미실측');
  });
});

describe('discoverTitleReferences', () => {
  it('조회수 5만+ 상위 2개를 서로 다른 채널에서 골라 검증을 통과시킨다', async () => {
    const deps = makeDeps();
    const result = await discoverTitleReferences(INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.references).toHaveLength(2);
    expect(result.references.map((r) => r.id)).toEqual(['ref-v1', 'ref-v2']);
    // v3는 조회수 미달로 풀에서 제외 표시
    const v3 = result.pool.find((c) => c.video_id === 'v3');
    expect(v3?.excluded_reason).toContain('조회수');
    // 자동 발굴 레퍼런스도 기존 검증 게이트를 통과해야 한다
    expect(validateTitleReferences(result.references).passed).toBe(true);
    // 등급 미실측 투명성
    expect(result.references[0].selected_reason).toContain('미실측');
    expect(result.references[0].source).toBe('youtube');
    expect(result.notes.join(' ')).toContain('미주입');
  });

  it('성과도/기여도 실측이 있으면 Good·Great 미만을 제외하고 source=viewtrap으로 만든다', async () => {
    const deps = makeDeps({
      scrapeGrades: jest.fn(async () => ({
        v1: { performance: 'good', contribution: 'great' },
        v2: { performance: 'bad', contribution: 'good' },
      })),
      getStats: jest.fn(async () => ({ v1: 250000, v2: 120000, v3: 90000 })),
    });
    const result = await discoverTitleReferences(INPUT, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // v2는 성과도 bad 실측 → 제외, v3가 두 번째로 선정
    expect(result.references.map((r) => r.id)).toEqual(['ref-v1', 'ref-v3']);
    expect(result.references[0].source).toBe('viewtrap');
    expect(result.references[0].performance_grade).toBe('Good');
    expect(result.references[0].contribution_grade).toBe('Great');
    const v2 = result.pool.find((c) => c.video_id === 'v2');
    expect(v2?.excluded_reason).toContain('미충족');
  });

  it('같은 채널 후보는 다른 채널 후보가 있으면 건너뛴다 (다양성)', async () => {
    const deps = makeDeps({
      search: jest.fn(async () => [
        { video_id: 'v1', title: '제목1', channel_id: 'c1', channel_title: 'A' },
        { video_id: 'v2', title: '제목2', channel_id: 'c1', channel_title: 'A' },
        { video_id: 'v3', title: '제목3', channel_id: 'c2', channel_title: 'B' },
      ]),
      getStats: jest.fn(async () => ({ v1: 300000, v2: 200000, v3: 100000 })),
    });
    const result = await discoverTitleReferences(INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.references.map((r) => r.id)).toEqual(['ref-v1', 'ref-v3']);
  });

  it('적격 후보가 2개 미만이면 ok=false + 사유를 남긴다', async () => {
    const deps = makeDeps({ getStats: jest.fn(async () => ({ v1: 60000, v2: 10000, v3: 5000 })) });
    const result = await discoverTitleReferences(INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient_candidates');
    expect(result.notes.join(' ')).toContain('2개 미만');
  });

  it('검색이 전부 실패하면 search_failed를 반환한다', async () => {
    const deps = makeDeps({ search: jest.fn(async () => { throw new Error('quota'); }) });
    const result = await discoverTitleReferences(INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('search_failed');
  });

  it('describeThumbnail 어댑터가 있으면 실측 문구를 쓴다', async () => {
    const deps = makeDeps({
      describeThumbnail: jest.fn(async () => ({
        thumbnail_text: '매출 3배 비밀',
        thumbnail_structure: '인물 좌측 + 우측 큰 문구',
      })),
    });
    const result = await discoverTitleReferences(INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.references[0].thumbnail_text).toBe('매출 3배 비밀');
    expect(result.references[0].thumbnail_structure).not.toContain('미실측');
  });
});

describe('shouldSwapTitle (업로드 후 제목 교체 규칙)', () => {
  it('7일 전에는 too_early', () => {
    expect(shouldSwapTitle({ days_since_upload: 3, views: 10 }).action).toBe('too_early');
  });
  it('7일 경과 + 100회 미만이면 swap_recommended', () => {
    const r = shouldSwapTitle({ days_since_upload: 7, views: 80 });
    expect(r.action).toBe('swap_recommended');
    expect(r.reason).toContain('제목 교체');
  });
  it('7일 경과 + 100회 이상이면 keep', () => {
    expect(shouldSwapTitle({ days_since_upload: 8, views: 150 }).action).toBe('keep');
  });
  it('임계값은 설정으로 조정 가능하다', () => {
    expect(
      shouldSwapTitle({ days_since_upload: 3, views: 50 }, { evaluate_after_days: 2, min_views: 30 }).action,
    ).toBe('keep');
    expect(
      shouldSwapTitle({ days_since_upload: 3, views: 20 }, { evaluate_after_days: 2, min_views: 30 }).action,
    ).toBe('swap_recommended');
  });
});
