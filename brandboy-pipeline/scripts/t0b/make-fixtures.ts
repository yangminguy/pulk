/**
 * T0b — 더미 픽스처 생성기
 *
 * fixtures/t0b/fixture-spec.json(compact) 을 읽어 하네스가 실제 수치를 산출하도록
 * fixtures/t0b/{transcripts,intents,expected-verdicts}.json 을 결정론적으로 확장 생성한다.
 * 90분급 1편을 흉내내기 위해 세그먼트 수백 개를 만든다. 랜덤 없음(재현 가능).
 *
 * 모든 수치(세그먼트 길이·개수·심는 위치)는 fixture-spec.json 데이터에서만 온다. 코드에 리터럴 없음.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  resolveFromRoot,
  isDirectRun,
  type Transcript,
  type TranscriptSegment,
  type SearchIntent,
} from './index-prototype.js'

interface SourceSpec {
  source_id: string
  segment_count: number
}

interface PlantSpec {
  intent_id: string
  importance: string
  intent: string
  source_id: string
  at_index: number
  text: string
}

interface FixtureSpec {
  seg_duration_sec: number
  sources: SourceSpec[]
  filler: string[]
  plants: PlantSpec[]
}

/** 정답 구간 — 심은 세그먼트의 시간 범위. verify 가 후보 판정 주입에 쓴다. */
export interface TruthWindow {
  intent_id: string
  source_id: string
  start: number
  end: number
}

export interface ExpectedVerdicts {
  truth: TruthWindow[]
}

export interface FixtureBundle {
  transcripts: Transcript[]
  intents: SearchIntent[]
  expected: ExpectedVerdicts
}

const SPEC_PATH = 'fixtures/t0b/fixture-spec.json'
const TRANSCRIPTS_PATH = 'fixtures/t0b/transcripts.json'
const INTENTS_PATH = 'fixtures/t0b/intents.json'
const EXPECTED_PATH = 'fixtures/t0b/expected-verdicts.json'
const JSON_INDENT = '  '

function pick<T>(arr: T[], index: number): T {
  const value = arr[index % arr.length]
  if (value === undefined) throw new Error('빈 배열에서 pick')
  return value
}

/** fixture-spec.json → 완전한 픽스처 번들 (인메모리). */
export function buildFixtures(spec: FixtureSpec): FixtureBundle {
  const dur = spec.seg_duration_sec

  // 소스별 심은 문장 위치 → 문장 텍스트
  const plantedText = new Map<string, string>()
  for (const plant of spec.plants) {
    plantedText.set(`${plant.source_id}#${plant.at_index}`, plant.text)
  }

  const transcripts: Transcript[] = spec.sources.map((src) => {
    const segments: TranscriptSegment[] = []
    for (let i = 0; i < src.segment_count; i++) {
      const start = i * dur
      const planted = plantedText.get(`${src.source_id}#${i}`)
      segments.push({
        start,
        end: start + dur,
        text: planted ?? pick(spec.filler, i),
      })
    }
    return { source_id: src.source_id, segments }
  })

  const intents: SearchIntent[] = spec.plants.map((p) => ({
    intent_id: p.intent_id,
    intent: p.intent,
    importance: p.importance,
  }))

  const truth: TruthWindow[] = spec.plants.map((p) => {
    const start = p.at_index * dur
    return { intent_id: p.intent_id, source_id: p.source_id, start, end: start + dur }
  })

  return { transcripts, intents, expected: { truth } }
}

export function loadSpec(): FixtureSpec {
  return JSON.parse(readFileSync(resolveFromRoot(SPEC_PATH), 'utf8')) as FixtureSpec
}

function writeJson(relPath: string, obj: unknown): void {
  writeFileSync(resolveFromRoot(relPath), JSON.stringify(obj, null, JSON_INDENT), 'utf8')
}

/** 픽스처를 디스크에 materialize 하고 인메모리 번들도 반환한다. */
export function materializeFixtures(): FixtureBundle {
  const bundle = buildFixtures(loadSpec())
  writeJson(TRANSCRIPTS_PATH, bundle.transcripts)
  writeJson(INTENTS_PATH, bundle.intents)
  writeJson(EXPECTED_PATH, bundle.expected)
  return bundle
}

function main(): void {
  const bundle = materializeFixtures()
  const totalSegments = bundle.transcripts.reduce((sum, t) => sum + t.segments.length, 0)
  process.stderr.write(
    `fixtures: 소스 ${bundle.transcripts.length}편 · 세그먼트 ${totalSegments}개 · 의도 ${bundle.intents.length}건\n`,
  )
  console.log(
    JSON.stringify({
      sources: bundle.transcripts.length,
      segments: totalSegments,
      intents: bundle.intents.length,
      truth: bundle.expected.truth.length,
    }),
  )
}

if (isDirectRun(/make-fixtures\.(ts|js)$/)) {
  main()
}
