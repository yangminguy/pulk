// CMO 풀링 콘텐츠 주제 탐색 보고서 (pulling_content_topic_discovery_workflow_v2)
//
// 키 콘텐츠 기획서가 확정된 뒤, 그 키 콘텐츠를 볼 만한 시청자를 데려오는
// "풀링 주제 4~5개"를 실데이터 기반으로 선별한다. 풀링의 역할은 현상 → 욕구.
//   ① LLM이 현상 영역 → 주제 탐색용 검색어 후보 생성(데이터 탐색용, 카피 고도화 아님)
//   ② YouTube API/CDP 뷰트랩으로 검색어별 후보 영상 발굴(성과도/기여도/노출확률 실측)
//   ③ 롱폼·5만+·노출확률 필터 + video_score 점수화(노출확률 최우선 가중)
//   ④ LLM 클러스터링 → 같은 현상/타깃/검색의도 영상을 주제로 묶음
//   ⑤ topic_score로 4~5개 주제 선별 + 등급 A~D
//   ⑥ 주제별 현상→욕구→계획→행동→보상 퍼널 + 상품 접목/키 콘텐츠 연결 논리(LLM, 병렬)
//
// 순수성: 모든 I/O(YouTube/CDP/LLM)는 주입된 deps로만. 점수화/등급/필터는 결정론 순수함수
// (단위테스트 대상, 개발규칙 §3). 외부 데이터/LLM 실패는 해당 항목만 건너뛰고 진행(throw 금지).
//
// 뷰트랩 차감 보호: 검색어(=뷰트랩 검색)는 콘텐츠 세트당 최대 10개로 제한한다(워크플로우 §6).

import {
  type ReportProduct,
  type ReportSourceVideo,
  type VideoDurationInfo,
  type IdentityMatch,
  isQualifiedCandidate,
} from './key-content-report';

// ── 입력/출력 타입 ───────────────────────────────────────────────────────────

/** 확정된 키 콘텐츠 기획서 요약 — 풀링이 현상→욕구로 이어붙일 대상. */
export interface PullingKeyContent {
  key_topic_title: string;
  recommended_video_id?: string | null;
  /** 키 콘텐츠 퍼널(욕구→계획→행동→보상) — 있으면 연결 논리에 사용. */
  funnel_desire?: string;
  funnel_plan?: string;
  funnel_action?: string;
  funnel_reward?: string;
}

/** draft에서 추린 풀링 탐색 컨텍스트(현상 후보·검색축). plugin이 key_content_draft로 채운다. */
export interface PullingDraftContext {
  category: string;
  entryStage: string;
  itemFeatures: string[];
  itemBenefits: string[];
  problems: string[];
  searchAxes: string[];
}

export interface PullingReportDeps {
  /** 검색어 1개 발굴 → 영상[](통계+성과도/기여도/노출확률 등급 병합). 실패 시 [] 권장. */
  discover(keyword: string): Promise<ReportSourceVideo[]>;
  /** videoId[] → duration/최근성. 롱폼·쇼츠 판별용. */
  getDurations(videoIds: string[]): Promise<VideoDurationInfo[]>;
  /** videoId → 인기순 상위 댓글(시청자 정체성 판단 근거). 미주입/실패 시 제목 기반. */
  getComments?(videoId: string): Promise<string[]>;
  /** videoId[] → 영상별 채널 규모 대비 초과성과(0~1). channels.list 실측. 미주입 시 중립 0.5. */
  getChannelAdj?(videoIds: string[]): Promise<Record<string, number>>;
  /**
   * videoId → 노출확률 등급. viewtrap에 사장님이 로드해둔 테이블에서 수집(코드 검색은 차단됨).
   * 풀 영상과 겹치는 것만 병합. 미주입/미일치 시 노출확률은 중립(가중 0.35).
   */
  getExposureMap?(): Promise<Record<string, string>>;
  /** LLM(JSON 응답 기대). */
  llmComplete: (prompt: string) => Promise<string>;
  /** 최근성 기준 현재시각(ms). 테스트 주입용. */
  nowMs?: number;
}

export type TopicGrade = 'A' | 'B' | 'C' | 'D';

export interface PullingEvidenceVideo {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  channelTitle: string;
  viewCount: number;
  publishedAt: string;
  isShort: boolean;
  exposure: string | null;
  performance: string | null;
  contribution: string | null;
  videoScore: number;
  source: '뷰트랩' | '뷰트랩/YouTube' | 'YouTube';
}

export interface PullingFunnel {
  phenomenon: string;
  desire: string;
  plan: string;
  action: string;
  reward: string;
}

export interface PullingTopic {
  rank: number;
  topic_name: string;
  grade: TopicGrade;
  /** 담당 현상(고객이 지금 겪는 문제). */
  target_phenomenon: string;
  /** 만들 욕구. */
  created_desire: string;
  /** 연결할 키 콘텐츠. */
  linked_key_content: string;
  evidence_videos: PullingEvidenceVideo[];
  /** 이 영상들을 끌어당기는 시청자 정체성(한 줄) + 우리 타깃과 정합성. */
  viewer_identity?: string;
  identity_match?: IdentityMatch;
  identity_reason?: string;
  selection_reason: string;
  /** 내 상품에 접목하면 어떻게 풀리는가(현상→상품 등장). */
  product_application: string;
  funnel: PullingFunnel;
  topic_score: number;
}

export interface ViewtrapBudgetSlot {
  slot: number;
  query: string;
  purpose: string;
  resultCount: number;
  goodOrGreatCount: number;
}

export interface PullingContentReport {
  product: string;
  target: string;
  key_content_title: string;
  key_funnel_summary: string;
  pulling_role: string; // '현상 → 욕구'
  search_summary: {
    keywords_used: number;
    videos_collected: number;
    videos_after_dedup: number;
    longform_count: number;
    over_50k_count: number;
    qualified_count: number;
  };
  viewtrap_budget: {
    used: number;
    limit: number;
    slots: ViewtrapBudgetSlot[];
  };
  topics: PullingTopic[];
  approval_request: string;
  provenance: {
    keywords_generated: number;
    clusters_formed: number;
    topics_selected: number;
    notes: string[];
  };
}

// ── 결정론 순수함수: 점수화 + 등급 (단위테스트 대상) ──────────────────────────

const MIN_VIEWS = 50_000;
const VIEWTRAP_SEARCH_LIMIT = 10; // 콘텐츠 세트당 뷰트랩 검색 예산(워크플로우 §6)

/** 뷰트랩 등급 문자열 → 0~1 점수. 영어 lowercase(great/good/normal/bad/worst/wow) + 한글 폴백. */
export function gradeToScore(grade: string | null | undefined): number {
  const g = String(grade ?? '').trim().toLowerCase();
  switch (g) {
    case 'great':
    case 'wow':
    case '매우좋음':
      return 1.0;
    case 'good':
    case '좋음':
      return 0.75;
    case 'normal':
    case '보통':
      return 0.5;
    case 'bad':
    case '나쁨':
      return 0.25;
    case 'worst':
    case '매우나쁨':
      return 0.0;
    default:
      return 0.5; // 미수집 → 중립
  }
}

export interface VideoScoreInput {
  exposure: string | null;
  contribution: string | null;
  performance: string | null;
  viewCount: number;
  /** 일평균 조회수(없으면 0 → 조회수만 사용). */
  viewsPerDay?: number;
  /** 채널 규모 대비 초과 성과(0~1, 모르면 0.5 중립). */
  channelAdj?: number;
  /** 주제 적합성(0~1, 모르면 0.5 중립). */
  topicFit?: number;
}

/**
 * 영상 단위 점수(순수, 0~1). 워크플로우 §9-1 가중치.
 *   노출확률 0.35 + 기여도 0.20 + 성과도 0.15 + 조회수 0.10 + 채널보정 0.10 + 주제적합 0.10
 * 노출확률이 가장 중요 — 풀링은 "현재 홈/탐색에서 선택받을 가능성"을 조회수보다 크게 본다.
 */
export function videoScore(v: VideoScoreInput): number {
  const exposure = gradeToScore(v.exposure);
  const contribution = gradeToScore(v.contribution);
  const performance = gradeToScore(v.performance);
  // 조회수 점수: 일평균 우선, 없으면 절대 조회수. 10만/일 또는 50만 누적에서 포화.
  const viewsScore =
    v.viewsPerDay && v.viewsPerDay > 0
      ? Math.min(v.viewsPerDay / 5_000, 1)
      : Math.min(v.viewCount / 500_000, 1);
  const channelAdj = v.channelAdj ?? 0.5;
  const topicFit = v.topicFit ?? 0.5;
  return (
    exposure * 0.35 +
    contribution * 0.2 +
    performance * 0.15 +
    viewsScore * 0.1 +
    channelAdj * 0.1 +
    topicFit * 0.1
  );
}

/**
 * 채널 규모 대비 영상 초과성과(순수, 0~1). 워크플로우 §5-3 outlier_score.
 * 단순히 대형 채널이라 조회수가 높은 영상과, 주제 자체가 강해 성과가 난 영상을 구분한다.
 *   ratio = 영상조회수 / 채널평균조회수. 2배↑ → 1.0(강한 초과성과), 1배 → 0.5, 0 → 0.
 *   채널평균 미상(0)이면 0.5 중립.
 */
export function computeChannelOutlier(videoViews: number, channelAvgViews: number): number {
  if (!channelAvgViews || channelAvgViews <= 0) return 0.5;
  const ratio = videoViews / channelAvgViews;
  return Math.max(0, Math.min(ratio / 2, 1));
}

export interface TopicScoreInput {
  /** 주제 내 상위 영상 video_score들. */
  videoScores: number[];
  /** 동일 주제 반복 출현 빈도(영상 수). */
  repeatCount: number;
  /** 키 콘텐츠 연결성(0~1). */
  keyLink: number;
  /** 상품 접목 가능성(0~1). */
  productLink: number;
}

/**
 * 주제 단위 점수(순수, 0~1). 워크플로우 §9-2.
 *   상위 영상 평균 video_score 0.45 + 최고 노출확률 영상 0.20
 *   + 반복 출현 빈도 0.10 + 키 콘텐츠 연결성 0.15 + 상품 접목 0.10
 */
export function topicScore(t: TopicScoreInput): number {
  const scores = t.videoScores.length ? t.videoScores : [0];
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best = Math.max(...scores);
  const repeat = Math.min(t.repeatCount / 3, 1); // 3개 이상이면 포화
  return (
    avg * 0.45 +
    best * 0.2 +
    repeat * 0.1 +
    Math.max(0, Math.min(1, t.keyLink)) * 0.15 +
    Math.max(0, Math.min(1, t.productLink)) * 0.1
  );
}

/**
 * 등급(순수). 데이터 강함(상위 영상 평균 점수) + 키 콘텐츠 연결성 강함으로 A~D.
 *   A: 데이터 강 + 연결 강 / B: 데이터 강 + 연결 보통 / C: 데이터 보통 + 연결 강 / D: 약함
 */
export function decideGrade(avgVideoScore: number, keyLink: number): TopicGrade {
  const strongData = avgVideoScore >= 0.6;
  const okData = avgVideoScore >= 0.45;
  const strongLink = keyLink >= 0.6;
  if (strongData && strongLink) return 'A';
  if (strongData && !strongLink) return 'B';
  if (okData && strongLink) return 'C';
  return 'D';
}

// ── LLM JSON 파서(관대) ──────────────────────────────────────────────────────

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start < 0) return fallback;
  const text = body.slice(start).trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const lastObj = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (lastObj > 0) {
      try {
        return JSON.parse(text.slice(0, lastObj + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

const normMatch = (s: unknown): IdentityMatch | undefined => {
  const v = String(s ?? '').trim().toLowerCase();
  return v === 'match' || v === 'partial' || v === 'mismatch' ? (v as IdentityMatch) : undefined;
};

const normGrade = (s: unknown): TopicGrade => {
  const v = String(s ?? '').trim().toUpperCase();
  return v === 'A' || v === 'B' || v === 'C' || v === 'D' ? (v as TopicGrade) : 'C';
};

const clamp01 = (n: unknown, dflt = 0.5): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
};

// ── 프롬프트 ─────────────────────────────────────────────────────────────────

function header(p: ReportProduct, kc: PullingKeyContent): string {
  return [
    `상품명: ${p.product_name}`,
    `카테고리: ${p.category}`,
    `핵심 타깃: ${p.target_audience}`,
    `핵심 제공가치: ${p.core_offer}`,
    `확정된 키 콘텐츠: "${kc.key_topic_title}"`,
  ].join('\n');
}

/** Step 1~2: 현상 영역 정의 + 뷰트랩/YouTube 검색어 후보 생성(데이터 탐색용). */
function searchKeywordPrompt(
  p: ReportProduct,
  kc: PullingKeyContent,
  ctx: PullingDraftContext,
  count: number,
): string {
  return `${header(p, kc)}

[풀링 콘텐츠의 역할]
키 콘텐츠는 "욕구 → 계획 → 행동 → 보상"을 담당한다(이미 확정).
풀링 콘텐츠는 그 앞단 "현상 → 욕구"를 담당한다 — 즉 시청자가 자기 문제(현상)를 깨닫고, 그 문제를 해결하려면 마케팅을 제대로 알아야겠다는 욕구를 갖게 만들어, 키 콘텐츠로 넘어오게 한다.

[참고 컨텍스트]
카테고리: ${ctx.category}
키 콘텐츠 진입 단계: ${ctx.entryStage}
아이템 기능/장점: ${[...ctx.itemFeatures, ...ctx.itemBenefits].join(', ')}
실제 사용자 문제: ${ctx.problems.join(', ')}
기존 검색축: ${ctx.searchAxes.join(', ')}

위를 바탕으로, 풀링 주제를 찾기 위한 **YouTube/뷰트랩 검색어 후보를 정확히 ${count}개** 만들어라.
- ★★ 검색어는 반드시 **2~4단어의 짧은 핵심 명사구**여야 한다. 긴 문장형 검색어 금지.
  뷰트랩은 긴 문장("광고비 썼는데 효과 없음 소자본 창업")을 정확히 매칭하지 못해 무관한 인기영상(축구 하이라이트 등)을 반환한다(실측). 짧은 키워드만 정확히 매칭된다.
  좋은 예: "1인 창업 마케팅", "소상공인 인스타", "마케팅 자동화", "광고비 효율", "콘텐츠 매출 전환", "릴스 마케팅".
  나쁜 예: "광고비 썼는데 효과 없는 소자본 창업", "인스타 꾸준히 올려도 매출 없음" (너무 길어 매칭 실패).
- 각 검색어는 우리 타깃이 겪는 "현상"을 건드려야 하고, 그 현상이 키 콘텐츠의 욕구로 이어질 수 있어야 한다.
- ★ 시청자 정체성: 그 검색어를 검색·시청할 사람이 우리 타깃(${p.target_audience})과 같은 정체성 레벨이어야 한다. 더 낮은 작업·실무 단위(예: "OO를 직접 하고 싶은 실무자")를 끌어당기는 검색어는 만들지 마라.
- 서로 다른 현상 영역을 덮어라(한 현상에 몰리지 마라).

JSON 배열로만 출력(정확히 ${count}개):
[{"query":"검색어","purpose":"이 검색어가 건드리는 현상/목적 한 줄","phenomenon":"담당 현상","desire":"만들 욕구"}]`;
}

/** Step 9: 후보 영상 풀 → 주제 클러스터로 묶기 + 4~5개 선별. */
function clusterPrompt(
  p: ReportProduct,
  kc: PullingKeyContent,
  pool: {
    idx: number;
    videoId: string;
    title: string;
    channelTitle: string;
    viewCount: number;
    exposure: string | null;
    performance: string | null;
    contribution: string | null;
    query: string;
  }[],
  commentsMap: Map<string, string[]>,
  targetCount: number,
): string {
  const list = pool
    .map((c) => {
      const head = `${c.idx}. [${c.query}] "${c.title}" — ${c.channelTitle}, 조회수 ${c.viewCount}, 노출확률 ${c.exposure ?? '-'}, 성과도 ${c.performance ?? '-'}, 기여도 ${c.contribution ?? '-'} (videoId=${c.videoId})`;
      const cm = (commentsMap.get(c.videoId) ?? []).slice(0, 2).map((t) => `     · ${t.replace(/\s+/g, ' ').slice(0, 80)}`);
      return cm.length ? `${head}\n   [상위 댓글]\n${cm.join('\n')}` : head;
    })
    .join('\n');
  return `${header(p, kc)}

아래는 검색어별로 모은 후보 영상들이다(이미 롱폼·5만+·성과 우수 전제). 각 영상에 상위 댓글을 붙였다.
${list}

이 영상들을 "같은 현상/같은 타깃 상황/같은 검색 의도/같은 키 콘텐츠 연결"을 기준으로 주제 클러스터로 묶고, 그 중 풀링 콘텐츠로 가장 좋은 **${targetCount}개 주제**를 골라라.

★★ 최우선 — 시청자 정체성 정합성 ★★
- 댓글은 실제로 누가 이 영상을 보는지 보여주는 직접 증거다. 제목(제작자 의도)과 댓글(실제 시청자)을 함께 보고 시청자 정체성을 판단하라.
- 주제가 마케팅/카테고리상 관련 있어도, 그 영상을 클릭·시청할 사람이 우리 타깃(${p.target_audience})보다 낮은 작업·실무 단위 정체성이면 그 클러스터는 제외하라(조회수가 높아도).
- 우리 타깃과 같은 정체성(대표/사업가가 "내 문제다"라고 느낄)을 끌어당기는 주제만 남겨라.

각 주제는 현상→욕구를 담당해야 하고, 확정된 키 콘텐츠 "${kc.key_topic_title}"로 자연스럽게 이어져야 한다.

★ 데이터 우선순위: 뷰트랩 실측 지표(노출확률 > 기여도 > 성과도)가 채워진 영상을 우선 근거로 삼아라. 노출확률/성과도/기여도가 '-'인 영상은 조회수가 높아도 후순위로 두고, 등급이 좋은 영상이 있는 클러스터를 우선 선별하라.
★ 근거영상 개수: 각 주제의 video_indexes에는 같은 현상/타깃을 다루는 영상을 **2~3개씩** 묶어라(영상 1개짜리 주제는 피하라). 가능하면 등급(성과도/기여도)이 있는 영상을 1개 이상 포함하라.

JSON 배열로만 출력(정확히 ${targetCount}개, rank 1~${targetCount}, video_indexes는 위 번호):
[{"rank":1,"topic_name":"풀링 주제명","target_phenomenon":"담당 현상","created_desire":"만들 욕구","video_indexes":[0,3],"viewer_identity":"이 주제가 끌어당기는 시청자 한 줄","identity_match":"match|partial|mismatch","identity_reason":"우리 타깃 정체성과 같/다른 이유","key_link":0.0~1.0,"product_link":0.0~1.0,"selection_reason":"데이터 기반 선택 이유 한 줄"}]`;
}

/** Step 11: 주제별 현상→욕구→계획→행동→보상 퍼널 + 상품 접목 논리. */
function topicLogicPrompt(
  p: ReportProduct,
  kc: PullingKeyContent,
  topic: { topic_name: string; target_phenomenon: string; created_desire: string; evidenceTitles: string[] },
): string {
  return `${header(p, kc)}

풀링 주제: "${topic.topic_name}"
담당 현상: ${topic.target_phenomenon}
만들 욕구: ${topic.created_desire}
근거 영상 제목들: ${topic.evidenceTitles.join(' / ')}

이 풀링 주제가 어떻게 작동하는지 분석하라.
1) 퍼널(funnel): 이 주제가 건드리는 현상 / 만드는 욕구 / 키 콘텐츠에서 세우는 계획 / 유도하는 행동(상품/상담) / 기대 보상.
   - 풀링은 현상→욕구, 키 콘텐츠는 계획→행동→보상을 담당한다는 분리를 지켜라.
2) 상품 접목(product_application): 이 콘텐츠에서 상품을 바로 팔지 않고, 먼저 현상을 인식시키고 → 원인을 (피상적 해결책이 아니라 마케팅 구조 부재로) 설명하고 → 키 콘텐츠 "${kc.key_topic_title}"로 연결하고 → 마지막에 우리 상품 "${p.product_name}"이 그 구조를 반복 실행하는 시스템으로 등장하는 흐름을 한 문단으로.

JSON 객체로만 출력:
{"funnel":{"phenomenon":"...","desire":"...","plan":"...","action":"...","reward":"..."},"product_application":"..."}`;
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function ytUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function metricStr(v: ReportSourceVideo, key: string): string | null {
  const raw = v.metrics?.[key];
  return raw == null || String(raw).trim() === '' ? null : String(raw);
}

// ── 메인 오케스트레이션 ──────────────────────────────────────────────────────

export interface RunPullingReportInput {
  product: ReportProduct;
  keyContent: PullingKeyContent;
  draftContext: PullingDraftContext;
  /** 생성할 검색어(=뷰트랩 검색) 수. 기본 10(예산 상한). */
  maxKeywords?: number;
  /** 선별할 풀링 주제 수. 기본 5. */
  targetTopics?: number;
  /** plugin이 주입하는 진단 노트(CDP 라이브 여부 등). */
  extraNotes?: string[];
}

export async function runPullingContentReport(
  input: RunPullingReportInput,
  deps: PullingReportDeps,
): Promise<PullingContentReport> {
  const p = input.product;
  const kc = input.keyContent;
  const nowMs = deps.nowMs ?? Date.now();
  const notes: string[] = [...(input.extraNotes ?? [])];
  const maxKeywords = Math.min(input.maxKeywords ?? VIEWTRAP_SEARCH_LIMIT, VIEWTRAP_SEARCH_LIMIT);
  const targetTopics = input.targetTopics ?? 5;

  // ── Step 1~2: LLM 검색어 후보 생성(현상 영역 기반) ──────────────────────────
  let searchPlan: { query: string; purpose: string; phenomenon: string; desire: string }[] = [];
  try {
    const raw = await deps.llmComplete(searchKeywordPrompt(p, kc, input.draftContext, maxKeywords));
    const parsed = parseJson<Array<{ query?: string; purpose?: string; phenomenon?: string; desire?: string }>>(raw, []);
    searchPlan = parsed
      .map((s) => ({
        query: String(s.query ?? '').trim(),
        purpose: String(s.purpose ?? '').trim(),
        phenomenon: String(s.phenomenon ?? '').trim(),
        desire: String(s.desire ?? '').trim(),
      }))
      .filter((s) => s.query.length > 0)
      .slice(0, maxKeywords);
  } catch (e) {
    notes.push(`검색어 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  // 폴백: draft 검색축으로.
  if (searchPlan.length === 0) {
    searchPlan = input.draftContext.searchAxes.slice(0, maxKeywords).map((q) => ({
      query: q,
      purpose: '검색축 폴백',
      phenomenon: q,
      desire: '',
    }));
    notes.push('LLM 검색어 생성 실패 — draft 검색축으로 폴백');
  }

  // ── Step 3~7: 검색어별 발굴 + duration → 적격 후보 풀(뷰트랩 예산 = 검색어 수) ──
  const budgetSlots: ViewtrapBudgetSlot[] = [];
  const seen = new Set<string>();
  let collected = 0;
  let longform = 0;
  let over50k = 0;
  type PoolItem = {
    idx: number;
    v: ReportSourceVideo;
    dur: VideoDurationInfo | undefined;
    query: string;
    exposure: string | null;
    performance: string | null;
    contribution: string | null;
    vScore: number;
  };
  const pool: PoolItem[] = [];

  for (let slot = 0; slot < searchPlan.length; slot += 1) {
    const sp = searchPlan[slot];
    let videos: ReportSourceVideo[] = [];
    try {
      videos = await deps.discover(sp.query);
    } catch (e) {
      notes.push(`discover("${sp.query}") 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    collected += videos.length;
    let durations: VideoDurationInfo[] = [];
    if (videos.length > 0) {
      try {
        durations = await deps.getDurations(videos.map((v) => v.videoId));
      } catch (e) {
        notes.push(`getDurations("${sp.query}") 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const durMap = new Map(durations.map((d) => [d.videoId, d]));
    let goodOrGreat = 0;
    for (const v of videos) {
      const dur = durMap.get(v.videoId);
      if (dur && !dur.isShort) longform += 1;
      if (v.viewCount >= MIN_VIEWS) over50k += 1;
      const perf = metricStr(v, '성과도');
      const contrib = metricStr(v, '기여도');
      if (gradeToScore(perf) >= 0.75 || gradeToScore(contrib) >= 0.75) goodOrGreat += 1;
      // 적격 + 중복 제거(video_id 기준).
      if (seen.has(v.videoId)) continue;
      if (!isQualifiedCandidate(v, dur)) continue;
      seen.add(v.videoId);
      const exposure = metricStr(v, '노출확률');
      const vScore = videoScore({
        exposure,
        contribution: contrib,
        performance: perf,
        viewCount: v.viewCount,
      });
      pool.push({ idx: pool.length, v, dur, query: sp.query, exposure, performance: perf, contribution: contrib, vScore });
    }
    budgetSlots.push({ slot: slot + 1, query: sp.query, purpose: sp.purpose, resultCount: videos.length, goodOrGreatCount: goodOrGreat });
  }

  // 시청자 정체성 근거 — 풀 영상 상위 댓글(병렬 수집).
  const commentsMap = new Map<string, string[]>();
  if (deps.getComments && pool.length > 0) {
    const uniqIds = [...new Set(pool.map((c) => c.v.videoId))];
    const fetched = await Promise.all(
      uniqIds.map(async (id) => {
        try {
          return [id, await deps.getComments!(id)] as const;
        } catch {
          return [id, [] as string[]] as const;
        }
      }),
    );
    let withComments = 0;
    for (const [id, cs] of fetched) {
      commentsMap.set(id, cs);
      if (cs.length) withComments += 1;
    }
    notes.push(`시청자 정체성: 후보 ${uniqIds.length}개 중 ${withComments}개 영상 댓글 확보`);
  }

  // ── Step 6: 노출확률 병합(viewtrap 로드 테이블) → exposure 채움 ──────────────
  // viewtrap은 코드 검색이 막혀(rules/50) 사장님이 로드해둔 테이블의 노출확률만 수집.
  // 풀 영상과 videoId가 겹치는 것만 병합. 노출확률은 video_score 최대 가중(0.35).
  if (deps.getExposureMap && pool.length > 0) {
    try {
      const expoMap = await deps.getExposureMap();
      let applied = 0;
      for (const it of pool) {
        const ex = expoMap[it.v.videoId];
        if (ex && !it.exposure) {
          it.exposure = ex;
          it.vScore = videoScore({ exposure: it.exposure, contribution: it.contribution, performance: it.performance, viewCount: it.v.viewCount });
          applied += 1;
        }
      }
      notes.push(
        applied > 0
          ? `노출확률(viewtrap 로드 테이블): 풀 ${pool.length}개 중 ${applied}개 매칭 병합`
          : `노출확률: viewtrap 로드 테이블에 풀 영상과 겹치는 항목 없음(사장님이 풀링 키워드를 viewtrap에서 검색하면 병합됨)`,
      );
    } catch (e) {
      notes.push(`노출확률 수집 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 4: 채널 보정(channels.list) → video_score 재계산 ──────────────────
  // 대형 채널이라 조회수 높은 영상과 주제 자체가 강한 영상을 구분(outlier). 미주입 시 중립 유지.
  if (deps.getChannelAdj && pool.length > 0) {
    try {
      const adjMap = await deps.getChannelAdj(pool.map((it) => it.v.videoId));
      let applied = 0;
      for (const it of pool) {
        const adj = adjMap[it.v.videoId];
        if (typeof adj === 'number' && Number.isFinite(adj)) {
          it.vScore = videoScore({
            exposure: it.exposure,
            contribution: it.contribution,
            performance: it.performance,
            viewCount: it.v.viewCount,
            channelAdj: adj,
          });
          applied += 1;
        }
      }
      notes.push(`채널 보정: 후보 ${pool.length}개 중 ${applied}개 outlier 반영(channels.list)`);
    } catch (e) {
      notes.push(`채널 보정 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 9~10: LLM 클러스터링 → 주제 4~5개 선별 ────────────────────────────
  let clusters: Array<{
    rank: number;
    topic_name: string;
    target_phenomenon: string;
    created_desire: string;
    video_indexes: number[];
    viewer_identity?: string;
    identity_match?: IdentityMatch;
    identity_reason?: string;
    key_link: number;
    product_link: number;
    selection_reason: string;
  }> = [];

  if (pool.length > 0) {
    // 클러스터 입력은 상위 N개로 제한(거대 프롬프트 타임아웃 방지).
    // ★ 등급(노출확률/성과도/기여도) 있는 영상을 최우선 — 조회수만 높은 대형채널·해외영상으로
    //    쏠리면 뷰트랩 실측 지표가 통째로 비어 모든 주제가 중립 등급으로 수렴하는 실측 버그 방지.
    //    같은 등급 보유 여부 내에서 video_score 내림차순. 전체 pool은 poolByIdx로 유지.
    const gradeCount = (it: PoolItem) =>
      (it.exposure ? 1 : 0) + (it.performance ? 1 : 0) + (it.contribution ? 1 : 0);
    const clusterPool = [...pool]
      .sort((a, b) => gradeCount(b) - gradeCount(a) || b.vScore - a.vScore)
      .slice(0, 15);
    try {
      const raw = await deps.llmComplete(
        clusterPrompt(
          p,
          kc,
          clusterPool.map((it) => ({
            idx: it.idx,
            videoId: it.v.videoId,
            title: it.v.title,
            channelTitle: it.v.channelTitle,
            viewCount: it.v.viewCount,
            exposure: it.exposure,
            performance: it.performance,
            contribution: it.contribution,
            query: it.query,
          })),
          commentsMap,
          targetTopics,
        ),
      );
      const parsed = parseJson<Array<Record<string, unknown>>>(raw, []);
      clusters = parsed.map((c, i) => ({
        rank: Number(c.rank ?? i + 1),
        topic_name: String(c.topic_name ?? `풀링 주제 ${i + 1}`),
        target_phenomenon: String(c.target_phenomenon ?? ''),
        created_desire: String(c.created_desire ?? ''),
        video_indexes: Array.isArray(c.video_indexes) ? c.video_indexes.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [],
        viewer_identity: c.viewer_identity ? String(c.viewer_identity) : undefined,
        identity_match: normMatch(c.identity_match),
        identity_reason: c.identity_reason ? String(c.identity_reason) : undefined,
        key_link: clamp01(c.key_link),
        product_link: clamp01(c.product_link),
        selection_reason: String(c.selection_reason ?? ''),
      }));
    } catch (e) {
      notes.push(`클러스터링 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    // 정체성 불일치 클러스터 제외.
    const before = clusters.length;
    clusters = clusters.filter((c) => {
      if (c.identity_match === 'mismatch') {
        notes.push(`정체성 불일치 제외(클러스터): ${c.topic_name} — ${c.identity_reason ?? ''}`);
        return false;
      }
      return true;
    });
    if (before > 0 && clusters.length === 0) {
      notes.push('모든 클러스터가 정체성 불일치 — 폴백 선별 사용');
    }
  } else {
    notes.push('적격 후보가 없어 클러스터링을 건너뜀');
  }

  // 폴백: 클러스터가 없으면 video_score 상위 영상을 단일 주제로.
  if (clusters.length === 0 && pool.length > 0) {
    const topVideos = [...pool].sort((a, b) => b.vScore - a.vScore).slice(0, Math.min(3, pool.length));
    clusters = [{
      rank: 1,
      topic_name: searchPlan[0]?.phenomenon || '풀링 주제(폴백)',
      target_phenomenon: searchPlan[0]?.phenomenon ?? '',
      created_desire: searchPlan[0]?.desire ?? '',
      video_indexes: topVideos.map((t) => t.idx),
      key_link: 0.5,
      product_link: 0.5,
      selection_reason: 'LLM 클러스터링 실패 — video_score 상위로 폴백',
    }];
    notes.push('클러스터링 결과 없음 — video_score 상위 단일 주제 폴백');
  }

  // ── Step 8: 주제별 점수화 + 등급 (순수) ────────────────────────────────────
  const poolByIdx = new Map(pool.map((it) => [it.idx, it]));
  const topicsBase = clusters.map((cl) => {
    const items = cl.video_indexes.map((i) => poolByIdx.get(i)).filter((x): x is PoolItem => !!x);
    const scores = items.map((it) => it.vScore);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const tScore = topicScore({ videoScores: scores, repeatCount: items.length, keyLink: cl.key_link, productLink: cl.product_link });
    const grade = decideGrade(avg, cl.key_link);
    const evidence_videos: PullingEvidenceVideo[] = items
      .sort((a, b) => b.vScore - a.vScore)
      .map((it) => ({
        videoId: it.v.videoId,
        title: it.v.title,
        url: ytUrl(it.v.videoId),
        thumbnailUrl: ytThumb(it.v.videoId),
        channelTitle: it.v.channelTitle,
        viewCount: it.v.viewCount,
        publishedAt: it.dur?.publishedAt ?? '',
        isShort: it.dur?.isShort ?? false,
        exposure: it.exposure,
        performance: it.performance,
        contribution: it.contribution,
        videoScore: Number(it.vScore.toFixed(3)),
        source: it.exposure || it.performance || it.contribution ? '뷰트랩/YouTube' : 'YouTube',
      }));
    return { cl, evidence_videos, tScore, grade };
  });

  // ── Step 11: 주제별 퍼널 + 상품 접목 논리 (LLM, 병렬) ──────────────────────
  const logics = await Promise.all(
    topicsBase.map(async (tb) => {
      try {
        const raw = await deps.llmComplete(
          topicLogicPrompt(p, kc, {
            topic_name: tb.cl.topic_name,
            target_phenomenon: tb.cl.target_phenomenon,
            created_desire: tb.cl.created_desire,
            evidenceTitles: tb.evidence_videos.map((e) => e.title).slice(0, 4),
          }),
        );
        return parseJson<{ funnel?: PullingFunnel; product_application?: string }>(raw, {});
      } catch (e) {
        notes.push(`주제논리 "${tb.cl.topic_name}" 실패: ${e instanceof Error ? e.message : String(e)}`);
        return {} as { funnel?: PullingFunnel; product_application?: string };
      }
    }),
  );

  const topics: PullingTopic[] = topicsBase.map((tb, i) => {
    const logic = logics[i];
    const funnel: PullingFunnel = logic.funnel ?? {
      phenomenon: tb.cl.target_phenomenon,
      desire: tb.cl.created_desire,
      plan: '키 콘텐츠 본문',
      action: '키 콘텐츠 CTA',
      reward: '상품 사용 후 기대 결과',
    };
    return {
      rank: tb.cl.rank,
      topic_name: tb.cl.topic_name,
      grade: tb.grade,
      target_phenomenon: tb.cl.target_phenomenon,
      created_desire: tb.cl.created_desire,
      linked_key_content: kc.key_topic_title,
      evidence_videos: tb.evidence_videos,
      viewer_identity: tb.cl.viewer_identity,
      identity_match: tb.cl.identity_match,
      identity_reason: tb.cl.identity_reason,
      selection_reason: tb.cl.selection_reason,
      product_application: String(logic.product_application ?? ''),
      funnel,
      topic_score: Number(tb.tScore.toFixed(3)),
    };
  });
  topics.sort((a, b) => a.rank - b.rank);

  const keyFunnelSummary = [kc.funnel_desire, kc.funnel_plan, kc.funnel_action, kc.funnel_reward]
    .filter((s) => s && s.trim())
    .join(' → ') || '욕구 → 계획 → 행동 → 보상';

  return {
    product: p.product_name,
    target: p.target_audience,
    key_content_title: kc.key_topic_title,
    key_funnel_summary: keyFunnelSummary,
    pulling_role: '현상 → 욕구',
    search_summary: {
      keywords_used: searchPlan.length,
      videos_collected: collected,
      videos_after_dedup: seen.size,
      longform_count: longform,
      over_50k_count: over50k,
      qualified_count: pool.length,
    },
    viewtrap_budget: {
      used: budgetSlots.length,
      limit: VIEWTRAP_SEARCH_LIMIT,
      slots: budgetSlots,
    },
    topics,
    approval_request: `위 ${topics.length}개 풀링 주제로 풀링 콘텐츠 세트를 확정해도 될까요?`,
    provenance: {
      keywords_generated: searchPlan.length,
      clusters_formed: clusters.length,
      topics_selected: topics.length,
      // extraNotes는 호출자(plugin discover 어댑터)가 실행 도중 push할 수 있다 —
      // 시작 시점 복사본(notes)에 빠진 항목을 합류시켜 진단 노트 유실을 막는다(2026-06-11).
      notes: [...notes, ...(input.extraNotes ?? []).filter((n) => !notes.includes(n))],
    },
  };
}
