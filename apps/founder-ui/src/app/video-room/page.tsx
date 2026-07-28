'use client'
import { useState, useEffect, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'
import type { ProjectDetail } from './_lib/types'
import VideoRoomHeader from './_components/VideoRoomHeader'
import DecisionPanel from './_components/DecisionPanel'
import CmoChatPanel from './_components/CmoChatPanel'
import StrategyBoard from './_components/StrategyBoard'
import ProductionBoard, { ProductionActionPanel } from './_components/ProductionBoard'
import ReviewPublishBoard, { ReviewApprovalPanel } from './_components/ReviewPublishBoard'
import ProjectSelector from './_components/ProjectSelector'
import StepProgressRail from './_components/StepProgressRail'

// ── Main VideoRoom Content ────────────────────────────────────────────────────
function VideoRoomContent() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activePage, setActivePage] = useState<'strategy' | 'production' | 'review_publish'>('strategy')
  const [deciding, setDeciding] = useState<string | null>(null)
  // 승인중심 전환: 챗은 보조 → 기본 접힘. 메인은 좌 레일 + 중 카드 + 승인.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tigerBusy, setTigerBusy] = useState(false)

  const loadDetail = useCallback(async (id: string, initPage?: boolean) => {
    setLoadingDetail(true)
    try {
      const res = await api.cmoGetProject(id) as ProjectDetail
      setDetail(res)
      if (initPage) {
        setActivePage(res.project?.current_page ?? 'strategy')
      }
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

  // 호랑이 회고 루프 토글 — ON이면 파이프라인 완료 시 오류/병목 회고 → CTO 개선 제안.
  const handleToggleTiger = async (next: boolean) => {
    if (!projectId) return
    setTigerBusy(true)
    try {
      await api.cmoSetTigerEnabled(projectId, next)
      await loadDetail(projectId)
    } catch {
      // ignore — 다음 로드에서 실제 상태로 복원
    } finally {
      setTigerBusy(false)
    }
  }

  // 새 보드 흐름은 승인 게이트 row를 만들지 않으므로, 게이트 상태에서 pending gate가 없을 때
  // 사장님이 직접 단계를 승인하고 다음으로 진행한다(approveStageGate).
  const handleApproveStage = async () => {
    if (!projectId) return
    setDeciding('stage')
    try {
      await api.cmoApproveStageGate(projectId)
      await loadDetail(projectId)
    } catch {
      // ignore
    } finally {
      setDeciding(null)
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
  const CUSTOM_PRODUCTION_GATES = ['storyboard_approval', 'pilot_approval']
  const pendingGates = gates.filter(g => g.status === 'pending' && !CUSTOM_PRODUCTION_GATES.includes(g.gate_type))
  // 승인 게이트 상태(GATE_BY_STATUS) — 새 보드 흐름은 여기서 pending gate가 없으므로
  // approveStageGate 버튼으로 통과한다.
  const APPROVAL_GATE_STATES = ['key_content_approval', 'pulling_content_set_approval', 'hook_draft_approval', 'script_approval', 'video_qa_approval', 'upload_approval']
  const needsStageApproval = pendingGates.length === 0 && APPROVAL_GATE_STATES.includes(project.status)
  const strategyGates = gates.filter(g => g.page === 'strategy' || (!g.page && !['script_approval', 'video_qa_approval', 'upload_approval'].includes(g.gate_type)))
  const productionGates = gates.filter(g => g.page === 'production' || g.gate_type === 'script_approval')
  const reviewGates = gates.filter(g => g.page === 'review_publish' || g.gate_type === 'video_qa_approval' || g.gate_type === 'upload_approval')

  // Board for the currently viewed page.
  const board =
    activePage === 'strategy'
      ? <StrategyBoard cards={cards} projectId={projectId} currentStatus={project.status} product={project.product} onRefresh={() => loadDetail(projectId)} />
      : activePage === 'production'
        ? <ProductionBoard cards={cards} projectId={projectId} currentStatus={project.status} onRefresh={() => loadDetail(projectId)} />
        : <ReviewPublishBoard cards={cards} projectId={projectId} currentStatus={project.status} onRefresh={() => loadDetail(projectId)} />

  // Decision/approval panel for the currently viewed page.
  const actionPanel =
    activePage === 'strategy'
      ? <DecisionPanel gates={strategyGates} onDecide={handleDecide} deciding={deciding} />
      : activePage === 'production'
        ? <ProductionActionPanel gates={gates} onDecide={handleDecide} deciding={deciding} />
        : <ReviewApprovalPanel gates={gates} onDecide={handleDecide} deciding={deciding} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <VideoRoomHeader
        project={project}
        gates={gates}
        tigerBusy={tigerBusy}
        onToggleTiger={handleToggleTiger}
      />

      {/* Body: left rail + main board + right drawer */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Step Progress Rail (~260px) */}
        <StepProgressRail
          currentStatus={project.status}
          onNavigate={setActivePage}
        />

        {/* Main: approval panel (always visible) + the active board */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px' }}>
          {pendingGates.length > 0 && (
            <div style={{
              marginBottom: 16,
              padding: 14,
              border: '1px solid var(--silver-2)',
              borderRadius: 8,
              background: 'var(--bg-surface)',
            }}>
              {actionPanel}
            </div>
          )}
          {needsStageApproval && (
            <div style={{
              marginBottom: 16,
              padding: 14,
              border: '1px solid var(--silver-2)',
              borderLeft: '4px solid var(--green)',
              borderRadius: 8,
              background: 'var(--bg-surface)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>이 단계 승인 대기</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                  초안을 확인하셨으면 승인하고 다음 단계로 진행합니다.
                </div>
              </div>
              <button
                className="j-btn j-btn-primary j-btn-sm"
                onClick={handleApproveStage}
                disabled={deciding === 'stage'}
              >
                {deciding === 'stage' ? '진행 중...' : '이 단계 승인하고 진행'}
              </button>
            </div>
          )}
          {board}
        </div>

        {/* Right drawer: CMO chat only (보조). 승인은 메인에. */}
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
              <span className="j-overline">CMO 챗 (보조)</span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16, lineHeight: 1, padding: 4 }}
                title="패널 접기"
              >
                ›
              </button>
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
            title="CMO 챗 열기"
          >
            <span style={{ fontSize: 16, color: 'var(--ink-3)' }}>‹</span>
            <span style={{ writingMode: 'vertical-rl', fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.05em' }}>
              CMO 챗
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
