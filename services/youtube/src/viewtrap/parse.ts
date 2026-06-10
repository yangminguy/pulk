// CMO M1 — Viewtrap 원시 추출물(브라우저 evaluate 산출) → 타입드 행 파싱.
// 순수함수만. CDP/DOM 의존 없음 → fixture로 단위테스트 가능.

import type {
  ExtensionMetricsRow,
  RawExtensionCard,
  RawTableRow,
  VideoSearchRow,
  ViewtrapGrade,
} from './types.js';

const GRADE_WORDS: Record<string, ViewtrapGrade> = {
  wow: 'wow',
  great: 'great',
  good: 'good',
  normal: 'normal',
  bad: 'bad',
  worst: 'worst',
};

/** "Wow!" / "Great" / "good" 등 → 등급. 등급 아니면 null ("-" 포함). */
export function normalizeGrade(text: string | null | undefined): ViewtrapGrade | null {
  if (!text) return null;
  const key = text.replace(/!/g, '').trim().toLowerCase();
  return GRADE_WORDS[key] ?? null;
}

/** "272,415" · "조회수 27만회" · "1.2천회" → 숫자. 파싱 불가 시 null. */
export function parseViews(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/조회수/g, '').trim();
  const man = t.match(/([\d.]+)\s*만/);
  if (man) return Math.round(parseFloat(man[1]) * 10_000);
  const cheon = t.match(/([\d.]+)\s*천/);
  if (cheon) return Math.round(parseFloat(cheon[1]) * 1_000);
  const plain = t.replace(/[,\s]/g, '').match(/^\d+/);
  return plain ? Number(plain[0]) : null;
}

/** 썸네일 src(i.ytimg.com/vi/<id>/...) 또는 watch/youtu.be/shorts href에서 videoId. */
export function extractVideoId(src: string | null | undefined): string | null {
  if (!src) return null;
  const m =
    src.match(/\/vi\/([^/?#]+)\//) ??
    src.match(/[?&]v=([^&#]+)/) ??
    src.match(/youtu\.be\/([^/?#]+)/) ??
    src.match(/\/shorts\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ── video-search 테이블 ──────────────────────────────────────────────────────
// 실측 컬럼(11열): [0]선택 [1]CC [2]썸네일(길이) [3]제목 [4]조회수
// [5]구독자/채널 [6]기여도 [7]성과도 [8]노출확률 [9]총영상수 [10]게시일

const TABLE_COLUMNS = {
  title: 3,
  views: 4,
  contribution: 6,
  performance: 7,
  exposure: 8,
  publishedAt: 10,
} as const;

/** 테이블 한 행 파싱. videoId 없는 행(광고/구분행)은 null. */
export function parseVideoSearchRow(raw: RawTableRow): VideoSearchRow | null {
  const videoId = extractVideoId(raw.thumbnailSrc);
  if (!videoId) return null;

  let title: string;
  let views: number | null;
  let contribution: ViewtrapGrade | null;
  let performance: ViewtrapGrade | null;
  let exposure: ViewtrapGrade | null;
  let publishedAt: string | null;

  if (raw.cells.length >= 11) {
    title = raw.cells[TABLE_COLUMNS.title] ?? '';
    views = parseViews(raw.cells[TABLE_COLUMNS.views]);
    contribution = normalizeGrade(raw.cells[TABLE_COLUMNS.contribution]);
    performance = normalizeGrade(raw.cells[TABLE_COLUMNS.performance]);
    exposure = normalizeGrade(raw.cells[TABLE_COLUMNS.exposure]);
    publishedAt = raw.cells[TABLE_COLUMNS.publishedAt]?.trim() || null;
  } else {
    // 컬럼 수가 다르면 휴리스틱: 제목=가장 긴 셀, 조회수=콤마 숫자 셀,
    // 등급 셀 등장 순서 = 기여도 → 성과도 → 노출확률 (테이블 실측 순서).
    title = raw.cells.reduce((a, b) => (b.length > a.length ? b : a), '');
    views = parseViews(raw.cells.find((c) => /^\d{1,3}(,\d{3})+$/.test(c.trim())) ?? null);
    const grades = raw.cells
      .map((c) => normalizeGrade(c))
      .filter((g): g is ViewtrapGrade => g !== null);
    contribution = grades[0] ?? null;
    performance = grades[1] ?? null;
    exposure = grades[2] ?? null;
    publishedAt = null;
  }

  return {
    videoId,
    title: title.trim(),
    views,
    contribution,
    performance,
    exposure,
    publishedAt,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: `https://youtu.be/${videoId}`,
  };
}

export function parseVideoSearchRows(raws: RawTableRow[]): VideoSearchRow[] {
  return raws
    .map((raw) => parseVideoSearchRow(raw))
    .filter((row): row is VideoSearchRow => row !== null);
}

// ── YouTube 검색결과 확장 주입 지표 ──────────────────────────────────────────

function metricByKey(metrics: Record<string, string>, keyword: string): string | undefined {
  const key = Object.keys(metrics).find((k) => k.includes(keyword));
  return key !== undefined ? metrics[key] : undefined;
}

/** 확장 카드 파싱. videoId 없거나 확장 지표(기여도/성과도)가 전혀 없으면 null. */
export function parseExtensionCard(raw: RawExtensionCard): ExtensionMetricsRow | null {
  const videoId = extractVideoId(raw.href);
  if (!videoId) return null;

  const contribution = normalizeGrade(metricByKey(raw.metrics, '기여'));
  const performance = normalizeGrade(metricByKey(raw.metrics, '성과'));
  const exposure = normalizeGrade(metricByKey(raw.metrics, '노출'));
  if (contribution === null && performance === null) return null;

  return {
    videoId,
    title: raw.title.trim(),
    views: parseViews(raw.metaText),
    contribution,
    performance,
    exposure,
    url: `https://youtu.be/${videoId}`,
  };
}

export function parseExtensionCards(raws: RawExtensionCard[]): ExtensionMetricsRow[] {
  return raws
    .map((raw) => parseExtensionCard(raw))
    .filter((row): row is ExtensionMetricsRow => row !== null);
}
