// 전체 파이프라인 라이브 E2E — 신규 프로젝트 생성 → 유튜브 업로드 "직전"(upload_approval)까지.
//
// - 전부 백엔드 HTTP(cmo:*)로 운전. publishUpload(실제 업로드)는 절대 호출하지 않음.
// - 단계별 체크포인트를 /tmp/e2e-pipeline-state.json에 저장 — 실패 수정 후 재실행하면 이어서 진행.
// - 렌더링은 factory(npm run render)를 직접 실행(오케스트레이터 역할).
//
// 실행: node e2e/full-pipeline-live.mjs            (이어서)
//       node e2e/full-pipeline-live.mjs --fresh    (처음부터 새 프로젝트)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'

const API = 'http://localhost:13000'
const STATE_FILE = '/tmp/bizpt-loop-state.json'
const FACTORY = process.env.VIDEO_FACTORY_DIR ?? '/Users/wonminyang/ai-slide-video-factory'
const fresh = process.argv.includes('--fresh')

let state = {}
if (!fresh && existsSync(STATE_FILE)) {
  try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { state = {} }
}
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

let token = ''
async function signIn() {
  const r = await fetch(`${API}/api/auth:signIn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
  })
  const j = await r.json()
  token = j?.data?.token
  if (!token) throw new Error('signIn failed')
}

async function call(action, body, timeoutMs = 120000) {
  try {
    return await callOnce(action, body, timeoutMs)
  } catch (e) {
    // keep-alive 소켓이 동기 자식 프로세스 실행 중 끊긴 경우 등 일시 오류 1회 재시도
    if (String(e?.message ?? e).includes('fetch failed')) {
      await new Promise((r) => setTimeout(r, 2000))
      return await callOnce(action, body, timeoutMs)
    }
    throw e
  }
}

async function callOnce(action, body, timeoutMs = 120000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${API}/api/cmo:${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}), signal: ctl.signal,
    })
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* noop */ }
    const data = json?.data?.data ?? json?.data ?? null
    return { ok: r.ok, status: r.status, data, raw: text.slice(0, 500) }
  } finally { clearTimeout(t) }
}

// 장시간 액션용: HTTP가 5분(undici/서버 keep-alive)에 끊겨도 서버는 계속 일하므로,
// fetch 실패/409면 기대 카드(stage)가 생길 때까지 getProject 폴링으로 결과를 회수한다.
async function callOrPoll(action, body, { card, timeoutMs = 1800000, sinceMs = Date.now() - 60000 } = {}) {
  let res
  try {
    res = await call(action, body, timeoutMs)
    if (res.ok) return res
    if (res.status !== 409) return res // 진짜 에러
    log(`   ↻ ${action} 409(in-flight) → 카드 폴링으로 전환`)
  } catch (e) {
    log(`   ↻ ${action} 전송 끊김(${String(e?.message ?? e).slice(0, 60)}) → 서버 계속 작업 중, 카드 폴링`)
  }
  if (!card) return res ?? { ok: false, status: 0, data: null, raw: 'no card to poll' }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20000))
    const pj = await call('getProject', { project_id: body.project_id }, 60000)
    const cards = pj.data?.cards ?? []
    const hit = cards.filter((c) => c.stage === card && new Date(c.createdAt ?? c.updatedAt ?? 0).getTime() >= sinceMs).pop()
    if (hit) {
      const data = typeof hit.data === 'string' ? JSON.parse(hit.data) : (hit.data ?? {})
      log(`   ↻ 카드 '${card}' 확인 — 폴링 회수 성공`)
      return { ok: true, status: 200, data: { ...data, polled: true }, raw: 'polled' }
    }
    log(`   … '${card}' 카드 대기 중 (${Math.round((deadline - Date.now()) / 60000)}분 남음)`)
  }
  return { ok: false, status: 0, data: null, raw: `poll timeout for card ${card}` }
}

function must(res, label) {
  if (!res.ok) {
    log(`❌ ${label} → HTTP ${res.status} ${res.raw}`)
    throw new Error(`${label} failed: HTTP ${res.status}`)
  }
  log(`✅ ${label}`)
  return res.data
}

const projStatus = async () => (await call('getProject', { project_id: state.project_id })).data?.project?.status
  ?? (await call('getProject', { project_id: state.project_id })).data?.status

async function getStatus() {
  const r = await call('getProject', { project_id: state.project_id })
  return r.data?.project?.status ?? r.data?.status ?? null
}

// 게이트면 approveStageGate, 아니면 advanceStatus — 목표 status까지 (최대 12스텝)
async function advanceUntil(target) {
  const GATES = new Set(['key_content_approval', 'pulling_content_set_approval', 'hook_draft_approval', 'script_approval', 'video_qa_approval', 'upload_approval'])
  for (let i = 0; i < 12; i++) {
    const cur = await getStatus()
    if (cur === target) { log(`   status = ${cur} (도달)`); return cur }
    if (cur === 'upload_approval') { log(`   status = upload_approval — 더 전진하지 않음(업로드 직전 정지)`); return cur }
    const action = GATES.has(cur) ? 'approveStageGate' : 'advanceStatus'
    const r = await call(action, { project_id: state.project_id, decision: 'approve', comment: 'E2E 승인' })
    if (!r.ok) throw new Error(`advanceUntil(${target}) @${cur} via ${action}: HTTP ${r.status} ${r.raw}`)
    const next = r.data?.status ?? r.data?.project?.status ?? '(?)'
    log(`   ${cur} → ${next} (${action})`)
  }
  throw new Error(`advanceUntil(${target}): 12스텝 내 미도달 (현재 ${await getStatus()})`)
}

const done = (step) => state.steps?.[step]
const mark = (step, extra = {}) => { state.steps = { ...(state.steps ?? {}), [step]: true }; Object.assign(state, extra); save() }

async function main() {
  await signIn()
  log(`상태 파일: ${STATE_FILE} ${fresh ? '(fresh)' : ''}`)

  // 1. 프로젝트 생성
  if (!done('create')) {
    const d = must(await call('createProject', {
      title: '비즈니스PT 매니저 실가동 — SNS 신규 유입 시스템 (미용실)',
      product: 'SNS 신규 유입 시스템 — 미용실 인스타 신규 손님 (문진·유입 리포트)',
      target_audience: '인스타는 직접 열심히 하는데 신규 손님이 늘지 않는 미용실 원장',
      business_goal: 'consulting_lead',
      customer_problem: '인스타를 매일 올려도 신규 손님이 오지 않고, SNS 보고 온 손님이 몇 명인지 측정하지 못한다',
      core_offer: 'SNS 신규 유입 진단 신청 (접수 문진 + 유입 리포트)',
    }), '1. createProject')
    mark('create', { project_id: d.project_id ?? d.project?.id })
    log(`   project_id = ${state.project_id}`)
  }

  // 2. PT 컨텍스트 로딩
  if (!done('pt')) { must(await call('loadPTContext', { project_id: state.project_id }, 300000), '2. loadPTContext'); mark('pt') }

  // 3. product_defined까지 전진 + 상품 정의 생성
  if (!done('productdef')) {
    await advanceUntil('product_defined')
    must(await callOrPoll('proposeProductDefinition', { project_id: state.project_id }, { card: 'product_definition', timeoutMs: 900000 }), '3. proposeProductDefinition (수 분 소요)')
    mark('productdef')
  }

  // 4. 상품 정의 승인 → 키 콘텐츠 보고서 (장시간: 5~15분)
  if (!done('keyreport')) {
    await advanceUntil('key_content_ideation')
    must(await callOrPoll('proposeKeyContentReport', { project_id: state.project_id }, { card: 'key_content_report', timeoutMs: 2400000 }), '4. proposeKeyContentReport (5~25분)')
    mark('keyreport')
  }

  // 5. 승인① 포함 풀링 선별까지 전진 → 풀링 보고서
  if (!done('pulling')) {
    await advanceUntil('pulling_content_set_selection')
    must(await callOrPoll('proposePullingReport', { project_id: state.project_id }, { card: 'pulling_plan', timeoutMs: 2400000 }), '5. proposePullingReport (장시간)')
    mark('pulling')
  }

  // 6. 승인② → 썸네일 단계 진입
  if (!done('tothumb')) { await advanceUntil('thumbnail_pattern_extraction'); mark('tothumb') }

  // 7. 제목 디벨롭 (레퍼런스 자동 발굴 + 핫비디오 — 갭 #2/#3 검증)
  if (!done('titledev')) {
    const d = must(await callOrPoll('proposeTitleDevelopment', { project_id: state.project_id }, { card: 'title_development', timeoutMs: 2400000 }), '7. proposeTitleDevelopment (자동 발굴 + 8단계)')
    log(`   auto_discovered=${d.auto_discovered} hot_videos_source=${String(d.hot_videos_source).slice(0, 60)}`)
    const selected = d.run?.selected_title ?? d.selected_title ?? d.title_development_workflow?.selected_title
    if (d.next_action === 'request_more_references') {
      log(`   ⚠ 자동 발굴 실패 → notes: ${JSON.stringify(d.discovery_notes ?? []).slice(0, 300)}`)
      throw new Error('titledev: 레퍼런스 자동 발굴 실패')
    }
    mark('titledev', { selected_title: selected })
    log(`   selected_title = ${selected}`)
  }

  // 8. 썸네일 레퍼런스 학습 (B1⑥)
  if (!done('thumblearn')) {
    const d = must(await callOrPoll('learnThumbnailReferences', { project_id: state.project_id }, { card: 'thumbnail_reference_patterns', timeoutMs: 900000 }), '8. learnThumbnailReferences')
    log(`   patterns=${d.patterns?.length ?? 0} eligible=${d.eligible_count}`)
    mark('thumblearn')
  }

  // 9. 썸네일 9개 매트릭스 (학습 패턴 자동 주입 + 채널 시청층 — B2 검증)
  if (!done('matrix')) {
    const d = must(await callOrPoll('proposeThumbnailMatrix', {
      project_id: state.project_id,
      title: state.selected_title ?? '미용실 인스타',
      main_click_reason: '인스타를 매일 올려도 손님이 안 오는 진짜 이유를 알고 싶다',
      channel_audience_profile: '인스타를 직접 운영하는 미용실 원장',
    }, { card: 'thumbnail_matrix', timeoutMs: 1200000 }), '9. proposeThumbnailMatrix')
    log(`   candidates=${d.candidates?.length ?? d.matrix?.candidates?.length ?? '?'} ref_source=${d.reference_patterns_source}`)
    mark('matrix')
  }

  // 10. 썸네일 플랜 + 커밋 → 훅 게이트까지 자동 전진
  if (!done('thumbcommit')) {
    const plan = must(await callOrPoll('proposeThumbnailPlanDraft', { project_id: state.project_id }, { card: 'thumbnail_plan', timeoutMs: 900000 }), '10a. proposeThumbnailPlanDraft')
    const cands = plan.plan?.candidates ?? plan.candidates ?? []
    const cid = cands[0]?.id ?? cands[0]?.candidate_id
    if (!cid) throw new Error('thumbnail plan candidate_id 없음: ' + JSON.stringify(plan).slice(0, 200))
    const d = must(await call('commitThumbnailPlan', { project_id: state.project_id, candidate_id: cid }, 120000), '10b. commitThumbnailPlan')
    log(`   status → ${d.status ?? '(?)'}`)
    mark('thumbcommit')
  }

  // 11. 도입부 정합 평가 (B4 검증) — hook 게이트 도달 후
  if (!done('hookalign')) {
    await advanceUntil('hook_draft_approval')
    const d = must(await callOrPoll('evaluateHookAlignment', { project_id: state.project_id }, { card: 'hook_alignment', timeoutMs: 600000 }), '11. evaluateHookAlignment')
    log(`   alignment=${d.alignment?.status} thumb=${d.thumbnail_score} intro=${d.intro_hook?.score}`)
    mark('hookalign')
  }

  // 12. 승인③ → 원고
  if (!done('script')) {
    await advanceUntil('script_planning')
    must(await callOrPoll('proposeScriptDraft', { project_id: state.project_id }, { card: 'script_draft', timeoutMs: 2400000 }), '12a. proposeScriptDraft (장시간)')
    // 원고 실체 가드(2026-07-12): 재개 레이스로 뼈대(<1500자) 원고가 커밋돼 영상까지
    // 나가던 회귀 방지 — 서버 백그라운드 LLM 완료를 기다리고, 그래도 뼈대면 1회 재생성.
    const scriptLen = async () => {
      const pj = await call('getProject', { project_id: state.project_id }, 60000)
      const sc = (pj.data?.cards ?? []).filter((c) => c.stage === 'script_draft').slice(-1)[0]
      const dd = typeof sc?.data === 'string' ? JSON.parse(sc.data) : sc?.data
      return String(dd?.integrated_script?.full_script ?? '').length
    }
    let slen = await scriptLen()
    for (let i = 0; i < 9 && slen < 1500; i++) {
      log(`   … 원고 ${slen}자(뼈대) — 서버 LLM 완료 대기 (${i + 1}/9)`)
      await new Promise((r) => setTimeout(r, 20000))
      slen = await scriptLen()
    }
    if (slen < 1500) {
      log('   ⚠ 원고 뼈대 지속 → proposeScriptDraft 재생성 1회')
      must(await callOrPoll('proposeScriptDraft', { project_id: state.project_id }, { card: 'script_draft', timeoutMs: 2400000 }), '12a-retry. proposeScriptDraft')
      slen = await scriptLen()
    }
    if (slen < 1500) throw new Error(`원고 분량 미달(${slen}자) — KB 09 기준(본론 2,500자 내외) 미충족, 뼈대 원고로 진행 금지`)
    log(`   원고 ${slen}자 확인 (KB 09 분량 가드 통과)`)
    const d = must(await call('commitScriptDraft', { project_id: state.project_id }, 120000), '12b. commitScriptDraft')
    log(`   status → ${d.status ?? '(?)'}`)
    mark('script')
  }

  // 13. 승인④ → 녹음 — 실원고 전문을 say TTS로 낭독 + afinfo 실측 duration.
  // (기존 8초 고정 테스트 음성은 점검 잔여 3 — 실 배선으로 교체, 2026-07-12)
  if (!done('voice')) {
    await advanceUntil('voice_recording')
    let scriptText = '안녕하세요. 이 영상은 전체 파이프라인 검증용 테스트 녹음입니다.'
    try {
      const pj = await call('getProject', { project_id: state.project_id }, 60000)
      const sc = (pj.data?.cards ?? []).filter((c) => c.stage === 'script_draft').slice(-1)[0]
      const data = typeof sc?.data === 'string' ? JSON.parse(sc.data) : sc?.data
      const full = String(data?.integrated_script?.full_script ?? '').trim()
      if (full.length > 100) scriptText = full
    } catch { /* 폴백 텍스트 유지 */ }
    let duration = 8
    try {
      writeFileSync('/tmp/e2e-voice-script.txt', scriptText)
      execSync(`say -o /tmp/e2e-voice.aiff -f /tmp/e2e-voice-script.txt`, { timeout: 600000 })
      const info = execSync(`afinfo /tmp/e2e-voice.aiff`, { encoding: 'utf8', timeout: 30000 })
      const m = info.match(/estimated duration:\s*([\d.]+)/)
      if (m) duration = Math.max(1, Math.round(parseFloat(m[1])))
    } catch { /* 합성 실패 시 기존 폴백 duration */ }
    const d = must(await call('attachVoice', { project_id: state.project_id, file_url: 'file:///tmp/e2e-voice.aiff', duration_sec: duration }, 60000), '13. attachVoice')
    log(`   status → ${d.status} · 낭독 ${duration}s (원고 ${scriptText.length}자)`)
    mark('voice')
  }

  // 14. Brief → Factory 전달 + 슬라이드덱 + 렌더 잡 제출
  if (!done('render_submit')) {
    const brief = await call('generateVideoExecutionBrief', { project_id: state.project_id }, 600000)
    log(`${brief.ok ? '✅' : '⚠️'} 14a. generateVideoExecutionBrief (${brief.status})`)
    const sent = await call('sendBriefToFactory', { project_id: state.project_id }, 120000)
    log(`${sent.ok ? '✅' : '⚠️'} 14b. sendBriefToFactory (${sent.status})`)
    const deck = must(await call('buildSlideDeck', { project_id: state.project_id }, 600000), '14c. buildSlideDeck')
    const specId = deck.slide_deck_spec_id
    const sub = must(await call('submitRender', { project_id: state.project_id, slide_deck_spec_id: specId }, 120000), '14d. submitRender')
    mark('render_submit', { slide_deck_spec_id: specId, render_job_id: sub.render_job_id, factory_slug: sub.factory_slug, job_path: sub.job_path })
    log(`   slug=${sub.factory_slug} job=${sub.job_path}`)
  }

  // 15. 실 렌더 실행 (오케스트레이터 역할) + 상태 폴링
  if (!done('rendered')) {
    log(`15a. factory 렌더 실행 중 (수 분)… slug=${state.factory_slug}`)
    const r = spawnSync('npm', ['run', 'render', '--', '--job', state.job_path, '--out', `outputs/${state.factory_slug}`], {
      cwd: FACTORY, encoding: 'utf8', timeout: 1200000,
    })
    if (r.status !== 0) {
      log(`   render stderr(tail): ${(r.stderr ?? '').slice(-600)}`)
      throw new Error(`factory render exit ${r.status}`)
    }
    log('✅ 15a. factory render 완료')
    for (let i = 0; i < 20; i++) {
      const st = must(await call('getRenderStatus', { project_id: state.project_id }, 60000), `15b. getRenderStatus #${i + 1}`)
      const s = st.derived_status ?? st.status ?? st.job?.status
      log(`   render status = ${s}`)
      if (s === 'completed') { mark('rendered'); break }
      if (s === 'failed') throw new Error('render failed: ' + JSON.stringify(st).slice(0, 300))
      await new Promise((res) => setTimeout(res, 5000))
    }
    if (!done('rendered')) throw new Error('render 폴링 타임아웃')
  }

  // 16. QA → 승인⑤ → 업로드 초안 → upload_approval (정지점)
  if (!done('qa')) {
    const d = must(await call('runQA', { project_id: state.project_id, render_job_id: state.render_job_id }, 300000), '16. runQA')
    log(`   qa overall=${d.overall_status ?? d.qa?.overall_status} status→${d.status ?? ''}`)
    mark('qa')
  }
  if (!done('uploaddraft')) {
    await advanceUntil('upload_draft')
    // 제목은 항상 서버의 최신 확정 제목(title_development.selected_title) 우선 —
    // 재실행으로 카드가 갱신됐을 때 루프 상태의 구 제목이 업로드되던 문제 방지.
    let uploadTitle
    try {
      const pj = await call('getProject', { project_id: state.project_id }, 60000)
      const td = (pj.data?.cards ?? []).filter((c) => c.stage === 'title_development').slice(-1)[0]
      const tdd = typeof td?.data === 'string' ? JSON.parse(td.data) : td?.data
      uploadTitle = String(tdd?.selected_title ?? '').trim() || undefined
    } catch { /* 폴백 유지 */ }
    uploadTitle = uploadTitle ?? state.selected_title
    const d = must(await call('createUploadDraft', { project_id: state.project_id, render_job_id: state.render_job_id, title: uploadTitle ?? 'E2E 영상' }, 300000), '17. createUploadDraft')
    log(`   draft title=${(d.draft?.title ?? d.title ?? '').slice(0, 60)} visibility=${d.draft?.visibility ?? d.visibility}`)
    mark('uploaddraft')
  }

  const final = await getStatus()
  log(`\n══════ 최종 status = ${final} ══════`)
  if (final === 'upload_approval') {
    log('🎉 SUCCESS: 유튜브 업로드 직전(upload_approval)까지 전 구간 관통. publishUpload는 호출하지 않았습니다(승인⑥ 대기).')
  } else {
    log(`⚠ 최종 status가 upload_approval이 아님: ${final}`)
    process.exitCode = 1
  }
}

main().catch((e) => { log(`💥 중단: ${e.message}`); save(); process.exitCode = 1 })
