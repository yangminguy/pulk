// CMO Video Room — Scene Decision 엔진 (Phase 2: insight 단일 붕괴 해소).
//
// VideoExecutionBrief의 logic_blocks(긴 speaker_text 문단)를 받아
//   1. 문장 경계 기반 페이싱 분할(씬당 8~12초 목표, 글자수÷5.5)
//   2. 한국어 텍스트 분석 스코어링으로 scene_type 결정(숫자밀도→metric_cards,
//      비교→comparison, 순서→steps/flow, 인용→quote, 나열→orbital/split,
//      재정의→reframe, 문제제기→problem, 장전환→section, 마무리→cta, 그 외→insight)
//   3. insight 과반 방지 다양성 밸런싱
//   4. emphasis / mood / transition / rhythm_role 결정론 배정
// 을 수행해 factory 호환 ScriptBeat[]를 만든다.
//
// 계약 근거: docs/cmo/CMO_TO_FACTORY_CONTRACT.md §12 — 브리프는 scene_type/duration을
// 제공하지 않으며 communication_goal 분석 → scene_type 결정은 이 변환 계층의 책임.
//
// Pure & deterministic — Date/random 금지, NocoBase 없이 테스트 가능(l5-core 규칙).
// LLM 리파이너는 주입 인터페이스(ScenePlanRefiner)만 남긴다(기본 no-op, 미사용).

import type { BriefLogicBlock, VideoExecutionBrief, SlideSpec } from './types';
import type { ScriptBeat } from './script-factory';

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 한국어 나레이션 글자수→초 환산 계수(기존 render-pipeline과 동일). */
export const CHARS_PER_SECOND = 5.5;
/** 씬 duration 하한(팩토리 zod 하한과 동일). */
export const SCENE_MIN_SECONDS = 3;
/** 씬 duration 상한 — 페이싱 개선 목표(기존 20초 정적 씬 금지). */
export const SCENE_MAX_SECONDS = 12;
/** 페이싱 목표 하한(초). hero는 이 하한을 하드 클램프로 사용. */
export const SCENE_TARGET_MIN_SECONDS = 8;

const TARGET_MAX_CHARS = Math.round(SCENE_MAX_SECONDS * CHARS_PER_SECOND); // 66
const TARGET_MIN_CHARS = Math.round(SCENE_TARGET_MIN_SECONDS * CHARS_PER_SECOND); // 44
const TINY_REMAINDER_CHARS = Math.round(SCENE_MIN_SECONDS * CHARS_PER_SECOND); // 17

/** 이번 단계에서 배정 가능한 scene 타입(데이터 없이 렌더 가능한 것만). */
export const DECIDABLE_SCENE_TYPES = [
  'hero',
  'problem',
  'reframe',
  'metric_cards',
  'comparison',
  'flow',
  'quote',
  'insight',
  'cta',
  'section',
  'split',
  'steps',
  'spotlight',
  'orbital',
] as const;

export type DecidedSceneType = (typeof DECIDABLE_SCENE_TYPES)[number];

// ── 1. 텍스트 유틸 ───────────────────────────────────────────────────────────

/** 원고 구획 아티팩트("---" 라인 등)를 제거하고 공백을 정돈한다. */
export function stripScriptArtifacts(text: string): string {
  return (text ?? '')
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, ' ') // 단독 구획 라인
    .replace(/\s-{3,}\s/g, ' ') // 인라인 구획
    .replace(/-{3,}/g, ' ') // 잔여
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** 문장 경계 분할(마침표/물음표/느낌표 + 닫는 따옴표 허용, lookbehind 미사용). */
export function splitSentences(text: string): string[] {
  const marked = (text ?? '').replace(/([.!?…]["'”’]?)(\s+)/g, '$1\u0000');
  return marked
    .split(/\u0000|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 글자수÷5.5 초 추정, [3, 12] 클램프. */
export function estimateSceneSeconds(text: string): number {
  const chars = (text ?? '').trim().length;
  const raw = Math.round(chars / CHARS_PER_SECOND);
  return Math.min(SCENE_MAX_SECONDS, Math.max(SCENE_MIN_SECONDS, raw));
}

export interface PacedChunk {
  /** 이 구간의 speaker_text 원문(아티팩트 정제됨) — caption으로 사용. */
  text: string;
  sentences: string[];
  /** "---" 기준 섹션 인덱스(0부터). */
  sectionIndex: number;
  /** 섹션의 첫 chunk 여부(장 전환 후보). */
  isSectionStart: boolean;
}

/**
 * 긴 speaker_text 문단을 문장 경계로 나눠 씬당 8~12초(≈44~66자) 목표 chunk로 만든다.
 * "---" 구획은 섹션 경계로 쓰고 텍스트에서는 제거한다. 3초 미만 꼬리는 직전에 합친다.
 */
export function paceSpeakerText(raw: string): PacedChunk[] {
  const sections = (raw ?? '')
    .split(/\n?\s*-{3,}\s*\n?/)
    .map((s) => stripScriptArtifacts(s))
    .filter((s) => s.length > 0);

  const chunks: PacedChunk[] = [];

  sections.forEach((section, sectionIndex) => {
    const sentences = splitSentences(section);
    let cur: string[] = [];
    let curLen = 0;
    const sectionChunkStart = chunks.length;

    const flush = () => {
      if (cur.length === 0) return;
      chunks.push({
        text: cur.join(' '),
        sentences: cur,
        sectionIndex,
        isSectionStart: chunks.length === sectionChunkStart,
      });
      cur = [];
      curLen = 0;
    };

    for (const sentence of sentences) {
      if (curLen > 0 && curLen + sentence.length > TARGET_MAX_CHARS) flush();
      cur.push(sentence);
      curLen += sentence.length;
      if (curLen >= TARGET_MIN_CHARS) flush();
    }

    // 3초 미만 꼬리는 같은 섹션의 직전 chunk에 합친다(빈 씬 방지).
    if (cur.length > 0) {
      const last = chunks[chunks.length - 1];
      if (curLen < TINY_REMAINDER_CHARS && last && last.sectionIndex === sectionIndex) {
        last.sentences = [...last.sentences, ...cur];
        last.text = `${last.text} ${cur.join(' ')}`;
        cur = [];
        curLen = 0;
      } else {
        flush();
      }
    }
  });

  return chunks;
}

// ── 2. 헤드라인/바디 축약 ────────────────────────────────────────────────────

const HEADLINE_MAX_CHARS = 36;

const LEADING_CONJUNCTIONS =
  /^(?:그러니까|그런데|근데|그리고|하지만|그래서|사실|실제로|그럼|이제|즉|또한?|먼저)[,\s]+/;

/** 흔한 종결어미를 걷어 핵심 구문으로 만든다(남는 길이가 충분할 때만). */
export function stripSentenceEnding(clause: string): string {
  let s = clause.trim().replace(/[.!…]+$/, '');
  const patterns: RegExp[] = [
    /(?:이|가)\s*있(?:습니다|어요|다|거든요)$/,
    /(?:입니다|이에요|예요|인데요|이죠|이다|라는\s*거예요|인\s*거예요)$/,
    /(?:합니다|습니다|거든요|잖아요|하겠습니다|할게요|드릴게요|해야\s*해요|해야\s*돼요)$/,
    /(?:했어요|됐어요|였어요|았어요|었어요|해요|돼요|와요|가요|어요|아요|에요|죠)$/,
    /(?:한다|된다|이다|는다)$/,
  ];
  for (const p of patterns) {
    const next = s.replace(p, '').trim();
    if (next !== s && next.length >= 6) return next;
  }
  return s;
}

/**
 * 문장에서 핵심 구문 headline을 뽑는다(전문 복붙·"…" 자름 금지):
 * 접속사 제거 → 쉼표 절 중 마지막(또는 길이 적합) 절 선택 → 종결어미 제거.
 */
export function condenseHeadline(text: string): string {
  const first = splitSentences(stripScriptArtifacts(text))[0] ?? stripScriptArtifacts(text);
  let s = first.replace(LEADING_CONJUNCTIONS, '').replace(/^["'“‘]|["'”’]$/g, '').trim();

  const clauses = s
    .split(/,\s*/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (clauses.length > 1) {
    const last = clauses[clauses.length - 1];
    if (last.length >= 8 && last.length <= HEADLINE_MAX_CHARS) {
      s = last;
    } else {
      const fitting = clauses.filter((c) => c.length >= 8 && c.length <= HEADLINE_MAX_CHARS);
      if (fitting.length > 0) s = fitting[fitting.length - 1];
    }
  }

  s = stripSentenceEnding(s);

  // 그래도 길면 마지막 어절 경계에서 줄인다(말줄임표 금지).
  if (s.length > HEADLINE_MAX_CHARS) {
    const cut = s.slice(0, HEADLINE_MAX_CHARS);
    const boundary = cut.lastIndexOf(' ');
    s = (boundary >= 10 ? cut.slice(0, boundary) : cut).trim();
  }
  return s.replace(/["'“‘”’]/g, '').trim() || stripScriptArtifacts(text).slice(0, HEADLINE_MAX_CHARS).trim();
}

/** 문단 전문 금지 — 핵심 문장 최대 2개를 축약해 바디로 만든다. */
export function condenseBody(sentences: string[]): string {
  const scored = sentences.map((s, i) => ({
    s,
    i,
    score:
      (countMetricSignals(s) > 0 ? 2 : 0) +
      (extractQuotedSpans(s).length > 0 ? 1 : 0) +
      (/(이유|핵심|문제|구조|목적|다리|차이)/.test(s) ? 1 : 0),
  }));
  const picked = [...scored]
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
    .map(({ s }) => stripSentenceEnding(s.replace(LEADING_CONJUNCTIONS, '')));
  return picked.join('\n');
}

// ── 3. 스코어링 규칙(규칙별 단위테스트 대상) ─────────────────────────────────

const METRIC_UNIT =
  '(?:%|퍼센트|배|명|개|편|건|번|장|회|원|만원|천만|억|시간|분|초|일|주|달|개월|년|가지)';

/** 숫자·%·금액·배수 신호 개수(한국어 수사 포함). */
export function countMetricSignals(text: string): number {
  const digits = text.match(new RegExp(`\\d[\\d,.]*\\s*${METRIC_UNIT}`, 'g')) ?? [];
  const korean = text.match(/(?:두|세|네|다섯|여섯|수십|수백|수천|서너)\s*(?:배|명|개|번|가지|곳)/g) ?? [];
  return digits.length + korean.length;
}

/** 비교 신호(vs, ~보다, 반면, 차이, 완전히 다른 …). */
export function countComparisonSignals(text: string): number {
  return (
    text.match(/\bvs\b|\bVS\b|보다\s|반면|차이(?:예요|가|는|를)?|완전히 다(?:른|르)|와\s*달리|는 다르/g) ?? []
  ).length;
}

/** 순서 신호(첫째/둘째, N단계, 스텝, 순서, 체크리스트, 그다음 …). */
export function countSequenceSignals(text: string): number {
  return (
    text.match(/첫째|둘째|셋째|\d\s*단계|스텝|순서(?:대로|는)?|체크리스트|그다음|그리고 나서|마지막 단계|->|→/g) ??
    []
  ).length;
}

/** 인용/사례 신호(따옴표 스팬, 후기, 사례, "~라고 말"). */
export function countQuoteSignals(text: string): number {
  const spans = extractQuotedSpans(text).length;
  const verbal = (text.match(/후기|사례|라고\s*(?:말|하|해|얘기)|라는\s*말/g) ?? []).length;
  return spans + verbal * 2;
}

/** 구조/요소 나열 신호(구성, 요소, 축, 기둥, N가지, 나열된 인용 스팬 3개 이상). */
export function countEnumerationSignals(text: string): number {
  const words = (text.match(/구성\s*요소|요소|기둥|축(?:은|이|을)?\s|(?:세|네|다섯|3|4|5)\s*가지/g) ?? []).length;
  const listedSpans = extractQuotedSpans(text).length >= 3 ? 2 : 0;
  return words + listedSpans;
}

/** 재정의/반전 신호(사실은, 진짜 이유, 아니에요, 오해, 착각, 즉 …). */
export function countReframeSignals(text: string): number {
  return (
    text.match(/사실은|사실\s|진짜\s*이유|아니에요|아니었|가\s*아니라|이\s*아니라|오해|착각|즉[,\s]/g) ?? []
  ).length;
}

/** 문제 제기 신호(왜 안 될까, 함정, 실수, 손해, 문제, 구멍, 이탈 …). */
export function countProblemSignals(text: string): number {
  return (
    text.match(/왜\s*(?:안|그럴까|못)|함정|실수|손해|문제(?:예요|는|가|도)?|구멍|이탈|막히|안\s*(?:되|오|늘)|않(?:는다|아요|죠)/g) ??
    []
  ).length;
}

/** 장 전환 신호 — chunk 첫 문장이 서수 전환("두 번째 이유는…")으로 시작하는가. */
export function hasSectionTransition(firstSentence: string): boolean {
  return /^(?:첫|두|세|네|다섯)\s*번째|^다음(?:으로|은)|^마지막으로/.test(firstSentence.trim());
}

/** 행동 촉구 신호(해보세요/세어보세요/받아보세요/구독/클릭 …). */
export function countCtaSignals(text: string): number {
  return (
    text.match(/해\s*보세요|보세요|해보세요|세어보|받아보|시작하세요|점검해|구독|눌러|클릭|신청|열어보|바꿔보/g) ?? []
  ).length;
}

export interface SceneTypeScores {
  metric_cards: number;
  comparison: number;
  steps: number;
  flow: number;
  quote: number;
  orbital: number;
  split: number;
  reframe: number;
  problem: number;
  section: number;
  cta: number;
}

export interface DecideSceneTypeContext {
  /** CMO visual_intent_hint 등에서 온 사전 힌트(참고용 가중치 +3). */
  hintType?: DecidedSceneType;
  /** 전체 plan의 마지막 chunk 여부 — cta는 마지막 chunk만 허용. */
  isFinalChunk?: boolean;
  /** "---" 섹션의 첫 chunk 여부. */
  isSectionStart?: boolean;
}

/** chunk 텍스트의 타입별 점수를 계산한다(결정론). */
export function scoreSceneTypes(text: string, ctx: DecideSceneTypeContext = {}): SceneTypeScores {
  const firstSentence = splitSentences(text)[0] ?? text;
  const metric = countMetricSignals(text);
  const seq = countSequenceSignals(text);
  const hasArrow = /->|→/.test(text);

  const scores: SceneTypeScores = {
    metric_cards: metric >= 2 ? metric + 1 : 0,
    comparison: countComparisonSignals(text) * 2,
    steps: hasArrow ? 0 : seq * 2,
    flow: hasArrow ? seq * 2 + 1 : 0,
    quote: countQuoteSignals(text),
    orbital: countEnumerationSignals(text) * 2,
    split: countEnumerationSignals(text),
    reframe: countReframeSignals(text) * 2,
    problem: countProblemSignals(text),
    section: ctx.isSectionStart && hasSectionTransition(firstSentence) ? 6 : 0,
    cta: ctx.isFinalChunk ? countCtaSignals(text) * 3 : 0,
  };

  if (ctx.hintType && ctx.hintType in scores) {
    scores[ctx.hintType as keyof SceneTypeScores] += 3;
  }
  return scores;
}

/** 동점 시 우선순위(구체적 → 일반적). */
const TYPE_PRIORITY: (keyof SceneTypeScores)[] = [
  'cta',
  'section',
  'metric_cards',
  'comparison',
  'flow',
  'steps',
  'quote',
  'orbital',
  'reframe',
  'problem',
  'split',
];

const DECISION_THRESHOLD = 2;

/** 점수 최고 타입을 고른다. 임계(2점) 미만이면 insight. */
export function decideSceneType(text: string, ctx: DecideSceneTypeContext = {}): DecidedSceneType {
  const scores = scoreSceneTypes(text, ctx);
  let best: keyof SceneTypeScores | null = null;
  for (const type of TYPE_PRIORITY) {
    if (scores[type] >= DECISION_THRESHOLD && (best === null || scores[type] > scores[best])) {
      best = type;
    }
  }
  return best ?? 'insight';
}

// ── 4. emphasis 추출 ─────────────────────────────────────────────────────────

const EMPHASIS_MAX = 4;
const EMPHASIS_SPAN_MAX_CHARS = 20;

const STOPWORD_TOKENS = new Set([
  '그리고', '그런데', '근데', '그래서', '하지만', '그러니까', '사실', '정말', '진짜',
  '이거', '저거', '그게', '이게', '거기서', '여기서', '지금', '오늘', '하나', '경우',
  '사람', '생각', '이야기', '얘기', '때문', '정도', '이상', '이하', '무엇', '어떻게',
]);

/** '…'/"…" 따옴표 스팬 추출(2~20자). */
export function extractQuotedSpans(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/['‘"“]([^'’"”]{2,20})['’"”]/g)) {
    out.push(m[1].trim());
  }
  return out;
}

/** 숫자+단위 스팬 추출. */
export function extractNumericSpans(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\d[\\d,.]*\\s*${METRIC_UNIT}`, 'g'))) {
    out.push(m[0].trim());
  }
  return out;
}

function stripTrailingParticle(token: string): string {
  if (token.length >= 3 && /[은는이가을를도의에로와과]$/.test(token)) return token.slice(0, -1);
  return token;
}

/** 반복 등장(2회 이상) 핵심 명사 후보 추출(등장 순서 유지). */
export function extractRepeatedKeywords(text: string): string[] {
  const tokens = text
    .split(/[\s,.!?…"'“”‘’()\[\]{}~·—–:;]+/)
    .map((t) => stripTrailingParticle(t.trim()))
    .filter((t) => t.length >= 2 && !STOPWORD_TOKENS.has(t) && !/^\d+$/.test(t));
  const freq = new Map<string, number>();
  const order: string[] = [];
  for (const t of tokens) {
    if (!freq.has(t)) order.push(t);
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return order.filter((t) => (freq.get(t) ?? 0) >= 2);
}

/**
 * headline·본문에서 강조 키워드를 뽑는다: 따옴표 스팬 → 숫자+단위 → 반복 명사.
 * 항상 1개 이상 보장(폴백: headline 첫 2자 이상 어절).
 */
export function extractEmphasis(headline: string, text: string): string[] {
  const combined = `${headline} ${text}`;
  const candidates = [
    ...extractQuotedSpans(combined),
    ...extractNumericSpans(combined),
    ...extractRepeatedKeywords(text),
  ]
    .map((c) => c.trim())
    .filter((c) => c.length >= 2 && c.length <= EMPHASIS_SPAN_MAX_CHARS);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
    if (out.length >= EMPHASIS_MAX) break;
  }

  if (out.length === 0) {
    const fallback =
      headline.split(/\s+/).find((t) => t.length >= 2) ??
      text.split(/\s+/).find((t) => t.length >= 2) ??
      headline;
    out.push(fallback.slice(0, EMPHASIS_SPAN_MAX_CHARS));
  }
  return out;
}

// ── 5. rhythm_role / transition / mood ──────────────────────────────────────

type RhythmRole = NonNullable<ScriptBeat['rhythm_role']>;

/** 전체 아크(hook→tension→explain→proof→insight→cta)에 맞춘 rhythm_role. */
export function assignRhythmRole(
  type: DecidedSceneType,
  index: number,
  total: number,
): RhythmRole {
  if (type === 'hero') return 'hook';
  if (type === 'cta') return 'cta';
  if (type === 'problem') return 'tension';
  if (type === 'section') return 'reset';
  if (type === 'metric_cards' || type === 'quote') return 'proof';
  if (type === 'reframe') return 'insight';
  // 마지막 1/4 구간(cta 직전)은 insight로 조여준다.
  if (total >= 4 && index >= Math.floor((total - 1) * 0.75)) return 'insight';
  return 'explain';
}

type Transition = NonNullable<ScriptBeat['transition']>;

/** cut/fade 교차 + 섹션 경계 fade_scale + 마지막 cta slide_up. */
export function pickTransition(type: DecidedSceneType, index: number): Transition {
  if (index === 0) return 'fade';
  if (type === 'section') return 'fade_scale';
  if (type === 'cta') return 'slide_up';
  return index % 2 === 0 ? 'fade' : 'cut';
}

type Mood = NonNullable<ScriptBeat['mood']>;

/** hook/cta는 dark로 대비, 증거(proof) 씬은 clean, 본문은 light. */
export function pickMood(type: DecidedSceneType): Mood {
  if (type === 'hero' || type === 'cta' || type === 'section') return 'dark';
  if (type === 'metric_cards' || type === 'quote') return 'clean';
  return 'light';
}

// ── 6. 타입별 하위구조 빌더 ──────────────────────────────────────────────────

const SPOTLIGHT_ICON_RULES: Array<[RegExp, string]> = [
  [/검색|찾|발견/, 'search'],
  [/예약|링크|연결|바이오/, 'link'],
  [/시간|기다|순간/, 'clock'],
  [/질문|물어|말|얘기|답/, 'chat'],
  [/마음|공감|좋아|사랑/, 'heart'],
  [/목표|타깃|타겟|겨냥/, 'target'],
  [/확인|체크|점검/, 'check'],
];

function pickSpotlightIcon(text: string): string {
  for (const [re, icon] of SPOTLIGHT_ICON_RULES) {
    if (re.test(text)) return icon;
  }
  return 'spark';
}

const ORBITAL_ICON_CYCLE = ['spark', 'target', 'check', 'chat', 'heart', 'link'];

function condenseLabel(text: string, max = 18): string {
  const c = condenseHeadline(text);
  if (c.length <= max) return c;
  const cut = c.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return (boundary >= 6 ? cut.slice(0, boundary) : cut).trim();
}

/** metric_cards.cards — 숫자 스팬을 value로, 해당 문장 축약을 label로. */
function buildMetricCards(chunk: PacedChunk): Array<{ value: string; label: string }> {
  const cards: Array<{ value: string; label: string }> = [];
  for (const sentence of chunk.sentences) {
    for (const value of extractNumericSpans(sentence)) {
      cards.push({ value, label: condenseLabel(sentence) || '지표' });
      if (cards.length >= 4) return cards;
    }
  }
  return cards.length > 0 ? cards : [{ value: '·', label: condenseLabel(chunk.text) || '지표' }];
}

/** problem.bullets — 물음/문제 신호 문장 우선으로 2~4개 축약. */
function buildProblemBullets(chunk: PacedChunk): string[] {
  const questions = chunk.sentences.filter((s) => /\?$/.test(s.trim()) || countProblemSignals(s) > 0);
  const source = questions.length >= 2 ? questions : chunk.sentences;
  const bullets = source.slice(0, 4).map((s) => condenseLabel(s, 28)).filter((b) => b.length > 0);
  return bullets.length > 0 ? bullets : [condenseLabel(chunk.text, 28)];
}

/** steps/flow.steps — 문장별 축약 라벨 2~5개. */
function buildStepLabels(chunk: PacedChunk): Array<{ label: string }> {
  const labels = chunk.sentences.slice(0, 5).map((s) => ({ label: condenseLabel(s, 24) }));
  const valid = labels.filter((l) => l.label.length > 0);
  if (valid.length >= 2) return valid;
  const clauses = chunk.text.split(/,\s*/).map((c) => condenseLabel(c, 24)).filter((c) => c.length > 0);
  if (clauses.length >= 2) return clauses.slice(0, 5).map((label) => ({ label }));
  return [{ label: condenseLabel(chunk.text, 24) }, { label: '다음 단계' }];
}

/** reframe from/to — 반전 신호(아니에요/아니라/사실은) 앞뒤 절 축약. */
function buildReframeFromTo(chunk: PacedChunk): { from: string; to: string } {
  const pivot = chunk.text.search(/아니에요|가\s*아니라|이\s*아니라|사실은|사실\s/);
  if (pivot > 4) {
    const before = chunk.text.slice(0, pivot);
    const after = chunk.text.slice(pivot);
    const from = condenseLabel(before, 24);
    const to = condenseLabel(after.replace(/^(?:아니에요|가\s*아니라|이\s*아니라|사실은|사실)\s*[.,]?\s*/, ''), 24);
    if (from && to) return { from, to };
  }
  return {
    from: condenseLabel(chunk.sentences[0] ?? chunk.text, 24),
    to: condenseLabel(chunk.sentences[chunk.sentences.length - 1] ?? chunk.text, 24),
  };
}

/** comparison left/right — 따옴표 스팬 2개를 타이틀로, 문장 전/후반을 포인트로. */
function buildComparison(chunk: PacedChunk): {
  left: { title: string; points: string[] };
  right: { title: string; points: string[] };
} {
  const spans = extractQuotedSpans(chunk.text);
  const half = Math.max(1, Math.ceil(chunk.sentences.length / 2));
  const leftPoints = chunk.sentences.slice(0, half).slice(0, 3).map((s) => condenseLabel(s, 26));
  const rightPoints = chunk.sentences.slice(half).slice(0, 3).map((s) => condenseLabel(s, 26));
  return {
    left: {
      title: (spans[0] ?? condenseLabel(chunk.sentences[0] ?? chunk.text, 14)) || '기존',
      points: leftPoints.filter(Boolean).length > 0 ? leftPoints.filter(Boolean) : [condenseLabel(chunk.text, 26)],
    },
    right: {
      title: (spans[1] ?? condenseLabel(chunk.sentences[chunk.sentences.length - 1] ?? chunk.text, 14)) || '실제',
      points:
        rightPoints.filter(Boolean).length > 0 ? rightPoints.filter(Boolean) : [condenseLabel(chunk.text, 26)],
    },
  };
}

/** orbital center+items — 나열된 인용 스팬 3~6개를 아이템으로. */
function buildOrbital(chunk: PacedChunk): {
  center: { label: string };
  items: Array<{ icon: string; label: string }>;
} | null {
  const spans = extractQuotedSpans(chunk.text);
  if (spans.length < 3) return null;
  return {
    center: { label: condenseLabel(chunk.sentences[0] ?? chunk.text, 14) || '핵심' },
    items: spans.slice(0, 6).map((label, i) => ({
      icon: ORBITAL_ICON_CYCLE[i % ORBITAL_ICON_CYCLE.length],
      label: label.slice(0, 18),
    })),
  };
}

/** split.cards — 핵심 절 2~4개(마지막 카드 accent). */
function buildSplitCards(chunk: PacedChunk): Array<{ label: string; accent?: boolean }> | null {
  const labels = chunk.sentences.slice(0, 4).map((s) => condenseLabel(s, 22)).filter((l) => l.length > 0);
  if (labels.length < 2) return null;
  return labels.map((label, i) => (i === labels.length - 1 ? { label, accent: true } : { label }));
}

// ── 7. 장면 계획(블록 → beats) ───────────────────────────────────────────────

export interface SceneDecisionContext {
  title: string;
  core_message?: string;
  desired_reaction?: string;
  /** pulling 콘텐츠의 브릿지 문구(있으면 cta 직전 section으로 배치). */
  bridge_to_key_content?: string;
}

/** 미래 LLM 리파이너 주입 인터페이스 — 지금은 no-op만 존재하고 사용하지 않는다. */
export interface ScenePlanRefiner {
  refine(beats: ScriptBeat[], ctx: SceneDecisionContext): ScriptBeat[];
}

export const noopScenePlanRefiner: ScenePlanRefiner = {
  refine: (beats) => beats,
};

interface PlannedSceneDraft {
  type: DecidedSceneType;
  chunk: PacedChunk;
  hintType?: DecidedSceneType;
}

/** visual_intent_hint / role → 사전 힌트 타입(참고 가중치용). */
export function hintTypeFromText(hint: string | undefined): DecidedSceneType | undefined {
  const h = (hint ?? '').toLowerCase();
  if (!h.trim()) return undefined;
  if (/(compar|비교|vs)/.test(h)) return 'comparison';
  if (/(quote|인용|후기)/.test(h)) return 'quote';
  if (/(check|step|단계|체크)/.test(h)) return 'steps';
  if (/(framework|flow|구조|프레임)/.test(h)) return 'flow';
  if (/(metric|숫자|지표|수치)/.test(h)) return 'metric_cards';
  if (/(cta|행동|구매)/.test(h)) return 'cta';
  return undefined;
}

const INSIGHT_SHARE_CAP = 0.4; // 과반(50%) 금지 + 여유 마진

/**
 * insight 비중이 과반이 되지 않도록 다양성 밸런싱.
 * 초과분은 등장 순서대로 spotlight ↔ split(카드 도출 가능 시)로 교대 재배정.
 */
export function balanceInsightShare(drafts: PlannedSceneDraft[]): PlannedSceneDraft[] {
  const result = drafts.map((d) => ({ ...d }));
  const insightIdx = result
    .map((d, i) => (d.type === 'insight' ? i : -1))
    .filter((i) => i >= 0);
  let insightCount = insightIdx.length;
  let flip = 0;
  for (const i of insightIdx) {
    if (insightCount / result.length <= INSIGHT_SHARE_CAP) break;
    const wantSplit = flip % 2 === 1 && buildSplitCards(result[i].chunk) !== null;
    result[i].type = wantSplit ? 'split' : 'spotlight';
    flip += 1;
    insightCount -= 1;
  }
  return result;
}

function draftToBeat(
  draft: PlannedSceneDraft,
  index: number,
  total: number,
): ScriptBeat {
  const { type, chunk } = draft;
  const headline = condenseHeadline(chunk.sentences[0] ?? chunk.text);
  const caption = chunk.text;
  const body = condenseBody(chunk.sentences);

  const beat: ScriptBeat = {
    scene_id: `scene_${String(index + 1).padStart(2, '0')}`,
    scene_type: type,
    rhythm_role: assignRhythmRole(type, index, total),
    headline,
    speaker_text: caption,
    duration: estimateSceneSeconds(caption),
    emphasis: extractEmphasis(headline, chunk.text),
    mood: pickMood(type),
    transition: pickTransition(type, index),
    body,
  };

  switch (type) {
    case 'metric_cards':
      beat.cards = buildMetricCards(chunk);
      break;
    case 'problem':
      beat.bullets = buildProblemBullets(chunk);
      break;
    case 'steps':
    case 'flow':
      beat.steps = buildStepLabels(chunk);
      break;
    case 'reframe': {
      const { from, to } = buildReframeFromTo(chunk);
      beat.from = from;
      beat.to = to;
      break;
    }
    case 'comparison': {
      const { left, right } = buildComparison(chunk);
      beat.left = left;
      beat.right = right;
      break;
    }
    case 'orbital': {
      const orbital = buildOrbital(chunk);
      if (orbital) {
        beat.center = orbital.center;
        beat.items = orbital.items;
      } else {
        beat.scene_type = 'split';
        const cards = buildSplitCards(chunk);
        if (cards) beat.splitCards = cards;
        else beat.scene_type = 'spotlight';
      }
      break;
    }
    case 'split': {
      const cards = buildSplitCards(chunk);
      if (cards) beat.splitCards = cards;
      else beat.scene_type = 'spotlight';
      break;
    }
    case 'quote': {
      const spans = extractQuotedSpans(chunk.text).filter((s) => s.length >= 6);
      beat.quote = spans[0] ?? condenseLabel(chunk.sentences[0] ?? chunk.text, 30);
      if (/사례/.test(chunk.text)) beat.attribution = '실제 사례';
      break;
    }
    case 'section':
      // number는 호출부에서 섹션 카운터로 덮어쓴다.
      beat.title = condenseLabel(chunk.sentences[0] ?? chunk.text, 24);
      break;
    case 'cta': {
      const imperative = chunk.sentences.find((s) => countCtaSignals(s) > 0);
      beat.action = condenseLabel(imperative ?? chunk.text, 32) || '지금 확인해보세요';
      break;
    }
    default:
      break;
  }

  if (beat.scene_type === 'spotlight') {
    beat.icon = pickSpotlightIcon(chunk.text);
  }
  return beat;
}

/** 블록별 페이싱 분할 + 타입 결정(밸런싱 전 draft). */
function draftScenesFromBlocks(blocks: BriefLogicBlock[]): PlannedSceneDraft[] {
  const drafts: PlannedSceneDraft[] = [];
  for (const block of blocks) {
    const hint = hintTypeFromText(`${block.visual_intent_hint ?? ''} ${block.role ?? ''}`);
    paceSpeakerText(block.speaker_text).forEach((chunk, ci) => {
      drafts.push({
        type: decideSceneType(chunk.text, {
          hintType: ci === 0 ? hint : undefined,
          isSectionStart: chunk.isSectionStart,
        }),
        chunk,
      });
    });
  }
  return drafts;
}

/**
 * 논리블록들을 페이싱 분할 + 타입 결정 + 밸런싱해 본문 beats로 만든다
 * (hero/cta 제외 — planScenesFromBrief가 앞뒤를 붙인다).
 */
export function planScenesFromLogicBlocks(blocks: BriefLogicBlock[]): ScriptBeat[] {
  return finalizeBeats(balanceInsightShare(draftScenesFromBlocks(blocks)));
}

/** 섹션 번호 부여 + index 재배열 + rhythm/transition/mood 최종화. */
function finalizeBeats(drafts: PlannedSceneDraft[], offset = 0, total?: number): ScriptBeat[] {
  const t = total ?? drafts.length + offset;
  let sectionNo = 0;
  return drafts.map((d, i) => {
    const beat = draftToBeat(d, i + offset, t);
    if (beat.scene_type === 'section') {
      sectionNo += 1;
      beat.number = String(sectionNo + 1).padStart(2, '0'); // 01은 인트로 몫
    }
    return beat;
  });
}

/**
 * VideoExecutionBrief → factory ScriptBeat[] 전체 계획.
 *   [0] hero(제목 + 인트로 첫 구간, duration 8~12 하드 클램프)
 *   [1..n] 논리블록 페이싱 분할 씬들(다양한 타입 + 밸런싱)
 *   [n+1] (pulling+bridge) section
 *   [last] cta 보장(마지막 chunk가 행동 촉구면 그것을 cta로, 아니면 합성)
 */
export function planScenesFromBrief(
  brief: VideoExecutionBrief,
  refiner: ScenePlanRefiner = noopScenePlanRefiner,
): ScriptBeat[] {
  const ctx: SceneDecisionContext = {
    title: brief.title,
    core_message: brief.strategy?.core_message,
    desired_reaction: brief.target_viewer?.desired_reaction,
    bridge_to_key_content:
      brief.content_type === 'pulling' ? brief.strategy?.bridge_to_key_content : undefined,
  };

  // 본문 drafts (블록별 분할 + 타입 결정)
  const bodyDrafts = draftScenesFromBlocks(brief.script?.logic_blocks ?? []);

  // 마지막 chunk가 행동 촉구면 cta로 승격(본문에서 분리).
  let ctaDraft: PlannedSceneDraft | null = null;
  const lastDraft = bodyDrafts[bodyDrafts.length - 1];
  if (lastDraft && countCtaSignals(lastDraft.chunk.text) > 0) {
    ctaDraft = { ...lastDraft, type: 'cta' };
    bodyDrafts.pop();
  }

  const balancedBody = balanceInsightShare(bodyDrafts);

  // hero — 인트로 첫 페이싱 구간만 사용(전문 20초 금지).
  const introSource =
    stripScriptArtifacts(brief.script?.intro_30s ?? '') || (ctx.core_message ?? '').trim();
  const heroChunk = paceSpeakerText(introSource)[0];
  const heroCaption = heroChunk?.text ?? (introSource || ctx.title);

  // bridge — pulling 콘텐츠는 cta 직전 section으로.
  const bridge = (ctx.bridge_to_key_content ?? '').trim();

  // cta — 마지막 chunk 승격분이 없으면 desired_reaction/core_message로 합성.
  const ctaCaption =
    ctaDraft?.chunk.text ??
    ((ctx.desired_reaction ?? '').trim() || (ctx.core_message ?? '').trim() || ctx.title);

  const total = 1 + balancedBody.length + (bridge ? 1 : 0) + 1;

  const beats: ScriptBeat[] = [];

  // [0] hero
  const heroHeadline = ctx.title.trim();
  beats.push({
    scene_id: 'scene_01',
    scene_type: 'hero',
    rhythm_role: 'hook',
    headline: heroHeadline,
    subtitle: condenseHeadline(heroCaption),
    speaker_text: heroCaption,
    duration: Math.min(
      SCENE_MAX_SECONDS,
      Math.max(SCENE_TARGET_MIN_SECONDS, Math.round(heroCaption.length / CHARS_PER_SECOND)),
    ),
    emphasis: extractEmphasis(heroHeadline, heroCaption),
    mood: pickMood('hero'),
    transition: pickTransition('hero', 0),
  });

  // [1..n] 본문
  beats.push(...finalizeBeats(balancedBody, 1, total));

  // bridge section
  if (bridge) {
    const idx = beats.length;
    beats.push({
      scene_id: `scene_${String(idx + 1).padStart(2, '0')}`,
      scene_type: 'section',
      rhythm_role: 'reset',
      headline: '다음 영상으로',
      title: '다음 영상으로',
      number: '99',
      body: condenseHeadline(bridge),
      speaker_text: bridge,
      duration: estimateSceneSeconds(bridge),
      emphasis: extractEmphasis('다음 영상으로', bridge),
      mood: pickMood('section'),
      transition: 'fade_scale',
    });
  }

  // [last] cta
  const ctaIdx = beats.length;
  const ctaHeadline = condenseHeadline(ctx.desired_reaction ?? ctx.core_message ?? ctx.title);
  const ctaImperative = ctaDraft
    ? ctaDraft.chunk.sentences.find((s) => countCtaSignals(s) > 0)
    : undefined;
  beats.push({
    scene_id: `scene_${String(ctaIdx + 1).padStart(2, '0')}`,
    scene_type: 'cta',
    rhythm_role: 'cta',
    headline: ctaHeadline,
    action: condenseLabel(ctaImperative ?? ctaCaption, 32) || '지금 확인해보세요',
    speaker_text: ctaCaption,
    duration: estimateSceneSeconds(ctaCaption),
    emphasis: extractEmphasis(ctaHeadline, ctaCaption),
    mood: pickMood('cta'),
    transition: pickTransition('cta', ctaIdx),
  });

  return refiner.refine(beats, ctx);
}

/**
 * (legacy 경로) SlideDeckSpec.slides만 있는 스펙을 위한 계획 —
 * 슬라이드별 speaker_text를 같은 엔진으로 분할·타입결정한다.
 * slides[0]은 hero, cta 부재 시 마지막 슬라이드 기반 cta 합성.
 */
export function planScenesFromSlides(slides: SlideSpec[]): ScriptBeat[] {
  if (!slides || slides.length === 0) return [];

  const drafts: PlannedSceneDraft[] = [];
  slides.slice(1).forEach((slide) => {
    const forcedType: DecidedSceneType | null =
      slide.visual_type === 'bridge' ? 'section' : slide.visual_type === 'cta' ? 'cta' : null;
    const hint =
      forcedType ?? hintTypeFromText(`${slide.visual_type} ${slide.animation_hint ?? ''}`);
    paceSpeakerText(slide.speaker_text).forEach((chunk, ci) => {
      const type =
        ci === 0 && forcedType
          ? forcedType
          : decideSceneType(chunk.text, {
              hintType: ci === 0 ? hint : undefined,
              isSectionStart: chunk.isSectionStart,
            });
      drafts.push({ type, chunk });
    });
  });

  // cta를 마지막으로 보장(중간 cta는 spotlight로 강등).
  drafts.forEach((d, i) => {
    if (d.type === 'cta' && i !== drafts.length - 1) d.type = 'spotlight';
  });

  const balanced = balanceInsightShare(drafts);

  const heroSlide = slides[0];
  const heroChunk = paceSpeakerText(heroSlide.speaker_text)[0];
  const heroCaption = heroChunk?.text ?? heroSlide.speaker_text;
  const needSyntheticCta = balanced[balanced.length - 1]?.type !== 'cta';
  const total = 1 + balanced.length + (needSyntheticCta ? 1 : 0);

  const beats: ScriptBeat[] = [
    {
      scene_id: 'scene_01',
      scene_type: 'hero',
      rhythm_role: 'hook',
      headline: heroSlide.headline,
      subtitle: condenseHeadline(heroCaption),
      speaker_text: heroCaption,
      duration: Math.min(
        SCENE_MAX_SECONDS,
        Math.max(SCENE_TARGET_MIN_SECONDS, Math.round(heroCaption.length / CHARS_PER_SECOND)),
      ),
      emphasis: extractEmphasis(heroSlide.headline, heroCaption),
      mood: pickMood('hero'),
      transition: pickTransition('hero', 0),
    },
    ...finalizeBeats(balanced, 1, total),
  ];

  if (needSyntheticCta) {
    const lastSlide = slides[slides.length - 1];
    const idx = beats.length;
    const headline = condenseHeadline(lastSlide.headline);
    beats.push({
      scene_id: `scene_${String(idx + 1).padStart(2, '0')}`,
      scene_type: 'cta',
      rhythm_role: 'cta',
      headline,
      action: '지금 확인해보세요',
      speaker_text: stripScriptArtifacts(lastSlide.speaker_text) || headline,
      duration: SCENE_TARGET_MIN_SECONDS,
      emphasis: extractEmphasis(headline, lastSlide.speaker_text),
      mood: pickMood('cta'),
      transition: 'slide_up',
    });
  }

  return beats;
}
