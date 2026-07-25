/**
 * render.ts — 스토리보드 검수 HTML 생성 (T4 · PORTING.md M4)
 *
 * 정적 자체완결 HTML 파일 하나(review.html)를 만든다. 서버·외부 CDN·localStorage·
 * File System Access API 없음. 생성 시점 shot-plan.json.revision 을 HTML 에 박는다.
 * 브라우저는 shot-plan.json 을 직접 쓰지 않고 결정 로그(append-only 증분)만 다운로드한다.
 *
 * M4 이식(약 50~60줄): argv/파일 IO 골격, esc()·time() 포맷터, IntersectionObserver
 * lazy 렌더 패턴(원본 453-476). 나머지(후보 video #t=in,out 재생·15키·2패스·경고·결정로그)는 신규.
 * 폐기: pulkVisualHtml·previewHtml·CSS 덩어리(전부 슬라이드덱 전용).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadProfile, loadFrame, type EditProfile } from '../lib/profile.js'
import { PHOTO_MOTION_TYPES } from '../schema/pipeline.js'
import { computeWarnings, type TimelineShot, type ReviewWarning } from './warnings.js'

const SEC_PER_MIN = 60 // @unit mm:ss 포맷 분 환산
const TENTHS = 10 // @unit 타임코드 소수 첫째자리
const MMSS_PAD = 2 // @unit mm/ss 0-채움 폭
const PCT = 100 // @unit 타임라인 블록 폭 백분율
const AUTOSAVE_EVERY = 10 // @unit 결정 N건마다 자동 다운로드 제안(손실 창 제한, spec/05:130)
const STEP_SEC = 0.1 // @unit [ ] 인·아웃 조정 스텝(초, UI 넛지)
const TENTHS_DP = 1 // @unit 점수·폭 소수 첫째자리
const NON_REVIEW_KINDS = new Set(['motion', 'caption_card']) // 검수 제외(spec/05 완료조건 8)

/* ─────────────── 입력 타입 ─────────────── */

interface RawCandidate {
  cand_id: string
  source_id: string
  source_in: number
  source_out: number
  score: number
  score_source: string
  rights_status: string
  asset_kind: string
  text?: string
  proxy_path: string | null
  proxy_ok: boolean
  photo_motion?: { type: string }
}

interface CatalogSource {
  source_id: string
  title?: string
  publisher?: string
  original_url?: string
}

interface Beat {
  beat_id: string
  narration: string
  start: number
  end: number
  visual_function: string
  importance: string
  search_intent: string
  must_show?: string[]
  avoid?: string[]
  emphasis_caption?: string
}

interface Shot {
  shot_id: string
  beat_ids: string[]
  start: number
  end: number
  asset_kind: string
  purpose: string
  selection_status: string
  rights_status: string
  framing?: string
  source_audio?: string
  source_id?: string
}

interface ShotPlan {
  project: string
  revision: number
  profile_rev: number
  frame_rev: number
  beats: Beat[]
  shots: Shot[]
}

export interface ReviewCard {
  shot: Shot
  beat: Beat
  candidates: RawCandidate[]
  rerankPending: boolean // candidates.json.rerank_pending — «리랭크 대기» 배지용
}

export interface ReviewInput {
  project: string
  revision: number
  profileRev: number
  frameRev: number
  totalSec: number
  cards: ReviewCard[]
  warnings: ReviewWarning[]
  profile: EditProfile
  catalog: Map<string, CatalogSource>
}

/* ─────────────── 로드 ─────────────── */

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadReviewInput(projectDir: string): ReviewInput {
  const planPath = resolve(projectDir, 'shot-plan.json')
  if (!existsSync(planPath)) throw new Error(`shot-plan.json 없음: ${planPath}`)
  const plan = readJson(planPath) as ShotPlan
  const profile = loadProfile(projectDir)
  loadFrame(projectDir) // frame_rev 검증(누락 시 ConfigError). 토큰은 현재 미사용

  const catalogPath = resolve(projectDir, 'sources', 'catalog.json')
  const catalog = new Map<string, CatalogSource>()
  if (existsSync(catalogPath)) {
    for (const s of readJson(catalogPath) as CatalogSource[]) catalog.set(s.source_id, s)
  }

  const beatById = new Map(plan.beats.map((b) => [b.beat_id, b]))

  // 후보 로드(비트별 candidates/<beat_id>/candidates.json)
  const candsByBeat = new Map<string, RawCandidate[]>()
  const rerankByBeat = new Map<string, boolean>()
  for (const beat of plan.beats) {
    const cp = resolve(projectDir, 'candidates', beat.beat_id, 'candidates.json')
    if (existsSync(cp)) {
      const doc = readJson(cp) as { candidates: RawCandidate[]; rerank_pending?: boolean }
      candsByBeat.set(beat.beat_id, doc.candidates ?? [])
      rerankByBeat.set(beat.beat_id, doc.rerank_pending === true)
    }
  }

  // 검수 카드 = motion·caption_card 아닌 샷 하나당 하나. 점수 내림차순 후보.
  const cards: ReviewCard[] = []
  for (const shot of plan.shots) {
    if (NON_REVIEW_KINDS.has(shot.asset_kind)) continue
    const primary = shot.beat_ids[0]
    const beat = primary !== undefined ? beatById.get(primary) : undefined
    if (beat === undefined) continue
    const cands = (candsByBeat.get(beat.beat_id) ?? []).slice().sort((a, b) => b.score - a.score)
    cards.push({ shot, beat, candidates: cands, rerankPending: rerankByBeat.get(beat.beat_id) === true })
  }

  const totalSec = Math.max(0, ...plan.shots.map((s) => s.end), ...plan.beats.map((b) => b.end))

  const timelineShots: TimelineShot[] = plan.shots.map((s) => ({
    shot_id: s.shot_id, start: s.start, end: s.end, asset_kind: s.asset_kind,
    source_id: s.source_id, framing: s.framing, source_audio: s.source_audio, beat_ids: s.beat_ids,
  }))
  const beatImportance = new Map(plan.beats.map((b) => [b.beat_id, b.importance]))
  const warnings = computeWarnings({ shots: timelineShots, beatImportance, totalSec, profile })

  return {
    project: plan.project, revision: plan.revision, profileRev: plan.profile_rev,
    frameRev: plan.frame_rev, totalSec, cards, warnings, profile, catalog,
  }
}

/* ─────────────── 포맷터 (M4 이식) ─────────────── */

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function time(v: number): string {
  const m = Math.floor(v / SEC_PER_MIN)
  const s = Math.floor(v % SEC_PER_MIN)
  const t = Math.floor((v % 1) * TENTHS)
  return `${String(m).padStart(MMSS_PAD, '0')}:${String(s).padStart(MMSS_PAD, '0')}.${t}`
}

function attr(v: number): string {
  return String(v)
}

/* ─────────────── 조각 ─────────────── */

const LANE_COLOR: Record<string, string> = {
  official_video: '#2563eb', video: '#2563eb', interview: '#7c3aed', advertisement: '#0891b2',
  news: '#0d9488', archive: '#65a30d', image: '#d97706', still: '#d97706',
  a_roll: '#059669', motion: '#db2777', caption_card: '#dc2626', fallback_text: '#6b7280',
}

function candKindColor(kind: string): string {
  return LANE_COLOR[kind] ?? '#6b7280'
}

function ratingRow(label: string): string {
  const pips = ['1', '2', '3', '4', '5']
    .map((n) => `<button class="pip" data-score="${n}" type="button">${n}</button>`).join('')
  return `<div class="rate-row"><span>${esc(label)}</span><span class="pips">${pips}</span></div>`
}

function passBlock(): string {
  return `<div class="passes">
    <div class="pass"><b>A 편집 적합성</b>${ratingRow('의미 일치')}${ratingRow('화면성')}${ratingRow('앞뒤 다양성')}</div>
    <div class="pass"><b>B 근거·권리</b>${ratingRow('출처 정확')}${ratingRow('증거 강도')}${ratingRow('권리 안전')}</div>
  </div>`
}

function candidateHtml(c: RawCandidate, catalog: Map<string, CatalogSource>, motionDefault: string, index: number, isTop: boolean, rerankPending: boolean): string {
  const src = catalog.get(c.source_id)
  const title = src?.title ?? c.source_id
  const publisher = src?.publisher ?? ''
  const url = src?.original_url ?? ''
  const isImage = c.asset_kind === 'image' || c.asset_kind === 'still'
  const motionType = c.photo_motion?.type ?? motionDefault
  const data = [
    `data-cand="${esc(c.cand_id)}"`, `data-source="${esc(c.source_id)}"`,
    `data-in="${attr(c.source_in)}"`, `data-out="${attr(c.source_out)}"`,
    `data-rights="${esc(c.rights_status)}"`, `data-kind="${esc(c.asset_kind)}"`,
    isImage ? `data-motion="${esc(motionType)}"` : '',
  ].filter((s) => s).join(' ')

  // 추천/대안 라벨 — 점수 1위(isTop)는 «AI 추천»(리랭크 대기 시 부가), 나머지는 «대안 N»(교체 소스 후보)
  const rankLabel = isTop
    ? `<span class="ai-badge" title="점수 1위 · AI 추천">★ AI 추천</span>${rerankPending ? '<span class="rerank-badge" title="점수 재정렬 대기 중">리랭크 대기</span>' : ''}`
    : `<span class="alt-label" title="교체 소스 후보">대안 ${index}</span>`

  const media = isImage
    ? `<div class="photo-box">사진 · ${esc(c.source_id)}</div>`
    : c.proxy_path
      ? `<video class="cand-video" data-src="${esc(c.proxy_path)}" preload="none" muted playsinline></video>`
      : `<div class="photo-box missing">프록시 없음</div>`

  const motionSel = isImage
    ? `<label class="motion-sel">촬영모션 <select class="motion">${PHOTO_MOTION_TYPES
        .map((t) => `<option value="${t}"${t === motionType ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
    : ''

  // 인·아웃 조정 버튼 — 키보드 [ ] 와 동일 로직(adjustEl), locked_selection:true 로 기록
  const trim = `<div class="trim" title="선택 구간(인·아웃) 조정"><button class="trim-btn" data-trim="in" type="button" title="[ 인점 앞으로 (구간 늘림)">인 −</button><button class="trim-btn" data-trim="out" type="button" title="] 아웃점 뒤로 (구간 늘림)">아웃 +</button></div>`

  const rightsBadge = `<span class="badge rights-${esc(c.rights_status)}">${esc(c.rights_status)}</span>`
  return `<div class="cand" ${data}>
    <div class="cand-rank">${rankLabel}<span class="sel-mark">✓ 선택됨</span></div>
    <div class="cand-media">${media}<button class="replay" type="button" title="Space 재생">▶ 구간</button></div>
    ${motionSel}
    ${trim}
    <div class="cand-meta">
      <div class="cand-title">${esc(title)}</div>
      <div class="cand-sub">${esc(publisher)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">원본</a>` : ''}</div>
      <div class="cand-nums">${rightsBadge}<span class="score">${c.score.toFixed(TENTHS_DP)}</span><span class="ssrc">${esc(c.score_source)}</span></div>
      ${c.text ? `<div class="cand-text">${esc(c.text)}</div>` : ''}
    </div>
    <div class="cand-actions"><button class="select-btn" type="button" title="Enter 와 동일 — 이 후보를 이 장면으로 선택">이 장면 선택</button></div>
  </div>`
}

function cardHtml(card: ReviewCard, catalog: Map<string, CatalogSource>, motionDefault: string): string {
  const { shot, beat, candidates } = card
  const mustShow = (beat.must_show ?? []).map(esc).join(', ')
  const avoid = (beat.avoid ?? []).map(esc).join(', ')
  const cands = candidates.map((c, i) => candidateHtml(c, catalog, motionDefault, i, i === 0, card.rerankPending)).join('')
  // 비트 헤더 액션 버튼 — 각각 키보드 A/C/X/R/Q 와 동일 동작(handleAct)
  const acts = `<div class="beat-acts">
      <button class="act-btn" data-act="aroll" type="button" title="A — 진행자 화면으로 지정">A 진행자</button>
      <button class="act-btn" data-act="caption" type="button" title="C — 강조 카드로 지정 (아래 문구 사용)">C 강조카드</button>
      <button class="act-btn" data-act="script" type="button" title="X — 원고 수정 필요 표시">X 원고수정</button>
      <button class="act-btn" data-act="research" type="button" title="R — 추가 조사 필요 표시">R 추가조사</button>
      <button class="act-btn" data-act="audio" type="button" title="Q — 원본음 순환 (mute→moment→quote)">Q 원본음</button>
    </div>`
  return `<article class="shot-card" data-shot="${esc(shot.shot_id)}" data-beat="${esc(beat.beat_id)}" data-asset-kind="${esc(shot.asset_kind)}" data-status="${esc(shot.selection_status)}">
    <div class="card-head">
      <div><span class="pill">${esc(shot.shot_id)}</span><span class="pill beat">${esc(beat.beat_id)}</span><strong>${time(beat.start)}–${time(beat.end)}</strong></div>
      <div class="tags"><span class="tag vf">${esc(beat.visual_function)}</span><span class="tag imp-${esc(beat.importance)}">${esc(beat.importance)}</span><span class="tag status">${esc(shot.selection_status)}</span></div>
    </div>
    ${acts}
    <p class="narration">${esc(beat.narration)}</p>
    <p class="purpose"><b>목적</b> ${esc(shot.purpose)} · <b>검색의도</b> ${esc(beat.search_intent)}</p>
    ${mustShow ? `<p class="must"><b>반드시</b> ${mustShow}</p>` : ''}
    ${avoid ? `<p class="avoid"><b>피할 것</b> ${avoid}</p>` : ''}
    <div class="cands">${cands || '<div class="no-cand">후보 없음</div>'}</div>
    <label class="caption-edit">강조 카드 문구 <input class="caption-input" value="${esc(beat.emphasis_caption ?? '')}"></label>
    ${passBlock()}
  </article>`
}

function timelineHtml(input: ReviewInput): string {
  const total = input.totalSec || 1
  const blocks = input.cards
    .slice()
    .sort((a, b) => a.shot.start - b.shot.start)
    .map((c) => {
      const w = ((c.shot.end - c.shot.start) / total) * PCT
      return `<span class="tl-block" style="width:${w.toFixed(TENTHS_DP)}%;background:${candKindColor(c.shot.asset_kind)}" title="${esc(c.shot.shot_id)} ${esc(c.shot.asset_kind)}"></span>`
    })
    .join('')
  const warns = input.warnings.length
    ? input.warnings.map((w) => `<li class="warn ${w.code}"><b>${esc(w.label)}</b> ${esc(w.message)} <em>${w.shot_ids.map(esc).join(', ')}</em></li>`).join('')
    : '<li class="warn-none">경고 없음</li>'
  return `<section class="timeline">
    <div class="tl-strip">${blocks}</div>
    <ul class="warnings" id="warnings">${warns}</ul>
  </section>`
}

/* ─────────────── 최상위 렌더 ─────────────── */

export function renderReviewHtml(input: ReviewInput): string {
  const cardsHtml = input.cards.map((c) => cardHtml(c, input.catalog, input.profile.photo_motion.default)).join('\n')
  const motionsJson = JSON.stringify(PHOTO_MOTION_TYPES)
  // 마우스 퍼스트 — 단축키 표는 도움말 오버레이(?)로 이동. 클릭 동선을 표 맨 앞에 둔다.
  const keyRows = [
    ['클릭', '후보 카드 프레임 또는 «이 장면 선택» 버튼 = 선택'],
    ['1 – 5', '후보 포커스 이동'],
    ['Enter', '포커스한 후보 선택 (approved)'],
    ['Space · 영상 클릭', '선택 구간 재생·정지'],
    ['[  ]  ·  인− 아웃+', '인·아웃 조정 (locked_selection)'],
    ['A', '진행자 화면(a_roll)으로 지정'],
    ['M · 촬영모션 드롭다운', '사진 촬영모션 변경 (parallax↔켄번즈)'],
    ['C', '강조 카드·문구 확정'],
    ['X', '원고 수정 필요 표시'],
    ['R', '추가 조사 필요 표시'],
    ['Q', '원본음 순환 (mute→moment→quote)'],
    ['J  K', '이전·다음 비트'],
    ['?', '이 도움말 열기·닫기'],
    ['Esc', '도움말 닫기'],
  ].map(([k, d]) => `<tr><td><kbd>${esc(k!)}</kbd></td><td>${esc(d!)}</td></tr>`).join('')

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>검수 — ${esc(input.project)} rev${input.revision}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#17212b;--muted:#5b6b7b;--line:#dce3ea;--accent:#2563eb;--warn:#c2410c;--ok:#047857}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181c22;--ink:#e6ebf1;--muted:#9aa7b4;--line:#2a3138;--accent:#6ea8fe;--warn:#fb923c;--ok:#34d399}}
:root[data-theme="dark"]{--bg:#0f1115;--card:#181c22;--ink:#e6ebf1;--muted:#9aa7b4;--line:#2a3138;--accent:#6ea8fe;--warn:#fb923c;--ok:#34d399}
:root[data-theme="light"]{--bg:#f6f7f9;--card:#fff;--ink:#17212b;--muted:#5b6b7b;--line:#dce3ea;--accent:#2563eb;--warn:#c2410c;--ok:#047857}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Apple SD Gothic Neo","Noto Sans KR",-apple-system,system-ui,sans-serif;line-height:1.6}
header{position:sticky;top:0;z-index:9;background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px}
.hbar{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
.htitle b{font-size:16px}.htitle span{color:var(--muted);font-size:13px}
.hactions{display:flex;align-items:center;gap:10px}
#count{font-weight:700;color:var(--accent)}
button.primary{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
button.primary.pulse{animation:pulse 1s ease 2}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 45%,transparent)}}
.progress{font-weight:700;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px}
.cnt{color:var(--muted);font-size:13px}
.help-btn{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-weight:800;cursor:pointer;font-size:15px}
.hint{margin-top:8px;font-size:13px;color:var(--muted);background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid var(--line);border-radius:8px;padding:6px 12px;display:flex;align-items:center;gap:8px}
.hint b{color:var(--accent)}
.hint-x{margin-left:auto;border:0;background:transparent;color:var(--muted);font-size:16px;cursor:pointer;line-height:1}
.help-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center}
.help-overlay[hidden]{display:none}
.help-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.help-panel{position:relative;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:20px;max-width:560px;width:calc(100% - 40px);max-height:80vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.help-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.help-h b{font-size:17px}
.help-x{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700}
.help-lead{font-size:14px;color:var(--muted);margin:0 0 12px}.help-lead b{color:var(--ink)}
.help-keys{width:100%;border-collapse:collapse;font-size:13px}
.help-keys td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.help-keys td:first-child{white-space:nowrap;color:var(--muted)}
.help-keys kbd{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1px 6px;font-family:ui-monospace,monospace}
.timeline{padding:10px 20px;border-bottom:1px solid var(--line);background:var(--card)}
.tl-strip{display:flex;height:14px;border-radius:4px;overflow:hidden;background:var(--bg);border:1px solid var(--line)}
.tl-block{height:100%;min-width:2px;border-right:1px solid rgba(0,0,0,.15)}
.warnings{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px;max-height:160px;overflow:auto;font-size:13px}
.warn{border-left:3px solid var(--warn);padding:3px 8px;background:color-mix(in srgb,var(--warn) 8%,transparent)}
.warn b{color:var(--warn)}.warn em{color:var(--muted);font-style:normal}.warn-none{color:var(--ok)}
.banner{display:none;position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--warn);color:#fff;padding:10px 18px;border-radius:10px;z-index:20;font-weight:700}
.banner.show{display:block}
main{max-width:1080px;margin:0 auto;padding:20px}
.shot-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px;scroll-margin-top:120px}
.shot-card.is-current{outline:2px solid var(--accent)}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pill{background:var(--accent);color:#fff;border-radius:999px;padding:2px 8px;font-size:12px;margin-right:6px}
.pill.beat{background:var(--muted)}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tag{border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;background:var(--bg);border:1px solid var(--line)}
.tag.imp-critical{background:#fee2e2;color:#b91c1c;border-color:#fecaca}
.tag.imp-normal{background:#fef3c7;color:#92400e;border-color:#fde68a}
.tag.imp-bridge{background:#e0e7ff;color:#3730a3;border-color:#c7d2fe}
.narration{font-size:17px;font-weight:700;margin:10px 0 6px}
.purpose,.must,.avoid{margin:2px 0;font-size:13px;color:var(--muted)}
.must b{color:var(--ok)}.avoid b{color:var(--warn)}
.cands{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:12px 0}
.cand{border:1px solid var(--line);border-radius:10px;padding:8px;position:relative;cursor:pointer}
.cand.is-focus{outline:2px solid var(--accent)}
.cand.is-selected{border:3px solid var(--ok);box-shadow:0 0 0 2px color-mix(in srgb,var(--ok) 30%,transparent);padding:6px}
.cand-rank{display:flex;align-items:center;gap:6px;min-height:20px;margin-bottom:6px}
.ai-badge{background:var(--ok);color:#fff;font-weight:800;font-size:11px;border-radius:6px;padding:2px 8px}
.rerank-badge{background:var(--warn);color:#fff;font-weight:700;font-size:10px;border-radius:6px;padding:2px 6px}
.alt-label{color:var(--muted);font-weight:700;font-size:11px;border:1px dashed var(--line);border-radius:6px;padding:1px 7px}
.sel-mark{display:none;margin-left:auto;color:var(--ok);font-weight:800;font-size:12px}
.cand.is-selected .sel-mark{display:inline}
.cand-actions{margin-top:8px}
.select-btn{width:100%;border:1px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border-radius:8px;padding:7px;font-weight:700;cursor:pointer;font-size:13px}
.cand.is-selected .select-btn{background:var(--ok);border-color:var(--ok);color:#fff}
.trim{display:flex;gap:6px;margin:6px 0}
.trim-btn{flex:1;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:6px;padding:3px 0;font-size:12px;font-weight:700;cursor:pointer}
.beat-acts{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px}
.act-btn{border:1px solid var(--line);background:var(--bg);color:var(--muted);border-radius:7px;padding:4px 9px;font-size:12px;font-weight:700;cursor:pointer}
.act-btn:hover{border-color:var(--accent);color:var(--accent)}
.cand-media{position:relative;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.cand-video{width:100%;height:100%;object-fit:cover}
.photo-box{color:#cbd5e1;font-size:13px;text-align:center;padding:8px}.photo-box.missing{color:#f87171}
.replay{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;border:0;border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer}
.motion-sel{display:block;font-size:12px;color:var(--muted);margin:6px 0}
.cand-meta{font-size:12px}.cand-title{font-weight:700}.cand-sub{color:var(--muted)}
.cand-nums{display:flex;gap:6px;align-items:center;margin-top:4px}
.badge{border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;background:var(--bg);border:1px solid var(--line)}
.badge.rights-blocked,.badge.rights-unknown{background:#fee2e2;color:#b91c1c}
.badge.rights-owned,.badge.rights-public_domain,.badge.rights-licensed,.badge.rights-permission,.badge.rights-cc{background:#d1fae5;color:#047857}
.score{font-weight:700}.ssrc{color:var(--muted)}
.cand-text{color:var(--muted);margin-top:4px}
.caption-edit{display:block;font-size:12px;color:var(--muted);margin:8px 0}
.caption-input{width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}
.passes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.pass{border:1px solid var(--line);border-radius:8px;padding:8px}.pass b{font-size:12px;color:var(--accent)}
.rate-row{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:4px}
.pip{width:22px;height:22px;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:5px;margin-left:3px;cursor:pointer}
.pip.on{background:var(--accent);color:#fff}
.no-cand{color:var(--warn)}
@media(max-width:720px){.passes{grid-template-columns:1fr}}
</style>
</head>
<body data-revision="${input.revision}" data-project="${esc(input.project)}">
<header>
  <div class="hbar">
    <div class="htitle"><b>${esc(input.project)}</b> <span>rev ${input.revision} · profile ${input.profileRev} · frame ${input.frameRev} · 검수 대상 ${input.cards.length}샷</span></div>
    <div class="hactions">
      <span class="progress" id="progress">선택 완료 0/${input.cards.length} 비트</span>
      <span class="cnt">결정 <span id="count">0</span></span>
      <button class="primary" id="download" type="button" title="지금까지의 결정을 파일로 저장합니다">결정 저장 (다운로드)</button>
      <button class="help-btn" id="help-btn" type="button" title="사용법·단축키 (?)" aria-label="도움말">?</button>
    </div>
  </div>
  <div class="hint" id="hint">후보 카드를 클릭해 장면을 선택하세요 · <b>?</b> = 도움말 · 마우스만으로 끝까지 완주할 수 있어요<button class="hint-x" id="hint-x" type="button" aria-label="힌트 닫기">×</button></div>
</header>
${timelineHtml(input)}
<main>${cardsHtml}</main>
<div class="banner" id="banner"></div>
<div class="help-overlay" id="help" hidden>
  <div class="help-backdrop" id="help-backdrop"></div>
  <div class="help-panel" role="dialog" aria-label="사용법">
    <div class="help-h"><b>사용법 · 단축키</b><button class="help-x" id="help-close" type="button">닫기 ×</button></div>
    <p class="help-lead"><b>장면 선택은 마우스로</b> — 후보 카드를 클릭하거나 «이 장면 선택» 버튼을 누르면 그 후보가 선택됩니다. 영상 영역 클릭은 재생/정지입니다. 아래 버튼·단축키는 모두 같은 결정으로 기록됩니다. <b>선택해도 다음 비트로 자동 이동하지 않습니다.</b></p>
    <table class="help-keys"><tbody>${keyRows}</tbody></table>
  </div>
</div>
<script>
(function(){
  "use strict";
  var REV = Number(document.body.dataset.revision);
  var AUTOSAVE_EVERY = ${AUTOSAVE_EVERY};
  var STEP = ${STEP_SEC};
  var MOTIONS = ${motionsJson};
  var AUDIO_CYCLE = ["mute","moment","quote"];
  var cards = Array.prototype.slice.call(document.querySelectorAll('.shot-card'));
  var cursor = 0;
  var log = [];                 // append-only 결정 로그
  var selectedCand = {};        // shot_id -> cand element (UI)
  var audioState = {};          // shot_id -> source_audio
  var selectedShots = {};       // shot_id -> true (진행 바 «선택 완료 x/y» 카운트)
  var TOTAL = cards.length;

  function clamp(i,lo,hi){ return Math.max(lo, Math.min(hi, i)); }
  function cardOf(){ return cards[cursor]; }
  function candsIn(card){ return Array.prototype.slice.call(card.querySelectorAll('.cand')); }
  function focusIdx(card){ var n=Number(card.dataset.focus); return isNaN(n)?0:n; }

  function paintFocus(){
    cards.forEach(function(c,i){ c.classList.toggle('is-current', i===cursor); });
    var card=cardOf(); if(!card) return;
    var fi=focusIdx(card), cs=candsIn(card);
    cs.forEach(function(el,i){ el.classList.toggle('is-focus', i===fi); });
    // lazy: 현재 카드의 포커스 후보 프록시를 확보(뷰포트 진입 전이라도 조작 대상은 로드)
    if(cs[fi]) ensureSrc(cs[fi]);
  }
  function focusCard(i){ cursor=clamp(i,0,cards.length-1); var c=cardOf(); if(c){ c.scrollIntoView({block:'center'}); } paintFocus(); }
  function focusCand(n){ var card=cardOf(); if(!card) return; var cs=candsIn(card); if(n<cs.length){ card.dataset.focus=String(n); paintFocus(); } }
  function focusedEl(){ var card=cardOf(); return card ? candsIn(card)[focusIdx(card)] : null; }

  function ensureSrc(candEl){
    var v = candEl.querySelector('video.cand-video'); if(!v) return null;
    if(!v.getAttribute('src') && v.dataset.src){
      v.src = v.dataset.src; v.preload='auto'; v.load();
      v.addEventListener('loadedmetadata', function(){ seekIn(candEl,v); }, {once:true});
      v.addEventListener('timeupdate', function(){
        var out=parseFloat(candEl.dataset.out);
        if(!isNaN(out) && v.currentTime >= out){ v.pause(); v.currentTime=out; }
      });
    }
    return v;
  }
  function seekIn(candEl,v){ var inS=parseFloat(candEl.dataset.in); if(!isNaN(inS)){ try{ v.currentTime=inS; }catch(e){} } }
  function playCand(candEl){
    var v=ensureSrc(candEl); if(!v) return;
    var run=function(){ seekIn(candEl,v); var p=v.play(); if(p&&p.catch) p.catch(function(){}); };
    if(v.paused){ if(v.readyState>=1) run(); else v.addEventListener('loadedmetadata',run,{once:true}); }
    else v.pause();
  }

  function bannerMsg(t){ var b=document.getElementById('banner'); b.textContent=t; b.classList.add('show'); setTimeout(function(){ b.classList.remove('show'); }, 2500); }
  function serialize(){ return JSON.stringify({ revision: REV, generated_at: new Date().toISOString(), decisions: log }, null, 2); }
  function download(){
    var blob=new Blob([serialize()],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='review-decisions-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }
  function updateCount(){
    document.getElementById('count').textContent=String(log.length);
    if(log.length>0 && log.length % AUTOSAVE_EVERY === 0){
      document.body.dataset.autosave=String(log.length);
      bannerMsg(log.length+'건 — 자동 저장(다운로드). «결정 저장» 버튼으로 언제든 다시 받을 수 있어요');
      var dl=document.getElementById('download'); if(dl){ dl.classList.add('pulse'); setTimeout(function(){ dl.classList.remove('pulse'); }, 2100); }
      download();
    }
  }
  function record(entry){ log.push(entry); updateCount(); }
  function updateProgress(){
    var n=0; for(var s in selectedShots){ if(selectedShots.hasOwnProperty(s)) n++; }
    var el=document.getElementById('progress'); if(el){ el.textContent='선택 완료 '+n+'/'+TOTAL+' 비트'; }
  }
  function markShotDone(shot){ selectedShots[shot]=true; updateProgress(); }

  function candData(el){
    return { cand_id:el.dataset.cand, source_id:el.dataset.source,
      source_in:parseFloat(el.dataset.in), source_out:parseFloat(el.dataset.out),
      rights_status:el.dataset.rights, asset_kind:el.dataset.kind, motion:el.dataset.motion };
  }
  function markSelected(card,el){
    candsIn(card).forEach(function(c){ c.classList.remove('is-selected'); });
    if(el) el.classList.add('is-selected');
    card.dataset.status='selected';
  }

  // 선택 기록(키보드 Enter·마우스 클릭 공용) — 동일 결정 로그 형식 보장
  function recordSelect(card, el, locked){
    if(!card||!el) return;
    var d=candData(el); var shot=card.dataset.shot;
    selectedCand[shot]=el; markSelected(card,el);
    var entry={ shot_id:shot, source_id:d.source_id, source_in:d.source_in, source_out:d.source_out,
      selection_status:'approved', rights_status:d.rights_status, asset_kind:d.asset_kind,
      source_audio:audioState[shot]||'mute', locked_selection:!!locked };
    if(d.asset_kind==='image'||d.asset_kind==='still'){ entry.photo_motion={ type: el.dataset.motion || MOTIONS[0] }; }
    record(entry);
    markShotDone(shot);
  }
  function doSelect(locked){ recordSelect(cardOf(), focusedEl(), locked); }
  // 클릭 선택 — 대상 후보로 포커스·커서를 옮기고 Enter 와 동일하게 기록(locked_selection:false, 자동 이동 없음)
  function selectByClick(cand){
    var card=cand.closest('.shot-card'); if(!card) return;
    var idx=candsIn(card).indexOf(cand); var ci=cards.indexOf(card);
    if(ci>=0) cursor=ci;
    if(idx>=0) card.dataset.focus=String(idx);
    paintFocus();
    recordSelect(card, cand, false);
  }
  // 인·아웃 조정(키보드 [ ]·마우스 인−/아웃+ 공용) — 동일 로직, locked_selection:true
  function adjustEl(card, el, which){
    if(!card||!el) return;
    var d=candData(el);
    if(which==='in') el.dataset.in=String(Math.max(0, (parseFloat(el.dataset.in)-STEP)));
    else el.dataset.out=String(parseFloat(el.dataset.out)+STEP);
    var v=el.querySelector('video.cand-video'); if(v && v.getAttribute('src')) seekIn(el,v);
    record({ shot_id:card.dataset.shot, source_id:d.source_id,
      source_in:parseFloat(el.dataset.in), source_out:parseFloat(el.dataset.out),
      selection_status:'approved', rights_status:d.rights_status, asset_kind:d.asset_kind,
      locked_selection:true });
  }
  function adjust(which){ adjustEl(cardOf(), focusedEl(), which); }
  function markARoll(card){
    card=card||cardOf(); if(!card) return;
    card.dataset.status='selected';
    record({ shot_id:card.dataset.shot, asset_kind:'a_roll', selection_status:'approved',
      rights_status:'owned', source_audio:audioState[card.dataset.shot]||'mute', locked_selection:true });
    markShotDone(card.dataset.shot);
  }
  function markCaption(card){
    card=card||cardOf(); if(!card) return;
    var cap=card.querySelector('.caption-input');
    record({ shot_id:card.dataset.shot, asset_kind:'caption_card', selection_status:'approved',
      rights_status:'owned', emphasis_caption: cap?cap.value:'', locked_selection:true });
    markShotDone(card.dataset.shot);
  }
  // 촬영모션 확정(키보드 M·마우스 드롭다운 공용) — 동일 결정 형식
  function recordMotion(card, el, type){
    if(!card||!el) return;
    el.dataset.motion=type;
    var sel=el.querySelector('select.motion'); if(sel) sel.value=type;
    var d=candData(el);
    record({ shot_id:card.dataset.shot, source_id:d.source_id, source_in:d.source_in, source_out:d.source_out,
      selection_status:'approved', rights_status:d.rights_status, asset_kind:'image',
      photo_motion:{ type: type }, locked_selection:true });
    bannerMsg('촬영모션 → '+type);
  }
  function cycleMotion(){
    var card=cardOf(); var el=focusedEl(); if(!card||!el) return;
    if(el.dataset.kind!=='image' && el.dataset.kind!=='still') return;
    var cur=el.dataset.motion||MOTIONS[0];
    var next=MOTIONS[(MOTIONS.indexOf(cur)+1)%MOTIONS.length];
    recordMotion(card, el, next);
  }
  function cycleAudio(card){
    card=card||cardOf(); if(!card) return; var shot=card.dataset.shot;
    var cur=audioState[shot]||'mute';
    var next=AUDIO_CYCLE[(AUDIO_CYCLE.indexOf(cur)+1)%AUDIO_CYCLE.length];
    audioState[shot]=next;
    record({ shot_id:shot, source_audio:next });
    bannerMsg('원본음 → '+next);
  }
  function flag(kind, card){ card=card||cardOf(); if(!card) return; record({ shot_id:card.dataset.shot, flag:kind }); bannerMsg(kind); }
  function toggleHelp(show){
    var h=document.getElementById('help'); if(!h) return;
    if(show===undefined) show=h.hasAttribute('hidden');
    if(show) h.removeAttribute('hidden'); else h.setAttribute('hidden','');
  }
  function handleAct(card, act){
    if(!card) return;
    if(act==='aroll') markARoll(card);
    else if(act==='caption') markCaption(card);
    else if(act==='script') flag('script_fix', card);
    else if(act==='research') flag('research', card);
    else if(act==='audio') cycleAudio(card);
  }

  document.addEventListener('keydown', function(e){
    var t=e.target;
    if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT')) return;
    var k=e.key;
    if(k==='?'){ toggleHelp(); e.preventDefault(); return; }
    if(k==='Escape'){ toggleHelp(false); return; }
    if(k>='1' && k<='9'){ focusCand(Number(k)-1); e.preventDefault(); return; }
    switch(k){
      case 'Enter': doSelect(false); e.preventDefault(); break;
      case ' ': { var el=focusedEl(); if(el) playCand(el); e.preventDefault(); break; }
      case '[': adjust('in'); e.preventDefault(); break;
      case ']': adjust('out'); e.preventDefault(); break;
      case 'a': case 'A': markARoll(); break;
      case 'm': case 'M': cycleMotion(); break;
      case 'r': case 'R': flag('research'); break;
      case 'x': case 'X': flag('script_fix'); break;
      case 'q': case 'Q': cycleAudio(); break;
      case 'c': case 'C': markCaption(); break;
      case 'j': case 'J': focusCard(cursor-1); e.preventDefault(); break;
      case 'k': case 'K': focusCard(cursor+1); e.preventDefault(); break;
      default: break;
    }
  });

  // 마우스 퍼스트 클릭 위임 — 선택·조정·촬영모션·비트 액션·도움말 모두 버튼/카드로 완주 가능
  document.addEventListener('click', function(e){
    var t=e.target;
    // 도움말·힌트
    if(t.closest('#help-btn')){ toggleHelp(); return; }
    if(t.closest('#help-close') || (t.classList && t.classList.contains('help-backdrop'))){ toggleHelp(false); return; }
    if(t.closest('#hint-x')){ var hint=document.getElementById('hint'); if(hint) hint.style.display='none'; return; }
    // 비트 헤더 액션(A·C·X·R·Q)
    var act=t.closest('[data-act]');
    if(act){ handleAct(act.closest('.shot-card'), act.getAttribute('data-act')); return; }
    // 인·아웃 조정(인− / 아웃+)
    var trim=t.closest('[data-trim]');
    if(trim){ var tc=trim.closest('.cand'); if(tc) adjustEl(tc.closest('.shot-card'), tc, trim.getAttribute('data-trim')); return; }
    // 평점 pip
    if(t.classList && t.classList.contains('pip')){
      var row=t.closest('.rate-row'); Array.prototype.forEach.call(row.querySelectorAll('.pip'),function(p){ p.classList.remove('on'); }); t.classList.add('on'); return;
    }
    // 영상 영역 클릭 = 재생/정지 (선택 아님 — 오클릭 방지)
    if(t.closest('.cand-media')){ var cm=t.closest('.cand'); if(cm) playCand(cm); return; }
    // «이 장면 선택» 버튼 = 선택
    if(t.closest('.select-btn')){ var sb=t.closest('.cand'); if(sb) selectByClick(sb); return; }
    // 후보 카드 프레임 클릭 = 선택 (입력·셀렉트·링크·버튼 영역 제외)
    var frame=t.closest('.cand');
    if(frame && !t.closest('input') && !t.closest('select') && !t.closest('a') && !t.closest('button')){ selectByClick(frame); return; }
  });
  document.addEventListener('change', function(e){
    var t=e.target;
    if(t.classList && t.classList.contains('motion')){
      var cand=t.closest('.cand'); var card=cand?cand.closest('.shot-card'):null;
      if(cand && card) recordMotion(card, cand, t.value); // 드롭다운 변경 = M 키와 동일 기록
    }
  });
  document.getElementById('download').addEventListener('click', download);

  // lazy 렌더 — 뷰포트 진입 시에만 프록시 src 세팅(200+행 정지 방지, M4 이식 패턴)
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){ candsIn(en.target).forEach(ensureSrc); }
    });
  }, { threshold: 0.2 });
  cards.forEach(function(c){ io.observe(c); });

  paintFocus();
  updateProgress();
  window.__review = { get log(){ return log; }, download: download, cursorShot: function(){ var c=cardOf(); return c?c.dataset.shot:null; },
    selectedCount: function(){ var n=0; for(var s in selectedShots){ if(selectedShots.hasOwnProperty(s)) n++; } return n; } };
})();
</script>
</body>
</html>`
}
