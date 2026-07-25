/**
 * make-qc-fixtures.ts — qc 검증용 위반 레이아웃 (T6). T5 fixtures/assemble/make-fixtures 를 재사용한다.
 *
 * 정상 조립 입력(mainLayout)을 복제해 치명 12종 중 **자동 판정 가능한** 위반을 하나씩 심는다.
 * writeFixture/buildMedia 는 assemble 픽스처 조성기를 그대로 쓴다(네트워크 0).
 */
import { mainLayout, type FixtureLayout } from '../assemble/make-fixtures.js'

/** 치명5(V8): 승인된 외부 샷의 권리 상태가 unknown → P0. */
export function rightsUnknownLayout(): FixtureLayout {
  const base = mainLayout()
  const shots = base.shots.map((s) => (s.shot_id === 'sh0001' ? { ...s, rights_status: 'unknown' } : s))
  return { ...base, shots }
}

/** 치명10(V11): 승인 상태로 남은 계획되지 않은 fallback_text → P0. */
export function fallbackApprovedLayout(): FixtureLayout {
  const base = mainLayout()
  const shots = base.shots.map((s) => (s.shot_id === 'sh0002' ? { ...s, asset_kind: 'fallback_text' } : s))
  return { ...base, shots }
}
