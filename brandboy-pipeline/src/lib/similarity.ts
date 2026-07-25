/**
 * similarity.ts — 정규화 · 편집거리 유사도 · 숫자↔한글 변환 · 원고 표기 교정
 *
 * T3 align 의 알고리즘 코어. M1(ai-slide-video-factory/src/lib/captions.ts) 이식:
 *  - normalizeForMatch(:191) · editDistance(:196-214) · isSimilar(:215-225)
 *  - alignWordsToScript(:235-278) → Word 를 { text, start, end }(초)로 변환하며 이식
 *    (원본은 밀리초 필드. brandboy 스키마는 초 단위이므로 밀리초 잔재를 남기지 않는다.)
 *
 * 숫자↔한글 변환(이 파일의 절반)은 신규 작성이다. 원고의 "1988년"이 전사에서
 * "천구백팔십팔년"으로 나오므로 양쪽을 다 읽기로 펼쳐 더 유사한 쪽으로 매칭한다.
 *
 * 이 파일에 편집 수치는 없다. 매칭 휴리스틱 상수만 있고 전부 // @unit 로 표시한다.
 * similarity_threshold·window_ratio 등 *편집* 수치는 match.ts 가 profile 로 받는다.
 */

/* ─────────────── 정규화 ─────────────── */

/**
 * 매칭용 정규화: 공백·구두점·기호 전량 제거 + 소문자.
 * 한국어 ASR 은 띄어쓰기를 자주 틀리는데 이건 내용 오류가 아니다(spec/02 §3).
 * 숫자·한글은 보존한다(숫자 변환은 아래에서 별도 처리).
 */
export function normalize(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
}

/** M1 이식(:191) — 상위 호환 별칭. emphasis 매칭 등에서 쓰던 이름 유지. */
export function normalizeForMatch(s: string): string {
  return normalize(s)
}

/* ─────────────── 편집거리 · 유사도 ─────────────── */

/** M1 이식(:196-214) — Levenshtein 편집거리(두 줄 DP). */
export function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[n]!
}

const EDIT_TOL_CAP = 3 // @unit isSimilar 편집거리 허용 상한 (M1 이식 휴리스틱)
const EDIT_TOL_DIVISOR = 3 // @unit isSimilar 길이비례 허용 분모 (M1 이식)
const MIN_SUBSTR_LEN = 2 // @unit isSimilar 부분포함 최소 길이 (M1 이식)
const SUBSTR_RATIO = 0.5 // @unit isSimilar 부분포함 최소 비율 (M1 이식)

/** M1 이식(:215-225) — whisper 오인식 흡수용 근사 일치(잇/있, 신교/신규 등). */
export function isSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const maxLen = Math.max(a.length, b.length)
  const tol = maxLen <= 1 ? 0 : Math.min(EDIT_TOL_CAP, Math.ceil(maxLen / EDIT_TOL_DIVISOR))
  if (editDistance(a, b) <= tol) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= MIN_SUBSTR_LEN && long.includes(short) && short.length / long.length >= SUBSTR_RATIO
}

/** spec/02 §4: similarity = 1 - levenshtein(a,b) / max(len a, len b). 0~1. */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - editDistance(a, b) / maxLen
}

/* ─────────────── 숫자 → 한글 읽기 ─────────────── */

const SINO_DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const SINO_SMALL_UNIT = ['', '십', '백', '천'] // 10^0..10^3 (그룹 내 자리)
const SINO_BIG_UNIT = ['', '만', '억', '조'] // 10^4 단위
const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉']
const NATIVE_ONES_ATTR = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉']
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']
const NATIVE_TENS_ATTR = ['', '열', '스무', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔']
const BIG_GROUP = 10000 // @unit 만 단위(4자리) 그룹 크기
const NATIVE_MAX = 99 // @unit 고유어 수사 상한(아흔아홉)
const SPECIAL_MONTH: Record<number, string> = { 6: '유월', 10: '시월' } // @unit 월 특례(유월·시월) 키

/** 4자리 이하 그룹(0~9999)을 한자어로. 계수 1은 십/백/천 앞에서 생략. */
function sinoGroup(n: number): string {
  let out = ''
  const digits = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10] // @unit 십진 자릿수 분해(천·백·십·일)
  for (let i = 0; i < digits.length; i++) {
    const d = digits[i]!
    if (d === 0) continue
    const unitPos = digits.length - 1 - i // 3,2,1,0 → 천,백,십,일
    if (d === 1 && unitPos > 0) out += SINO_SMALL_UNIT[unitPos]!
    else out += SINO_DIGIT[d]! + SINO_SMALL_UNIT[unitPos]!
  }
  return out
}

/** 한자어 기수 읽기. 0 → 영. 큰 수는 만·억·조 그룹. */
export function sinoKoreanReading(n: number): string {
  if (n === 0) return SINO_DIGIT[0]!
  const groups: number[] = []
  let rest = n
  while (rest > 0) {
    groups.push(rest % BIG_GROUP)
    rest = Math.floor(rest / BIG_GROUP)
  }
  let out = ''
  for (let g = groups.length - 1; g >= 0; g--) {
    const val = groups[g]!
    if (val === 0) continue
    // 만/억/조 앞 계수 1 도 생략(만원 = "만원", "일만원" 아님)
    const body = val === 1 && g > 0 ? '' : sinoGroup(val)
    out += body + SINO_BIG_UNIT[g]!
  }
  return out
}

/** 고유어 기수 읽기(1~99). attributive=true 면 관형형(한/두/세/스무). */
export function nativeKoreanReading(n: number, attributive: boolean): string {
  if (n <= 0 || n > NATIVE_MAX) return ''
  const tens = Math.floor(n / 10) // @unit 십의 자리
  const ones = n % 10 // @unit 일의 자리
  const tensArr = attributive ? NATIVE_TENS_ATTR : NATIVE_TENS
  const onesArr = attributive ? NATIVE_ONES_ATTR : NATIVE_ONES
  // 관형형은 일의 자리에만 적용(스물세 → 스물+세). 십의 자리 스물→스무는 일의자리 0 일 때만.
  if (ones === 0) return tensArr[tens]!
  const tensPart = tens === 0 ? '' : NATIVE_TENS[tens]! // 스물셋의 십의자리는 비관형
  return tensPart + onesArr[ones]!
}

// 한자어로 읽는 접미사(년·월·일·원·번지·호 등)
const SINO_SUFFIX = new Set(['년', '월', '일', '원', '호', '번지', '퍼센트', '프로', '도', '점'])
// 고유어(관형형)로 읽는 접미사(개·명·장·살·마리·시·번·권·잔 등)
const NATIVE_SUFFIX = new Set(['개', '명', '장', '살', '마리', '시', '번', '권', '잔', '가지', '대', '켤레', '송이'])

/**
 * 한 숫자 토큰(digits + 선택적 접미사)을 가능한 한글 읽기들로 펼친다.
 * 접미사가 힌트를 주면 우선하되, 어느 읽기로 발화됐는지 모르므로 sino·native 를 다 낸다.
 */
function numberTokenReadings(digits: string, suffix: string): string[] {
  const n = Number(digits)
  const out = new Set<string>()
  if (!Number.isFinite(n)) return [digits + suffix]

  // 월 특례(유월·시월)
  if (suffix === '월' && SPECIAL_MONTH[n]) out.add(SPECIAL_MONTH[n]! )
  // 퍼센트/프로: 접미사 통일 변형
  const suffixVariants = suffix === '퍼센트' || suffix === '프로' ? ['퍼센트', '프로'] : [suffix]

  const sino = sinoKoreanReading(n)
  const nativeCount = nativeKoreanReading(n, false)
  const nativeAttr = nativeKoreanReading(n, true)

  for (const sfx of suffixVariants) {
    const preferSino = SINO_SUFFIX.has(sfx)
    const preferNative = NATIVE_SUFFIX.has(sfx)
    if (preferSino || !preferNative) out.add(sino + sfx)
    if (preferNative || !preferSino) {
      if (nativeAttr) out.add(nativeAttr + sfx)
      if (nativeCount) out.add(nativeCount + sfx)
    }
    // 원 숫자 표기도 후보(전사가 숫자로 나오는 드문 경우)
    out.add(digits + sfx)
  }
  return [...out]
}

/**
 * 문자열 안의 숫자런(+접미사)을 한글 읽기로 치환한 대체 문자열들을 만든다.
 * 소수(3.5→삼점오)·퍼센트·단위를 포함. 결과는 원본 포함, 상한으로 폭발 방지.
 */
const VARIANT_CAP = 8 // @unit 숫자 변형 조합 상한(폭발 방지)
const NUM_TOKEN_RE = /(\d+(?:\.\d+)?)(년|월|일|원|개|명|장|살|마리|시|번|권|잔|가지|대|퍼센트|프로|도|호|%)?/gu

export function expandNumberVariants(s: string): string[] {
  const matches = [...s.matchAll(NUM_TOKEN_RE)]
  if (matches.length === 0) return [s]

  let variants: string[] = [s]
  for (const m of matches) {
    const whole = m[0]
    const numRaw = m[1]!
    let suffix = m[2] ?? ''
    if (suffix === '%') suffix = '퍼센트'

    let readings: string[]
    if (numRaw.includes('.')) {
      // 소수: 정수부·소수부 각 자리를 한자어로, 점 삽입
      const [intPart, fracPart] = numRaw.split('.')
      const intR = sinoKoreanReading(Number(intPart))
      const fracR = [...fracPart!].map((d) => SINO_DIGIT[Number(d)]!).join('')
      readings = [intR + '점' + fracR + suffix, whole]
    } else {
      readings = numberTokenReadings(numRaw, suffix)
    }

    const next: string[] = []
    for (const base of variants) {
      for (const r of readings) {
        next.push(base.replace(whole, r))
        if (next.length >= VARIANT_CAP) break
      }
      if (next.length >= VARIANT_CAP) break
    }
    variants = [...new Set(next)]
  }
  return [...new Set([s, ...variants])]
}

/**
 * 숫자 인식 유사도: 양쪽을 정규화 후 숫자 변형으로 펼쳐 교차 비교하고 최대값.
 * 원고 "1988년" ↔ 전사 "천구백팔십팔년" 을 이 함수가 흡수한다.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  const va = expandNumberVariants(na).map(normalize)
  const vb = expandNumberVariants(nb).map(normalize)
  let best = 0
  for (const x of va) {
    for (const y of vb) {
      const s = levenshteinSimilarity(x, y)
      if (s > best) best = s
      if (best === 1) return 1
    }
  }
  return best
}

/* ─────────────── 원고 표기 교정 (M1 alignWordsToScript 이식) ─────────────── */

export interface TimedWord {
  text: string
  start: number
  end: number
}

export interface ScriptWindow {
  startSec: number
  endSec: number
  text: string
}

const WINDOW_TOL_SEC = 0.001 // @unit 창 경계 포함 허용오차(원본의 ±1ms)
const LOOKAHEAD_TOKENS = 5 // @unit 원고 토큰 룩어헤드(M1 이식: 삽입/누락 재동기화)
const MAX_JOIN_TOKENS = 3 // @unit 원고 토큰 1~3개 연결(M1 이식: 붙여쓰기 흡수)

/**
 * M1 이식(:235-278) — whisper 단어의 표시 텍스트를 원고 표기로 교정한다.
 * 타이밍(start/end)은 whisper 것을 그대로 두고 텍스트만 원고 표기로 교체.
 * 창별로 커서를 리셋해 오차 누적 차단. 매칭 실패 단어는 whisper 표기 유지(안전 폴백).
 */
export function alignWordsToScript(words: TimedWord[], windows: ScriptWindow[]): TimedWord[] {
  const out = words.map((w) => ({ ...w }))
  for (const win of windows) {
    const tokens = win.text.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const normTokens = tokens.map((t) => normalize(t))

    let cursor = 0
    for (const w of out) {
      if (w.start < win.startSec - WINDOW_TOL_SEC || w.start >= win.endSec + WINDOW_TOL_SEC) continue
      const nw = normalize(w.text)
      if (!nw) continue

      let matched = false
      for (let j = cursor; j < Math.min(cursor + LOOKAHEAD_TOKENS, tokens.length) && !matched; j++) {
        let bestK = 0
        let bestDiff = Infinity
        for (let k = 1; k <= MAX_JOIN_TOKENS && j + k <= tokens.length; k++) {
          const c = normTokens.slice(j, j + k).join('')
          const diff = Math.abs(c.length - nw.length)
          if (isSimilar(nw, c) && diff < bestDiff) {
            bestK = k
            bestDiff = diff
          }
        }
        if (bestK > 0) {
          w.text = tokens.slice(j, j + bestK).join(' ')
          cursor = j + bestK
          matched = true
        }
      }
    }
  }
  return out
}
