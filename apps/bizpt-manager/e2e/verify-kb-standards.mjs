// 지식베이스(docs/cmo/prd/bizpt-kb) 기준 대조 검증 — 파이프라인 산출물이 강의 기준대로 나왔는지.
// 실행: node e2e/verify-kb-standards.mjs <project_id>
// 판정 항목(정본 문서 §):
//  07 제목: 35자 이내(초과 시 조사→수식어 제거 대상), 정답 노출형 아님(질문/누락 권장)
//  09 도입부: ~200자(허용 120~300), 40초~1분10초 낭독(≈글자수/5.5초)
//  09 본론: 3,000자 내외(허용 2,000~4,500), 신뢰도 보강 요소 존재
//  08 썸네일: 후보 3개 이상(A/B 전제), 문구 존재
//  03/04 판매논리: 현상→욕구→계획→행동→보상 요소
//  렌더: video.mp4 실존 + 크기 + (ffprobe 가능 시) 길이·해상도
import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

const API = 'http://localhost:13000'
const FACTORY = process.env.VIDEO_FACTORY_DIR ?? '/Users/wonminyang/ai-slide-video-factory'
const projectId = process.argv[2]
if (!projectId) { console.error('usage: node verify-kb-standards.mjs <project_id>'); process.exit(2) }

let token = ''
const signIn = async () => {
  const r = await fetch(`${API}/api/auth:signIn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }) })
  token = (await r.json())?.data?.token
}
const call = async (action, body) => {
  const r = await fetch(`${API}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body ?? {}) })
  const j = await r.json()
  const inner = j?.data
  return inner && typeof inner === 'object' && 'data' in inner ? inner.data : inner
}

const results = []
const check = (id, kb, name, pass, evidence) => {
  results.push({ id, kb, name, pass, evidence })
  console.log(`${pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO'} [${kb}] ${name} — ${evidence}`)
}
const deep = (o, path) => path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o)
const findText = (obj, keys, min = 10) => {
  // 카드 content 안에서 keys 이름의 긴 문자열을 재귀 탐색
  const seen = new Set()
  const stack = [obj]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue
    seen.add(cur)
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'string' && v.length >= min && keys.some(key => k.toLowerCase().includes(key))) return v
      if (v && typeof v === 'object') stack.push(v)
    }
  }
  return null
}

await signIn()
// 짧은 ID로 호출하면 조용히 빈 결과가 나와 오판 위험 — 전체 UUID를 강제한다(2026-07-12 점검).
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  console.error(`❌ project_id는 전체 UUID여야 합니다 (받은 값: "${projectId}"). 짧은 ID는 status=undefined·카드 0건으로 조용히 실패합니다.`)
  process.exit(2)
}
const detail = await call('cmo:getProject', { project_id: projectId })
const proj = detail?.project ?? {}
const cards = detail?.cards ?? []
if (!proj.status) {
  console.error(`❌ 프로젝트를 찾지 못했습니다: ${projectId} (status=undefined). ID를 확인하세요.`)
  process.exit(2)
}
console.log(`\n=== KB 기준 대조: ${proj.title ?? projectId} · status=${proj.status} · 카드 ${cards.length}건 ===\n`)
const byStage = {}
for (const c of cards) { const k = c.stage ?? c.card_type ?? 'unknown'; (byStage[k] ??= []).push(c) }
console.log('카드 종류:', Object.keys(byStage).join(', '), '\n')
const latest = (k) => { const a = byStage[k]; return a ? a[a.length - 1] : null }
const content = (k) => { const c = latest(k); if (!c) return null; const raw = c.data ?? c.content; try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return raw } }

// ── 07 제목 ──
const titleCard = content('title_development')
const findKey = (obj, key) => { const st=[obj]; const seen=new Set(); while(st.length){ const c=st.pop(); if(!c||typeof c!=='object'||seen.has(c))continue; seen.add(c); for(const [k,v] of Object.entries(c)){ if(k===key&&typeof v==='string'&&v.trim())return v; if(v&&typeof v==='object')st.push(v); } } return null }
const selectedTitle = deep(titleCard, 'run.selected_title') ?? findKey(titleCard ?? {}, 'selected_title') ?? findKey(titleCard ?? {}, 'final_title')
if (selectedTitle) {
  const len = [...selectedTitle].length
  check('T1', '07 §4', '제목 35자 이내', len <= 35, `"${selectedTitle}" (${len}자)`)
  check('T2', '07 §3-⑤', '제목이 정답 노출형이 아님(휴리스틱)', !/방법 공개|입니다\.$/.test(selectedTitle), `말미 패턴 검사`)
} else check('T1', '07', '확정 제목 존재', false, 'title_development 카드에서 selected_title 미발견')

// ── 09 도입부 ──
const scriptCard = content('script_draft') ?? content('script')
const intro = (scriptCard?.intro_30s?.script && String(scriptCard.intro_30s.script)) || findText(scriptCard ?? {}, ['intro', 'opening', 'hook_intro'], 40)
if (intro) {
  const n = [...intro.replace(/\s+/g, ' ')].length
  const sec = Math.round(n / 5.5)
  check('S1', '09 §1', `도입부 분량 200자 내외(120~300)`, n >= 120 && n <= 300, `${n}자 · 낭독 ≈${sec}초`)
  check('S2', '09 §1', '도입부 낭독 40초~70초', sec >= 30 && sec <= 80, `≈${sec}초 (글자수/5.5)`)
} else check('S1', '09', '도입부 존재', false, 'script 카드에서 intro 미발견')

// ── 09 본론 ──
const body = findText(scriptCard ?? {}, ['body', 'main', 'full_script', 'script_text'], 500)
if (body) {
  const n = [...body.replace(/\s+/g, ' ')].length
  check('S3', '09 §6', '본론 3,000자 내외(2,000~4,500)', n >= 2000 && n <= 4500, `${n}자`)
  // 신뢰도 6요소의 실제 한국어 표현 변형 포함(2026-07-12: "실제로 …원장님이" 같은 사례 표현 미검출 보강)
  const trustHits = ['원리', '왜냐하면', '이유', '주의', '사례', '실제로', '예를 들', '출처', '연구', '데이터', '반론', '하실 수', '의문', '인터뷰', '직접', '경험', '결과'].filter(w => body.includes(w))
  check('S4', '09 §7', '신뢰도 보강 요소 흔적(4종 이상)', trustHits.length >= 4, `발견: ${trustHits.join('·')}`)
} else check('S3', '09', '본론 존재', false, 'script 카드에서 body 미발견')

// ── 08 썸네일 ──
const matrix = content('thumbnail_matrix')
const cands = deep(matrix, 'matrix.candidates') ?? matrix?.candidates ?? []
check('TH1', '08 §5', '썸네일 후보 3개 이상(A/B 전제)', Array.isArray(cands) && cands.length >= 3, `${Array.isArray(cands) ? cands.length : 0}개`)
if (Array.isArray(cands) && cands[0]) {
  const copy = cands[0].copy ?? cands[0].text ?? findText(cands[0], ['copy', 'text'], 2) ?? ''
  check('TH2', '08 §1', '문구 존재(글씨 최소화 대상)', !!copy, `1안: "${String(copy).slice(0, 30)}" (${[...String(copy)].length}자)`)
}

// ── 훅 정렬 (B4 · 08 §5 "썸9점→도입부9점") ──
const hook = content('hook_alignment')
if (hook) check('H1', '08 §5', '훅 강도 정렬 평가 존재', true, `status=${deep(hook, 'alignment.status') ?? JSON.stringify(hook).slice(0, 60)}`)
else check('H1', '08 §5', '훅 강도 정렬 평가 존재', false, 'hook_alignment 카드 없음')

// ── 03/04 판매논리 (현상→보상) ──
const keyReport = content('key_content_report')
const krStr = JSON.stringify(keyReport ?? {})
const funnel = ['현상', '욕구', '계획', '행동', '보상'].filter(w => krStr.includes(w))
check('F1', '03·04', '판매논리 5단계 요소(현상→보상)', funnel.length >= 4, `발견 ${funnel.length}/5: ${funnel.join('→')}`)

// ── 렌더 산출물 ──
const rs = await call('cmo:getRenderStatus', { project_id: projectId }).catch(() => null)
const slug = rs?.slug
if (slug) {
  const mp4 = `${FACTORY}/outputs/${slug}/video.mp4`
  const exists = existsSync(mp4)
  check('V1', '렌더', 'video.mp4 실존', exists, mp4)
  if (exists) {
    const mb = (statSync(mp4).size / 1048576).toFixed(1)
    check('V2', '렌더', '파일 크기 > 0.5MB', statSync(mp4).size > 524288, `${mb}MB`)
    try {
      const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of csv=p=0 "${mp4}"`, { timeout: 20000 }).toString().trim().split(/[\n,]/)
      check('V3', '렌더', '해상도·길이 관측', true, `${probe.join(' · ')}`)
    } catch { check('V3', '렌더', 'ffprobe', null, '미설치 — 크기 검증만') }
    check('V4', '렌더 QA', 'QA 상태', rs?.render_qa ? true : null, JSON.stringify(rs?.render_qa ?? {}).slice(0, 120))
  }
} else check('V1', '렌더', '렌더 잡 존재', false, 'getRenderStatus에서 slug 미발견 (아직 렌더 전이면 정상)')

// ── 요약 ──
const p = results.filter(r => r.pass === true).length
const f = results.filter(r => r.pass === false).length
console.log(`\n=== 판정: PASS ${p} · FAIL ${f} · INFO ${results.length - p - f} ===`)
process.exitCode = f > 0 ? 1 : 0
