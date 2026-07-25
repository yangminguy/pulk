/**
 * verify-motion.ts — T8 완료 조건 자동 판정 (실렌더 포함)
 *
 * hyperframes 0.7.71(package.json 핀)로 실제 lint→check→render 체인을 돈다. 헤드리스 크롬을 띄우므로
 * 첫 실행이 느릴 수 있다(수 분). 타임아웃은 요청 JSON 의 timeout_sec 로 준다(harvest.timeout_sec 아님).
 *
 * 판정:
 *  1) 유효 모션 요청(b900) → 체인 자동 진행, 산출 mov 가 probe 통과 + 길이 duration±0.1초
 *  2) 의도적 파손(b901, 트랙 겹침) → failed[] 보고, fallback 없음(산출 mov 없음)
 *  3) 캐시 키에 frame_rev 포함 + frame_rev 증가 시 재렌더(cached=false) 발생
 *  4) rg 'hyperframes@latest' src/ → 0건
 *  5) 모션 총 길이가 ratios.motion 범위 검사(checkMotionRatio)
 *  6) 사진 parallax(sh9001) → 렌더 → duration±0.1, 캐시 키에 focal/zoom/frame_rev 포함
 *  7) 템플릿 폴백이 critical 비트에서 거부, 비critical 에서 허용
 *
 * 실행:  npx tsx scripts/verify-motion.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadProfile } from '../src/lib/profile.js'
import { sha256Hex } from '../src/lib/canonical.js'
import {
  runBridge,
  renderRequest,
  loadRequest,
  motionCacheKey,
  photoCacheKey,
  templateFallbackGuard,
  checkMotionRatio,
  type BridgeOptions,
  type MotionRequest,
  type PhotoRequest,
} from '../src/motion/bridge.js'

const ROOT = resolve(import.meta.dirname, '..')
const FIX = resolve(ROOT, 'fixtures', 'motion')
const REQ = resolve(FIX, 'requests')
const SRC = resolve(ROOT, 'src')
const OUT = mkdtempSync(join(tmpdir(), 'motion-verify-'))

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/** cache.ts 와 동일 규칙으로 캐시 파일 경로를 만들어 해당 키만 지운다(다른 캐시 불가침). */
function clearCacheKey(key: string): void {
  const p = join(ROOT, '.cache', `${sha256Hex(key)}.json`)
  if (existsSync(p)) rmSync(p)
}

const profile = loadProfile('config')
const opts: BridgeOptions = {
  compositionsDir: resolve(FIX, 'compositions'),
  outDir: OUT,
  profile,
}

async function main(): Promise<void> {
  const b900File = resolve(REQ, 'b900.json')
  const b900 = loadRequest(b900File) as MotionRequest
  const sh9001File = resolve(REQ, 'sh9001.json')

  // 시작 전 테스트 키 초기화(fr1/fr2 · photo).
  clearCacheKey(motionCacheKey(b900))
  clearCacheKey(motionCacheKey({ ...b900, frame_rev: b900.frame_rev + 1 }))

  /* ── 1. 유효 모션: 체인 자동 진행 + probe + 길이 ── */
  const t0 = Date.now()
  const r1 = await runBridge([b900File], opts)
  const renderSec = (Date.now() - t0) / 1000
  const out1 = r1.outputs[0]
  const durOk = out1 !== undefined && Math.abs(out1.duration - b900.duration) <= 0.1
  record(
    '1.valid-motion:chain+probe',
    r1.report.failed.length === 0 && out1 !== undefined && existsSync(out1.file) && durOk && out1.cached === false,
    `failed=${r1.report.failed.length} out=${out1 ? `${out1.file.split('/').pop()} dur=${out1.duration}s cached=${out1.cached}` : '없음'} render=${renderSec.toFixed(1)}s`,
  )

  /* ── 2. 의도적 파손: failed[] · fallback 없음 ── */
  const b901File = resolve(REQ, 'b901.json')
  const r2 = await runBridge([b901File], opts)
  const noOutput = r2.outputs.length === 0 && !existsSync(resolve(OUT, 'b901.mov'))
  const reasonHasLint = r2.report.failed.some((f) => /lint|overlap|겹침/.test(f.reason))
  record(
    '2.broken:failed-no-fallback',
    r2.report.failed.length === 1 && noOutput && reasonHasLint,
    `failed=${r2.report.failed.length} reason="${r2.report.failed[0]?.reason ?? ''}" 산출없음=${noOutput}`,
  )

  /* ── 3. frame_rev 캐시: 키 포함 + 증가 시 재렌더 ── */
  const keyFr1 = motionCacheKey(b900)
  const keyFr2 = motionCacheKey({ ...b900, frame_rev: b900.frame_rev + 1 })
  const keyDiffers = keyFr1 !== keyFr2
  // 동일 fr1 재실행 → 캐시 히트(재렌더 없음)
  const r3a = await renderRequest(b900, opts, b900File)
  // fr2 → 캐시 미스 → 재렌더
  clearCacheKey(keyFr2)
  const r3b = await renderRequest({ ...b900, frame_rev: b900.frame_rev + 1 }, opts, b900File)
  record(
    '3.frame_rev:key+rerender',
    keyDiffers && r3a.output?.cached === true && r3b.output?.cached === false,
    `key(fr1!=fr2)=${keyDiffers} fr1재실행cached=${r3a.output?.cached} fr2cached=${r3b.output?.cached}(=재렌더)`,
  )

  /* ── 4. hyperframes@latest 0건 (src/) ── */
  const offenders: string[] = []
  const scan = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e)
      if (statSync(full).isDirectory()) scan(full)
      else if (full.endsWith('.ts') && readFileSync(full, 'utf8').includes('hyperframes@latest')) offenders.push(full)
    }
  }
  scan(SRC)
  record('4.no-latest-tag', offenders.length === 0, `hyperframes@latest 포함 파일 ${offenders.length}건: ${offenders.map((f) => f.slice(ROOT.length + 1)).join(', ') || '없음'}`)

  /* ── 5. 모션 총 길이 비중 검사 ── */
  const [lo, hi] = profile.ratios.motion
  const inRange = checkMotionRatio(lo * 900, 900, profile.ratios.motion) // 하한 지향 예: 하한*15분
  const overRange = checkMotionRatio((hi + 0.1) * 900, 900, profile.ratios.motion)
  record(
    '5.motion-ratio',
    inRange.ok === true && overRange.ok === false,
    `범위[${lo},${hi}] 하한샘플ratio=${inRange.ratio.toFixed(3)}(ok=${inRange.ok}) 초과샘플ratio=${overRange.ratio.toFixed(3)}(ok=${overRange.ok})`,
  )

  /* ── 6. 사진 parallax: 렌더 + 캐시 키(focal/zoom/frame_rev) ── */
  const photoReq = loadRequest(sh9001File) as PhotoRequest
  const stillHash = 'FIXED' // 키 성분(focal/zoom/frame_rev) 포함 여부만 확인 — 파일 해시는 상수로 고정
  const kBase = photoCacheKey(photoReq, stillHash)
  const kFocal = photoCacheKey({ ...photoReq, focal: [0.1, 0.1] }, stillHash)
  const kZoom = photoCacheKey({ ...photoReq, zoom: [1.0, 1.5] }, stillHash)
  const kFrame = photoCacheKey({ ...photoReq, frame_rev: photoReq.frame_rev + 1 }, stillHash)
  const photoKeyOk = kBase !== kFocal && kBase !== kZoom && kBase !== kFrame
  const r6 = await runBridge([sh9001File], opts)
  const pout = r6.outputs[0]
  const pdurOk = pout !== undefined && Math.abs(pout.duration - photoReq.duration) <= 0.1
  record(
    '6.photo-parallax:render+key',
    r6.report.failed.length === 0 && pout !== undefined && existsSync(pout.file) && pdurOk && photoKeyOk,
    `failed=${r6.report.failed.length} out=${pout ? `${pout.file.split('/').pop()} dur=${pout.duration}s` : '없음'} 키(focal/zoom/frame_rev 반영)=${photoKeyOk}`,
  )

  /* ── 7. 템플릿 폴백: critical 거부 / 비critical 허용 ── */
  const gCrit = templateFallbackGuard('critical')
  const gNormal = templateFallbackGuard('normal')
  const b902File = resolve(REQ, 'b902-template-critical.json')
  const r7 = await runBridge([b902File], opts)
  const rejectedInPipeline = r7.report.failed.length === 1 && r7.outputs.length === 0 && /템플릿|critical/.test(r7.report.failed[0]?.reason ?? '')
  record(
    '7.template-fallback-guard',
    gCrit.allowed === false && gNormal.allowed === true && rejectedInPipeline,
    `guard(critical)=${gCrit.allowed} guard(normal)=${gNormal.allowed} 파이프라인거부=${rejectedInPipeline} reason="${r7.report.failed[0]?.reason ?? ''}"`,
  )

  /* ── 마감 ── */
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, out_dir: OUT, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length} · 산출 ${OUT}\n`)
  if (!allPass) process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(`verify-motion 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
