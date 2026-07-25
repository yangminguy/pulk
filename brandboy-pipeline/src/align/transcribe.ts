/**
 * transcribe.ts — faster-whisper 단어 타임스탬프 (M3 이식)
 *
 * M3(ai-slide-video-factory/scripts/generate-narration.ts:71-90) transcribe() 호출부만 이식.
 * TTS·measureSceneDurations 는 버린다(사람 녹음으로 전환).
 * 필수 변경: word_timestamps=True 추가 → segment.words[] 가 생기므로 파서를 신규 작성한다.
 *
 * 실행은 proc.run(배열 인자·타임아웃·stderr 보존)을 지난다. /usr/bin/python3 사용(preflight P1).
 */
import { run } from '../lib/proc.js'
import type { TimedWord } from '../lib/similarity.js'

const PYTHON_BIN = '/usr/bin/python3' // preflight: faster_whisper 는 /usr/bin/python3 에만 있다
const DEFAULT_MODEL = 'medium' // preflight P1 검증 모델(캐시됨). 문자열 상수(수치 아님)
const LANG = 'ko'
const WHISPER_TIMEOUT_SEC = 900 // @unit whisper CPU int8 여유 타임아웃(처리 정책, 편집 수치 아님)
const DECIMALS = 3 // @unit 타임스탬프 소수 3자리(canonical 과 동일)
const ERR_TAIL = 500 // @unit stderr 로그 절단 길이
const OUT_HEAD = 300 // @unit stdout 로그 절단 길이

// faster-whisper 단어 시각 추출. word_timestamps=True 로 segment.words[] 를 받는다.
const PY_SCRIPT = [
  'import sys, json',
  'from faster_whisper import WhisperModel',
  'm = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")',
  'segs, info = m.transcribe(sys.argv[2], language=sys.argv[3], word_timestamps=True)',
  'words = []',
  'for s in segs:',
  '    for w in (s.words or []):',
  '        words.append({"text": w.word.strip(), "start": float(w.start), "end": float(w.end)})',
  'sys.stdout.write(json.dumps(words, ensure_ascii=False))',
].join('\n')

function round3(n: number): number {
  return Number(n.toFixed(DECIMALS))
}

export interface TranscribeOptions {
  model?: string
}

/** 세션 WAV → whisper 단어 배열(초 단위, 표기는 whisper 원문). 실패 시 예외. */
export async function transcribeWords(wavPath: string, opts: TranscribeOptions = {}): Promise<TimedWord[]> {
  const model = opts.model ?? DEFAULT_MODEL
  const r = await run(PYTHON_BIN, ['-c', PY_SCRIPT, model, wavPath, LANG], { timeoutSec: WHISPER_TIMEOUT_SEC })
  if (r.timedOut) throw new Error(`whisper 타임아웃(${WHISPER_TIMEOUT_SEC}s): ${wavPath}`)
  if (r.code !== 0 || !r.stdout.trim()) {
    throw new Error(`whisper 전사 실패(code=${r.code}): ${wavPath}\n${r.stderr.slice(-ERR_TAIL)}`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(r.stdout)
  } catch {
    throw new Error(`whisper 출력 파싱 실패: ${wavPath}\n${r.stdout.slice(0, OUT_HEAD)}`)
  }
  if (!Array.isArray(raw)) throw new Error(`whisper 출력이 배열이 아님: ${wavPath}`)
  const words: TimedWord[] = []
  for (const w of raw as Record<string, unknown>[]) {
    const text = String(w['text'] ?? '').trim()
    const start = Number(w['start'])
    const end = Number(w['end'])
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue
    if (!(end > start)) continue
    words.push({ text, start: round3(start), end: round3(end) })
  }
  return words
}
