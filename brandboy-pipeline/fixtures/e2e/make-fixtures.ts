/**
 * make-fixtures.ts — 골든패스 e2e 픽스처 조성 (네트워크 0, 단일 완전체 프로젝트)
 *
 * fixtures/assemble/make-fixtures.ts 인프라를 그대로 재사용한다(더미 미디어·catalog·timeline·captions).
 * assemble 픽스처와의 단 하나의 차이: caption_card 샷 sh0018 을 selection_status:"need" 로 낮춰
 * 7단계 체인이 관통하는 진짜 need→approved 전이를 만든다. 나머지 샷은 approved·sourced 완전체다.
 *
 * 봉인: writeFixture 는 seal:"x" 스텁을 쓴다 → 여기서 sealHash 로 유효 V14 봉인을 재계산한다.
 * 그래야 validate(1단계)가 exit 0 로 통과한다(외부 쓰기 판정에 걸리지 않음).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildMedia, writeFixture, mainLayout, type FixtureLayout } from '../assemble/make-fixtures.js'
import { sealHash } from '../../src/lib/canonical.js'

const ROOT = resolve(import.meta.dirname, '..', '..')
const CFG = resolve(ROOT, 'config')
const MEDIA = resolve(ROOT, 'fixtures', 'e2e', '.media')

/** e2e 레이아웃 — mainLayout 에서 caption_card 샷만 need 로. (approved caption_card 는 V14b 위반) */
export function e2eLayout(): FixtureLayout {
  const base = mainLayout()
  return {
    ...base,
    shots: base.shots.map((s) => (s.shot_id === 'sh0018' ? { ...s, selection_status: 'need' } : s)),
  }
}

/** shot-plan.json 의 seal 을 유효값으로 재계산한다(createInitial/V14 와 동일 정규화). */
function reseal(projectDir: string): void {
  const planPath = resolve(projectDir, 'shot-plan.json')
  const doc = JSON.parse(readFileSync(planPath, 'utf8')) as { writers: { seal: string } }
  const clone = structuredClone(doc) as { writers: { seal?: string } }
  delete clone.writers.seal
  doc.writers.seal = sealHash(clone)
  writeFileSync(planPath, JSON.stringify(doc, null, 2))
}

/** 봉인 유효 완전체 프로젝트 생성(네트워크 0). validate→plan→harvest→review→assemble→qc 단일 픽스처. */
export function makeE2eProject(projectDir: string): void {
  const media = buildMedia(MEDIA)
  writeFixture(projectDir, e2eLayout(), { configDir: CFG, media })
  reseal(projectDir)
}
