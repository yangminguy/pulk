'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { CmoCard } from '../_lib/types'

type Scene = { scene_id: string; role: string; start_sec: number; end_sec: number; assertion: string; asset_status: string }
type StoryboardEnvelope = { run_id: string; version: number; data?: { html?: string; manifest?: { coverage?: number; scenes?: Scene[] } } }
type RunStatus = { current_skill?: string | null; progress?: number; blocker?: string | null; skill_states?: Record<string, string> }

export default function VideoProductionUpgradePanel({ projectId, currentStatus, cards, onRefresh }: {
  projectId: string
  currentStatus: string
  cards: CmoCard[]
  onRefresh: () => void
}) {
  const storyboard = useMemo(() => {
    const card = [...cards].reverse().find(item => item.stage === 'storyboard')
    return (card?.data ?? null) as StoryboardEnvelope | null
  }, [cards])
  const pilotQa = useMemo(() => [...cards].reverse().find(item => item.stage === 'pilot_qa')?.data as any, [cards])
  const scenes = storyboard?.data?.manifest?.scenes ?? []
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [feedbackScope, setFeedbackScope] = useState<'scene' | 'project' | 'global'>('scene')
  const [sceneDecisions, setSceneDecisions] = useState<Record<string, 'approved' | 'needs_revision' | 'hold'>>({})
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  const revisionRoute = useMemo(() => {
    if (/(자막|caption|줄바꿈)/i.test(note)) return 'video-caption-designer → storyboard-composer'
    if (/(음악|효과음|sound|소리)/i.test(note)) return 'video-sound-designer → storyboard-composer'
    if (/(모션|전환|animation|motion)/i.test(note)) return 'video-motion-graphics → storyboard-composer'
    if (/(이미지|영상|자산|asset|b-roll)/i.test(note)) return 'video-asset-director → storyboard-composer'
    if (/(원고|의미|주장|구조)/i.test(note)) return 'video-scene-planner → video-slide-worker → storyboard-composer'
    return 'video-slide-worker → storyboard-composer'
  }, [note])

  useEffect(() => {
    if (!storyboard?.run_id) return
    let cancelled = false
    void api.cmoGetVideoProductionStatus(projectId, storyboard.run_id)
      .then(result => { if (!cancelled) setRunStatus((result.run ?? null) as RunStatus | null) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [projectId, storyboard?.run_id, cards])

  useEffect(() => {
    if (!pendingRunId) return
    let cancelled = false
    const poll = async () => {
      try {
        const result = await api.cmoGetVideoProductionStatus(projectId, pendingRunId)
        if (cancelled) return
        const run = (result.run ?? null) as (RunStatus & { status?: string }) | null
        setRunStatus(run)
        if (run?.status === 'storyboard_review' || run?.status === 'blocked' || run?.status === 'failed') {
          setPendingRunId(null)
          onRefresh()
        }
      } catch { /* the next poll retries transient API failures */ }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 1500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [pendingRunId, projectId, onRefresh])

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); onRefresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.') }
    finally { setBusy(null) }
  }

  return (
    <div style={{ border: '1px solid var(--silver-2)', borderRadius: 8, background: 'var(--paper-surface)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>영상 제작 스킬 · Storyboard · Pilot</span>
        {storyboard && <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>run {storyboard.run_id?.slice(0, 8)} · v{storyboard.version}</span>}
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ color: 'var(--red)', background: 'var(--red-tint)', padding: 8, borderRadius: 4, fontSize: 12 }}>{error}</div>}

        {!storyboard && (
          <div>
            <p style={{ margin: '0 0 10px', color: 'var(--ink-3)', fontSize: 13 }}>등록한 원본 영상과 승인 원고로 01~08 제작 계획과 애니메이션 Storyboard를 만듭니다.</p>
            {runStatus && <p style={{ margin: '0 0 8px', fontSize: 12, color: runStatus.blocker ? 'var(--red)' : 'var(--ink-3)' }}>현재 스킬: {runStatus.current_skill ?? '완료 정리'} · {runStatus.progress ?? 0}%{runStatus.blocker ? ` · ${runStatus.blocker}` : ''}</p>}
            <button className="j-btn j-btn-primary j-btn-sm" disabled={busy !== null || currentStatus !== 'slide_deck' || pendingRunId !== null} onClick={() => act('planning', async () => { const result = await api.cmoStartVideoPlanning(projectId); setPendingRunId(result.run_id) })}>
              {busy === 'planning' ? '제작 스킬 실행 중...' : '영상 제작 계획 시작'}
            </button>
          </div>
        )}

        {storyboard && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="j-badge">장면 {scenes.length}개</span>
              <span className="j-badge">원고 커버리지 {Math.round((storyboard.data?.manifest?.coverage ?? 0) * 100)}%</span>
              <span className="j-badge">상태 {currentStatus}</span>
            </div>
            {runStatus && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) minmax(180px,2fr)', gap: 8, fontSize: 12, color: 'var(--ink-3)' }}>
                <span>현재 스킬: {runStatus.current_skill ?? '승인 대기'} · {runStatus.progress ?? 0}%</span>
                <span>{runStatus.blocker ? `Blocker: ${runStatus.blocker}` : Object.entries(runStatus.skill_states ?? {}).map(([skill, status]) => `${skill} ${status}`).join(' · ')}</span>
              </div>
            )}
            <iframe
              title="Animated storyboard review"
              sandbox="allow-scripts"
              srcDoc={storyboard.data?.html ?? ''}
              style={{ width: '100%', minHeight: 640, border: '1px solid var(--silver-2)', borderRadius: 6, background: '#090909' }}
            />
          </>
        )}

        {storyboard && currentStatus === 'storyboard_approval' && (
          <div style={{ borderTop: '1px solid var(--silver-1)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>장면별 결정</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {scenes.map(scene => (
                <div key={scene.scene_id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, alignItems: 'center', padding: 8, border: '1px solid var(--silver-1)', borderRadius: 5 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{scene.scene_id}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{scene.assertion}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['approved', 'needs_revision', 'hold'] as const).map(decision => (
                      <button key={decision} className={`j-btn j-btn-sm ${sceneDecisions[scene.scene_id] === decision ? 'j-btn-primary' : 'j-btn-secondary'}`} onClick={() => setSceneDecisions(prev => ({ ...prev, [scene.scene_id]: decision }))}>
                        {decision === 'approved' ? '승인' : decision === 'needs_revision' ? '수정' : '보류'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <textarea className="j-input" value={note} onChange={e => setNote(e.target.value)} placeholder="수정 또는 승인 메모" style={{ marginTop: 10, minHeight: 72, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--ink-3)' }}>적용 범위</label>
              <select className="j-input" value={feedbackScope} onChange={e => setFeedbackScope(e.target.value as 'scene' | 'project' | 'global')} style={{ width: 180 }}>
                <option value="scene">이번 장면</option>
                <option value="project">이번 프로젝트</option>
                <option value="global">전역 제작 규칙</option>
              </select>
              {note.trim() && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>재실행: {revisionRoute}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="j-btn j-btn-primary j-btn-sm" disabled={busy !== null || Object.values(sceneDecisions).some(v => v !== 'approved')} onClick={() => act('storyboard-approve', () => api.cmoDecideStoryboard({ project_id: projectId, run_id: storyboard.run_id, decision: 'approved', note, scene_decisions: Object.entries(sceneDecisions).map(([scene_id, decision]) => ({ scene_id, decision, note, scope: feedbackScope })) }))}>
                {busy === 'storyboard-approve' ? '승인 중...' : 'Storyboard 전체 승인'}
              </button>
              <button className="j-btn j-btn-secondary j-btn-sm" disabled={busy !== null || !note.trim()} onClick={() => act('storyboard-revise', () => api.cmoDecideStoryboard({ project_id: projectId, run_id: storyboard.run_id, decision: 'needs_revision', note, scene_decisions: Object.entries(sceneDecisions).map(([scene_id, decision]) => ({ scene_id, decision, note, scope: feedbackScope })) }))}>
                수정 요청
              </button>
            </div>
          </div>
        )}

        {storyboard && currentStatus === 'pilot_rendering' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="j-btn j-btn-primary j-btn-sm" disabled={busy !== null} onClick={() => act('pilot', () => api.cmoSubmitPilot(projectId, storyboard.run_id))}>{busy === 'pilot' ? '파일럿 준비 중...' : '파일럿 렌더 시작'}</button>
            <button className="j-btn j-btn-secondary j-btn-sm" disabled={busy !== null} onClick={() => act('pilot-status', () => api.cmoGetPilotStatus(projectId, storyboard.run_id))}>파일럿 상태 확인</button>
          </div>
        )}

        {storyboard && currentStatus === 'pilot_approval' && (
          <div style={{ borderTop: '1px solid var(--silver-1)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 }}>Pilot QA: {pilotQa?.data?.verdict ?? '확인 필요'} · 가로 프레이밍, 립싱크, 자막, 그래픽, 전환을 확인하세요.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="j-btn j-btn-primary j-btn-sm" disabled={busy !== null || pilotQa?.data?.verdict !== 'PASS'} onClick={() => act('pilot-approve', () => api.cmoDecidePilot(projectId, storyboard.run_id, 'approved'))}>파일럿 승인</button>
              <button className="j-btn j-btn-secondary j-btn-sm" disabled={busy !== null || !note.trim()} onClick={() => act('pilot-revise', () => api.cmoDecidePilot(projectId, storyboard.run_id, 'needs_revision', note))}>수정 요청</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
