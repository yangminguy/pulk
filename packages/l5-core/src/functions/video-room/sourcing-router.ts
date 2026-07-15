// FR-9 — 리서치 데이터 소싱 라우터.
//
// "필요한 데이터가 무엇인가"로 소스를 결정한다 (뷰트랩 사이트 중심 금지):
//   성과도·기여도            → 유튜브 검색결과의 뷰트랩 플러그인 오버레이 크롤링
//   영상 자체 데이터(메타)   → YouTube Data API (크롤링 금지 — 더 정확·저렴)
//   노출 확률·키워드 집계    → 뷰트랩 사이트 (다른 소스로 못 얻는 지표만)
//
// 우선순위: API > 플러그인 오버레이 > 뷰트랩 사이트 (같은 데이터면 싼 소스).
// 모든 병합 레코드는 source / fetched_at 필수 — 소스 불명 데이터는 리포트에 쓰지 않는다.
//
// 순수 함수. Date.now() 미사용 — fetched_at은 caller가 주입한다.

export type ResearchDataKind =
  /** 성과도·기여도 등급. */
  | 'performance_contribution'
  /** 제목·videoId·채널·구독자·조회수·게시일·길이·썸네일. */
  | 'video_meta'
  /** 노출 확률, 키워드별 조회수 합계 등 뷰트랩 전용 집계. */
  | 'viewtrap_aggregates';

export type ResearchSource = 'youtube_api' | 'viewtrap_overlay' | 'viewtrap_site';

/** 데이터 종류 → 정본 소스 (FR-9 기준표). */
export function routeResearchSource(kind: ResearchDataKind): ResearchSource {
  switch (kind) {
    case 'performance_contribution':
      return 'viewtrap_overlay';
    case 'video_meta':
      return 'youtube_api';
    case 'viewtrap_aggregates':
      return 'viewtrap_site';
  }
}

/** 같은 데이터를 여러 소스에서 얻을 수 있을 때의 우선순위(작을수록 우선). */
export const SOURCE_PRIORITY: Record<ResearchSource, number> = {
  youtube_api: 0,
  viewtrap_overlay: 1,
  viewtrap_site: 2,
};

export interface SourcedField<T> {
  value: T;
  source: ResearchSource;
  fetched_at: string;
}

/** FR-2 판정 UI가 그대로 렌더하는 병합 후보 레코드. */
export interface MergedResearchCandidate {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  channelTitle: string;
  viewCount: number;
  publishedAt?: string;
  durationSeconds?: number;
  subscriberCount?: number;
  /** 뷰트랩 오버레이 실측 등급. */
  performance?: string | null;
  contribution?: string | null;
  /** 뷰트랩 사이트 전용 지표. */
  exposure?: string | null;
  /** 필드 그룹별 출처 — 소스 불명 금지. */
  sources: {
    meta: SourcedField<'youtube_api'>['source'];
    grades?: ResearchSource;
    aggregates?: ResearchSource;
  };
  fetched_at: string;
}

export interface ApiVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  publishedAt?: string;
  durationSeconds?: number;
  subscriberCount?: number;
  thumbnailUrl?: string;
}

export interface OverlayGrades {
  performance?: string | null;
  contribution?: string | null;
}

export interface SiteAggregates {
  exposure?: string | null;
}

/**
 * API 메타(정본) + 오버레이 등급 + 사이트 집계를 videoId 기준으로 병합해
 * 하나의 후보 레코드로 만든다. fetched_at은 caller 주입(순수성 유지).
 * 메타(videoId/title)가 없으면 병합 불가 — throw.
 */
export function mergeResearchCandidate(input: {
  meta: ApiVideoMeta;
  grades?: OverlayGrades | null;
  aggregates?: SiteAggregates | null;
  fetched_at: string;
}): MergedResearchCandidate {
  const { meta, grades, aggregates, fetched_at } = input;
  if (!meta || !meta.videoId?.trim() || !meta.title?.trim()) {
    throw new Error('mergeResearchCandidate: meta(videoId/title)는 YouTube API에서 필수');
  }
  if (!fetched_at?.trim()) {
    throw new Error('mergeResearchCandidate: fetched_at은 필수 — 소스/시점 불명 데이터 금지');
  }

  const record: MergedResearchCandidate = {
    videoId: meta.videoId,
    title: meta.title,
    url: `https://www.youtube.com/watch?v=${meta.videoId}`,
    thumbnailUrl: meta.thumbnailUrl ?? `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`,
    channelTitle: meta.channelTitle ?? '',
    viewCount: Number(meta.viewCount ?? 0),
    ...(meta.publishedAt ? { publishedAt: meta.publishedAt } : {}),
    ...(meta.durationSeconds != null ? { durationSeconds: meta.durationSeconds } : {}),
    ...(meta.subscriberCount != null ? { subscriberCount: meta.subscriberCount } : {}),
    sources: { meta: 'youtube_api' },
    fetched_at,
  };
  if (grades && (grades.performance != null || grades.contribution != null)) {
    record.performance = grades.performance ?? null;
    record.contribution = grades.contribution ?? null;
    record.sources.grades = 'viewtrap_overlay';
  }
  if (aggregates && aggregates.exposure != null) {
    record.exposure = aggregates.exposure;
    record.sources.aggregates = 'viewtrap_site';
  }
  return record;
}
