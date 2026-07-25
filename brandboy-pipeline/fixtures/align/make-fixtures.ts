/**
 * make-fixtures.ts — align 픽스처 결정론적 생성 (실녹음 대체)
 *
 * say -v Yuna 로 한국어 문장을 합성하고 ffmpeg 로 세션 WAV 3개를 만든다.
 * - 세션 시작 전 5초 룸톤(녹음 SOP) — 낮은 레벨 핑크노이즈
 * - 문장 사이에 긴 침묵(트림 대상) / 짧은 침묵(병합 대상)을 섞어 빈 공백 정리를 검증 가능하게
 * - 세션 3은 마이크 거리 차이를 volume·noise 차이로 시뮬레이션 → 세션 접합 경고 유발
 * - 반복 문장(같은 텍스트 2회)을 넣어 "둘 다 생존" 검증
 * - 숫자(1988년) 를 넣어 숫자↔한글 변환 검증
 *
 * script.md · script-map.json 도 같은 데이터에서 함께 생성한다(단일 출처).
 * fixtures 는 tsconfig include/verify 스캔 밖이라 리터럴 자유. macOS 에 timeout 없음.
 *
 * 실행:  npx tsx fixtures/align/make-fixtures.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const PROJ = resolve(ROOT, 'fixtures', 'align-project')
const RAW = join(PROJ, 'audio', 'raw')
const TMP = join(PROJ, '.tmp-say')
const SR = 22050
const OUT_SR = 16000

interface Sentence {
  sentence_key: string
  sentence_id: string
  segment_id: string
  text: string
  session: string
  gap_before: number // 직전 문장/룸톤과의 침묵 길이(초)
}

// 룸톤 5초는 각 세션 첫 문장의 gap_before 로 표현한다.
const ROOM = 5.0
const SENTENCES: Sentence[] = [
  { sentence_key: 's0000001', sentence_id: 'sn001', segment_id: 'g01', text: '브랜드보이가 새로운 광고를 공개했습니다', session: 'session-01', gap_before: ROOM },
  { sentence_key: 's0000002', sentence_id: 'sn002', segment_id: 'g01', text: '매출이 크게 늘었습니다', session: 'session-01', gap_before: 1.5 },
  { sentence_key: 's0000003', sentence_id: 'sn003', segment_id: 'g01', text: '매출이 크게 늘었습니다', session: 'session-01', gap_before: 0.2 },
  { sentence_key: 's0000004', sentence_id: 'sn004', segment_id: 'g02', text: '그 광고는 1988년에 처음 나왔습니다', session: 'session-02', gap_before: ROOM },
  { sentence_key: 's0000005', sentence_id: 'sn005', segment_id: 'g02', text: '많은 사람들이 아직도 그것을 기억합니다', session: 'session-02', gap_before: 1.5 },
  { sentence_key: 's0000006', sentence_id: 'sn006', segment_id: 'g03', text: '결국 그 브랜드는 크게 성장했습니다', session: 'session-03', gap_before: ROOM },
  { sentence_key: 's0000007', sentence_id: 'sn007', segment_id: 'g03', text: '그것이 우리가 배운 교훈입니다', session: 'session-03', gap_before: 0.2 },
]

const SEGMENTS = [
  { segment_id: 'g01', act: 'hook' },
  { segment_id: 'g02', act: 'build' },
  { segment_id: 'g03', act: 'reveal' },
]

// 세션별 마이크 시뮬레이션: speechVol(발화만 적용) · roomtone amplitude · seed
// 룸톤(노이즈 플로어)은 세션 간 균일 → 접합부 seam 이 매끄럽다(±100ms RMS < 6dB).
// 마이크 거리 차이는 발화 레벨 차이(LUFS 편차)로 시뮬레이션 → 세션 경고 유발.
const SESSION_PARAMS: Record<string, { speechVol: number; noise: number; seed: number }> = {
  'session-01': { speechVol: 1.0, noise: 0.006, seed: 11 },
  'session-02': { speechVol: 1.0, noise: 0.006, seed: 22 },
  'session-03': { speechVol: 0.55, noise: 0.006, seed: 33 }, // 더 먼 마이크 = 발화만 작게
}

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function sayClip(text: string, out: string): void {
  execFileSync('say', ['-v', 'Yuna', text, '-o', out], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function buildSession(sessionId: string): void {
  const items = SENTENCES.filter((s) => s.session === sessionId)
  const p = SESSION_PARAMS[sessionId]!
  const inputs: string[] = []
  const filters: string[] = []
  const labels: string[] = []
  let idx = 0

  const addSilence = (dur: number, isRoom: boolean): void => {
    if (isRoom) {
      inputs.push('-f', 'lavfi', '-t', String(dur), '-i', `anoisesrc=color=pink:amplitude=${p.noise}:r=${SR}:seed=${p.seed}`)
    } else {
      inputs.push('-f', 'lavfi', '-t', String(dur), '-i', `anullsrc=r=${SR}:cl=mono`)
    }
    filters.push(`[${idx}:a]aresample=${SR},aformat=sample_fmts=s16:channel_layouts=mono[a${idx}]`)
    labels.push(`[a${idx}]`)
    idx++
  }

  for (let i = 0; i < items.length; i++) {
    const s = items[i]!
    addSilence(s.gap_before, i === 0) // 첫 문장 앞은 룸톤, 이후는 순수 침묵
    const clip = join(TMP, `${s.sentence_key}.aiff`)
    sayClip(s.text, clip)
    inputs.push('-i', clip)
    // 발화 클립에만 볼륨 적용(룸톤/침묵은 그대로) → 노이즈 플로어 균일 유지
    filters.push(`[${idx}:a]aresample=${SR},aformat=sample_fmts=s16:channel_layouts=mono,volume=${p.speechVol}[a${idx}]`)
    labels.push(`[a${idx}]`)
    idx++
  }
  // 말미 침묵 0.4초
  addSilence(0.4, false)

  const concat = `${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`
  const graph = [...filters, concat].join(';')
  const out = join(RAW, `${sessionId}.wav`)
  ff([...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', String(OUT_SR), '-ac', '1', '-c:a', 'pcm_s16le', out])
  process.stderr.write(`  ${sessionId}.wav 생성\n`)
}

function main(): void {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
  mkdirSync(RAW, { recursive: true })
  mkdirSync(TMP, { recursive: true })

  // script.md
  const md = ['# 원고\n', ...SENTENCES.map((s) => s.text)].join('\n') + '\n'
  writeFileSync(join(PROJ, 'script.md'), md)

  // script-map.json
  const sessions = ['session-01', 'session-02', 'session-03'].map((id) => {
    const items = SENTENCES.filter((s) => s.session === id)
    return {
      id,
      wav_path: `audio/raw/${id}.wav`,
      from_sentence_key: items[0]!.sentence_key,
      to_sentence_key: items[items.length - 1]!.sentence_key,
    }
  })
  const scriptMap = {
    segments: SEGMENTS,
    sentences: SENTENCES.map((s) => ({
      sentence_key: s.sentence_key,
      sentence_id: s.sentence_id,
      segment_id: s.segment_id,
      text: s.text,
    })),
    sessions,
  }
  writeFileSync(join(PROJ, 'script-map.json'), JSON.stringify(scriptMap, null, 2) + '\n')

  // config 복사(dry-run 이 profile 복사 부작용을 내지 않도록 사전 배치)
  copyFileSync(join(ROOT, 'config', 'edit-profile.json'), join(PROJ, 'edit-profile.json'))
  copyFileSync(join(ROOT, 'config', 'frame.md'), join(PROJ, 'frame.md'))

  for (const id of ['session-01', 'session-02', 'session-03']) buildSession(id)

  rmSync(TMP, { recursive: true, force: true })
  process.stderr.write('align 픽스처 생성 완료\n')
}

main()
