/**
 * verify-resolve.ts — 경로 R(Resolve OTIO 이미터) 완료 조건 자동 판정. **네트워크 0**(ffmpeg 더미 미디어).
 *
 * fixtures/assemble/make-fixtures.ts 로 조립 입력을 만들고 assemble 을 세 갈래로 돌린다:
 *  1) --emit all     → capcut/numbered/resolve 3종 산출 상태 + resolve ok
 *  2) --emit resolve → resolve 단독(capcut/numbered 미생성)
 *  3) --emit bogus   → 알 수 없는 타깃, CLI exit 2
 * 그다음 공식 opentimelineio(파이썬)로 .otio 를 파싱해 스키마 유효·트랙/클립 수·총길이·미디어 실존·
 * 마커 수를 render_report(TimelineModel)와 대조한다. otio 미설치면 pip --user 로 설치(있으면 skip).
 *
 * 실행:  npx tsx scripts/verify-resolve.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 실패 시 exit 1
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runAssemble } from '../src/commands/assemble.js'
import { emitResolve } from '../src/assemble/emit-resolve.js'
import { loadProfile } from '../src/lib/profile.js'
import { TRACK_NAMES, type TimelineModel, type TrackItem, type TrackName } from '../src/assemble/model.js'
import { buildMedia, writeFixture, mainLayout, type MediaPaths } from '../fixtures/assemble/make-fixtures.js'

const ROOT = resolve(import.meta.dirname, '..')
const CFG = resolve(ROOT, 'config')
const MEDIA = resolve(ROOT, 'fixtures', 'assemble', '.media')
const PROJ = resolve(ROOT, 'fixtures', 'resolve-project')
const PY = '/usr/bin/python3'

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = []
function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail })
  process.stderr.write(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}\n`)
}

/** opentimelineio 를 보장(설치돼 있으면 skip, 없으면 pip --user 설치). */
function ensureOtio(): boolean {
  const probe = spawnSync(PY, ['-c', 'import opentimelineio'], { encoding: 'utf8' })
  if (probe.status === 0) return true
  process.stderr.write('[verify-resolve] opentimelineio 미설치 → pip install --user\n')
  const inst = spawnSync(PY, ['-m', 'pip', 'install', '--user', 'opentimelineio'], { encoding: 'utf8' })
  if (inst.status !== 0) { process.stderr.write(`${inst.stderr ?? ''}\n`); return false }
  return spawnSync(PY, ['-c', 'import opentimelineio'], { encoding: 'utf8' }).status === 0
}

/** 공식 otio 로 .otio 를 파싱·검증하는 파이썬 스니펫. render_report 와 대조한 결과 JSON 을 stdout 으로. */
const PY_CHECK = `
import sys, os, json, glob
import opentimelineio as otio

proj = sys.argv[1]
otio_files = glob.glob(os.path.join(proj, 'resolve', '*.otio'))
report = json.load(open(os.path.join(proj, 'render_report.json')))
out = {'ok': False, 'checks': {}, 'detail': {}}

if not otio_files:
    out['detail']['error'] = 'no .otio file'
    print(json.dumps(out)); sys.exit(0)

tl = otio.adapters.read_from_file(otio_files[0])
out['detail']['otio'] = os.path.basename(otio_files[0])
tc = report['track_counts']

tracks = list(tl.tracks)
names = [t.name for t in tracks]
out['detail']['track_names'] = names
clip_counts = {}
media_ok = True
missing = []
for t in tracks:
    clips = [c for c in t if isinstance(c, otio.schema.Clip)]
    clip_counts[t.name] = len(clips)
    for c in clips:
        mr = c.media_reference
        url = getattr(mr, 'target_url', '') or ''
        path = url[len('file://'):] if url.startswith('file://') else url
        if not os.path.exists(path):
            media_ok = False; missing.append(path)
out['detail']['clip_counts'] = clip_counts
out['detail']['missing'] = missing

want_tracks = ['Video 1', 'Video 2', 'Video 3', 'Video 4', 'Audio 1', 'Audio 2']
out['checks']['track_names'] = names == want_tracks
# 직접 매핑 트랙 클립 수 == TimelineModel(track_counts)
direct = {'Video 1': 'V1', 'Video 2': 'V2', 'Video 3': 'V3', 'Audio 1': 'A1', 'Audio 2': 'A2'}
out['checks']['clip_counts_match'] = all(clip_counts.get(k, -1) == tc.get(v, -2) for k, v in direct.items())
out['checks']['media_exists'] = media_ok

# 총길이 == narration_master_sec ±1프레임
dur = tl.duration()
fps = dur.rate
total_frames = round(dur.value)
master = report.get('narration_master_sec')
master_frames = round(master * fps) if master is not None else None
out['detail']['total_frames'] = total_frames
out['detail']['master_frames'] = master_frames
out['detail']['fps'] = fps
out['checks']['total_len'] = master_frames is not None and abs(total_frames - master_frames) <= 1

# 타임라인(Stack) 마커 수 == music_cues + sound_cues + V6(usage_credits)
stack_markers = len(list(tl.tracks.markers))
expected_markers = report['music_cues'] + report['sound_cues'] + report['usage_credits']
out['detail']['stack_markers'] = stack_markers
out['detail']['expected_markers'] = expected_markers
out['checks']['marker_count'] = stack_markers == expected_markers

# 스테이징: 모든 clip target_url 이 resolve/media/ 아래 + 유일 스테이지 수 == media 폴더 파일 수
all_urls = []
for t in tracks:
    for c in t:
        if isinstance(c, otio.schema.Clip):
            all_urls.append(getattr(c.media_reference, 'target_url', '') or '')
media_dir = os.path.join(proj, 'resolve', 'media')
staged_files = os.listdir(media_dir) if os.path.isdir(media_dir) else []
out['detail']['url_count'] = len(all_urls)
out['detail']['distinct_staged'] = len(set(all_urls))
out['detail']['media_files'] = len(staged_files)
out['checks']['all_under_media'] = len(all_urls) > 0 and all('/resolve/media/' in u for u in all_urls)
# 공유 파일 dedup: 여러 클립이 같은 물리 파일을 참조하면 스테이지는 하나 → 유일 URL 수 == media 파일 수
out['checks']['staged_dedup'] = len(set(all_urls)) == len(staged_files)

# 매핑 파일: 원본→스테이지, staged 는 media/ 아래, original 실존
man_path = os.path.join(proj, 'resolve', 'media-manifest.json')
man = json.load(open(man_path)) if os.path.exists(man_path) else None
out['detail']['manifest_count'] = man.get('count') if man else None
out['checks']['manifest'] = (
    man is not None
    and man.get('count') == len(staged_files)
    and len(man.get('entries', [])) == len(staged_files)
    and all('/resolve/media/' in e['staged'] for e in man.get('entries', []))
    and all(os.path.exists(e['original']) for e in man.get('entries', []))
)

out['ok'] = all(out['checks'].values())
print(json.dumps(out))
`

interface PyResult { ok: boolean; checks: Record<string, boolean>; detail: Record<string, unknown> }

async function main(): Promise<void> {
  const media: MediaPaths = buildMedia(MEDIA)
  const capDrafts = mkdtempSync(join(tmpdir(), 'resolve-capcut-'))

  /* ── 1. --emit all: 3종 산출 상태 ── */
  writeFixture(PROJ, mainLayout(), { configDir: CFG, media })
  const all = await runAssemble(PROJ, { emit: ['capcut', 'numbered', 'resolve'], force: true, human: false, draftsDir: capDrafts })
  const o = all.summary.outputs
  const otioPath = o.resolve?.path ?? ''
  const guideExists = o.resolve?.guide_path !== undefined && existsSync(o.resolve.guide_path)
  record('1-emit-all-3targets',
    o.capcut !== undefined && o.numbered !== undefined && o.resolve !== undefined && o.resolve.status === 'ok' && existsSync(otioPath) && guideExists,
    `capcut=${o.capcut?.status} numbered=${o.numbered?.status} resolve=${o.resolve?.status} otio=${existsSync(otioPath)} guide=${guideExists} srt=${existsSync(join(PROJ, 'resolve', 'captions.srt'))}`)

  /* ── 2. --emit resolve 단독: capcut/numbered 미생성 ── */
  const only = await runAssemble(PROJ, { emit: ['resolve'], force: true, human: false })
  const o2 = only.summary.outputs
  record('2-emit-resolve-alone',
    o2.resolve !== undefined && o2.resolve.status === 'ok' && o2.capcut === undefined && o2.numbered === undefined && only.exitCode === 0,
    `resolve=${o2.resolve?.status} capcut=${o2.capcut === undefined ? '없음' : o2.capcut.status} numbered=${o2.numbered === undefined ? '없음' : o2.numbered.status} exit=${only.exitCode}`)

  /* ── 3. --emit bogus: CLI exit 2 ── */
  const bogus = spawnSync('npx', ['tsx', 'src/cli.ts', 'assemble', '--project', PROJ, '--emit', 'bogus', '--force'], { cwd: ROOT, encoding: 'utf8' })
  record('3-unknown-target-exit2', bogus.status === 2, `exit=${bogus.status}`)

  /* ── 4~8. 공식 otio 파싱 검증 ── */
  // resolve 단독 실행이 report 를 numbered/capcut 없이 덮었으므로 report 대조를 위해 all 을 다시 만든다.
  writeFixture(PROJ, mainLayout(), { configDir: CFG, media })
  await runAssemble(PROJ, { emit: ['capcut', 'numbered', 'resolve'], force: true, human: false, draftsDir: capDrafts })

  if (!ensureOtio()) {
    record('otio-available', false, 'opentimelineio 설치 실패 (pip --user)')
  } else {
    const pyFile = join(capDrafts, 'otio_check.py')
    writeFileSync(pyFile, PY_CHECK)
    const py = spawnSync(PY, [pyFile, PROJ], { encoding: 'utf8' })
    let res: PyResult | null = null
    try { res = JSON.parse((py.stdout ?? '').trim()) as PyResult } catch { res = null }
    if (res === null) {
      record('otio-parse', false, `파이썬 검증 stdout 파싱 실패 exit=${py.status} stderr=${(py.stderr ?? '').trim().slice(0, PY_ERR)}`)
    } else {
      const d = res.detail
      record('4-otio-parse-schema', res.detail['error'] === undefined, `otio=${String(d['otio'] ?? '(없음)')} err=${String(d['error'] ?? '-')}`)
      record('5-track-names', res.checks['track_names'] === true, `names=${JSON.stringify(d['track_names'])}`)
      record('6-clip-counts-match', res.checks['clip_counts_match'] === true, `clip_counts=${JSON.stringify(d['clip_counts'])} track_counts=${JSON.stringify(all.summary.track_counts)}`)
      record('7-media-exists', res.checks['media_exists'] === true, `missing=${JSON.stringify(d['missing'])}`)
      record('8-total-length-1frame', res.checks['total_len'] === true, `total=${String(d['total_frames'])}f master=${String(d['master_frames'])}f fps=${String(d['fps'])}`)
      record('9-marker-count', res.checks['marker_count'] === true, `stack_markers=${String(d['stack_markers'])} expected(music+sound+V6)=${String(d['expected_markers'])}`)
      record('10-all-under-media', res.checks['all_under_media'] === true, `urls=${String(d['url_count'])} 전부 resolve/media/ 내부=${String(res.checks['all_under_media'])}`)
      record('11-staged-dedup', res.checks['staged_dedup'] === true, `유일 스테이지=${String(d['distinct_staged'])} media파일=${String(d['media_files'])} (URL ${String(d['url_count'])}개 → 공유 dedup)`)
      record('12-media-manifest', res.checks['manifest'] === true, `manifest.count=${String(d['manifest_count'])} media파일=${String(d['media_files'])}`)
    }
  }

  /* ── 13~15. 파일명 충돌 · 공유 · 멱등 (합성 모델, checks 우회) ── */
  await stagingSynthChecks()

  /* ── 마감 ── */
  rmSync(capDrafts, { recursive: true, force: true })
  rmSync(PROJ, { recursive: true, force: true })
  const passCount = checks.filter((c) => c.pass).length
  const allPass = passCount === checks.length
  console.log(JSON.stringify({ pass: allPass, passed: passCount, total: checks.length, checks }))
  process.stderr.write(`\n${allPass ? 'ALL PASS' : 'FAILED'} — ${passCount}/${checks.length}\n`)
  if (!allPass) process.exitCode = 1
}

/* ─────────────── 스테이징 합성 검증(충돌·공유·멱등) ─────────────── */

function emptyTracks(): Record<TrackName, TrackItem[]> {
  const t = {} as Record<TrackName, TrackItem[]>
  for (const n of TRACK_NAMES) t[n] = []
  return t
}

function clipItem(id: string, file: string, start: number, end: number): TrackItem {
  return { id, lane: 'V1', role: 'main', start, end, file, source_in: 0, source_out: end - start }
}

/** emitResolve 만 직접 호출(buildModel/checks 우회)해 스테이징 엣지케이스를 결정론적으로 검증. */
function synthModel(v1: TrackItem[], v2: TrackItem[]): TimelineModel {
  const tracks = emptyTracks()
  tracks.V1 = v1
  tracks.V2 = v2
  return {
    project: 'collide', duration: 4, narration_master: null, narration_master_sec: null,
    word_timing: 'exact', align_rev: 1, tracks, beats: [], segments: [], unapproved: [],
    music_cues: [], sound_cues: [], usage: [], captions_srt: null,
    intro_visual_changes: 0, hook_window_sec: 30, is_spine: false,
  }
}

async function stagingSynthChecks(): Promise<void> {
  const profile = loadProfile(ROOT, { bootstrap: false }) // config/edit-profile.json 메모리 폴백
  const dir = mkdtempSync(join(tmpdir(), 'resolve-stage-'))
  try {
    // 다른 폴더의 같은 basename(clip.mp4) + 한 파일(fileA)을 두 클립이 공유.
    const aDir = join(dir, 'a')
    const bDir = join(dir, 'b')
    mkdirSync(aDir, { recursive: true })
    mkdirSync(bDir, { recursive: true })
    const fileA = join(aDir, 'clip.mp4')
    const fileB = join(bDir, 'clip.mp4')
    writeFileSync(fileA, 'AAAA')
    writeFileSync(fileB, 'BBBB')
    const model = synthModel([clipItem('sh1', fileA, 0, 2)], [clipItem('sh2', fileB, 0, 2), clipItem('sh3', fileA, 2, 4)])

    const r1 = await emitResolve(model, dir, profile, { force: true })
    const mediaDir = join(dir, 'resolve', 'media')
    const files1 = readdirSync(mediaDir)
    const man = JSON.parse(readFileSync(join(dir, 'resolve', 'media-manifest.json'), 'utf8')) as { count: number; entries: { original: string; staged: string }[] }
    const otioText = readFileSync(join(dir, 'resolve', 'collide.otio'), 'utf8')
    const urls = [...otioText.matchAll(/"target_url": "([^"]+)"/g)].map((m) => m[1] ?? '')
    const distinct = new Set(urls)

    // 13 충돌: 두 clip.mp4 가 유일 이름으로(하나는 clean, 하나는 해시 프리픽스) 둘 다 media/ 에.
    record('13-collision-unique',
      files1.length === 2 && new Set(files1).size === 2 && files1.includes('clip.mp4') && files1.some((f) => f !== 'clip.mp4' && f.endsWith('_clip.mp4')),
      `media파일=${JSON.stringify(files1)}`)
    // 14 공유: fileA 는 한 번만 스테이징 → manifest 2건·staged 2, sh1/sh3 는 같은 target_url(URL 3건 중 distinct 2).
    record('14-shared-once',
      man.count === 2 && r1.staged === 2 && man.entries.length === 2 && urls.length === 3 && distinct.size === 2,
      `manifest.count=${man.count} staged=${r1.staged} URL=${urls.length} distinct=${distinct.size}`)

    // 15 멱등: 재실행(force 아님) 시 중복 스테이징 없음 — media 파일 목록 동일.
    await emitResolve(model, dir, profile, { force: false })
    const files2 = readdirSync(mediaDir)
    const same = files2.length === files1.length && JSON.stringify([...files2].sort()) === JSON.stringify([...files1].sort())
    record('15-idempotent-no-dup', same, `재실행 media파일=${JSON.stringify(files2)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PY_ERR = 600 // 파이썬 stderr 발췌 길이

main().catch((err: unknown) => {
  process.stderr.write(`verify-resolve 예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exitCode = 1
})
