// narration-retake-edit.ts — 나레이션 녹음의 "리테이크 자동 편집" 두뇌(순수·결정론).
//
// 문제: 사장님이 녹음 중 절면(말 더듬으면) 같은 문장을 다시 읽는다. 이 "실패 테이크 →
// 재발화" 구간을 골라 나쁜 테이크를 잘라내는 편집이 지금은 전부 수동이다
// (deliverables/bandit-.../edit_main_audio.py의 EDL을 사람이 파형 보며 손으로 찍음).
//
// 이 모듈은 [단어별 타임스탬프 전사 + 승인 원고]를 받아 EDL 초안(살릴 구간/버릴 구간/사람이
// 확인할 지점)을 자동 생성한다. 부작용 없음 — whisper 실행·ffmpeg 컷은 바깥 스크립트가 주입한다.
//
// 100% 자동이 아니다(Whisper 전사는 재발화를 늘 두 번으로 잡아주지 않는다 —
// fix_main_transcript.py 사례). 그래서 애매한 판정은 컷하지 않고 flags로 올려 사람이 검토한다.

// ── 입력 타입 (Whisper word-level 전사와 동형) ────────────────────────────────
export interface TranscriptWord {
  /** 전사 단어(원문, 선행 공백 포함 가능 — 정규화해서 비교). */
  word: string;
  start: number;
  end: number;
  /** Whisper 신뢰도(0~1). 없으면 1로 간주. 낮으면 웅얼거림/오인식 신호. */
  probability?: number;
}

export interface NarrationSource {
  /** 소스 식별자. 첫 번째가 메인(spine). 예: 'full', 'revised'. */
  source: string;
  words: TranscriptWord[];
}

/**
 * 오디오 분석(ffmpeg silencedetect)으로 찾은 "발화 아닌 무음/멈칫" 구간(절대 초).
 * 늘어진 단어(whisper가 앞뒤 침묵을 단어에 붙인 것) 내부의 침묵을 잘라내는 데 쓴다.
 * 순수 로직은 오디오를 만지지 않으므로 이 구간을 외부 스크립트가 주입한다.
 */
export interface SilenceSpan {
  source: string;
  start: number;
  end: number;
}

// ── 출력 타입 (EDL 초안) ─────────────────────────────────────────────────────
export type CutReason = 'retake_discarded' | 'false_start' | 'silence' | 'filler';

export interface EditClip {
  source: string;
  start: number;
  end: number;
  /** 이 구간이 커버하는 원고 어절 인덱스 범위 [from, to] (inclusive). 미상이면 null. */
  script_span: [number, number] | null;
  confidence: number;
  reason: 'kept';
}

export interface EditCut {
  source: string;
  start: number;
  end: number;
  reason: CutReason;
  /** 사람이 이해할 근거 문구(한국어). */
  note: string;
}

export interface EditFlag {
  source: string;
  at: number;
  issue: string;
}

export interface EditPlan {
  clips: EditClip[];
  cuts: EditCut[];
  flags: EditFlag[];
  kept_seconds: number;
  cut_seconds: number;
}

export interface BuildEditPlanOptions {
  /** 이 값을 넘는 무음(인접 단어 gap, 초)은 침묵 컷. 기본 0.6s. */
  silence_gap_sec?: number;
  /** 원고 포인터가 이만큼(어절) 이상 뒤로 점프하면 되감기(재발화) 후보로 본다. 기본 2.
   *  (실제 확정은 alignToScript 2-pass의 연속 매칭(REWIND_MIN_RUN)이 담당하므로 문턱은 낮게 둔다.) */
  rewind_min_tokens?: number;
  /** 한 단어가 이보다 오래 지속되면 절음(웅얼거림) 신호로 flag. 기본 2.0s. */
  long_word_sec?: number;
  /** 필러/저신뢰 컷 임계 probability. 이 미만 + 원고 미매칭이면 필러 후보. 기본 0.6. */
  filler_prob?: number;
}

const DEFAULTS: Required<BuildEditPlanOptions> = {
  silence_gap_sec: 0.6,
  rewind_min_tokens: 2,
  long_word_sec: 2.0,
  filler_prob: 0.6,
};

// ── 정규화 ───────────────────────────────────────────────────────────────────
/** NFKC·소문자·문자/숫자 외 제거(inspect-source.mjs normalized() 규칙과 동일 계열). */
export function normalizeToken(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** 승인 원고를 정규화 어절 배열로. 헤더(#...)·빈 어절 제거. */
export function tokenizeScript(script: string): string[] {
  return String(script ?? '')
    .replace(/^#.*$/gm, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
}

// ── 정렬 결과 (내부) ─────────────────────────────────────────────────────────
interface AlignedWord {
  word: TranscriptWord;
  norm: string;
  /** 매칭된 원고 어절 인덱스. 미매칭(-1). */
  scriptIndex: number;
  /** 이 단어에서 원고 포인터가 크게 역행했다(=재발화 시작 경계). */
  rewind: boolean;
}

/** forward window 폭(어절). expected부터 이 범위 안의 매칭을 정상 진행으로 본다. */
const FWD_WINDOW = 10;
/** 되감기(재발화)로 인정하려면 과거 구간에서 최소 이만큼 단어가 연속 매칭돼야 한다. */
const REWIND_MIN_RUN = 3;

/**
 * 전사 단어열을 원고 어절열에 정렬한다.
 *
 * 순진한 "expected에 가장 가까운 후보" 방식은 원고 전역에 흔한 어절("그","이","것")에서
 * 엉뚱한 먼 위치로 매칭돼 span이 거대해진다(실측: 343s 과잉 컷). 대신:
 *   1. expected부터 좁은 forward window 안의 매칭을 우선(정상 진행).
 *   2. window 밖이면 가까운 과거(되감기 후보) 또는 먼 미래(전사 누락 후 점프)로.
 *   3. 되감기는 이후 단어가 REWIND_MIN_RUN 이상 연속 매칭될 때만 재발화로 확정.
 *      고립된 과거 매칭은 흔한 어절의 오매칭이므로 미매칭(-1)으로 강등한다.
 */
export function alignToScript(
  words: TranscriptWord[],
  scriptTokens: string[],
  rewindMin: number,
): AlignedWord[] {
  const positions = new Map<string, number[]>();
  scriptTokens.forEach((tok, i) => {
    const arr = positions.get(tok);
    if (arr) arr.push(i);
    else positions.set(tok, [i]);
  });

  const norms = words.map((w) => normalizeToken(w.word));
  const idx = new Array<number>(words.length).fill(-1);
  let expected = 0;

  // 1-pass: window 우선 그리디 매칭.
  for (let k = 0; k < words.length; k++) {
    const norm = norms[k];
    if (!norm) continue;
    const cands = positions.get(norm);
    if (!cands || cands.length === 0) continue;

    const fwd = cands.filter((c) => c >= expected && c <= expected + FWD_WINDOW);
    if (fwd.length) {
      const c = Math.min(...fwd);
      idx[k] = c;
      expected = c + 1;
      continue;
    }
    const back = cands.filter((c) => c < expected);
    const farFwd = cands.filter((c) => c > expected + FWD_WINDOW);
    if (back.length) {
      const c = Math.max(...back); // 가장 가까운 과거
      idx[k] = c;
      expected = c + 1;
    } else if (farFwd.length) {
      const c = Math.min(...farFwd); // 전사 누락 후 앞으로 점프
      idx[k] = c;
      expected = c + 1;
    }
    // 그 외: 미매칭(-1), expected 유지.
  }

  // 2-pass: 되감기 확정 / 고립 오매칭 강등.
  const matchedK: number[] = [];
  for (let k = 0; k < idx.length; k++) if (idx[k] >= 0) matchedK.push(k);
  const rewind = new Array<boolean>(words.length).fill(false);

  for (let m = 1; m < matchedK.length; m++) {
    const k = matchedK[m];
    const prevIdx = idx[matchedK[m - 1]];
    if (idx[k] > prevIdx - rewindMin) continue; // 되감기 아님
    // 되감기 후보: 이후 단조 진행 run 길이 측정.
    let runLen = 1;
    let prev = idx[k];
    for (let n = m + 1; n < matchedK.length; n++) {
      const cur = idx[matchedK[n]];
      if (cur >= prev - 1 && cur <= prev + FWD_WINDOW) {
        runLen++;
        prev = cur;
      } else break;
    }
    if (runLen >= REWIND_MIN_RUN) {
      rewind[k] = true; // 진짜 재발화
    } else {
      idx[k] = -1; // 고립 오매칭 강등
    }
  }

  return words.map((w, k) => ({ word: w, norm: norms[k], scriptIndex: idx[k], rewind: rewind[k] }));
}

// ── run(연속 발화 구간) 분할 ─────────────────────────────────────────────────
interface Run {
  source: string;
  words: AlignedWord[];
  start: number;
  end: number;
  scriptStart: number; // 매칭된 최소 원고 인덱스(robust, 없으면 -1)
  scriptEnd: number; // 매칭된 최대 원고 인덱스(robust, 없으면 -1)
  matched: number; // 원고 매칭 단어 수
  avgProb: number;
  isRetake: boolean; // 첫 단어가 되감기(rewind) — 앞 구간을 다시 말한 재발화 테이크
}

/** 재발화로 자동 컷할 수 있는 최대 길이(초). 이보다 길면 오탐 위험 → 컷 대신 flag. */
const MAX_RETAKE_CUT_SEC = 20;

/**
 * 매칭된 원고 인덱스들의 "가장 큰 연속 덩어리"(gap ≤ 3) 범위를 반환한다.
 * 단순 min/max는 잔존 오매칭 하나가 span을 통째로 왜곡하므로 robust range를 쓴다.
 */
function robustSpan(indices: number[]): [number, number] {
  if (indices.length === 0) return [-1, -1];
  const s = [...indices].sort((a, b) => a - b);
  let bestS = s[0];
  let bestE = s[0];
  let curS = s[0];
  let curE = s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i] - curE <= 3) {
      curE = s[i];
    } else {
      if (curE - curS > bestE - bestS) [bestS, bestE] = [curS, curE];
      curS = s[i];
      curE = s[i];
    }
  }
  if (curE - curS > bestE - bestS) [bestS, bestE] = [curS, curE];
  return [bestS, bestE];
}

function summarizeRun(source: string, words: AlignedWord[]): Run {
  const matchedIdx = words.filter((w) => w.scriptIndex >= 0).map((w) => w.scriptIndex);
  const probs = words.map((w) => w.word.probability ?? 1);
  const [scriptStart, scriptEnd] = robustSpan(matchedIdx);
  return {
    source,
    words,
    start: words[0].word.start,
    end: words[words.length - 1].word.end,
    scriptStart,
    scriptEnd,
    matched: matchedIdx.length,
    avgProb: probs.reduce((a, b) => a + b, 0) / Math.max(1, probs.length),
    isRetake: words[0]?.rewind ?? false,
  };
}

/**
 * 정렬된 단어열을 run으로 자른다. 새 run 경계:
 *   - 재발화(rewind) 시작, 또는
 *   - 긴 무음(gap > silenceGap) 뒤 원고 인덱스가 이어지지 않을 때.
 */
export function splitRuns(
  aligned: AlignedWord[],
  source: string,
  silenceGap: number,
): Run[] {
  const runs: Run[] = [];
  let cur: AlignedWord[] = [];
  for (let i = 0; i < aligned.length; i++) {
    const w = aligned[i];
    if (cur.length > 0) {
      const prev = cur[cur.length - 1];
      const gap = w.word.start - prev.word.end;
      const contiguous = w.scriptIndex >= 0 && prev.scriptIndex >= 0 && w.scriptIndex - prev.scriptIndex <= 2;
      const boundary = w.rewind || (gap > silenceGap && !contiguous);
      if (boundary) {
        runs.push(summarizeRun(source, cur));
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length > 0) runs.push(summarizeRun(source, cur));
  return runs;
}

// ── 테이크 선택 ──────────────────────────────────────────────────────────────
/** run이 커버하는 원고 span [start,end]가 겹치는지. */
function spansOverlap(a: Run, b: Run): boolean {
  if (a.scriptStart < 0 || b.scriptStart < 0) return false;
  return a.scriptStart <= b.scriptEnd && b.scriptStart <= a.scriptEnd;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
/**
 * 원고 + 전사 소스(들)로 EDL 초안을 만든다.
 * 첫 소스가 메인 spine. 겹치는 원고 span을 커버하는 run들 중 최고점 테이크만 남기고 나머지는 컷.
 */
export function buildEditPlan(
  input: {
    approvedScript: string;
    sources: NarrationSource[];
    /** 오디오 분석으로 찾은 발화 속 무음/멈칫 구간. 늘어진 단어 정리에 쓴다. */
    silences?: SilenceSpan[];
    options?: BuildEditPlanOptions;
  },
): EditPlan {
  const opts = { ...DEFAULTS, ...(input.options ?? {}) };
  const scriptTokens = tokenizeScript(input.approvedScript);
  const silences = input.silences ?? [];

  const clips: EditClip[] = [];
  const cuts: EditCut[] = [];
  const flags: EditFlag[] = [];

  // 소스별 run 생성 후, 전 소스의 run을 원고 span 기준으로 경쟁시킨다.
  const allRuns: Run[] = [];
  for (const src of input.sources) {
    if (!src.words || src.words.length === 0) continue;
    const aligned = alignToScript(src.words, scriptTokens, opts.rewind_min_tokens);

    // 필러/저신뢰(원고 미매칭 + 낮은 prob) 연속 구간 → 컷 + flag.
    collectFillerCuts(aligned, src.source, opts, cuts, flags);

    // 긴 단어(절음 웅얼거림). 오디오 무음 분석이 주입되면 그쪽이 자동 처리하므로 flag 생략.
    if (silences.length === 0) {
      for (const a of aligned) {
        if (a.word.end - a.word.start >= opts.long_word_sec) {
          flags.push({
            source: src.source,
            at: a.word.start,
            issue: `단어 "${a.word.word.trim()}"가 ${(a.word.end - a.word.start).toFixed(1)}s로 비정상적으로 깁니다(절음 가능). 확인 필요.`,
          });
        }
      }
    }

    allRuns.push(...splitRuns(aligned, src.source, opts.silence_gap_sec));
  }

  // 인접 rewind 경계에서만 재발화 컷(전역 그룹핑 아님) → 과잉 컷 방지.
  const kept = selectTakes(allRuns, cuts, flags);

  // 채택 run들 → 시간순 clips + 내부 긴 침묵 컷.
  kept.sort((a, b) => (a.source === b.source ? a.start - b.start : a.source < b.source ? -1 : 1));
  for (const run of kept) {
    splitRunByGaps(run, silences, opts.silence_gap_sec, clips, cuts);
    if (run.scriptStart >= 0) {
      const spanLen = run.scriptEnd - run.scriptStart + 1;
      const coverage = run.matched / spanLen;
      if (coverage < 0.6) {
        flags.push({
          source: run.source,
          at: run.start,
          issue: `${run.start.toFixed(1)}s 구간이 원고와 ${Math.round(coverage * 100)}%만 일치합니다. 잘못 남겼는지 확인 필요.`,
        });
      }
    }
  }

  const kept_seconds = round3(clips.reduce((s, c) => s + (c.end - c.start), 0));
  const cut_seconds = round3(cuts.reduce((s, c) => s + (c.end - c.start), 0));
  clips.sort((a, b) => (a.source === b.source ? a.start - b.start : a.source < b.source ? -1 : 1));
  cuts.sort((a, b) => (a.source === b.source ? a.start - b.start : a.source < b.source ? -1 : 1));
  flags.sort((a, b) => (a.source === b.source ? a.at - b.at : a.source < b.source ? -1 : 1));
  return { clips, cuts, flags, kept_seconds, cut_seconds };
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 원고에 없고 신뢰도 낮은 연속 단어("음","어","다시 할게요" 등) → 필러 컷 + flag. */
function collectFillerCuts(
  aligned: AlignedWord[],
  source: string,
  opts: Required<BuildEditPlanOptions>,
  cuts: EditCut[],
  flags: EditFlag[],
): void {
  let i = 0;
  while (i < aligned.length) {
    const a = aligned[i];
    const isFiller = a.scriptIndex < 0 && (a.word.probability ?? 1) < opts.filler_prob && a.norm.length > 0;
    if (!isFiller) {
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < aligned.length &&
      aligned[j + 1].scriptIndex < 0 &&
      (aligned[j + 1].word.probability ?? 1) < opts.filler_prob
    ) {
      j++;
    }
    const start = aligned[i].word.start;
    const end = aligned[j].word.end;
    const text = aligned
      .slice(i, j + 1)
      .map((x) => x.word.word.trim())
      .join(' ');
    cuts.push({ source, start, end, reason: 'filler', note: `원고에 없는 삽입/필러: "${text}"` });
    flags.push({ source, at: start, issue: `필러 컷 후보 "${text}" — 실제로 불필요한지 확인 필요.` });
    i = j + 1;
  }
}

/**
 * 재발화를 컷한다. 재발화는 전역이 아니라 **시간상 인접한 rewind 경계**에서만 일어난다:
 * 화자가 한 구간을 말하다 절고 → 바로 같은 구간을 다시 말한다. 따라서 isRetake run과
 * 그 직전 run(같은 원고 span을 커버)만 경쟁시키고, 낮은 점수 쪽을 컷한다.
 *
 * 안전장치: 컷 대상이 MAX_RETAKE_CUT_SEC보다 길면 정렬 오탐일 가능성이 크므로 컷하지 않고
 * flag로 올린다(사람 검토). 이것이 "97초를 통째로 중복 처리"하던 오탐을 막는다.
 */
export function selectTakes(runs: Run[], cuts: EditCut[], flags: EditFlag[]): Run[] {
  const sorted = [...runs].sort((a, b) =>
    a.source === b.source ? a.start - b.start : a.source < b.source ? -1 : 1,
  );
  const kept: Run[] = [];

  for (const run of sorted) {
    const prev = kept[kept.length - 1];
    const competes =
      prev &&
      prev.source === run.source &&
      run.isRetake &&
      prev.scriptStart >= 0 &&
      run.scriptStart >= 0 &&
      spansOverlap(prev, run);

    if (!competes) {
      kept.push(run);
      continue;
    }

    // 재발화 구조: prev(앞 테이크) … rewind … run(다시 읽은 뒤 테이크).
    // 사장님 워크플로우상 "절면 다시 읽는다" → 뒤 테이크(run)가 최종본이다.
    // prev에서 run이 다시 커버하는 부분(원고 rS 이상)만 컷하고, 그 앞의 정상 발화는 살린다.
    const rS = run.scriptStart;
    const k = prev.words.findIndex((w) => w.scriptIndex >= rS);
    const keepPart = k > 0 ? prev.words.slice(0, k) : null;
    const cutStart = keepPart ? prev.words[k].word.start : prev.start;
    const cutEnd = prev.end;
    const cutLen = cutEnd - cutStart;

    if (cutLen > MAX_RETAKE_CUT_SEC) {
      flags.push({
        source: prev.source,
        at: cutStart,
        issue: `${cutStart.toFixed(1)}s 재발화 의심(${cutLen.toFixed(1)}s)이지만 너무 길어 자동 컷하지 않음. 확인 필요.`,
      });
      kept.push(run);
      continue;
    }

    // 컷 대상 span 길이로 false_start(짧은 미완 시작) / retake_discarded 구분.
    const cutWords = keepPart ? prev.words.slice(k) : prev.words;
    const cutMatched = cutWords.filter((w) => w.scriptIndex >= 0).map((w) => w.scriptIndex);
    const spanLen = cutMatched.length ? Math.max(...cutMatched) - Math.min(...cutMatched) + 1 : 0;
    const reason: CutReason = !keepPart && spanLen <= 4 ? 'false_start' : 'retake_discarded';
    cuts.push({
      source: prev.source,
      start: cutStart,
      end: cutEnd,
      reason,
      note:
        reason === 'false_start'
          ? `실패한 시작 — 뒤의 깨끗한 테이크로 대체.`
          : `중복 발화 — 다시 읽은 테이크로 대체.`,
    });
    // prev를 살릴 앞부분만으로 교체(있으면), run을 채택.
    kept.pop();
    if (keepPart) kept.push(summarizeRun(prev.source, keepPart));
    kept.push(run);
  }
  return kept;
}

/**
 * 채택 run을 무음 경계로 잘라 clip(살릴 발화)과 silence cut으로 나눈다.
 * 무음 경계는 두 종류:
 *   1. 단어 사이 gap > silenceGap (문장 사이 침묵)
 *   2. 주입된 silences(오디오 분석) — 늘어진 단어 내부의 멈칫/침묵
 * 둘을 합쳐 겹치면 병합한 뒤, 무음 아닌 구간만 clip으로 남긴다.
 */
function splitRunByGaps(
  run: Run,
  silences: SilenceSpan[],
  silenceGap: number,
  clips: EditClip[],
  cuts: EditCut[],
): void {
  const runStart = run.words[0].word.start;
  const runEnd = run.words[run.words.length - 1].word.end;

  type Sil = { start: number; end: number; note: string };
  const sils: Sil[] = [];
  for (let i = 1; i < run.words.length; i++) {
    const gap = run.words[i].word.start - run.words[i - 1].word.end;
    if (gap > silenceGap) {
      sils.push({ start: run.words[i - 1].word.end, end: run.words[i].word.start, note: `${round3(gap)}s 무음 제거.` });
    }
  }
  for (const s of silences) {
    if (s.source !== run.source) continue;
    const start = Math.max(s.start, runStart);
    const end = Math.min(s.end, runEnd);
    if (end - start > 0.05) sils.push({ start, end, note: '늘어진 발화 속 멈칫/침묵 제거.' });
  }
  sils.sort((a, b) => a.start - b.start);

  // 겹치는 무음 병합('멈칫' 라벨 우선 보존).
  const merged: Sil[] = [];
  for (const s of sils) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (s.note.includes('멈칫')) last.note = s.note;
    } else merged.push({ ...s });
  }

  let cursor = runStart;
  for (const s of merged) {
    if (s.start > cursor + 0.02) clips.push(makeClip(run, cursor, s.start));
    cuts.push({ source: run.source, start: round3(s.start), end: round3(s.end), reason: 'silence', note: s.note });
    cursor = Math.max(cursor, s.end);
  }
  if (runEnd > cursor + 0.02) clips.push(makeClip(run, cursor, runEnd));
}

function makeClip(run: Run, start: number, end: number): EditClip {
  const spanLen = run.scriptStart >= 0 ? run.scriptEnd - run.scriptStart + 1 : 0;
  const coverage = spanLen > 0 ? Math.min(1, run.matched / spanLen) : run.avgProb;
  return {
    source: run.source,
    start: round3(start),
    end: round3(end),
    script_span: run.scriptStart >= 0 ? [run.scriptStart, run.scriptEnd] : null,
    confidence: round3(0.5 * coverage + 0.5 * run.avgProb),
    reason: 'kept',
  };
}
