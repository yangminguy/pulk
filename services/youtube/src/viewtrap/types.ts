// CMO M1 — Viewtrap CDP 크롤링 타입.
// 셀렉터·등급·함정 실측 기록 = docs/cmo/features/youtube-viewtrap-discovery.md

/** Viewtrap 지표 등급. 등급순: wow > great > good > normal > bad > worst. */
export type ViewtrapGrade = 'wow' | 'great' | 'good' | 'normal' | 'bad' | 'worst';

export const GRADE_RANK: Record<ViewtrapGrade, number> = {
  worst: 0,
  bad: 1,
  normal: 2,
  good: 3,
  great: 4,
  wow: 5,
};

/** app.viewtrap.com/video-search 테이블 한 행 (파싱 결과). */
export interface VideoSearchRow {
  videoId: string;
  title: string;
  views: number | null;
  /** 기여도 */
  contribution: ViewtrapGrade | null;
  /** 성과도 */
  performance: ViewtrapGrade | null;
  /** 노출확률 — 행의 버튼 클릭 전에는 "-"(null). clickExposureProbability로 채움. */
  exposure: ViewtrapGrade | null;
  /** 게시일 원문 (예: "2023.05.12" — 포맷 가공 없이 보존) */
  publishedAt: string | null;
  thumbnail: string;
  url: string;
}

/** YouTube 검색결과에 Viewtrap 확장이 shadow DOM으로 주입한 지표 (영상 단위). */
export interface ExtensionMetricsRow {
  videoId: string;
  title: string;
  views: number | null;
  contribution: ViewtrapGrade | null;
  performance: ViewtrapGrade | null;
  exposure: ViewtrapGrade | null;
  url: string;
}

// ── 브라우저 evaluate가 반환하는 원시 구조 (DOM 접근 없는 순수 파서 입력) ──

/** video-search 테이블 <tr> 원시 추출: td innerText 배열 + 썸네일 src. */
export interface RawTableRow {
  cells: string[];
  thumbnailSrc: string | null;
}

/** YouTube 검색결과 카드(ytd-video-renderer) 원시 추출. metrics = dt/dd 페어. */
export interface RawExtensionCard {
  href: string;
  title: string;
  metaText: string;
  metrics: Record<string, string>;
}
