/**
 * io.ts — 원자적 쓰기 + writeScoped 소유권 가드 (CONTRACTS §1)
 *
 * 필드마다 작성자는 하나고 모든 작성자는 CLI 를 지난다. writeScoped 가 그 계약의 실체다.
 * 구역별 필드 목록은 CONTRACTS §1 표를 여기 ZONE_FIELDS 상수 하나로 옮긴다.
 * 여러 파일에 흩어지면 반드시 어긋난다.
 *
 * 정규화·봉인은 canonical.ts 가 유일 출처다(V14 와 공유). 재구현 금지.
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { canonicalJSON, sealHash } from './canonical.js'

const JSON_INDENT = 2 // @unit JSON 들여쓰기 폭 (표시 형식, 편집 수치 아님)
const ABSENT = '(부재)'

/* ─────────────── 구역 소유권 표 (CONTRACTS §1) ─────────────── */

/**
 * 각 구역이 소유(=쓸 수 있는)하는 필드. 구역-밖 필드가 mutator 실행으로 변하면 abort.
 * 비교는 shot_id/beat_id/segment_id 키 기준(배열 위치 무관) → plan 재정렬 오탐 없음.
 *
 * 해석 노트(CONTRACTS 표와의 대응):
 *  - Z1 은 segments·beats 를 전체 소유(ownsSegments/ownsBeats) + shots 의 계획 필드.
 *    asset_kind·emphasis_caption 은 Z1(생성)·Z2(확정) 둘 다 소유 → 양쪽 shot 목록에 있다.
 *  - Z1 만 need 샷 생성/삭제 허용(allowShotAddRemove). Z2·Z3 은 기존 샷만 갱신.
 *  - beats[].{start,end,timing_rev} 는 Z3(시각)이 소유. 나머지 beat 필드는 Z3 에서 가드.
 *  - Z0 메타(revision·writers·profile_rev·frame_rev)는 어느 구역 shadow 에도 넣지 않는다.
 *    writeScoped 가 직접 갱신하는 필드이므로 가드 대상이 아니다.
 */
export interface ZoneSpec {
  ownsSegments: boolean
  ownsBeats: boolean
  ownsCoverageGap: boolean
  segment: string[] // ownsSegments=false 일 때 사용하는 소유 필드(없음)
  beat: string[] // ownsBeats=false 일 때 사용하는 소유 필드
  shot: string[]
  allowShotAddRemove: boolean
  writer: 'plan_rev' | 'review_rev' | 'reanchor_rev'
}

export type Zone = 'Z1' | 'Z2' | 'Z3'

export const ZONE_FIELDS: Record<Zone, ZoneSpec> = {
  Z1: {
    ownsSegments: true,
    ownsBeats: true,
    ownsCoverageGap: true,
    segment: [],
    beat: [],
    shot: ['shot_id', 'beat_ids', 'purpose', 'framing', 'asset_kind', 'emphasis_caption'],
    allowShotAddRemove: true,
    writer: 'plan_rev',
  },
  Z2: {
    ownsSegments: false,
    ownsBeats: false,
    ownsCoverageGap: false,
    segment: [],
    beat: [],
    shot: [
      'selection_status', 'source_id', 'source_in', 'source_out', 'file', 'rights_status',
      'locked_selection', 'asset_kind', 'source_audio', 'source_audio_in', 'source_audio_out',
      'photo_motion', 'emphasis_caption',
    ],
    allowShotAddRemove: false,
    writer: 'review_rev',
  },
  Z3: {
    ownsSegments: false,
    ownsBeats: false,
    ownsCoverageGap: false,
    segment: [],
    beat: ['start', 'end', 'timing_rev'],
    shot: ['start', 'end', 'timing_rev', 'needs_review', 'orphaned'],
    allowShotAddRemove: false,
    writer: 'reanchor_rev',
  },
}

/* ─────────────── 문서 타입 ─────────────── */

export interface MutableDoc {
  revision: number
  writers: { plan_rev: number; review_rev: number; reanchor_rev: number; seal: string }
  segments: Array<Record<string, unknown>>
  beats: Array<Record<string, unknown>>
  shots: Array<Record<string, unknown>>
  coverage_gap?: unknown[]
  [key: string]: unknown
}

export interface ScopedDiff {
  path: string
  before: string
  after: string
}

/** 구역 밖 필드가 mutator 로 변경됨 — 파일 무변경, CLI exit 1. */
export class ScopedWriteError extends Error {
  constructor(public readonly zone: Zone, public readonly file: string, public readonly diffs: ScopedDiff[]) {
    super(`${zone} writeScoped 위반 — 구역 밖 필드 ${diffs.length}개 변경: ${file}`)
    this.name = 'ScopedWriteError'
  }
}

/* ─────────────── 원자적 쓰기 ─────────────── */

/** <path>.tmp 에 쓰고 rename. 중간에 죽어도 기존 파일이 남는다. */
export function writeAtomic(path: string, data: unknown): void {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, JSON_INDENT) + '\n'
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

/** JSON 파일을 읽어 파싱한다. 없거나 파싱 실패면 null(선택 입력 로더 공용). */
export function readJsonOrNull<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

/* ─────────────── shadow(구역-밖 투영) ─────────────── */

function projection(entity: Record<string, unknown>, idField: string, owned: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(entity)) {
    if (key === idField) continue // 키는 매칭에 쓰므로 값 투영에서 제외
    if (owned.includes(key)) continue // 구역 소유 필드는 가드 안 함
    if (entity[key] === undefined) continue // undefined === 부재
    out[key] = entity[key]
  }
  return out
}

function mapEntities(arr: Array<Record<string, unknown>>, idField: string, owned: string[]): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {}
  for (const e of arr) map[String(e[idField])] = projection(e, idField, owned)
  return map
}

/** 구역 Z 기준으로 "가드해야 하는 구역-밖 내용"만 뽑아낸 구조. mutation 과 분리하려 deep clone. */
function buildShadow(doc: MutableDoc, zone: Zone): Record<string, unknown> {
  const spec = ZONE_FIELDS[zone]
  const shadow: Record<string, unknown> = { project: doc['project'] }
  if (!spec.ownsCoverageGap) shadow['coverage_gap'] = doc.coverage_gap ?? []
  if (!spec.ownsSegments) shadow['segments'] = mapEntities(doc.segments ?? [], 'segment_id', spec.segment)
  if (!spec.ownsBeats) shadow['beats'] = mapEntities(doc.beats ?? [], 'beat_id', spec.beat)
  shadow['shots'] = mapEntities(doc.shots ?? [], 'shot_id', spec.shot)
  return structuredClone(shadow)
}

function fmt(value: unknown): string {
  return value === undefined ? ABSENT : canonicalJSON(value)
}

function compareValue(path: string, before: unknown, after: unknown, diffs: ScopedDiff[]): void {
  if (canonicalJSON(before) !== canonicalJSON(after)) diffs.push({ path, before: fmt(before), after: fmt(after) })
}

function diffEntityMap(
  kind: string,
  before: Record<string, Record<string, unknown>>,
  after: Record<string, Record<string, unknown>>,
  allowAddRemove: boolean,
  diffs: ScopedDiff[],
): void {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const id of ids) {
    const b = before[id]
    const a = after[id]
    if (b === undefined || a === undefined) {
      if (allowAddRemove) continue // 구역이 생성/삭제 허용(Z1 need 샷) → 오탐 아님
      diffs.push({ path: `${kind}.${id}`, before: b === undefined ? ABSENT : '(존재)', after: a === undefined ? ABSENT : '(존재)' })
      continue
    }
    const fields = new Set([...Object.keys(b), ...Object.keys(a)])
    for (const f of fields) compareValue(`${kind}.${id}.${f}`, b[f], a[f], diffs)
  }
}

function diffShadows(before: Record<string, unknown>, after: Record<string, unknown>, zone: Zone): ScopedDiff[] {
  const spec = ZONE_FIELDS[zone]
  const diffs: ScopedDiff[] = []
  compareValue('project', before['project'], after['project'], diffs)
  if (!spec.ownsCoverageGap) compareValue('coverage_gap', before['coverage_gap'], after['coverage_gap'], diffs)
  const asMap = (v: unknown): Record<string, Record<string, unknown>> => v as Record<string, Record<string, unknown>>
  if (!spec.ownsSegments) diffEntityMap('segments', asMap(before['segments']), asMap(after['segments']), false, diffs)
  if (!spec.ownsBeats) diffEntityMap('beats', asMap(before['beats']), asMap(after['beats']), false, diffs)
  diffEntityMap('shots', asMap(before['shots']), asMap(after['shots']), spec.allowShotAddRemove, diffs)
  return diffs
}

/* ─────────────── writeScoped ─────────────── */

function reseal(doc: MutableDoc): void {
  const clone = structuredClone(doc) as MutableDoc
  delete (clone.writers as { seal?: string }).seal
  doc.writers.seal = sealHash(clone)
}

/**
 * writeScoped(file, zone, mutator) — CONTRACTS §1 절차 그대로:
 *  1. 읽기 → 구역-밖 shadow 계산
 *  2. mutator 실행
 *  3. shadow 재계산
 *  4. 다르면 abort(파일 무변경 + ScopedWriteError(diff))
 *  5. 같으면 Z0 갱신(자기 writer rev +1, revision +1) + writers.seal 재봉인 + writeAtomic
 */
export function writeScoped(file: string, zone: Zone, mutator: (doc: MutableDoc) => void): void {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as MutableDoc
  const before = buildShadow(doc, zone)
  mutator(doc)
  const after = buildShadow(doc, zone)
  const diffs = diffShadows(before, after, zone)
  if (diffs.length > 0) throw new ScopedWriteError(zone, file, diffs)

  const spec = ZONE_FIELDS[zone]
  doc.writers[spec.writer] = doc.writers[spec.writer] + 1
  doc.revision = doc.revision + 1
  reseal(doc)
  writeAtomic(file, doc)
}
