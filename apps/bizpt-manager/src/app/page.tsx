'use client'
// 비즈니스 PT 매니저 — 메인 콘솔.
// 라이브 뷰(오늘·파이프라인·프로젝트 상세)는 NocoBase cmo:* 실데이터,
// 나머지 정보 뷰는 v4 프로토타입 추출본(STATIC_VIEWS, 시연 데이터 표시).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, signIn, type Project, type ProjectDetail } from '@/lib/api'
import { PHASE6, isGate, label, nowNext, phaseIndexOf, statusOrder, ORDERED } from '@/lib/statuses'
import { STATIC_VIEWS } from '@/lib/static-views'
import { ArtifactBoard } from '@/components/ArtifactBoard'
import { ApprovalCenter } from '@/components/ApprovalCenter'
import { ResearchBoard } from '@/components/ResearchBoard'
import { cardName, renderCardKorean } from '@/components/CardRenderers'

type ViewKey = string

const NAV: Array<[string, string] | [string, string, string]> = [
  ['today', '🏠 오늘 · 승인 큐'],
  ['approve', '✅ 승인 센터'],
  ['G', '전략 · 기획'],
  ['pipe', '📌 콘텐츠 파이프라인'],
  ['funnel', '🧭 퍼널 · 콘텐츠 세트'],
  ['item', '💼 아이템 · 상품'],
  ['calc', '🎯 목표 역산 · 트래픽'],
  ['G', '리서치'],
  ['research', '🔎 뷰트랩 리서치'],
  ['expand', '🔀 논리적 확장'],
  ['bench', '🗂 벤치마크 · 수집'],
  ['watch', '📡 채널 워치'],
  ['G', '제작 스튜디오'],
  ['title', '✏️ 제목 디벨롭'],
  ['thumb', '🖼 썸네일 디벨롭'],
  ['script', '📜 원고 · 도입부/본론'],
  ['G', '발행 · 성과'],
  ['upload', '✅ 업로드 · 캘린더'],
  ['diag', '🩺 지표 진단 · 처방'],
  ['dam', '🌊 트래픽 댐 · 랜딩'],
  ['G', '성장 로드맵'],
  ['road', '🗺 판매 단계 · 로드맵'],
  ['routine', '🔁 데일리 루틴 · 훈련'],
  ['insight', '📊 인사이트 루프'],
  ['G', '지식'],
  ['kb', '📚 지식베이스 (12문서)'],
  ['me', '🙋 내 컨설팅 기록'],
  ['G', '시스템'],
  ['jobs', '⚙️ 자동초안 잡'],
  ['render', '🎬 렌더 잡'],
]

const TITLES: Record<string, [string, string, string]> = {
  today: ['오늘', '사장님이 지금 결정할 것 · 자동으로 돌아가는 것', '00 인덱스 · 정량 4요소 = 조회수 1000 · 지속 35%(4분) · 도입부 60%(30초) · CTR 10%'],
  approve: ['승인 센터', '6개 게이트 리포트 검토 → 승인/반려가 한 화면에서', 'FR-6 · 리포트 없는 승인 차단'],
  pipe: ['콘텐츠 파이프라인', '기획 → 훅 → 원고 → 영상 → 업로드 → 성과 (실데이터)', '01 역순 기획 · 03 퍼널'],
  funnel: ['퍼널 · 콘텐츠 세트', '현상→욕구→계획→행동→보상 통로 배열', '03 · 05 §5.5'],
  item: ['아이템 · 상품', '객단가×시장 매트릭스 · 선정 5기준', '02'],
  calc: ['목표 역산 · 트래픽', '목표 매출 → 필요 조회수 역산', '01 §4·§5'],
  research: ['뷰트랩 리서치', '8단계 · 가치 3종 필터 · 판매논리', '05 §4 · 06'],
  expand: ['논리적 확장', '상품 → 기능 → 결핍 → 클릭할 문장', '05 §5'],
  bench: ['벤치마크 · 수집', '실측 · 가치 판별', '06 §4'],
  watch: ['채널 워치', '떡상 감지 · 퍼스트 히트', '06 §3-5'],
  title: ['제목 디벨롭', '8기법 · 조회수 합계 평가 · 35자', '07'],
  thumb: ['썸네일 디벨롭', '45/45/10 · 데드존 · A/B', '08'],
  script: ['원고 · 도입부/본론', '도입부 200자 · 신뢰도 6단계 · 유니크 3질문', '09'],
  upload: ['업로드 · 캘린더', 'SEO 체크 · 교체창 타이머', '08 §5'],
  diag: ['지표 진단 · 처방', '정량 4요소 → 손볼 위치 지정', '06 · 10'],
  dam: ['트래픽 댐 · 랜딩', '잠재고객 저수지 · 전환 퍼널', '01 §3'],
  road: ['판매 단계 · 로드맵', '판매 4단계 · 확장 4단계 · 주차별', '10'],
  routine: ['데일리 루틴 · 훈련', '썸끝 · 원끝 · 복기', '11'],
  insight: ['인사이트 루프', '매일 21시 후킹 분석 → 세컨 브레인', '자동 학습'],
  kb: ['지식베이스', '12문서 — 모든 화면의 근거 (repo 반입본)', '정본'],
  me: ['내 컨설팅 기록', '개인 컨텍스트 · 판단 기준', '11'],
  jobs: ['자동초안 잡', '단계별 진행 (파이프라인 카드에서 파생)', '시스템'],
  render: ['렌더 잡', '렌더 상태 · 자동 QA', '시스템'],
}

// 라이브 배선된 뷰 — 나머지는 v4 시연 화면
// 2026-07-12 확장: 승인센터 + 산출물 보드 8종(식별 헤더·콘텐츠 필터, FR-1/2/3/6/7/8).
const LIVE_VIEWS = new Set(['today', 'pipe', 'approve', 'research', 'bench', 'title', 'thumb', 'script', 'upload', 'jobs', 'render'])

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

export default function Home() {
  const [view, setView] = useState<ViewKey>('today')
  const [ready, setReady] = useState(false)
  const [connErr, setConnErr] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [soOpen, setSoOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((m: string) => {
    setToast(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      const r = await api.listProjects()
      setProjects((r?.projects ?? []) as Project[])
      setConnErr(null)
    } catch (e) {
      setConnErr(String(e).slice(0, 200))
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await signIn()
      if (!alive) return
      await loadProjects()
      setReady(true)
    })()
    const t = setInterval(loadProjects, 20000)
    return () => { alive = false; clearInterval(t) }
  }, [loadProjects])

  // 정적 뷰의 inline onclick(go/openCard/toast2) 브릿지
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.go = (v: string) => setView(v)
    w.openCard = () => showToast('시연 화면입니다 — 실데이터 카드는 파이프라인에서 여세요')
    w.closeCard = () => setSoOpen(false)
    w.tab = () => {}
    w.toast2 = (m: string) => showToast(m)
  }, [showToast])

  const openProject = useCallback(async (id: string) => {
    setSoOpen(true)
    setDetail(null)
    try {
      const d = await api.getProject(id)
      setDetail(d)
    } catch (e) {
      showToast('상세 로드 실패: ' + String(e).slice(0, 120))
      setSoOpen(false)
    }
  }, [showToast])

  const doApprove = useCallback(async (p: Project) => {
    setBusy(p.id)
    try {
      const r = await api.approveStageGate(p.id)
      showToast(`승인 완료 → ${label(r.status)}`)
      await loadProjects()
      if (detail?.project?.id === p.id) await openProject(p.id)
    } catch (e) {
      showToast('승인 실패: ' + String(e).slice(0, 140))
    } finally {
      setBusy(null)
    }
  }, [detail, loadProjects, openProject, showToast])

  const doAdvance = useCallback(async (p: Project) => {
    setBusy(p.id)
    try {
      const r = await api.advanceStatus(p.id)
      showToast(`전진 → ${label(r.status)}`)
      await loadProjects()
      if (detail?.project?.id === p.id) await openProject(p.id)
    } catch (e) {
      showToast('전진 실패: ' + String(e).slice(0, 140))
    } finally {
      setBusy(null)
    }
  }, [detail, loadProjects, openProject, showToast])

  const gates = useMemo(() => projects.filter(p => isGate(p.status)), [projects])
  const running = useMemo(() => projects.filter(p => !isGate(p.status) && p.status !== 'completed' && p.status !== 'paused'), [projects])
  const byPhase = useMemo(() => {
    const m: Project[][] = PHASE6.map(() => [])
    for (const p of projects) {
      const i = phaseIndexOf(p.status)
      if (i >= 0) m[i].push(p)
    }
    return m
  }, [projects])

  const t = TITLES[view] ?? ['', '', '']

  return (
    <div className="layout">
      <nav className="side">
        <div className="logo">비즈니스PT <span>매니저</span></div>
        {NAV.map((item, i) =>
          item[0] === 'G'
            ? <div key={i} className="grp">{item[1]}</div>
            : (
              <button key={i} className={view === item[0] ? 'on' : ''} onClick={() => setView(item[0])}>
                {item[1]}
                {item[0] === 'today' && gates.length > 0 && <span className="num hot">{gates.length}</span>}
                {item[0] === 'pipe' && projects.length > 0 && <span className="num">{projects.length}</span>}
              </button>
            ),
        )}
      </nav>

      <div className="main">
        <div className="top">
          <div>
            <h2>{t[0]}</h2>
            <div className="sub">{t[1]}</div>
            <div className="kb">근거: <b>{t[2]}</b></div>
          </div>
          <div className="acts">
            <span className={`pill ${gates.length ? 'gate' : 'line'}`}>{gates.length ? <span className="dot pulse" /> : null} 승인 대기 <b>{gates.length}</b></span>
            <span className={`pill ${running.length ? 'run' : 'line'}`}>{running.length ? <span className="dot pulse" /> : null} 자동 진행 <b>{running.length}</b></span>
            <span className={`pill ${connErr ? 'bad' : 'ok'}`}>{connErr ? '백엔드 연결 오류' : '백엔드 연결됨'}</span>
          </div>
        </div>

        {connErr && (
          <div className="card" style={{ borderLeft: '4px solid var(--danger)', marginBottom: 12 }}>
            <b style={{ fontSize: 13 }}>NocoBase(13000) 연결 실패</b>
            <div className="hint" style={{ marginTop: 4 }}>{connErr}</div>
          </div>
        )}

        {/* ═══ 오늘 (라이브) ═══ */}
        {view === 'today' && (
          <div className="view on">
            <div className="sect">사장님 차례 — 승인 {gates.length}건 <span className="kbref">사람이 결정하는 지점만 모음</span></div>
            {gates.length === 0 && (
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="hint">지금 승인 대기 항목이 없습니다 — 자동 단계가 진행 중이거나, 새 콘텐츠를 시작할 차례입니다.</div>
              </div>
            )}
            <div className="gaterow">
              {gates.map(p => (
                <div className="gitem" key={p.id}>
                  <div className="gh"><span className="pill gate">{label(p.status)}</span><span className="hint">{timeAgo(p.updatedAt)}</span></div>
                  <div className="gt">{p.title || '(제목 없음)'}</div>
                  <div className="gs">단계 {statusOrder(p.status) + 1}/{ORDERED.length} · {PHASE6[phaseIndexOf(p.status)]?.label}</div>
                  <div className="ga">
                    {/* FR-6: 리포트 없는 "바로 승인" 제거 — 승인은 승인 센터에서 리포트 검토 후에만 */}
                    <button className="btn p sm" onClick={() => setView('approve')}>리포트 검토하고 승인 →</button>
                    <button className="btn g sm" onClick={() => openProject(p.id)}>상세</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card">
                <h3>자동 진행 중 <span className="sub2">{running.length}건</span></h3>
                {running.length === 0 && <div className="hint">자동 진행 중인 항목이 없습니다.</div>}
                {running.map(p => {
                  const nn = nowNext(p.status)
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f2f4f6' }}>
                      <span className="pill run"><span className="dot pulse" /> 자동</span>
                      <span style={{ flex: 1, fontSize: 12.5 }}>
                        <b>{p.title || '(제목 없음)'}</b> — 지금: {nn.now} · 다음: {nn.next}
                      </span>
                      <button className="btn g sm" onClick={() => openProject(p.id)}>→</button>
                    </div>
                  )
                })}
              </div>
              <div className="card">
                <h3>정량 4요소 <span className="sub2">근거: 06 — 게시 데이터 수집 후 표시</span></h3>
                <div className="hint" style={{ lineHeight: 1.8 }}>
                  목표: 조회수 <b>1,000</b> · 시청 지속 <b>35% (4분)</b> · 도입부 유지 <b>60% (30초)</b> · 클릭률 <b>10%</b><br />
                  게시된 영상의 성과가 자동 수집되면 이 자리에 실측이 표시되고, 미달 지표는 <b>지표 진단 · 처방</b>으로 연결됩니다.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ 파이프라인 (라이브) ═══ */}
        {view === 'pipe' && (
          <div className="view on">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span className="hint">카드를 누르면 상세 · 실데이터 {projects.length}건 · 색: 초록=완료 · 청록=자동 · 주황=사장님 차례</span>
            </div>
            <div className="kanban">
              {PHASE6.map((ph, pi) => (
                <div className="kcol" key={ph.key}>
                  <div className="kh"><span className="t">{ph.label}</span><span className="n">{byPhase[pi].length}</span></div>
                  {byPhase[pi].length === 0 && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '14px 0' }}>비어 있음</div>}
                  {byPhase[pi].map(p => {
                    const nn = nowNext(p.status)
                    const gated = isGate(p.status)
                    return (
                      <div className={`pc ${gated ? 'gated' : ''}`} key={p.id} onClick={() => openProject(p.id)}>
                        <div className="r1">
                          {gated
                            ? <span className="pill gate">승인 대기</span>
                            : p.status === 'completed'
                              ? <span className="pill ok">게시됨</span>
                              : <span className="pill run"><span className="dot pulse" /> 자동</span>}
                          <span className="id">{p.id.slice(0, 8)}</span>
                        </div>
                        <div className="tt">{p.title || '(제목 없음)'}</div>
                        <div className="ph">
                          {PHASE6.map((_, i) => (
                            <i key={i} className={i < pi ? 'd' : i === pi ? (gated ? 'g' : 'n') : ''} />
                          ))}
                        </div>
                        <div className="now">
                          지금: {nn.now}
                          <span className={`who ${gated ? 'me' : 'ai'}`}>{nn.who}</span>
                        </div>
                        <div className="nxt">다음: {nn.next}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ 승인 센터 (라이브 · FR-6) ═══ */}
        {view === 'approve' && (
          <div className="view on">
            <ApprovalCenter projects={projects} reload={loadProjects} toast={showToast} />
          </div>
        )}

        {/* ═══ 뷰트랩 리서치 후보 판정 (라이브 · FR-2) ═══ */}
        {view === 'research' && (
          <div className="view on">
            <ResearchBoard projects={projects} onOpenProject={openProject} toast={showToast} />
          </div>
        )}

        {/* ═══ 산출물 보드 (라이브 · FR-1 식별 헤더 + 콘텐츠 필터) ═══ */}
        {view === 'bench' && (
          <div className="view on">
            <ArtifactBoard stages={['research_judgments', 'key_content_viewtrap', 'key_content_plan_doc', 'pulling_plan_doc']} projects={projects} onOpenProject={openProject} emptyHint="수집·판정 기록이 아직 없습니다." />
          </div>
        )}
        {view === 'title' && (
          <div className="view on">
            <ArtifactBoard stages={['title_development']} projects={projects} onOpenProject={openProject} emptyHint="제목 디벨롭 산출물이 아직 없습니다 — 훅 단계에서 생성됩니다." />
          </div>
        )}
        {view === 'thumb' && (
          <div className="view on">
            <ArtifactBoard stages={['thumbnail_plan', 'thumbnail_choice', 'image_sources']} projects={projects} onOpenProject={openProject} emptyHint="썸네일 산출물이 아직 없습니다." />
          </div>
        )}
        {view === 'script' && (
          <div className="view on">
            <ArtifactBoard stages={['script_draft', 'hook_alignment']} projects={projects} onOpenProject={openProject} emptyHint="원고 산출물이 아직 없습니다." />
          </div>
        )}
        {view === 'upload' && (
          <div className="view on">
            <ArtifactBoard stages={['upload_draft']} projects={projects} onOpenProject={openProject} emptyHint="업로드 초안이 아직 없습니다." />
          </div>
        )}
        {view === 'jobs' && (
          <div className="view on">
            <ArtifactBoard stages={[]} projects={projects} onOpenProject={openProject} emptyHint="산출물이 아직 없습니다." />
          </div>
        )}
        {view === 'render' && (
          <div className="view on">
            <ArtifactBoard stages={['slide_deck', 'rendering', 'qa']} projects={projects} onOpenProject={openProject} emptyHint="렌더 잡이 아직 없습니다." />
          </div>
        )}

        {/* ═══ 정적 뷰 (v4 시연 화면) ═══ */}
        {!LIVE_VIEWS.has(view) && STATIC_VIEWS[view] && (
          <div className="view on">
            <div style={{ background: 'var(--gate-soft)', border: '1px solid #f0dcae', borderRadius: 10, padding: '8px 13px', fontSize: 11.5, fontWeight: 700, color: '#96690a', marginBottom: 12 }}>
              시연 화면 — 이 뷰의 실데이터 배선은 다음 단계(P3)입니다. 구성·기준은 지식베이스 정합 완료.
            </div>
            <div dangerouslySetInnerHTML={{ __html: STATIC_VIEWS[view] }} />
          </div>
        )}

        {!ready && <div className="hint" style={{ marginTop: 20 }}>백엔드 연결 중…</div>}
      </div>

      {/* ═══ 프로젝트 상세 슬라이드오버 (라이브) ═══ */}
      <div className={`mask ${soOpen ? 'on' : ''}`} onClick={() => setSoOpen(false)} />
      <div className={`so ${soOpen ? 'on' : ''}`}>
        {detail?.project ? (() => {
          const p = detail.project
          const nn = nowNext(p.status)
          const gated = isGate(p.status)
          const curIdx = statusOrder(p.status)
          const cards = (detail.cards ?? []) as Array<Record<string, unknown>>
          // FR-1: 식별 헤더 — 확정 키 주제를 상세 헤더에 상시 표시.
          const keyChoiceCard = cards.filter(c => String(c.stage) === 'key_content_choice').slice(-1)[0]
          const keyTopic = keyChoiceCard ? String(((keyChoiceCard.data ?? {}) as Record<string, unknown>).key_topic_title ?? '') : ''
          return (
            <>
              <div className="sh2">
                <button className="x" onClick={() => setSoOpen(false)}>✕</button>
                <div className="st1">
                  {p.title || '(제목 없음)'}
                  <span className={`pill ${gated ? 'gate' : p.status === 'completed' ? 'ok' : 'run'}`}>{label(p.status)}</span>
                </div>
                <div className="st2">
                  {keyTopic && <span style={{ color: '#2f6f4f', fontWeight: 700 }}>🔑 {keyTopic} · </span>}
                  {p.id} · {PHASE6[phaseIndexOf(p.status)]?.label} · 담당: <b>{nn.who}</b> · 다음: {nn.next}
                </div>
                <div style={{ display: 'flex', gap: 8, padding: '12px 0' }}>
                  {gated && (
                    <button className="btn p" disabled={busy === p.id} onClick={() => doApprove(p)}>
                      {busy === p.id ? '처리 중…' : `✓ ${label(p.status)} — 승인하고 다음으로`}
                    </button>
                  )}
                  {!gated && p.status !== 'completed' && (
                    <button className="btn g" disabled={busy === p.id} onClick={() => doAdvance(p)}>
                      {busy === p.id ? '처리 중…' : '다음 단계로 (수동 전진)'}
                    </button>
                  )}
                </div>
              </div>
              <div className="sb">
                <div className="grid" style={{ gridTemplateColumns: '0.9fr 1.1fr' }}>
                  <div className="card">
                    <h3>여정 지도 — 한국어 전체 단계</h3>
                    <div className="smv">
                      {PHASE6.map(ph => (
                        <div key={ph.key}>
                          <div className="grp2">{ph.label}</div>
                          {ph.statuses.map(s => {
                            const i = statusOrder(s)
                            const cls = i < curIdx ? 'done' : i === curIdx ? (isGate(s) ? 'gate' : 'now') : 'wait'
                            return (
                              <div key={s} className={`rw ${cls}`}>
                                <span className="ic">{i < curIdx ? '✓' : i === curIdx ? (isGate(s) ? '⏸' : '▶') : '·'}</span>
                                {label(s)}
                                {i === curIdx && <span className="tag" style={{ background: isGate(s) ? 'var(--gate)' : 'var(--accent)', color: '#fff' }}>지금 여기</span>}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card">
                    {/* FR-3: 지금 진행 중인 과정 타임라인 — 완료 → 현재(실작업 서술) → 다음 */}
                    <h3>지금 진행 중인 과정</h3>
                    <div style={{ fontSize: 12.5, lineHeight: 1.8, marginBottom: 10 }}>
                      <div>✓ 완료: <b>{Math.max(0, curIdx)}단계</b> / {ORDERED.length}단계</div>
                      <div>{gated ? '⏸' : '▶'} 지금: <b>{nn.now}</b> — {(() => {
                        const latest = cards.slice(-1)[0]
                        return latest ? `최근 산출물 "${cardName(String(latest.stage ?? ''))}" ${timeAgo(latest.createdAt as string)}` : '산출물 생성 대기'
                      })()}</div>
                      <div>· 다음: {nn.next} <span className={`who ${gated ? 'me' : 'ai'}`} style={{ marginLeft: 4 }}>{nn.who}</span></div>
                    </div>
                    <h3>산출물 카드 <span className="sub2">{cards.length}건 · 최신순 · 한국어 요약(원본 JSON은 접힘)</span></h3>
                    {cards.length === 0 && <div className="hint">아직 산출물이 없습니다.</div>}
                    {cards.slice().reverse().slice(0, 12).map((c, i) => {
                      const stage = String(c.stage ?? c.card_type ?? 'card')
                      const korean = renderCardKorean(stage, c.data ?? c.content)
                      return (
                        <div key={i} style={{ borderBottom: '1px solid #f2f4f6', padding: '7px 0' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                            {cardName(stage)} <span className="hint" style={{ fontWeight: 500 }}>{timeAgo(c.createdAt as string)}</span>
                          </div>
                          {korean}
                          <details>
                            <summary style={{ fontSize: 10.5, color: 'var(--muted, #7a8494)', cursor: 'pointer' }}>원본 JSON (디버그)</summary>
                            <pre style={{ fontSize: 10.5, background: '#f7f8fa', borderRadius: 8, padding: 10, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto' }}>
                              {JSON.stringify(c.data ?? c.content ?? c, null, 2).slice(0, 4000)}
                            </pre>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )
        })() : (
          <div style={{ padding: 40 }} className="hint">{soOpen ? '불러오는 중…' : ''}</div>
        )}
      </div>

      <div className={`toast ${toast ? 'on' : ''}`}>{toast}</div>
    </div>
  )
}
