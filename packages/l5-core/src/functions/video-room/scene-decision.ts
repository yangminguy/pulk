// CMO Video Room — Scene Decision 엔진 (Phase 2: insight 단일 붕괴 해소).
//
// VideoExecutionBrief의 logic_blocks(긴 speaker_text 문단)를 받아
//   1. 문장 경계 기반 페이싱 분할(씬당 8~12초 목표, 글자수÷5.5)
//   2. 한국어 텍스트 분석 스코어링으로 scene_type 결정(숫자밀도→metric_cards,
//      라벨+수치 쌍 2개 이상→chart_reveal(metric_cards보다 우선), 비교→comparison,
//      순서→steps/flow, 인용→quote, 나열→orbital/split, 재정의→reframe, 문제제기→problem,
//      장전환→section, 마무리→cta, hook/tension/insight 위치의 단정 선언문→kinetic_typo(15% 캡),
//      그 외→insight)
//   3. insight 과반 방지 다양성 밸런싱(초과분은 chart_reveal/kinetic_typo도 후보)
//   4. emphasis / mood / transition / rhythm_role 결정론 배정
// 을 수행해 factory 호환 ScriptBeat[]를 만든다.
//
// 계약 근거: docs/cmo/CMO_TO_FACTORY_CONTRACT.md §12 — 브리프는 scene_type/duration을
// 제공하지 않으며 communication_goal 분석 → scene_type 결정은 이 변환 계층의 책임.
//
// Pure & deterministic — Date/random 금지, NocoBase 없이 테스트 가능(l5-core 규칙).
// LLM 리파이너는 주입 인터페이스(ScenePlanRefiner)만 남긴다(기본 no-op, 미사용).

import type { BriefLogicBlock, VideoExecutionBrief, SlideSpec, PreferredAssetType } from './types';
import type {
  ScriptBeat,
  BackgroundMedia,
  BackgroundMediaKind,
  BackgroundMediaTreatment,
  GalleryItem,
} from './script-factory';

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 한국어 나레이션 글자수→초 환산 계수(기존 render-pipeline과 동일). */
export const CHARS_PER_SECOND = 5.5;
/** 씬 duration 하한(팩토리 zod 하한과 동일). */
export const SCENE_MIN_SECONDS = 3;
/** 씬 duration 상한 — 페이싱 개선 목표(기존 20초 정적 씬 금지). */
export const SCENE_MAX_SECONDS = 12;
/** 페이싱 목표 하한(초). */
export const SCENE_TARGET_MIN_SECONDS = 8;
/** hero duration 하한 — 캡션 글자수 기반(F2). 짧은 훅 캡션(예: 15자)에 8초 고정 배정 금지. */
export const HERO_MIN_SECONDS = 4;

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
  'chart_reveal',
  'kinetic_typo',
  'broll',
  'gallery',
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

/** hero 캡션 글자수÷5.5 초 추정, [4, 12] 클램프(F2: 8초 고정 하한이 만들던 무음 공백 제거). */
export function estimateHeroSeconds(text: string): number {
  const chars = (text ?? '').trim().length;
  const raw = Math.round(chars / CHARS_PER_SECOND);
  return Math.min(SCENE_MAX_SECONDS, Math.max(HERO_MIN_SECONDS, raw));
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

/** headline 최대 길이 — 화면 두 줄 이내(F3 재검: 36 → 40). */
const HEADLINE_MAX_CHARS = 40;

const LEADING_CONJUNCTIONS =
  /^(?:그러니까|그런데|근데|그리고|하지만|그래서|사실|실제로|그럼|이제|즉|또한?|먼저)[,\s]+/;

/**
 * 어미 제거 결과가 잘린 활용형인지 검사(F3).
 * kind=verb: 동사성 어미를 뗀 자리 — 어간 꼬리(늘/짚어/않/있 …)로 끝나면 제거 포기.
 * kind=noun: 명사 뒤 계사/존재("예요/이 있다")를 뗀 자리 — 명사의 어아여 종결("마니아")은 정상.
 */
function isDanglingStemResult(s: string, kind: 'noun' | 'verb'): boolean {
  const lastToken = s.split(/\s+/).pop() ?? '';
  if (lastToken.length < 2) return true; // "늘", "가" 같은 1글자 어간
  if (/(?:지\s*않|지\s*못|않|못|있|없)$/.test(s)) return true; // 잘린 부정/존재 어간
  if (kind === 'verb' && /[어아여워]$/.test(s)) return true; // 잘린 활용형("짚어", "새어")
  return false;
}

/** 흔한 종결어미를 걷어 핵심 구문으로 만든다(남는 길이가 충분하고 잘린 어간이 아닐 때만). */
export function stripSentenceEnding(clause: string): string {
  const s = clause.trim().replace(/[.!…]+$/, '');

  // "-고 있어요/있습니다" 진행형은 명사형(-기)으로 변환("올리고 있어요" → "올리기").
  const nominal = s.replace(/([가-힣]+)고\s+있(?:습니다|어요|다|거든요|네요|죠)$/, '$1기');
  if (nominal !== s && nominal.length >= 6) return nominal;

  const patterns: Array<{ re: RegExp; kind: 'noun' | 'verb' }> = [
    { re: /(?:이|가)\s*있(?:습니다|어요|다|거든요)$/, kind: 'noun' },
    { re: /\s+있(?:습니다|어요|다|거든요|네요|죠)$/, kind: 'noun' }, // "하나 있거든요" → "하나"
    { re: /(?:입니다|이에요|예요|인데요|이죠|이다|라는\s*거예요|인\s*거예요)$/, kind: 'noun' },
    { re: /(?:합니다|습니다|거든요|잖아요|하겠습니다|할게요|드릴게요|해야\s*해요|해야\s*돼요)$/, kind: 'verb' },
    { re: /(?:했어요|됐어요|였어요|았어요|었어요|해요|돼요|와요|가요|어요|아요|에요|죠)$/, kind: 'verb' },
    { re: /(?:한다|된다|이다|는다)$/, kind: 'verb' },
  ];
  for (const { re, kind } of patterns) {
    const next = s.replace(re, '').trim();
    if (next !== s && next.length >= 6 && !isDanglingStemResult(next, kind)) return next;
  }
  return s; // 자연스럽게 못 줄이면 온전한 어미 그대로 둔다("늘지 않는다", "늘었어요").
}

/**
 * 잘린 어간/연결어미/다자 조사로 끝나 화면 headline로 부자연스러운지 검사(F3 휴리스틱).
 * 자연 종결(명사구 마무리, 온전한 어미, 물음)은 통과한다.
 */
export function hasBrokenHeadlineEnding(text: string): boolean {
  const t = (text ?? '').trim().replace(/["'“”‘’]+$/, '');
  if (!t) return false;
  if (/(?:지\s*않|지\s*못|않|못|있|없)$/.test(t)) return true; // 잘린 부정/존재 어간
  if (/(?:는데|은데|다가|면서|지만|거나|려면)$/.test(t)) return true; // 연결어미
  if (/(?:까지|부터|에서|에게|한테|처럼|보다|마다|조차|밖에)$/.test(t)) return true; // 다자 조사
  return false;
}

/** 잘린 어미로 끝나면 어절 단위로 걷어내 자연 종결로 복구한다(복구 불가 시 어미 포함 폴백). */
function repairDanglingEnding(s: string, naturalFallback: string): string {
  if (!hasBrokenHeadlineEnding(s)) return s;
  let t = s;
  while (hasBrokenHeadlineEnding(t)) {
    const cut = t.replace(/\s*\S+$/, '').trim();
    if (cut.length < 6) {
      return naturalFallback.length > 0 &&
        naturalFallback.length <= HEADLINE_MAX_CHARS &&
        !hasBrokenHeadlineEnding(naturalFallback)
        ? naturalFallback
        : s;
    }
    t = cut;
  }
  return t;
}

/**
 * 문장에서 핵심 구문 headline을 뽑는다(전문 복붙·"…" 자름 금지):
 * 접속사 제거 → 쉼표 절 중 마지막(또는 길이 적합) 절 선택 → 종결어미 제거
 * → 잘린 어미 복구(항상 명사구 마무리 또는 온전한 어미로 종결, F3).
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

  // 어미 포함 자연 종결 폴백(복구 실패 시 사용).
  const natural = s.replace(/[.!…]+$/, '').replace(/["'“‘”’]/g, '').trim();

  s = stripSentenceEnding(s);

  // 그래도 길면 마지막 어절 경계에서 줄인다(말줄임표 금지).
  if (s.length > HEADLINE_MAX_CHARS) {
    const cut = s.slice(0, HEADLINE_MAX_CHARS);
    const boundary = cut.lastIndexOf(' ');
    s = (boundary >= 10 ? cut.slice(0, boundary) : cut).trim();
  }

  s = repairDanglingEnding(s.replace(/["'“‘”’]/g, '').trim(), natural);
  return s || stripScriptArtifacts(text).slice(0, HEADLINE_MAX_CHARS).trim();
}

/**
 * body/subtitle이 caption(나레이션 전문)과 사실상 동일하면 비운다(F3: 화면 텍스트는 핵심만,
 * 전문은 음성·자막). body는 caption 문장들에서 파생되므로 정규화 글자수 비 80% 이상이면
 * 중복으로 보고 빈 문자열을 반환한다(팩토리 스키마상 optional 필드).
 */
export function dedupeBodyAgainstCaption(body: string, caption: string): string {
  const nb = normalizeForDedupe(body);
  const nc = normalizeForDedupe(caption);
  if (nb.length === 0 || nc.length === 0) return body;
  if (nb === nc || nb.length / nc.length >= 0.8) return '';
  return body;
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

// ── 3.5 chart_reveal / kinetic_typo 신호 ─────────────────────────────────────

/** chart_reveal.items 후보(라벨 + 수치 + 단위). */
export interface ChartItemCandidate {
  label: string;
  value: number;
  unit?: string;
}

/** "N월"/"N분기"/"N주차"/"N번째" 같은 순번 라벨 뒤에 붙는 수치 나열(예: "1월 120명, 2월 340명"). */
const ORDINAL_LABEL_UNIT = '(?:월|분기|주차|일차|번째|년차|주년)';

function extractOrdinalLabeledPairs(text: string): ChartItemCandidate[] {
  const re = new RegExp(
    `(\\d{1,2}\\s*${ORDINAL_LABEL_UNIT})\\s*[:,]?\\s*(\\d[\\d,.]*)\\s*(${METRIC_UNIT})`,
    'g',
  );
  const out: ChartItemCandidate[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ label: m[1].replace(/\s+/g, ''), value: Number(m[2].replace(/,/g, '')), unit: m[3] });
  }
  return out;
}

/** "전환율 3%→12%"처럼 화살표로 이어진 전/후 수치 한 쌍. */
function extractArrowPair(text: string): ChartItemCandidate[] {
  const re = new RegExp(
    `(\\d[\\d,.]*)\\s*(${METRIC_UNIT})\\s*(?:→|->|~)\\s*(\\d[\\d,.]*)\\s*(${METRIC_UNIT})?`,
  );
  const m = re.exec(text);
  if (!m) return [];
  return [
    { label: '이전', value: Number(m[1].replace(/,/g, '')), unit: m[2] },
    { label: '이후', value: Number(m[3].replace(/,/g, '')), unit: m[4] ?? m[2] },
  ];
}

/** 라벨 없이 나열된 수치+단위(2개 이상)를 순번 라벨로 변환(최후 폴백). */
function extractSequentialNumericItems(text: string): ChartItemCandidate[] {
  const spans = extractNumericSpans(text);
  if (spans.length < 2) return [];
  return spans.map((span, i) => {
    const m = span.match(new RegExp(`^(\\d[\\d,.]*)\\s*(${METRIC_UNIT})$`));
    return {
      label: `${i + 1}구간`,
      value: m ? Number(m[1].replace(/,/g, '')) : 0,
      unit: m?.[2],
    };
  });
}

/**
 * chart_reveal 후보 아이템(라벨+수치 쌍 2개 이상)을 추출한다.
 * 우선순위: 순번 라벨 나열(1월/2월…) → 화살표 전/후(3%→12%) → 라벨 없는 순수 나열.
 * 2개 미만이면 빈 배열(= chart_reveal 부적격, metric_cards 등 기존 로직 유지).
 */
export function extractChartItems(text: string): ChartItemCandidate[] {
  const ordinal = extractOrdinalLabeledPairs(text);
  if (ordinal.length >= 2) return ordinal;
  const arrow = extractArrowPair(text);
  if (arrow.length >= 2) return arrow;
  return extractSequentialNumericItems(text);
}

const KINETIC_TYPO_MAX_CHARS = 40;

/** 짧고 단정적인 한 문장 선언문인지: 문장 1개·40자 이하·물음이 아니고 나열도 아님. */
export function isShortDeclarative(text: string): boolean {
  const sentences = splitSentences(text);
  if (sentences.length !== 1) return false;
  const s = sentences[0].trim();
  if (s.length === 0 || s.length > KINETIC_TYPO_MAX_CHARS) return false;
  if (/[?？]\s*$/.test(s)) return false;
  if (countEnumerationSignals(s) > 0) return false;
  return true;
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
  chart_reveal: number;
  kinetic_typo: number;
}

export interface DecideSceneTypeContext {
  /** CMO visual_intent_hint 등에서 온 사전 힌트(참고용 가중치 +3). */
  hintType?: DecidedSceneType;
  /** 전체 plan의 마지막 chunk 여부 — cta는 마지막 chunk만 허용. */
  isFinalChunk?: boolean;
  /** "---" 섹션의 첫 chunk 여부. */
  isSectionStart?: boolean;
  /** hook(앞1/4)/tension(문제 제기 직후)/insight(뒤1/4) 리듬 위치 여부 — kinetic_typo 배정 후보 조건. */
  isRhythmPunchZone?: boolean;
}

/** chunk 텍스트의 타입별 점수를 계산한다(결정론). */
export function scoreSceneTypes(text: string, ctx: DecideSceneTypeContext = {}): SceneTypeScores {
  const firstSentence = splitSentences(text)[0] ?? text;
  const metric = countMetricSignals(text);
  const seq = countSequenceSignals(text);
  const hasArrow = /->|→/.test(text);
  const chartItems = extractChartItems(text);

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
    // 라벨+수치 쌍 2개 이상이면 metric_cards보다 우선(수치 1개뿐이면 0 → metric_cards 로직 그대로 유지).
    chart_reveal: chartItems.length >= 2 ? chartItems.length + 3 : 0,
    // hook/tension/insight 위치 + 짧은 단정 선언문일 때만 후보(threshold 동점 시 우선순위 최하단).
    kinetic_typo: ctx.isRhythmPunchZone && isShortDeclarative(text) ? DECISION_THRESHOLD : 0,
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
  'chart_reveal',
  'metric_cards',
  'comparison',
  'flow',
  'steps',
  'quote',
  'orbital',
  'reframe',
  'problem',
  'split',
  'kinetic_typo',
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
  if (type === 'metric_cards' || type === 'quote' || type === 'chart_reveal') return 'proof';
  if (type === 'reframe' || type === 'kinetic_typo') return 'insight';
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
  if (type === 'kinetic_typo') return 'cut';
  return index % 2 === 0 ? 'fade' : 'cut';
}

type Mood = NonNullable<ScriptBeat['mood']>;

/** hook/cta는 dark로 대비, 증거(proof) 씬은 clean, 본문은 light. */
export function pickMood(type: DecidedSceneType): Mood {
  if (type === 'hero' || type === 'cta' || type === 'section' || type === 'kinetic_typo') return 'dark';
  if (type === 'metric_cards' || type === 'quote' || type === 'chart_reveal') return 'clean';
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

/** chart_reveal.items — 라벨+수치 쌍을 최대 6개로 자른다(스코어링 단계에서 이미 2개 이상 확인됨). */
function buildChartItems(chunk: PacedChunk): ChartItemCandidate[] {
  const items = extractChartItems(chunk.text).slice(0, 6);
  // 방어적 폴백 — decideSceneType이 chart_reveal을 고른 경우 실제로는 도달하지 않는다.
  return items.length >= 2 ? items : [{ label: '이전', value: 0 }, { label: '이후', value: 0 }];
}

/** chart_reveal.chart_kind — 화살표/추이 어휘가 있으면 line, 아니면 막대(bar). */
function pickChartKind(text: string): 'bar' | 'line' {
  return /→|->|~|추이|증가|감소|늘어|줄어/.test(text) ? 'line' : 'bar';
}

/** kinetic_typo.lines — 쉼표 절 기준 최대 2줄로 분리(단문이면 1줄). */
function buildKineticLines(chunk: PacedChunk): string[] {
  const sentence = chunk.sentences[0] ?? chunk.text;
  const clauses = sentence
    .split(/,\s*/)
    .map((c) => stripSentenceEnding(c.trim()).replace(/[.!?…]+$/, '').trim())
    .filter((c) => c.length > 0);
  if (clauses.length >= 2) return clauses.slice(0, 2);
  const single = stripSentenceEnding(sentence).replace(/[.!?…]+$/, '').trim();
  return [single || condenseHeadline(sentence)];
}

// ── 6.5 배경 미디어(background_media) 배정 ───────────────────────────────────
// D3 Phase 8: communication_goal/원고 키워드 → 스톡 검색어 또는 스크린샷 요청.
// 사장님 방침: 진짜 스크린샷 우선, 스톡 B-roll은 무거운 보정(치닝 방지 기본 강하게).
// Phase 6 미디어 에이전트와 정확히 동일 shape(script-factory.ts의 BackgroundMedia/
// BrollMedia/GalleryItem)으로 생성한다.

/** 실사 배경이 오히려 가독성을 해치는 데이터/구조 씬(카드·차트·좌우비교) — 미배정. */
const NO_BACKGROUND_MEDIA_TYPES = new Set<DecidedSceneType>([
  'metric_cards',
  'chart_reveal',
  'comparison',
]);

interface StockQueryRule {
  match: RegExp;
  query: string;
  kind: 'stock_video' | 'stock_photo';
}

/**
 * 한국어 원고 키워드 → 영어 Pexels 검색어 사전(결정론, 구체적 표현 우선순위).
 * 행동/과정을 묘사하는 키워드는 stock_video, 장소/정적 개념은 stock_photo로 나눈다.
 */
const STOCK_QUERY_RULES: StockQueryRule[] = [
  { match: /미용실|헤어|원장님/, query: 'hair salon', kind: 'stock_photo' },
  { match: /카페|커피\s*(?:숍|샵)/, query: 'coffee shop interior', kind: 'stock_photo' },
  { match: /식당|음식점|레스토랑/, query: 'restaurant dining', kind: 'stock_photo' },
  { match: /병원|의원|클리닉/, query: 'medical clinic', kind: 'stock_photo' },
  { match: /헬스장|피트니스/, query: 'gym workout', kind: 'stock_video' },
  { match: /학원|과외|수업/, query: 'classroom study', kind: 'stock_photo' },
  { match: /인스타(?:그램)?|릴스/, query: 'instagram phone scrolling', kind: 'stock_video' },
  { match: /유튜브/, query: 'youtube video camera', kind: 'stock_video' },
  { match: /해시태그/, query: 'social media hashtag phone', kind: 'stock_photo' },
  { match: /팔로워/, query: 'social media followers phone', kind: 'stock_photo' },
  { match: /저장(?:을|한|하는)?/, query: 'social media bookmark phone', kind: 'stock_photo' },
  { match: /광고/, query: 'advertising marketing laptop', kind: 'stock_video' },
  { match: /후기|리뷰|사례/, query: 'customer review smartphone', kind: 'stock_photo' },
  { match: /예약/, query: 'booking phone calendar', kind: 'stock_photo' },
  { match: /손님|고객/, query: 'customer shop', kind: 'stock_video' },
  { match: /매출|성장|수익/, query: 'business growth chart', kind: 'stock_photo' },
  { match: /전환율|전환/, query: 'conversion funnel chart', kind: 'stock_photo' },
  { match: /상담|문의/, query: 'business consultation meeting', kind: 'stock_video' },
  { match: /동네/, query: 'neighborhood street', kind: 'stock_photo' },
  { match: /시간|기다림/, query: 'people waiting time', kind: 'stock_video' },
];

/** 원고 텍스트에 매칭되는 첫 스톡 검색어 규칙(사전 순서가 우선순위). */
function pickStockQuery(text: string): StockQueryRule | undefined {
  return STOCK_QUERY_RULES.find(({ match }) => match.test(text));
}

/** 제품/UI/화면/앱 콘텐츠 신호 — 있으면 스톡보다 스크린샷을 우선한다(사장님 방침). */
const SCREENSHOT_SUBJECT_RE =
  /프로필|바이오|DM|스토리\s*하이라이트|앱\s*화면|스크린샷|대시보드|링크(?:를|이)?\s*(?:눌|클릭)|가격표|페이지|버튼|설정\s*(?:화면|메뉴)?/;

function isScreenshotSubject(text: string): boolean {
  return SCREENSHOT_SUBJECT_RE.test(text);
}

/** 스톡 매칭 있고 스크린샷 신호는 없는 실세계 촬영감 — broll 전환 후보 판정에 쓴다. */
function hasRealWorldVisualSignal(text: string): boolean {
  return !isScreenshotSubject(text) && pickStockQuery(text) !== undefined;
}

/** 기본 강한 보정(치닝 방지) — duotone + 강한 blur/scrim + grain. 정지 이미지는 ken_burns 추가. */
function buildTreatment(kind: BackgroundMediaKind): BackgroundMediaTreatment {
  return {
    grade: 'duotone',
    blur: 6,
    scrim: 0.7,
    grain: true,
    ...(kind === 'stock_photo' ? { ken_burns: true } : {}),
  };
}

/** asset_requests.preferred_asset_type → background_media.kind 매핑. face_video는 talking_head
 *  힌트일 뿐 background_media 대상이 아니라 매핑에서 제외한다. */
const ASSET_TYPE_TO_KIND: Partial<Record<PreferredAssetType, BackgroundMediaKind>> = {
  screen_work: 'screenshot',
  source_screenshot: 'screenshot',
  reference_image: 'stock_photo',
  reference_video: 'stock_video',
};

type AssetRequest = NonNullable<VideoExecutionBrief['asset_requests']>[number];

/** 텍스트에서 http(s) URL을 뽑는다(screenshot src 후보 — 러너는 src가 URL이어야 캡처). */
function extractUrl(text: string): string | undefined {
  const m = (text ?? '').match(/https?:\/\/[^\s"'<>)\]]+/);
  return m ? m[0] : undefined;
}

/** 여러 컨텍스트 텍스트에서 영상 전체의 대표 스톡 주제 검색어를 뽑는다(없으면 generic 폴백). */
function resolveBaseStockQuery(texts: Array<string | undefined>): string {
  for (const t of texts) {
    if (!t) continue;
    const rule = pickStockQuery(t);
    if (rule) return rule.query;
  }
  return 'small business';
}

/**
 * 스톡 폴백 — 러너가 미디어를 가져오려면 stock_* 는 반드시 query가 있어야 한다.
 * 텍스트 사전 매칭 우선, 없으면 baseQuery, 그것도 없으면 undefined(미배정 — 단색 허용).
 */
function stockFallback(text: string, baseQuery?: string): BackgroundMedia | undefined {
  const rule = pickStockQuery(text);
  if (rule) return { kind: rule.kind, query: rule.query, treatment: buildTreatment(rule.kind) };
  if (baseQuery) return { kind: 'stock_photo', query: baseQuery, treatment: buildTreatment('stock_photo') };
  return undefined;
}

/** 조사 제거 + 2자 이상 토큰화(불용어 제외) — asset_request 매칭용(등장 횟수 조건 없음). */
function tokenizeKeywords(text: string): Set<string> {
  const tokens = (text ?? '')
    .split(/[\s,.!?…"'“”‘’()[\]{}~·—–:;/]+/)
    .map((t) => stripTrailingParticle(t.trim()))
    .filter((t) => t.length >= 2 && !STOPWORD_TOKENS.has(t) && !/^\d+$/.test(t));
  return new Set(tokens);
}

/** 씬 텍스트와 핵심 토큰이 겹치는 asset_request(있으면 첫 항목 — 브리프 배열 순서를 우선순위로 본다). */
function findMatchingAssetRequest(
  text: string,
  requests: AssetRequest[] | undefined,
): AssetRequest | undefined {
  if (!requests || requests.length === 0) return undefined;
  const sceneTokens = tokenizeKeywords(text);
  if (sceneTokens.size === 0) return undefined;
  return requests.find((req) => {
    const reqTokens = tokenizeKeywords(`${req.need} ${req.reason ?? ''}`);
    for (const t of reqTokens) {
      if (sceneTokens.has(t)) return true;
    }
    return false;
  });
}

/**
 * 씬 타입/원고 텍스트(+asset_requests)로 background_media를 결정한다.
 * 우선순위: 데이터 씬 미배정 → asset_request 매칭(있으면 우선 반영) → 스크린샷 신호 → 스톡 사전 → 미배정.
 *
 * 러너 계약(G1/G2): stock_* 는 반드시 query, screenshot 은 반드시 src(URL)를 가져야 한다.
 *   - screenshot 은 asset_request가 실제 캡처 URL을 준 경우에만 배정(그 외엔 스톡 폴백).
 *   - stock_* 는 query가 없으면 baseQuery 폴백, 그것도 없으면 미배정.
 */
export function decideBackgroundMedia(
  sceneType: DecidedSceneType,
  text: string,
  assetRequests?: AssetRequest[],
  baseQuery?: string,
): BackgroundMedia | undefined {
  if (NO_BACKGROUND_MEDIA_TYPES.has(sceneType)) return undefined;

  const matchedRequest = findMatchingAssetRequest(text, assetRequests);
  if (matchedRequest) {
    const kind = ASSET_TYPE_TO_KIND[matchedRequest.preferred_asset_type];
    if (!kind) return undefined; // face_video 등 — talking_head 힌트일 뿐, 배경 미디어 대상 아님.
    const reqText = `${matchedRequest.need} ${matchedRequest.reason ?? ''}`;
    if (kind === 'screenshot') {
      const url = extractUrl(reqText);
      // 실제 캡처 URL이 있을 때만 screenshot. 없으면 러너가 캡처 못 하므로 스톡으로 폴백.
      if (url) return { kind: 'screenshot', src: url, focus: 'ui', treatment: buildTreatment('screenshot') };
      return stockFallback(`${reqText} ${text}`, baseQuery);
    }
    // reference_image → stock_photo, reference_video → stock_video (요청 kind 유지, query 필수).
    const query = pickStockQuery(`${reqText} ${text}`)?.query ?? baseQuery;
    if (!query) return undefined;
    return { kind, query, treatment: buildTreatment(kind) };
  }

  if (isScreenshotSubject(text)) {
    // URL을 모르는 스크린샷 신호 씬 → screenshot 대신 관련 스톡으로 폴백(사장님 방침 (b)).
    return stockFallback(text, baseQuery);
  }

  const stock = pickStockQuery(text);
  if (stock) {
    return { kind: stock.kind, query: stock.query, treatment: buildTreatment(stock.kind) };
  }

  return undefined;
}

/** gallery 아이템의 서로 다른 각도 검색어(같은 주제, 다른 앵글). */
const GALLERY_ANGLE_SUFFIXES = ['interior', 'people at work', 'customer', 'storefront'];

/** base 검색어 → 서로 다른 앵글의 stock 검색어 count개(예: "hair salon" → interior/people at work/customer). */
function galleryAngleQueries(base: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${base} ${GALLERY_ANGLE_SUFFIXES[i % GALLERY_ANGLE_SUFFIXES.length]}`,
  );
}

/**
 * orbital 후보였던 나열 스팬(3~6개)을 gallery 아이템(2~4개)으로 변환.
 * 각 item에 반드시 query를 채운다(G1: 러너는 query 없으면 미디어를 못 가져옴).
 * 주제 base는 chunk 사전 매칭 → baseQuery → generic 폴백 순. label은 스팬/문장 축약.
 */
function buildGalleryItems(chunk: PacedChunk, baseQuery?: string): GalleryItem[] {
  const spans = extractQuotedSpans(chunk.text);
  const rawLabels =
    spans.length >= 2
      ? spans.slice(0, 4)
      : chunk.sentences
          .slice(0, 4)
          .map((s) => condenseLabel(s, 18))
          .filter((s) => s.length > 0);
  const count = Math.min(4, Math.max(2, rawLabels.length));
  const base = pickStockQuery(chunk.text)?.query ?? baseQuery ?? 'small business';
  const queries = galleryAngleQueries(base, count);
  return Array.from({ length: count }, (_, i) => ({
    kind: 'stock_photo' as const,
    query: queries[i],
    ...(rawLabels[i] ? { label: rawLabels[i].slice(0, 24) } : {}),
  }));
}

/** 미디어 배정에 필요한 영상 전체 컨텍스트(asset_requests + 대표 스톡 주제 검색어). */
interface MediaPlanContext {
  assetRequests?: AssetRequest[];
  /** 영상 전체 대표 스톡 검색어(screenshot→stock 폴백 및 gallery/broll 채움용). */
  baseQuery?: string;
}

const BROLL_CAP_SHARE = 0.1; // broll 남용 방지 — 전체(body draft)의 ~10% 이하.
const GALLERY_CAP_SHARE = 0.1; // gallery 남용 방지 — 전체(body draft)의 ~10% 이하.

/**
 * 실세계 묘사가 강한 hook~중반 구간에 broll 1개, 나열형(orbital) 구간에 gallery 1개를 배치한다
 * (리듬 규칙: "첫 hook 직후나 proof 구간에 broll 1개 정도"). 총 chunk 수가 10 미만이면
 * (cap<1) 배치하지 않는다 — 너무 짧은 영상에 억지로 컷어웨이를 끼우지 않기 위함.
 */
export function assignBrollGallery(drafts: PlannedSceneDraft[]): PlannedSceneDraft[] {
  const result = drafts.map((d) => ({ ...d }));
  const total = result.length;
  if (total === 0) return result;

  const brollCap = Math.floor(total * BROLL_CAP_SHARE);
  if (brollCap >= 1) {
    const brollIdx = result.findIndex(
      (d, i) =>
        (d.type === 'insight' || d.type === 'spotlight' || d.type === 'problem') &&
        i <= Math.ceil(total * 0.5) &&
        hasRealWorldVisualSignal(d.chunk.text),
    );
    if (brollIdx >= 0) result[brollIdx] = { ...result[brollIdx], type: 'broll' };
  }

  const galleryCap = Math.floor(total * GALLERY_CAP_SHARE);
  if (galleryCap >= 1) {
    const galleryIdx = result.findIndex((d) => d.type === 'orbital');
    if (galleryIdx >= 0) result[galleryIdx] = { ...result[galleryIdx], type: 'gallery' };
  }

  return result;
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
const KINETIC_TYPO_SHARE_CAP = 0.15; // kinetic_typo 남용 방지

/** hook(앞1/4) / tension(problem 직후) / insight(뒤1/4) 리듬 위치 판정. */
function isKineticTypoZone(index: number, total: number, prevType?: DecidedSceneType): boolean {
  if (total <= 0) return false;
  if (index < total * 0.25) return true;
  if (index >= total * 0.75) return true;
  return prevType === 'problem';
}

/**
 * insight 비중이 과반이 되지 않도록 다양성 밸런싱.
 * 초과분은 등장 순서대로: chart_reveal(라벨+수치 쌍 2개 이상 추출 가능 시) →
 * kinetic_typo(hook/tension/insight 위치의 단정 선언문, 15% 캡 이내) →
 * spotlight ↔ split(카드 도출 가능 시) 교대 재배정.
 */
export function balanceInsightShare(drafts: PlannedSceneDraft[]): PlannedSceneDraft[] {
  const result = drafts.map((d) => ({ ...d }));
  const total = result.length;
  const insightIdx = result
    .map((d, i) => (d.type === 'insight' ? i : -1))
    .filter((i) => i >= 0);
  let insightCount = insightIdx.length;
  let flip = 0;
  let kineticCount = result.filter((d) => d.type === 'kinetic_typo').length;
  const kineticCap = Math.floor(total * KINETIC_TYPO_SHARE_CAP);
  for (const i of insightIdx) {
    if (insightCount / total <= INSIGHT_SHARE_CAP) break;
    const chunkText = result[i].chunk.text;
    if (extractChartItems(chunkText).length >= 2) {
      result[i].type = 'chart_reveal';
    } else if (
      kineticCount < kineticCap &&
      isKineticTypoZone(i, total, result[i - 1]?.type) &&
      isShortDeclarative(chunkText)
    ) {
      result[i].type = 'kinetic_typo';
      kineticCount += 1;
    } else {
      const wantSplit = flip % 2 === 1 && buildSplitCards(result[i].chunk) !== null;
      result[i].type = wantSplit ? 'split' : 'spotlight';
      flip += 1;
    }
    insightCount -= 1;
  }
  return result;
}

/** kinetic_typo 비중이 전체의 15%를 넘지 않도록 초과분(뒤에서부터)을 insight로 되돌리는 안전망. */
export function capKineticTypoShare(drafts: PlannedSceneDraft[]): PlannedSceneDraft[] {
  const result = drafts.map((d) => ({ ...d }));
  const total = result.length;
  if (total === 0) return result;
  const cap = Math.floor(total * KINETIC_TYPO_SHARE_CAP);
  const idx = result.map((d, i) => (d.type === 'kinetic_typo' ? i : -1)).filter((i) => i >= 0);
  let excess = idx.length - cap;
  for (let k = idx.length - 1; k >= 0 && excess > 0; k--) {
    result[idx[k]].type = 'insight';
    excess -= 1;
  }
  return result;
}

function draftToBeat(
  draft: PlannedSceneDraft,
  index: number,
  total: number,
  media?: MediaPlanContext,
): ScriptBeat {
  const { type, chunk } = draft;
  const headline = condenseHeadline(chunk.sentences[0] ?? chunk.text);
  const caption = chunk.text;
  // F3: body가 caption(자막/나레이션)과 사실상 동일하면 비운다 — 화면 텍스트는 핵심만.
  const body = dedupeBodyAgainstCaption(condenseBody(chunk.sentences), caption);

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
    case 'chart_reveal':
      beat.chartItems = buildChartItems(chunk);
      beat.chart_kind = pickChartKind(chunk.text);
      break;
    case 'kinetic_typo':
      beat.lines = buildKineticLines(chunk);
      break;
    case 'broll': {
      // broll = 풀블리드 실사(footage). 스크린샷이 아니라 항상 stock_*, query 필수.
      const stock = pickStockQuery(chunk.text);
      const kind: 'stock_video' | 'stock_photo' = stock?.kind ?? 'stock_video';
      beat.media = { kind, query: stock?.query ?? media?.baseQuery ?? 'small business' };
      beat.treatment = buildTreatment(kind);
      break;
    }
    case 'gallery':
      beat.gallery_items = buildGalleryItems(chunk, media?.baseQuery);
      break;
    default:
      break;
  }

  if (beat.scene_type === 'spotlight') {
    beat.icon = pickSpotlightIcon(chunk.text);
  }

  // background_media는 broll/gallery(자체 media 필드 사용) 외 나머지 씬 타입에 배정한다.
  if (beat.scene_type !== 'broll' && beat.scene_type !== 'gallery') {
    const backgroundMedia = decideBackgroundMedia(
      beat.scene_type as DecidedSceneType,
      chunk.text,
      media?.assetRequests,
      media?.baseQuery,
    );
    if (backgroundMedia) beat.background_media = backgroundMedia;
  }

  return beat;
}

/**
 * dedupe 정규화 키 — 아티팩트 제거 + 공백/구두점/따옴표 무시.
 * 상류 브리프 버그(블록마다 full_script 전문 중복)를 플래너에서 방어하기 위한 비교 기준.
 */
export function normalizeForDedupe(text: string): string {
  return stripScriptArtifacts(text ?? '').replace(/[\s.,!?…"'“”‘’]/g, '');
}

/**
 * 블록별 페이싱 분할 + 타입 결정(밸런싱 전 draft).
 * 정규화된 speaker_text가 이미 처리한 블록과 사실상 동일한 블록은 스킵한다
 * (메타(hint 등)는 자연스럽게 첫 블록 것만 반영됨).
 * 전체 chunk 수를 먼저 모은 뒤 순차 결정해 kinetic_typo의 hook/tension/insight
 * 위치 판정(isKineticTypoZone)에 필요한 index/total/직전 타입을 확보한다.
 */
function draftScenesFromBlocks(blocks: BriefLogicBlock[]): PlannedSceneDraft[] {
  const seen = new Set<string>();
  const rawChunks: Array<{ chunk: PacedChunk; ci: number; hint?: DecidedSceneType }> = [];
  for (const block of blocks) {
    const key = normalizeForDedupe(block.speaker_text);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    const hint = hintTypeFromText(`${block.visual_intent_hint ?? ''} ${block.role ?? ''}`);
    paceSpeakerText(block.speaker_text).forEach((chunk, ci) => {
      rawChunks.push({ chunk, ci, hint });
    });
  }

  const total = rawChunks.length;
  const drafts: PlannedSceneDraft[] = [];
  rawChunks.forEach(({ chunk, ci, hint }, i) => {
    const type = decideSceneType(chunk.text, {
      hintType: ci === 0 ? hint : undefined,
      isSectionStart: chunk.isSectionStart,
      isRhythmPunchZone: isKineticTypoZone(i, total, drafts[i - 1]?.type),
    });
    drafts.push({ type, chunk });
  });
  return drafts;
}

/**
 * 논리블록들을 페이싱 분할 + 타입 결정 + 밸런싱(+broll/gallery 배치)해 본문 beats로 만든다
 * (hero/cta 제외 — planScenesFromBrief가 앞뒤를 붙인다).
 */
export function planScenesFromLogicBlocks(
  blocks: BriefLogicBlock[],
  assetRequests?: AssetRequest[],
): ScriptBeat[] {
  const drafts = assignBrollGallery(
    capKineticTypoShare(balanceInsightShare(draftScenesFromBlocks(blocks))),
  );
  const baseQuery = resolveBaseStockQuery(blocks.map((b) => b.speaker_text));
  return finalizeBeats(drafts, 0, undefined, { assetRequests, baseQuery });
}

/** 섹션 번호 부여 + index 재배열 + rhythm/transition/mood 최종화. */
function finalizeBeats(
  drafts: PlannedSceneDraft[],
  offset = 0,
  total?: number,
  media?: MediaPlanContext,
): ScriptBeat[] {
  const t = total ?? drafts.length + offset;
  let sectionNo = 0;
  return drafts.map((d, i) => {
    const beat = draftToBeat(d, i + offset, t, media);
    if (beat.scene_type === 'section') {
      sectionNo += 1;
      beat.number = String(sectionNo + 1).padStart(2, '0'); // 01은 인트로 몫
    }
    return beat;
  });
}

/**
 * VideoExecutionBrief → factory ScriptBeat[] 전체 계획.
 *   [0] hero(제목 + 인트로 첫 구간, duration은 캡션 글자수 기반 4~12 클램프)
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

  // hero — 인트로 첫 페이싱 구간만 사용(전문 20초 금지).
  const introSource =
    stripScriptArtifacts(brief.script?.intro_30s ?? '') || (ctx.core_message ?? '').trim();
  const heroChunk = paceSpeakerText(introSource)[0];
  const heroCaption = heroChunk?.text ?? (introSource || ctx.title);

  // 본문 drafts (블록별 분할 + 타입 결정, 사실상 동일한 블록은 스킵)
  const bodyDrafts = draftScenesFromBlocks(brief.script?.logic_blocks ?? []);

  // hero가 이미 커버한 원고 구간이 본문 첫 씬에서 "그대로" 반복되면 제거.
  // 정규화 후 완전 일치만 제거한다 — 부분 겹침(후킹 반복 패턴)은 의도로 보고 유지.
  if (
    bodyDrafts.length > 0 &&
    normalizeForDedupe(bodyDrafts[0].chunk.text) === normalizeForDedupe(heroCaption)
  ) {
    bodyDrafts.shift();
  }

  // 마지막 chunk가 행동 촉구면 cta로 승격(본문에서 분리).
  let ctaDraft: PlannedSceneDraft | null = null;
  const lastDraft = bodyDrafts[bodyDrafts.length - 1];
  if (lastDraft && countCtaSignals(lastDraft.chunk.text) > 0) {
    ctaDraft = { ...lastDraft, type: 'cta' };
    bodyDrafts.pop();
  }

  const balancedBody = assignBrollGallery(capKineticTypoShare(balanceInsightShare(bodyDrafts)));
  const assetRequests = brief.asset_requests;
  // 영상 전체 대표 스톡 주제(제목·핵심메시지·인트로·첫 블록에서 도출) — 스크린샷→스톡 폴백 및
  // gallery/broll 아이템 채움에 쓰는 base 검색어.
  const baseQuery = resolveBaseStockQuery([
    brief.title,
    ctx.core_message,
    introSource,
    ...(brief.script?.logic_blocks ?? []).map((b) => b.speaker_text),
  ]);
  const media: MediaPlanContext = { assetRequests, baseQuery };

  // bridge — pulling 콘텐츠는 cta 직전 section으로.
  const bridge = (ctx.bridge_to_key_content ?? '').trim();

  // cta — 마지막 chunk 승격분이 없으면 desired_reaction/core_message로 합성.
  const ctaCaption =
    ctaDraft?.chunk.text ??
    ((ctx.desired_reaction ?? '').trim() || (ctx.core_message ?? '').trim() || ctx.title);

  const total = 1 + balancedBody.length + (bridge ? 1 : 0) + 1;

  const beats: ScriptBeat[] = [];

  // [0] hero — duration은 캡션 글자수 기반(F2), subtitle은 캡션 중복 시 비움(F3).
  const heroHeadline = ctx.title.trim();
  const heroBackgroundMedia = decideBackgroundMedia('hero', heroCaption, assetRequests, baseQuery);
  beats.push({
    scene_id: 'scene_01',
    scene_type: 'hero',
    rhythm_role: 'hook',
    headline: heroHeadline,
    subtitle: dedupeBodyAgainstCaption(condenseHeadline(heroCaption), heroCaption),
    speaker_text: heroCaption,
    duration: estimateHeroSeconds(heroCaption),
    emphasis: extractEmphasis(heroHeadline, heroCaption),
    mood: pickMood('hero'),
    transition: pickTransition('hero', 0),
    ...(heroBackgroundMedia ? { background_media: heroBackgroundMedia } : {}),
  });

  // [1..n] 본문
  beats.push(...finalizeBeats(balancedBody, 1, total, media));

  // bridge section
  if (bridge) {
    const idx = beats.length;
    const bridgeBackgroundMedia = decideBackgroundMedia('section', bridge, assetRequests, baseQuery);
    beats.push({
      scene_id: `scene_${String(idx + 1).padStart(2, '0')}`,
      scene_type: 'section',
      rhythm_role: 'reset',
      headline: '다음 영상으로',
      title: '다음 영상으로',
      number: '99',
      body: dedupeBodyAgainstCaption(condenseHeadline(bridge), bridge),
      speaker_text: bridge,
      duration: estimateSceneSeconds(bridge),
      emphasis: extractEmphasis('다음 영상으로', bridge),
      mood: pickMood('section'),
      transition: 'fade_scale',
      ...(bridgeBackgroundMedia ? { background_media: bridgeBackgroundMedia } : {}),
    });
  }

  // [last] cta
  const ctaIdx = beats.length;
  const ctaHeadline = condenseHeadline(ctx.desired_reaction ?? ctx.core_message ?? ctx.title);
  const ctaImperative = ctaDraft
    ? ctaDraft.chunk.sentences.find((s) => countCtaSignals(s) > 0)
    : undefined;
  const ctaBackgroundMedia = decideBackgroundMedia('cta', ctaCaption, assetRequests, baseQuery);
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
    ...(ctaBackgroundMedia ? { background_media: ctaBackgroundMedia } : {}),
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

  const balanced = assignBrollGallery(capKineticTypoShare(balanceInsightShare(drafts)));
  const baseQuery = resolveBaseStockQuery(slides.map((s) => s.speaker_text));
  const media: MediaPlanContext = { baseQuery };

  const heroSlide = slides[0];
  const heroChunk = paceSpeakerText(heroSlide.speaker_text)[0];
  const heroCaption = heroChunk?.text ?? heroSlide.speaker_text;
  const needSyntheticCta = balanced[balanced.length - 1]?.type !== 'cta';
  const total = 1 + balanced.length + (needSyntheticCta ? 1 : 0);
  const heroBackgroundMedia = decideBackgroundMedia('hero', heroCaption, undefined, baseQuery);

  const beats: ScriptBeat[] = [
    {
      scene_id: 'scene_01',
      scene_type: 'hero',
      rhythm_role: 'hook',
      headline: heroSlide.headline,
      subtitle: dedupeBodyAgainstCaption(condenseHeadline(heroCaption), heroCaption),
      speaker_text: heroCaption,
      duration: estimateHeroSeconds(heroCaption),
      emphasis: extractEmphasis(heroSlide.headline, heroCaption),
      mood: pickMood('hero'),
      transition: pickTransition('hero', 0),
      ...(heroBackgroundMedia ? { background_media: heroBackgroundMedia } : {}),
    },
    ...finalizeBeats(balanced, 1, total, media),
  ];

  if (needSyntheticCta) {
    const lastSlide = slides[slides.length - 1];
    const idx = beats.length;
    const headline = condenseHeadline(lastSlide.headline);
    const ctaSpeakerText = stripScriptArtifacts(lastSlide.speaker_text) || headline;
    const ctaBackgroundMedia = decideBackgroundMedia('cta', ctaSpeakerText, undefined, baseQuery);
    beats.push({
      scene_id: `scene_${String(idx + 1).padStart(2, '0')}`,
      scene_type: 'cta',
      rhythm_role: 'cta',
      headline,
      action: '지금 확인해보세요',
      speaker_text: ctaSpeakerText,
      duration: SCENE_TARGET_MIN_SECONDS,
      emphasis: extractEmphasis(headline, lastSlide.speaker_text),
      mood: pickMood('cta'),
      transition: 'slide_up',
      ...(ctaBackgroundMedia ? { background_media: ctaBackgroundMedia } : {}),
    });
  }

  return beats;
}
