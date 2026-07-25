/**
 * canonical.ts — 정규화 직렬화 + 봉인 해시 (CONTRACTS §1)
 *
 * V14 봉인 해시(validate)와 T2 writeScoped 의 구역-밖 해시가 **같은 정규화**를 공유한다.
 * 두 벌 구현 금지 — 이 파일이 유일한 정규화 출처다.
 *
 * 정규화 규칙 (CONTRACTS §1 "정규화 규칙"):
 *  1. 객체 키를 정렬한다.
 *  2. 수치는 소수 3자리로 고정한다 (134.2 === 134.200).
 *  3. `undefined` 와 필드 부재를 동일 취급한다 (undefined 값 키는 방출하지 않는다).
 *  4. 배열은 순서를 보존한다.
 *
 * T2 writeScoped 인수인계: 구역-밖 정합 비교는 `shot_id`/`beat_id` 키 기준으로 대상 객체를
 * 골라낸 뒤(배열 위치 무관) 각 객체를 `canonicalJSON` 으로 직렬화해 비교하면 된다.
 * 재정렬만으로 오탐이 나지 않도록 배열이 아니라 키 기준으로 매칭할 것.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const DECIMALS = 3 // @unit CONTRACTS §1: 수치 소수 3자리 고정 (134.2 == 134.200)

function serialize(value: unknown): string {
  if (value === null) return 'null'
  const kind = typeof value
  if (kind === 'number') return (value as number).toFixed(DECIMALS)
  if (kind === 'boolean') return value ? 'true' : 'false'
  if (kind === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map((item) => serialize(item === undefined ? null : item)).join(',') + ']'
  }
  if (kind === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined) // undefined === 부재
      .sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + serialize(obj[key])).join(',') + '}'
  }
  return 'null' // undefined 는 최상위에서만 도달 — 부재로 취급
}

/** CONTRACTS §1 정규화 규칙으로 결정론적 문자열을 만든다. */
export function canonicalJSON(value: unknown): string {
  return serialize(value)
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 파일 바이트의 sha256 hex. sha256Hex 의 파일 버전 — 캐시 키·중복 검사·상태 해시가 공유. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 봉인 해시 — sha256(canonicalJSON(value)). V14 와 writeScoped 가 공유. */
export function sealHash(value: unknown): string {
  return sha256Hex(canonicalJSON(value))
}
