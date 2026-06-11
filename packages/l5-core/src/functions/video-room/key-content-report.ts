// CMO 키 콘텐츠 기획 보고서 — 승인된 상품정의(키워드/타깃)를 받아
//   ① 키워드 시장성 분석(YouTube API 실데이터)
//   ② 성과도/기여도 등급 필터 + 키워드별 후보 3선별
//   ③ 자막 기반 판매논리 분석(현상→욕구→계획→행동→보상 + 수익화 구조)
//   ④ 최종 보고서(우리 상품 적용 판매논리 + 추천 1개) 조립
// 까지 수행하고, 사장님이 승인할 수 있는 보고서 객체를 반환한다.
//
// 순수성: 모든 I/O(YouTube/자막/LLM)는 주입된 deps로만 발생. 시장성 지표 계산과
// 판정(decideVerdict)은 결정론 순수함수 — 단위테스트 대상(개발규칙 §3).
//
// 외부 데이터/LLM 실패는 해당 항목만 건너뛰고 진행한다(부분 보고서 허용, throw 금지).

// ── 입력/출력 타입 ───────────────────────────────────────────────────────────

export interface ReportProduct {
  product_name: string;
  category: string;
  target_audience: string;
  core_offer: string;
}

/** 발굴 1건 — runDiscoveryPipeline videos 미러. metrics는 성과도/기여도/노출확률(한글 키). */
export interface ReportSourceVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  metrics?: Record<string, string | number | undefined>;
}

export interface VideoDurationInfo {
  videoId: string;
  isShort: boolean;
  durationSeconds: number;
  publishedAt: string;
}

export interface TranscriptInfo {
  available: boolean;
  text: string;
}

export interface KeyContentReportDeps {
  /** 키워드 1개 발굴 → 영상[](통계+성과도/기여도 등급 병합). 실패 시 [] 반환 권장. */
  discover(keyword: string): Promise<ReportSourceVideo[]>;
  /** videoId[] → duration/최근성. 롱폼·쇼츠 판별용. */
  getDurations(videoIds: string[]): Promise<VideoDurationInfo[]>;
  /** videoId → 자막 평문(판매논리 분석용). */
  fetchTranscript(videoId: string): Promise<TranscriptInfo>;
  /** LLM(JSON 응답 기대). */
  llmComplete: (prompt: string) => Promise<string>;
  /** 최근성 기준 현재시각(ms). 테스트 주입용. */
  nowMs?: number;
}

export type MarketVerdict = '진행 추천' | '보류' | '제외';
export type FitGrade = '높음' | '보통' | '낮음';

export interface MarketKeywordRow {
  keyword: string;
  videoCount: number;
  avgViews: number;
  topViews: number;
  longformRatio: number;
  shortsRatio: number;
  recentRatio: number;
  targetFit: FitGrade;
  salesLink: FitGrade;
  verdict: MarketVerdict;
  verdictReason: string;
}

export interface FunnelAnalysis {
  phenomenon: string;
  desire: string;
  plan: string;
  action: string;
  reward: string;
}

export interface MonetizationAnalysis {
  selling_product: string;
  pinned_comment: string;
  description_links: string;
  profile_links: string;
  moves_user_to: string;
  monetization_method: string;
  takeaway_for_us: string;
}

export type IdentityMatch = 'match' | 'partial' | 'mismatch';

export interface ReportCandidate {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  channelTitle: string;
  viewCount: number;
  performance: string | null;
  contribution: string | null;
  isShort: boolean;
  keyword: string;
  rank: number;
  topPick: boolean;
  transcriptAvailable: boolean;
  /** 이 영상이 끌어당기는 시청자가 누구인지(한 줄). */
  viewer_identity?: string;
  /** 그 시청자 정체성이 우리 핵심 타깃과 같은 레벨인지. */
  identity_match?: IdentityMatch;
  /** 정체성 판단 근거. */
  identity_reason?: string;
  funnel?: FunnelAnalysis;
  monetization?: MonetizationAnalysis;
}

export interface AppliedSalesLogic {
  content_topic: string;
  core_target: string;
  target_phenomenon: string;
  desire_to_trigger: string;
  plan_user_makes: string;
  action_to_our_product: string;
  reward_user_expects: string;
}

export interface KeyContentReport {
  product: string;
  target: string;
  market: MarketKeywordRow[];
  candidates: ReportCandidate[];
  applied_sales_logic: AppliedSalesLogic | null;
  recommended_video_id: string | null;
  recommendation_reason: string;
  approval_request: string;
  provenance: {
    keywords_analyzed: number;
    keywords_advanced: number;
    candidates_selected: number;
    transcripts_fetched: number;
    notes: string[];
  };
}

// ── 결정론 순수함수: 시장성 지표 + 판정 (단위테스트 대상) ─────────────────────

const MIN_VIEWS = 50_000;
const RECENT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000; // 12개월

export interface MarketMetrics {
  videoCount: number;
  avgViews: number;
  topViews: number;
  longformRatio: number;
  shortsRatio: number;
  recentRatio: number;
}

/** 영상[] + duration 정보로 시장성 수치 산출(순수). */
export function computeMarketMetrics(
  videos: ReportSourceVideo[],
  durations: VideoDurationInfo[],
  nowMs: number,
): MarketMetrics {
  const n = videos.length;
  if (n === 0) {
    return { videoCount: 0, avgViews: 0, topViews: 0, longformRatio: 0, shortsRatio: 0, recentRatio: 0 };
  }
  const durMap = new Map(durations.map((d) => [d.videoId, d]));
  const views = videos.map((v) => v.viewCount);
  const avgViews = Math.round(views.reduce((a, b) => a + b, 0) / n);
  const topViews = Math.max(...views);
  let shorts = 0;
  let recent = 0;
  let durKnown = 0;
  for (const v of videos) {
    const d = durMap.get(v.videoId);
    if (!d) continue;
    durKnown += 1;
    if (d.isShort) shorts += 1;
    const ts = Date.parse(d.publishedAt);
    if (!Number.isNaN(ts) && nowMs - ts <= RECENT_WINDOW_MS) recent += 1;
  }
  const shortsRatio = durKnown > 0 ? shorts / durKnown : 0;
  const longformRatio = durKnown > 0 ? (durKnown - shorts) / durKnown : 0;
  const recentRatio = durKnown > 0 ? recent / durKnown : 0;
  return { videoCount: n, avgViews, topViews, longformRatio, shortsRatio, recentRatio };
}

/**
 * 시장성 판정(순수). 결정론 베이스라인 + LLM 적합도(targetFit) 결합.
 * - 제외: 영상 너무 적음 / 평균조회수 너무 낮음 / 롱폼 비중 낮음 / 타깃 적합 '낮음'
 * - 진행 추천: 충분한 양 + 상위 5만+ + 롱폼 우세 + 타깃 적합 '높음'
 * - 그 외: 보류
 */
export function decideVerdict(
  m: MarketMetrics,
  targetFit: FitGrade,
  salesLink: FitGrade,
): { verdict: MarketVerdict; reason: string } {
  if (m.videoCount < 3) return { verdict: '제외', reason: '검색 결과 영상이 너무 적어 시장성 미달' };
  if (m.avgViews < 5_000) return { verdict: '제외', reason: `평균 조회수(${m.avgViews.toLocaleString()})가 낮아 수요 부족` };
  if (m.longformRatio < 0.2) return { verdict: '제외', reason: '롱폼 콘텐츠 비중이 낮아 롱폼 주제로 부적합' };
  if (targetFit === '낮음') return { verdict: '제외', reason: '우리 핵심 타깃이 볼 만한 주제가 아님' };

  const strongVolume = m.videoCount >= 8;
  const strongViews = m.topViews >= MIN_VIEWS && m.avgViews >= 20_000;
  const longformOk = m.longformRatio >= 0.4;
  if (strongVolume && strongViews && longformOk && targetFit === '높음' && salesLink !== '낮음') {
    return { verdict: '진행 추천', reason: `상위 조회수 ${m.topViews.toLocaleString()}·롱폼 우세·타깃 적합 높음·판매연결 가능` };
  }
  return { verdict: '보류', reason: '시장성은 있으나 타깃 적합/판매연결 신뢰도가 충분치 않음' };
}

/** 후보 영상 필터(순수): 롱폼 + 성과도/기여도 Good 이상 + 5만+. */
const GOOD_GRADES = new Set(['Good', 'Great', 'good', 'great']);
export function isQualifiedCandidate(v: ReportSourceVideo, dur: VideoDurationInfo | undefined): boolean {
  if (dur?.isShort) return false;
  if (v.viewCount < MIN_VIEWS) return false;
  const perf = String(v.metrics?.['성과도'] ?? '');
  const contrib = String(v.metrics?.['기여도'] ?? '');
  // 등급이 둘 다 비어 있으면(확장 미주입) 조회수만으로 통과시킨다(graceful).
  if (!perf && !contrib) return true;
  return GOOD_GRADES.has(perf) || GOOD_GRADES.has(contrib);
}

// ── LLM JSON 파서(관대) ──────────────────────────────────────────────────────

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start < 0) return fallback;
  // 끝 괄호까지 균형 맞춰 자르기 시도
  const text = body.slice(start).trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // 마지막 } 또는 ] 까지만
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

const grade = (s: unknown): FitGrade => {
  const v = String(s ?? '').trim();
  return v === '높음' || v === '보통' || v === '낮음' ? v : '보통';
};

// ── 프롬프트 ─────────────────────────────────────────────────────────────────

function productHeader(p: ReportProduct): string {
  return [
    `상품명: ${p.product_name}`,
    `카테고리: ${p.category}`,
    `핵심 타깃: ${p.target_audience}`,
    `핵심 제공가치: ${p.core_offer}`,
  ].join('\n');
}

function marketJudgePrompt(p: ReportProduct, rows: { keyword: string; m: MarketMetrics }[]): string {
  const table = rows
    .map(
      (r) =>
        `- "${r.keyword}": 영상수 ${r.m.videoCount}, 평균조회수 ${r.m.avgViews}, 상위조회수 ${r.m.topViews}, 롱폼비중 ${(r.m.longformRatio * 100).toFixed(0)}%, 최근업로드비중 ${(r.m.recentRatio * 100).toFixed(0)}%`,
    )
    .join('\n');
  return `${productHeader(p)}

아래는 각 키워드의 유튜브 실데이터 시장성 수치다.
${table}

각 키워드가 (1) 이 키워드 영상을 보는 시청자의 **정체성·자기인식 레벨**이 우리 핵심 타깃과 같은지(targetFit) (2) 우리 상품 판매논리로 연결 가능한지(salesLink)를 판단하라.
★ targetFit은 단순 주제 매칭이 아니다. 주제가 마케팅/카테고리상 관련 있어도, 그 키워드를 검색·시청할 사람이 우리 타깃보다 낮은 작업·실무 단위 정체성이면(예: 우리 타깃은 '대표/사업가'인데 키워드는 'OO를 직접 하고 싶은 실무자/작업자'를 끌어당김) targetFit은 "낮음"이다.
각각 "높음" | "보통" | "낮음" 중 하나로만 답하라.

JSON 배열로만 출력:
[{"keyword":"...","targetFit":"높음|보통|낮음","salesLink":"높음|보통|낮음"}]`;
}

function selectPrompt(
  p: ReportProduct,
  pool: { keyword: string; videoId: string; title: string; channelTitle: string; viewCount: number; performance: string | null; contribution: string | null }[],
): string {
  const list = pool
    .map(
      (c, i) =>
        `${i}. [${c.keyword}] "${c.title}" — ${c.channelTitle}, 조회수 ${c.viewCount}, 성과도 ${c.performance ?? '-'}, 기여도 ${c.contribution ?? '-'} (videoId=${c.videoId})`,
    )
    .join('\n');
  return `${productHeader(p)}

[우리 핵심 타깃] ${p.target_audience}

아래는 시장성 통과 키워드들에서 모은 후보 영상이다(롱폼·성과·조회수 우수 — 이미 전제).
${list}

★★ 최우선 기준 — 시청자 정체성 정합성 ★★
각 영상의 제목·주제가 실제로 끌어당기는 "시청자의 정체성·자기인식 레벨"이 우리 핵심 타깃과 같은지 먼저 판단하라.
- 주제가 마케팅/카테고리상 관련 있어도, 그 영상을 클릭·시청할 사람이 우리 타깃보다 낮은 작업·실무 단위 정체성이면 정체성 불일치(mismatch)다.
  예: 우리 타깃이 '마케팅 팀 없는 대표/사업가'인데, 영상이 'SNS 글쓰기를 자동화하고 싶은 실무자'를 끌어당긴다면 — 대표는 'SNS 글쓰기'를 자기 일로 인식하지 않으므로 mismatch.
  반대로 '팀 없이도 마케팅을 직접 굴릴 수 있겠다'고 대표가 판단하게 만드는 영상은 match.
- **조회수·성과가 아무리 높아도 정체성이 mismatch면 후보에서 제외하라.** match를 최우선, 차선은 partial.

그 다음, 정체성이 맞는(match 우선) 후보 중 우리 상품 판매논리(현상→욕구→계획→행동→보상)를 세우기 가장 좋은 3개를 골라라.
가장 추천하는 1개에 top=true.

JSON 배열로만 출력(정확히 3개, rank 1~3):
[{"videoId":"...","rank":1,"top":true,"viewer_identity":"이 영상이 끌어당기는 시청자 한 줄","identity_match":"match|partial|mismatch","identity_reason":"우리 타깃 정체성과 같/다른 이유","reason":"선정 이유"}]`;
}

function salesLogicPrompt(
  p: ReportProduct,
  c: ReportCandidate,
  transcript: string,
): string {
  const body = transcript
    ? `아래는 이 영상의 자막(대본)이다:\n"""\n${transcript}\n"""`
    : `이 영상의 자막은 확보하지 못했다. 제목·채널·조회수 메타데이터만으로 합리적으로 추론하라.`;
  return `${productHeader(p)}

분석 대상 영상: "${c.title}" — ${c.channelTitle} (조회수 ${c.viewCount}, 성과도 ${c.performance ?? '-'}, 기여도 ${c.contribution ?? '-'})
${body}

이 영상 안의 판매논리를 분석하라.
1) 수익화 구조(monetization): 무엇을 파는가, 고정댓글/본문링크/프로필링크 구조, 사용자를 어디로 이동시키는가, 수익화 방식, 우리 상품에 참고할 점.
2) 퍼널(funnel): 영상이 건드리는 현상 / 유발하는 욕구 / 세우게 하는 계획 / 유도하는 행동 / 기대하게 하는 보상.

JSON 객체로만 출력:
{"monetization":{"selling_product":"...","pinned_comment":"...","description_links":"...","profile_links":"...","moves_user_to":"...","monetization_method":"...","takeaway_for_us":"..."},"funnel":{"phenomenon":"...","desire":"...","plan":"...","action":"...","reward":"..."}}`;
}

function synthesisPrompt(
  p: ReportProduct,
  top: ReportCandidate | undefined,
  candidates: ReportCandidate[],
): string {
  const summary = candidates
    .map((c) => `- "${c.title}" (성과도 ${c.performance ?? '-'}, 기여도 ${c.contribution ?? '-'}, 조회수 ${c.viewCount})${c.topPick ? ' [최우선]' : ''}`)
    .join('\n');
  return `${productHeader(p)}

선별된 키 콘텐츠 후보:
${summary}

위 후보(특히 최우선: "${top?.title ?? '-'}")를 바탕으로, 우리 상품으로 만들 키 콘텐츠의 판매논리를 설계하라.
또한 그 최우선 콘텐츠를 추천하는 이유를 우리 타깃 적합/성과/판매논리 확장성/수익화 확인/연결 자연스러움 기준으로 서술하라.

JSON 객체로만 출력:
{"applied":{"content_topic":"우리 상품으로 만들 키 콘텐츠 주제 한 줄","core_target":"...","target_phenomenon":"...","desire_to_trigger":"...","plan_user_makes":"...","action_to_our_product":"...","reward_user_expects":"..."},"recommendation_reason":"..."}`;
}

// ── 메인 오케스트레이션 ──────────────────────────────────────────────────────

export interface RunKeyContentReportInput {
  product: ReportProduct;
  /** 승인된 뷰트랩 검색 키워드(상품정의 카드). */
  keywords: string[];
  /** 한 번에 분석할 최대 키워드 수(시간/쿼터 보호). 기본 6. */
  maxKeywords?: number;
  /** 호출측(plugin)이 주입하는 진단 노트(CDP 라이브 여부 등) — provenance.notes 앞에 합쳐진다. */
  extraNotes?: string[];
}

function ytUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
function ytThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export async function runKeyContentReport(
  input: RunKeyContentReportInput,
  deps: KeyContentReportDeps,
): Promise<KeyContentReport> {
  const p = input.product;
  const nowMs = deps.nowMs ?? Date.now();
  const notes: string[] = [...(input.extraNotes ?? [])];
  const keywords = input.keywords.slice(0, input.maxKeywords ?? 6);

  // ── 1단계: 키워드별 발굴 + duration → 시장성 수치 ──────────────────────────
  const perKeyword: { keyword: string; videos: ReportSourceVideo[]; durations: VideoDurationInfo[]; m: MarketMetrics }[] = [];
  for (const keyword of keywords) {
    let videos: ReportSourceVideo[] = [];
    try {
      videos = await deps.discover(keyword);
    } catch (e) {
      notes.push(`discover("${keyword}") 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    let durations: VideoDurationInfo[] = [];
    if (videos.length > 0) {
      try {
        durations = await deps.getDurations(videos.map((v) => v.videoId));
      } catch (e) {
        notes.push(`getDurations("${keyword}") 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    perKeyword.push({ keyword, videos, durations, m: computeMarketMetrics(videos, durations, nowMs) });
  }

  // ── 2단계: LLM 시장성 판단(배치) → verdict ────────────────────────────────
  let judgments: { keyword: string; targetFit: FitGrade; salesLink: FitGrade }[] = [];
  try {
    const raw = await deps.llmComplete(marketJudgePrompt(p, perKeyword.map((k) => ({ keyword: k.keyword, m: k.m }))));
    const parsed = parseJson<Array<{ keyword?: string; targetFit?: string; salesLink?: string }>>(raw, []);
    judgments = parsed.map((j) => ({ keyword: String(j.keyword ?? ''), targetFit: grade(j.targetFit), salesLink: grade(j.salesLink) }));
  } catch (e) {
    notes.push(`market judge 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const judgeMap = new Map(judgments.map((j) => [j.keyword, j]));

  const market: MarketKeywordRow[] = perKeyword.map((k) => {
    const j = judgeMap.get(k.keyword) ?? { targetFit: '보통' as FitGrade, salesLink: '보통' as FitGrade };
    const { verdict, reason } = decideVerdict(k.m, j.targetFit, j.salesLink);
    return {
      keyword: k.keyword,
      videoCount: k.m.videoCount,
      avgViews: k.m.avgViews,
      topViews: k.m.topViews,
      longformRatio: k.m.longformRatio,
      shortsRatio: k.m.shortsRatio,
      recentRatio: k.m.recentRatio,
      targetFit: j.targetFit,
      salesLink: j.salesLink,
      verdict,
      verdictReason: reason,
    };
  });

  // ── 3단계: 진행 키워드의 적격 후보 풀 → LLM 최종 3선별 ─────────────────────
  const advanced = new Set(market.filter((r) => r.verdict === '진행 추천').map((r) => r.keyword));
  // 진행 키워드가 0개면 '보류'까지 포함해 폴백(보고서가 비지 않도록).
  const usableKeywords = advanced.size > 0
    ? advanced
    : new Set(market.filter((r) => r.verdict !== '제외').map((r) => r.keyword));

  const pool: ReportCandidate[] = [];
  for (const k of perKeyword) {
    if (!usableKeywords.has(k.keyword)) continue;
    const durMap = new Map(k.durations.map((d) => [d.videoId, d]));
    const qualified = k.videos
      .filter((v) => isQualifiedCandidate(v, durMap.get(v.videoId)))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 3);
    for (const v of qualified) {
      pool.push({
        videoId: v.videoId,
        title: v.title,
        url: ytUrl(v.videoId),
        thumbnailUrl: ytThumb(v.videoId),
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
        performance: (v.metrics?.['성과도'] as string) ?? null,
        contribution: (v.metrics?.['기여도'] as string) ?? null,
        isShort: durMap.get(v.videoId)?.isShort ?? false,
        keyword: k.keyword,
        rank: 0,
        topPick: false,
        transcriptAvailable: false,
      });
    }
  }

  let finalCandidates: ReportCandidate[] = [];
  if (pool.length > 0) {
    let selection: Array<{
      videoId?: string; rank?: number; top?: boolean;
      viewer_identity?: string; identity_match?: string; identity_reason?: string;
    }> = [];
    try {
      const raw = await deps.llmComplete(selectPrompt(p, pool));
      selection = parseJson<typeof selection>(raw, []);
    } catch (e) {
      notes.push(`final select 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    const normMatch = (s: unknown): IdentityMatch | undefined => {
      const v = String(s ?? '').trim().toLowerCase();
      return v === 'match' || v === 'partial' || v === 'mismatch' ? (v as IdentityMatch) : undefined;
    };
    const byId = new Map(pool.map((c) => [c.videoId, c]));
    for (const s of selection) {
      const c = byId.get(String(s.videoId ?? ''));
      // 시청자 정체성 불일치는 (LLM이 실수로 넣어도) 후보에서 배제.
      if (s.identity_match && normMatch(s.identity_match) === 'mismatch') {
        notes.push(`정체성 불일치 제외: ${c?.title ?? s.videoId} — ${s.identity_reason ?? ''}`);
        continue;
      }
      if (c && !finalCandidates.includes(c)) {
        c.rank = Number(s.rank ?? finalCandidates.length + 1);
        c.topPick = s.top === true;
        if (s.viewer_identity) c.viewer_identity = String(s.viewer_identity);
        c.identity_match = normMatch(s.identity_match);
        if (s.identity_reason) c.identity_reason = String(s.identity_reason);
        finalCandidates.push(c);
      }
    }
    // LLM이 못 고르면 조회수 상위 3개 폴백.
    if (finalCandidates.length === 0) {
      finalCandidates = pool.sort((a, b) => b.viewCount - a.viewCount).slice(0, 3);
      finalCandidates.forEach((c, i) => { c.rank = i + 1; c.topPick = i === 0; });
      notes.push('LLM 선별 실패 — 조회수 상위 3개로 폴백');
    }
    finalCandidates.sort((a, b) => a.rank - b.rank);
    if (!finalCandidates.some((c) => c.topPick) && finalCandidates[0]) finalCandidates[0].topPick = true;
  } else {
    notes.push('적격 후보가 없어 후보 선별을 건너뜀');
  }

  // ── 4단계: 자막 + 판매논리 분석(후보별) ────────────────────────────────────
  let transcriptsFetched = 0;
  for (const c of finalCandidates) {
    let transcript = '';
    try {
      const t = await deps.fetchTranscript(c.videoId);
      c.transcriptAvailable = t.available;
      if (t.available) { transcript = t.text; transcriptsFetched += 1; }
    } catch (e) {
      notes.push(`transcript ${c.videoId} 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const raw = await deps.llmComplete(salesLogicPrompt(p, c, transcript));
      const parsed = parseJson<{ monetization?: MonetizationAnalysis; funnel?: FunnelAnalysis }>(raw, {});
      if (parsed.monetization) c.monetization = parsed.monetization;
      if (parsed.funnel) c.funnel = parsed.funnel;
    } catch (e) {
      notes.push(`sales-logic ${c.videoId} 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 5단계: 우리 상품 적용 판매논리 + 추천 사유 ─────────────────────────────
  const top = finalCandidates.find((c) => c.topPick);
  let applied: AppliedSalesLogic | null = null;
  let recommendationReason = '';
  if (finalCandidates.length > 0) {
    try {
      const raw = await deps.llmComplete(synthesisPrompt(p, top, finalCandidates));
      const parsed = parseJson<{ applied?: AppliedSalesLogic; recommendation_reason?: string }>(raw, {});
      applied = parsed.applied ?? null;
      recommendationReason = String(parsed.recommendation_reason ?? '');
    } catch (e) {
      notes.push(`synthesis 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    product: p.product_name,
    target: p.target_audience,
    market,
    candidates: finalCandidates,
    applied_sales_logic: applied,
    recommended_video_id: top?.videoId ?? null,
    recommendation_reason: recommendationReason,
    approval_request: '위 3가지 콘텐츠 후보와 추천 콘텐츠를 기준으로 키 콘텐츠 기획을 확정해도 될까요?',
    provenance: {
      keywords_analyzed: keywords.length,
      keywords_advanced: advanced.size,
      candidates_selected: finalCandidates.length,
      transcripts_fetched: transcriptsFetched,
      notes,
    },
  };
}
