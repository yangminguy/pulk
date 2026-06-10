// M1~M3 통합 — 발굴→크롤링→분류 파이프라인 (순수, 어댑터 주입).
//
// 목표: 키 콘텐츠 Step8 + 풀링 Step5/8의 "viewtrap 검증·선정이유"를
// LLM 추측/수동입력에서 실데이터 파이프라인으로 교체 가능하게 만든다.
//
// 단계: ① searchVideos(발굴) → ② getVideoStats + 5만+ 필터 →
//       ③ (있으면) 확장/사이트 크롤링 지표 병합 + 성과도·기여도 필터 →
//       ④ classify(Sonnet, M3) → ⑤ fit+성과좋음 후보 산출.
//
// 함정 회피 규칙:
// - 각 단계 실패 시 그 단계만 건너뛰고 진행한다(부분 데이터로도 후보 산출).
// - provenance에 어떤 소스가 실데이터인지 기록한다(LLM 추측과 실측을 구분).
// - 순수: Date.now()/randomUUID() 금지. 모든 외부 I/O는 deps로 주입.

import type { ProductBrief } from './types';
import {
  classifyDiscoveredVideos,
  type DiscoveredVideo,
  type DiscoveryMode,
  type ClassifyDiscoveredVideosResult,
  type VideoClassification,
  type DiscoveryClassificationDeps,
} from './discovery-classification';

// ── 입력 영상 모양 (어댑터 산출의 구조적 부분집합) ───────────────────────────

/** searchVideos 산출(YouTube search.list). */
export interface DiscoverySearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
}

/** getVideoStats 산출(YouTube videos.list). */
export interface DiscoveryVideoStats {
  videoId: string;
  title?: string;
  channelTitle?: string;
  viewCount: number;
}

/**
 * 확장/사이트 크롤링이 영상별로 채워주는 Viewtrap 지표(부분 데이터 허용).
 * 등급 문자열(good/great/wow 등)은 분류·후보 판단에 쓰인다.
 */
export interface DiscoveryScrapedMetrics {
  videoId: string;
  contribution?: string; // 기여도
  performance?: string; // 성과도
  exposure?: string; // 노출확률
  publishedAge?: 'old' | 'recent';
}

// ── deps ─────────────────────────────────────────────────────────────────────

export interface DiscoveryPipelineDeps {
  /** ① 발굴(YouTube search.list). 필수. */
  searchVideos(query: string): Promise<DiscoverySearchResult[]>;
  /** ② 통계(YouTube videos.list). 필수. */
  getVideoStats(videoIds: string[]): Promise<DiscoveryVideoStats[]>;
  /**
   * ③ (옵션) 확장/사이트 크롤링으로 영상별 Viewtrap 지표 병합.
   * 미주입 시 이 단계는 건너뛴다(stats만으로 분류·후보 산출).
   */
  scrapeMetrics?(query: string, videoIds: string[]): Promise<DiscoveryScrapedMetrics[]>;
  /**
   * ④ Sonnet 의도 분류(M3). 미주입 시 classifyDiscoveredVideos가
   * deps.llm 없이 전 영상 ambiguous 결정론 폴백 → 후보 0개.
   */
  classify?(
    videos: DiscoveredVideo[],
    mode: DiscoveryMode,
  ): Promise<ClassifyDiscoveredVideosResult>;
}

export interface RunDiscoveryPipelineInput {
  query: string;
  product: ProductBrief;
  /** 타깃 서술(product.target_audience보다 구체적 허용). */
  target: string;
  mode: DiscoveryMode;
  /** mode='pulling'일 때 키 콘텐츠 요약 — 브릿지 판단 근거. */
  key_content_context?: string;
  /** 발굴 최소 조회수(기본 50,000). */
  minViews?: number;
}

/** 어떤 단계가 실데이터로 통과했는지 기록(LLM 추측과 실측 구분). */
export interface DiscoveryProvenance {
  searched: boolean;
  stats: boolean;
  scraped: boolean;
  classified: boolean;
  /** 단계별 실패 사유(있으면). */
  notes: string[];
}

/** 분류 결과 + 발굴/지표/크롤링 데이터가 합쳐진 후보 1건. */
export interface DiscoveryCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  metrics?: Record<string, string | number | undefined>;
  /** 분류 단계 통과 시 채워진다(④). 분류 실패/미통과면 undefined. */
  classification?: VideoClassification;
}

export interface RunDiscoveryPipelineResult {
  mode: DiscoveryMode;
  query: string;
  /** 분류된 모든 영상(통계·지표 병합 후). */
  videos: DiscoveryCandidate[];
  /** candidate_basis=true (fit+성과좋음) — 키/풀링 후보의 실데이터 근거. */
  candidates: DiscoveryCandidate[];
  provenance: DiscoveryProvenance;
  classificationResult: ClassifyDiscoveredVideosResult | null;
}

const DEFAULT_MIN_VIEWS = 50_000;

function pushNote(prov: DiscoveryProvenance, stage: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  prov.notes.push(`${stage}: ${msg}`);
}

/**
 * 발굴→통계·필터→(옵션)크롤링 병합→Sonnet 분류→후보 산출.
 * 각 단계 실패는 그 단계만 건너뛰고 진행한다(부분 파이프라인 허용).
 */
export async function runDiscoveryPipeline(
  input: RunDiscoveryPipelineInput,
  deps: DiscoveryPipelineDeps,
): Promise<RunDiscoveryPipelineResult> {
  const minViews = input.minViews ?? DEFAULT_MIN_VIEWS;
  const provenance: DiscoveryProvenance = {
    searched: false,
    stats: false,
    scraped: false,
    classified: false,
    notes: [],
  };

  // ① 발굴 — 실패하면 후보 0개로 끝낸다(검색 없이는 진행 불가).
  let searched: DiscoverySearchResult[] = [];
  try {
    searched = await deps.searchVideos(input.query);
    provenance.searched = true;
  } catch (err) {
    pushNote(provenance, 'searchVideos', err);
    return {
      mode: input.mode,
      query: input.query,
      videos: [],
      candidates: [],
      provenance,
      classificationResult: null,
    };
  }

  // ② 통계 + 5만+ 필터 — 실패하면 검색 결과를 viewCount=0으로 통과시킨다.
  const byId = new Map<string, DiscoveryCandidate>();
  for (const s of searched) {
    byId.set(s.videoId, {
      videoId: s.videoId,
      title: s.title,
      channelTitle: s.channelTitle,
      viewCount: 0,
    });
  }
  try {
    const stats = await deps.getVideoStats(searched.map((s) => s.videoId));
    provenance.stats = true;
    const statsById = new Map(stats.map((v) => [v.videoId, v]));
    for (const [id, cand] of byId) {
      const st = statsById.get(id);
      if (st) {
        cand.viewCount = st.viewCount;
        if (st.title) cand.title = st.title;
        if (st.channelTitle) cand.channelTitle = st.channelTitle;
      }
    }
    // 5만+ 필터(stats가 있을 때만 — 없으면 조회수 미상이라 거르지 않는다).
    for (const [id, cand] of [...byId]) {
      if (cand.viewCount < minViews) byId.delete(id);
    }
  } catch (err) {
    pushNote(provenance, 'getVideoStats', err);
    // stats 실패: 필터 못 함 → 검색 결과 전부 viewCount=0으로 다음 단계 진행.
  }

  // ③ (옵션) 크롤링 지표 병합 + 성과도·기여도 필터.
  if (deps.scrapeMetrics) {
    try {
      const ids = [...byId.keys()];
      const scraped = await deps.scrapeMetrics(input.query, ids);
      provenance.scraped = true;
      const scrapedById = new Map(scraped.map((m) => [m.videoId, m]));
      for (const [id, cand] of byId) {
        const m = scrapedById.get(id);
        if (!m) continue;
        const metrics: Record<string, string | number | undefined> = { ...cand.metrics };
        if (m.contribution !== undefined) metrics['기여도'] = m.contribution;
        if (m.performance !== undefined) metrics['성과도'] = m.performance;
        if (m.exposure !== undefined) metrics['노출확률'] = m.exposure;
        if (m.publishedAge !== undefined) metrics['게시일'] = m.publishedAge;
        cand.metrics = metrics;
      }
    } catch (err) {
      pushNote(provenance, 'scrapeMetrics', err);
      // 크롤링 실패: 지표 병합 생략, stats만으로 분류 진행.
    }
  }

  const videos = [...byId.values()];

  // ④ Sonnet 분류(M3).
  let classificationResult: ClassifyDiscoveredVideosResult | null = null;
  const classById = new Map<string, VideoClassification>();
  if (videos.length > 0) {
    const discovered: DiscoveredVideo[] = videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.channelTitle,
      viewCount: v.viewCount,
      ...(v.metrics ? { metrics: v.metrics } : {}),
    }));
    try {
      classificationResult = deps.classify
        ? await deps.classify(discovered, input.mode)
        : await classifyDiscoveredVideos({
            product: input.product,
            target: input.target,
            videos: discovered,
            mode: input.mode,
            ...(input.key_content_context
              ? { key_content_context: input.key_content_context }
              : {}),
          });
      provenance.classified = classificationResult.fallback_count === 0;
      if (classificationResult.fallback_count > 0) {
        provenance.notes.push(
          `classify: ${classificationResult.fallback_count}개 영상 폴백(ambiguous)`,
        );
      }
      for (const c of classificationResult.classifications) classById.set(c.videoId, c);
    } catch (err) {
      pushNote(provenance, 'classify', err);
    }
  }

  // ⑤ 후보 = fit + 성과좋음(candidate_basis). 분류 실패 영상은 후보 제외.
  const candidateVideos: DiscoveryCandidate[] = [];
  for (const v of videos) {
    const cls = classById.get(v.videoId);
    if (cls) v.classification = cls;
    if (cls?.candidate_basis) candidateVideos.push(v);
  }

  return {
    mode: input.mode,
    query: input.query,
    videos: videos.filter((v) => v.classification),
    candidates: candidateVideos,
    provenance,
    classificationResult,
  };
}

// ── 변환: 후보 → 키/풀링 Step 입력 ───────────────────────────────────────────

const GRADE_RANK: Record<string, number> = {
  worst: 0,
  bad: 1,
  normal: 2,
  good: 3,
  great: 4,
  wow: 5,
};

/** Viewtrap 6등급 문자열 → l5-core 3등급. wow·great→great, good→good, 그 외→normal. */
function toScore(grade: string | number | undefined): 'normal' | 'good' | 'great' {
  if (typeof grade !== 'string') return 'normal';
  const rank = GRADE_RANK[grade.trim().toLowerCase()];
  if (rank === undefined) return 'normal';
  if (rank >= GRADE_RANK.great) return 'great';
  if (rank === GRADE_RANK.good) return 'good';
  return 'normal';
}

/** 후보 metrics에서 한 지표의 최고 등급을 3등급으로 환산. */
function bestScore(
  candidates: DiscoveryCandidate[],
  metricKey: string,
): 'normal' | 'good' | 'great' {
  let best = 0;
  for (const c of candidates) {
    const raw = c.metrics?.[metricKey];
    if (typeof raw !== 'string') continue;
    const rank = GRADE_RANK[raw.trim().toLowerCase()];
    if (rank !== undefined && rank > best) best = rank;
  }
  if (best >= GRADE_RANK.great) return 'great';
  if (best === GRADE_RANK.good) return 'good';
  return 'normal';
}

/**
 * 후보의 "viewtrap 선정이유"를 실데이터(조회수·성과도·기여도·노출확률·분류 사유)로 생성.
 * LLM 추측이 아니라 실측 + 분류 근거를 한 문장으로 묶는다.
 */
export function buildSelectionReason(candidate: DiscoveryCandidate): string {
  const parts: string[] = [`조회수 ${candidate.viewCount.toLocaleString('en-US')}`];
  const m = candidate.metrics ?? {};
  if (m['성과도'] !== undefined) parts.push(`성과도 ${m['성과도']}`);
  if (m['기여도'] !== undefined) parts.push(`기여도 ${m['기여도']}`);
  if (m['노출확률'] !== undefined) parts.push(`노출확률 ${m['노출확률']}`);
  const reasons = candidate.classification?.reasons ?? [];
  const reasonText = reasons.length ? ` — ${reasons.join('; ')}` : '';
  return `Viewtrap 실측: ${parts.join(' · ')}${reasonText}`;
}

export interface ToKeyViewtrapValidationOptions {
  /** Step7에서 검증에 쓴 검색 키워드들. */
  validatedKeywords: string[];
  /** 채널값/사람값 리스크는 크롤링으로 알 수 없는 사람 판단 — 기본 false. */
  channelValueRisk?: boolean;
  personValueRisk?: boolean;
}

/**
 * 후보들 → buildViewtrapValidation 입력(키 Step8용, Omit<...,'verdict'>).
 * performance/contribution = 후보들 중 최고 등급의 3등급 환산.
 * growth_status = 'unknown'(테이블에 성장 신호 없음 — 실데이터만, 추측 금지).
 */
export function toKeyViewtrapValidationInput(
  candidates: DiscoveryCandidate[],
  options: ToKeyViewtrapValidationOptions,
): {
  validated_keywords: string[];
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  channel_value_risk: boolean;
  person_value_risk: boolean;
} {
  return {
    validated_keywords: [...options.validatedKeywords],
    candidate_titles: candidates.map((c) => c.title),
    performance_score: bestScore(candidates, '성과도'),
    contribution_score: bestScore(candidates, '기여도'),
    growth_status: 'unknown',
    channel_value_risk: options.channelValueRisk ?? false,
    person_value_risk: options.personValueRisk ?? false,
  };
}

export interface ToPullingViewtrapValidationOptions {
  /** Step5 검색 키워드(buildPullingViewtrapValidation.search_keyword). */
  searchKeyword: string;
  /** 저구독 채널에서도 재현되는지 — 크롤링으로 모름, 기본 false. */
  reproducibleLowSubscriber?: boolean;
  channelValueRisk?: boolean;
  personValueRisk?: boolean;
}

/**
 * 후보들 → buildPullingViewtrapValidation 입력(풀링 Step5용).
 */
export function toPullingViewtrapValidationInput(
  candidates: DiscoveryCandidate[],
  options: ToPullingViewtrapValidationOptions,
): {
  search_keyword: string;
  candidate_titles: string[];
  performance_score: 'normal' | 'good' | 'great';
  contribution_score: 'normal' | 'good' | 'great';
  growth_status: 'growing' | 'stalled' | 'unknown';
  reproducible_low_subscriber: boolean;
  channel_value_risk: boolean;
  person_value_risk: boolean;
} {
  return {
    search_keyword: options.searchKeyword,
    candidate_titles: candidates.map((c) => c.title),
    performance_score: bestScore(candidates, '성과도'),
    contribution_score: bestScore(candidates, '기여도'),
    growth_status: 'unknown',
    reproducible_low_subscriber: options.reproducibleLowSubscriber ?? false,
    channel_value_risk: options.channelValueRisk ?? false,
    person_value_risk: options.personValueRisk ?? false,
  };
}

/**
 * 후보들 → findLongtailEvergreen 입력(풀링 Step8용, LongtailCandidateInput[]).
 * published_age = 크롤링 metrics['게시일'] 신호('old'|'recent'), 미상이면 'recent'(노다지 제외).
 * exposure_probability = metrics['노출확률']의 3등급 환산.
 * evergreen_reason/adapted_topic = 실데이터 기반 선정이유 + 후보 제목.
 */
export function toLongtailCandidateInputs(candidates: DiscoveryCandidate[]): {
  source_title: string;
  published_age: 'old' | 'recent';
  exposure_probability: 'normal' | 'good' | 'great';
  evergreen_reason: string;
  adapted_topic: string;
}[] {
  return candidates.map((c) => {
    const ageRaw = c.metrics?.['게시일'];
    const published_age: 'old' | 'recent' = ageRaw === 'old' ? 'old' : 'recent';
    return {
      source_title: c.title,
      published_age,
      exposure_probability: toScore(c.metrics?.['노출확률']),
      evergreen_reason: buildSelectionReason(c),
      adapted_topic: c.title,
    };
  });
}

// re-export deps 타입을 caller가 조립할 수 있게.
export type { DiscoveryClassificationDeps };
