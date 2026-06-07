'use client'
import { useState, useEffect, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'
import type { ProjectDetail } from './_lib/types'
import PhaseTimeline from './_components/PhaseTimeline'
import VideoRoomHeader from './_components/VideoRoomHeader'
import DecisionPanel from './_components/DecisionPanel'
import CmoChatPanel from './_components/CmoChatPanel'
import StrategyBoard from './_components/StrategyBoard'
import ProductionBoard, { ProductionActionPanel } from './_components/ProductionBoard'
import ReviewPublishBoard, { ReviewApprovalPanel } from './_components/ReviewPublishBoard'
import ProjectSelector from './_components/ProjectSelector'

// ── Main VideoRoom Content ────────────────────────────────────────────────────
function VideoRoomContent() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activePage, setActivePage] = useState<'strategy' | 'production' | 'review_publish'>('strategy')
  const [deciding, setDeciding] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [readyToAdvance, setReadyToAdvance] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)

  const loadDetail = useCallback(async (id: string, initPage?: boolean) => {
    setLoadingDetail(true)
    try {
      const res = await api.cmoGetProject(id) as ProjectDetail
      setDetail(res)
      if (initPage) {
        setActivePage(res.project?.current_page ?? 'strategy')
      }
      // check if last message has ready_to_advance
      const msgs = res.messages ?? []
      const lastCmo = [...msgs].reverse().find(m => m.role === 'cmo')
      setReadyToAdvance(lastCmo?.ready_to_advance ?? false)
    } catch {
      setDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) {
      loadDetail(projectId, true)
    }
  }, [projectId, loadDetail])

  const handleDecide = async (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected') => {
    if (!projectId) return
    setDeciding(gateId)
    try {
      await api.cmoDecideGate(gateId, decision)
      await loadDetail(projectId)
    } catch {
      // ignore
    } finally {
      setDeciding(null)
    }
  }

  const handleAdvance = async () => {
    if (!projectId) return
    setAdvancing(true)
    try {
      await api.cmoAdvanceStatus(projectId)
      await loadDetail(projectId)
    } catch {
      // ignore
    } finally {
      setAdvancing(false)
    }
  }

  if (!projectId) {
    return <ProjectSelector onSelect={id => setProjectId(id)} />
  }

  if (loadingDetail && !detail) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--ink-4)', fontSize: 14 }}>
        로딩 중...
      </div>
    )
  }

  if (!detail) {
    return (
      <div style={{ padding: 24, color: 'var(--red)', fontSize: 14 }}>
        프로젝트를 불러오지 못했습니다.
        <button onClick={() => loadDetail(projectId)} className="j-btn j-btn-secondary j-btn-sm" style={{ marginLeft: 12 }}>
          재시도
        </button>
      </div>
    )
  }

  const { project, cards, gates, messages } = detail
  const pendingGates = gates.filter(g => g.status === 'pending')
  const strategyGates = gates.filter(g => g.page === 'strategy' || (!g.page && !['script_approval', 'video_qa_approval', 'upload_approval'].includes(g.gate_type)))
  const productionGates = gates.filter(g => g.page === 'production' || g.gate_type === 'script_approval')
  const reviewGates = gates.filter(g => g.page === 'review_publish' || g.gate_type === 'video_qa_approval' || g.gate_type === 'upload_approval')

  const pendingByPage: Record<string, number> = {
    strategy: strategyGates.filter(g => g.status === 'pending').length,
    production: productionGates.filter(g => g.status === 'pending').length,
    review_publish: reviewGates.filter(g => g.status === 'pending').length,
  }

  // Board for the currently viewed page.
  const board =
    activePage === 'strategy'
      ? <StrategyBoard cards={cards} projectId={projectId} currentStatus={project.status} onRefresh={() => loadDetail(projectId)} />
      : activePage === 'production'
        ? <ProductionBoard cards={cards} projectId={projectId} currentStatus={project.status} onRefresh={() => loadDetail(projectId)} />
        : <ReviewPublishBoard cards={cards} projectId={projectId} currentStatus={project.status} onRefresh={() => loadDetail(projectId)} />

  // Decision/approval panel for the currently viewed page.
  const actionPanel =
    activePage === 'strategy'
      ? <DecisionPanel gates={strategyGates} readyToAdvance={readyToAdvance && pendingGates.length === 0} onDecide={handleDecide} onAdvance={handleAdvance} deciding={deciding} advancing={advancing} />
      : activePage === 'production'
        ? <ProductionActionPanel gates={gates} readyToAdvance={readyToAdvance} onDecide={handleDecide} onAdvance={handleAdvance} deciding={deciding} advancing={advancing} />
        : <ReviewApprovalPanel gates={gates} readyToAdvance={readyToAdvance} onDecide={handleDecide} onAdvance={handleAdvance} deciding={deciding} advancing={advancing} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <VideoRoomHeader project={project} gates={gates} />

      {/* Phase Timeline (5-phase navigation) */}
      <div style={{ borderBottom: '1px solid var(--silver-2)', background: 'var(--bg-surface)' }}>
        <PhaseTimeline
          currentStatus={project.status}
          activePage={activePage}
          pendingByPage={pendingByPage}
          onSelectPage={setActivePage}
        />
      </div>

      {/* Body: focused board + collapsible right drawer */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main: the active board, full width */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
          {board}
        </div>

        {/* Right drawer: CMO chat + approvals, collapsible */}
        {drawerOpen ? (
          <div style={{
            width: 360,
            flexShrink: 0,
            borderLeft: '1px solid var(--silver-2)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '1px solid var(--silver-1)',
            }}>
              <span className="j-overline">CMO · 승인</span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16, lineHeight: 1, padding: 4 }}
                title="패널 접기"
              >
                ›
              </button>
            </div>
            {/* Approvals first (actionable), then chat */}
            <div style={{ flexShrink: 0, maxHeight: '45%', overflowY: 'auto', padding: 14, borderBottom: '1px solid var(--silver-1)' }}>
              {actionPanel}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <CmoChatPanel
                projectId={projectId}
                initialMessages={messages}
                onRefresh={() => loadDetail(projectId)}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              width: 44, flexShrink: 0,
              borderLeft: '1px solid var(--silver-2)',
              background: 'var(--bg-surface)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '14px 0',
            }}
            title="CMO 챗 · 승인 열기"
          >
            <span style={{ fontSize: 16, color: 'var(--ink-3)' }}>‹</span>
            {pendingGates.length > 0 && (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--pi-rose)', color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {pendingGates.length}
              </span>
            )}
            <span style={{ writingMode: 'vertical-rl', fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.05em' }}>
              CMO · 승인
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

export default function VideoRoomPage() {
  return <AuthGate><VideoRoomContent /></AuthGate>
}
