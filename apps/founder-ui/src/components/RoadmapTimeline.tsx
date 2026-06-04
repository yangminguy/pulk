'use client'
import { useEffect, useState, useCallback } from 'react'
import AgentBadge from '@/components/AgentBadge'
import { api, ProjectRoadmapEventItem, TaskItem } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'
import { useInboxNav, type InboxTaskRef } from '@/lib/inbox-nav'

// ── BPR phases (unchanged) ────────────────────────────────────────────────────
const BPR_PHASES = [
  { id: 'direction_alignment',    name: '방향 정렬',    label: 'Direction'   },
  { id: 'pmf_diagnosis',          name: 'PMF 진단',     label: 'PMF'         },
  { id: 'execution_build',        name: '실행 빌드',    label: 'Build'       },
  { id: 'sales_distribution_test',name: '세일즈 테스트', label: 'Sales'       },
  { id: 'productization_review',  name: '제품화 검토',  label: 'Productize'  },
  { id: 'scale_automation',       name: '스케일/자동화', label: 'Scale'       },
]

// ── Status badge tones ────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  queued:       { bg: 'var(--silver-1)',   fg: 'var(--ink-2)',       dot: 'var(--silver-4)', label: '대기 중'  },
  running:      { bg: 'var(--green-tint)', fg: 'var(--green-press)', dot: 'var(--green)',    label: '실행 중'  },
  blocked:      { bg: 'var(--red-tint)',   fg: '#8C2A1F',            dot: 'var(--red)',      label: '차단됨'   },
  needs_review: { bg: 'var(--amber-tint)', fg: '#8A5408',            dot: 'var(--amber)',    label: '검토 중'  },
  done:         { bg: 'var(--green-tint)', fg: 'var(--green-press)', dot: 'var(--green)',    label: '완료됨'   },
  killed:       { bg: 'var(--silver-1)',   fg: 'var(--ink-3)',       dot: 'var(--silver-3)', label: '취소됨'   },
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconRefresh({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function IconCheck({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconMap({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE['queued']!
  const pulsing = status === 'running' || status === 'needs_review'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      background: s.bg, color: s.fg,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: 999, background: s.dot,
        animation: pulsing ? 'j-pulse 1.8s ease-in-out infinite' : undefined,
      }} />
      {s.label}
    </span>
  )
}

// ── Upper task card (archived / completed) ────────────────────────────────────
function UpperCard({ title, agent, status, completedAt, summary, onClick }: {
  title: string
  agent: string
  status: string
  completedAt: string
  summary: string
  onClick?: () => void
}) {
  return (
    <div
    onClick={onClick}
    style={{
      width: '100%',
      background: 'var(--paper-elevated)',
      border: '1px solid var(--silver-2)',
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 5,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 120ms, box-shadow 120ms',
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLDivElement
      el.style.borderColor = 'var(--silver-3)'
      el.style.boxShadow = 'var(--shadow-2)'
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLDivElement
      el.style.borderColor = 'var(--silver-2)'
      el.style.boxShadow = 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <AgentBadge agent={agent} variant="chip" />
        <StatusBadge status={status} />
      </div>
      <div style={{
        fontFamily: 'var(--font-sans)', fontWeight: 600,
        fontSize: 11.5, color: 'var(--ink-1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={title}>
        {title}
      </div>
      {summary && (
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-3)',
          lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          background: 'var(--bg-inset)',
          padding: '5px 7px', borderRadius: 4,
        }}>
          {summary}
        </p>
      )}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ color: 'var(--green-press)', fontSize: 9.5, fontWeight: 600 }}>아카이브</span>
        <span>{new Date(completedAt).toLocaleDateString('ko-KR')}</span>
      </div>
    </div>
  )
}

// ── Lower task card (active / pending) ───────────────────────────────────────
function LowerCard({ task, onClick }: { task: TaskItem; onClick?: () => void }) {
  const isBlocked = task.status === 'blocked'
  const borderColor = isBlocked ? 'var(--red)' : 'var(--silver-2)'

  return (
    <div
    onClick={onClick}
    style={{
      width: '100%',
      background: 'var(--paper-elevated)',
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 5,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 120ms, box-shadow 120ms',
    }}
    onMouseEnter={e => {
      const el = e.currentTarget as HTMLDivElement
      if (!isBlocked) el.style.borderColor = 'var(--silver-3)'
      el.style.boxShadow = 'var(--shadow-2)'
    }}
    onMouseLeave={e => {
      const el = e.currentTarget as HTMLDivElement
      el.style.borderColor = borderColor
      el.style.boxShadow = 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <AgentBadge agent={task.agent} variant="chip" />
        <StatusBadge status={task.status} />
      </div>
      <div style={{
        fontFamily: 'var(--font-sans)', fontWeight: 600,
        fontSize: 11.5, color: 'var(--ink-1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={task.task_title}>
        {task.task_title}
      </div>
      {task.rationale && (
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-3)',
          lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          background: 'var(--bg-inset)',
          padding: '5px 7px', borderRadius: 4,
        }}>
          {task.rationale}
        </p>
      )}
      {isBlocked && task.blocker && (
        <div style={{
          fontSize: 10.5, color: 'var(--red)',
          background: 'var(--red-tint)',
          border: '1px solid var(--red)',
          borderRadius: 4, padding: '5px 7px',
          lineHeight: 1.4,
        }}>
          <strong>차단 원인:</strong> {task.blocker}
        </div>
      )}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
        textAlign: 'right',
      }}>
        업데이트: {new Date(task.updated_at).toLocaleTimeString('ko-KR')}
      </div>
    </div>
  )
}

// ── Phase node ────────────────────────────────────────────────────────────────
function PhaseNode({ phase, isPast, isActive }: {
  phase: typeof BPR_PHASES[number]
  isPast: boolean
  isActive: boolean
}) {
  const nodeBg = isActive
    ? 'var(--green)'
    : isPast
    ? 'var(--green-tint-2)'
    : 'var(--paper-surface)'

  const nodeColor = isActive
    ? '#fff'
    : isPast
    ? 'var(--green-press)'
    : 'var(--ink-4)'

  const nodeBorder = isActive
    ? 'var(--green)'
    : isPast
    ? 'var(--green)'
    : 'var(--silver-3)'

  const ringStyle = isActive
    ? '0 0 0 3px var(--paper-canvas), 0 0 0 5px var(--green)'
    : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 40, height: 40,
        borderRadius: 999,
        background: nodeBg,
        border: `2px solid ${nodeBorder}`,
        color: nodeColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: isPast ? 'var(--font-sans)' : 'var(--font-mono)',
        fontWeight: 700,
        fontSize: isPast ? 14 : 13,
        boxShadow: ringStyle,
        transition: 'all 300ms',
        flexShrink: 0,
        zIndex: 2,
        position: 'relative',
      }}>
        {isPast ? <IconCheck size={14} /> : phase.id === BPR_PHASES[BPR_PHASES.length - 1]?.id ? '6' : String(BPR_PHASES.findIndex(p => p.id === phase.id) + 1)}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-sans)', fontWeight: isActive ? 700 : 500,
          fontSize: 11.5,
          color: isActive ? 'var(--green-press)' : isPast ? 'var(--ink-2)' : 'var(--ink-4)',
        }}>
          {phase.name}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          color: 'var(--ink-4)', marginTop: 2,
          letterSpacing: '0.04em',
        }}>
          {phase.label}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
function taskToRef(t: any): InboxTaskRef {
  return {
    task_id: t.task_id ?? t.id,
    assigned_agent: t.agent ?? t.assigned_agent ?? '',
    title: t.task_title ?? t.title ?? '',
    rationale: t.rationale,
    expected_output: t.expected_output,
    decision: t.decision,
    reasoning: t.reasoning,
    next_action: t.next_action,
    blocker: t.blocker,
    risk_level: t.risk_level,
    status: t.status,
    approval_required: t.approval_required,
    source_instruction: t.source_instruction,
  }
}

export default function RoadmapTimeline() {
  const { selectedProjectId } = useBusiness()
  const { openInboxTask } = useInboxNav()
  const [archivedEvents, setArchivedEvents] = useState<ProjectRoadmapEventItem[]>([])
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPhaseId, setCurrentPhaseId] = useState<string>('direction_alignment')

  const fetchData = useCallback(async () => {
    if (!selectedProjectId) return
    setLoading(true)
    try {
      const [events, tasks, phaseInfo] = await Promise.all([
        api.getProjectRoadmapEvents(selectedProjectId),
        api.getProjectTasks(selectedProjectId),
        api.currentPhase().catch(() => null),
      ])
      setArchivedEvents(events)
      setActiveTasks(tasks)
      if (phaseInfo?.current_phase) {
        setCurrentPhaseId(phaseInfo.current_phase)
      }
    } catch (err) {
      console.error('Failed to fetch roadmap details:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    fetchData()
    // Poll every 10 seconds for real-time roadmap task updates
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [fetchData])

  // ── Empty / loading states ──────────────────────────────────────────────────
  if (!selectedProjectId) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '64px 24px', gap: 12,
        background: 'var(--paper-surface)', border: '1px solid var(--silver-2)', borderRadius: 8,
        textAlign: 'center',
      }}>
        <IconMap size={28} />
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
          프로젝트를 선택하여 로드맵을 확인하세요.
        </p>
      </div>
    )
  }

  if (loading && archivedEvents.length === 0 && activeTasks.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '64px 24px', gap: 12,
        background: 'var(--paper-surface)', border: '1px solid var(--silver-2)', borderRadius: 8,
        textAlign: 'center',
      }}>
        <div style={{
          width: 28, height: 28,
          border: '2px solid var(--silver-2)',
          borderTopColor: 'var(--green)',
          borderRadius: 999,
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
          로드맵 로딩 중...
        </p>
      </div>
    )
  }

  const activePhaseIndex = BPR_PHASES.findIndex(p => p.id === currentPhaseId)
  const progressPct = activePhaseIndex >= 0 ? (activePhaseIndex / (BPR_PHASES.length - 1)) * 100 : 0

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--silver-2)',
        background: 'var(--paper-elevated)',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconMap size={16} />
          <div>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17,
              color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.01em',
            }}>
              프로젝트 로드맵
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--font-sans)' }}>
              완료된 태스크는 1주일 후 삭제되며 위쪽(아카이브)에 요약 보존됩니다
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="j-btn j-btn-secondary j-btn-sm"
          aria-label="로드맵 새로고침"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconRefresh size={13} />
          새로고침
        </button>
      </div>

      {/* Mobile vertical timeline (< lg) */}
      <div className="lg:hidden" style={{ padding: '12px 14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {BPR_PHASES.map((phase, idx) => {
          const isPast = idx < activePhaseIndex
          const isActive = idx === activePhaseIndex
          const archivedItems = archivedEvents.filter(e => e.phase === phase.id)
          const completedActiveTasks = activeTasks.filter(t => t.phase === phase.id && (t.status === 'done' || t.status === 'killed'))
          const lowerItems = activeTasks.filter(t => t.phase === phase.id && t.status !== 'done' && t.status !== 'killed')
          const upperItems = [
            ...archivedItems.map(e => ({ id: e.id, title: e.title, agent: e.assigned_agent, status: e.status, completedAt: e.completed_at, summary: e.output_summary })),
            ...completedActiveTasks.map(t => ({ id: t.task_id, title: t.task_title, agent: t.agent, status: t.status, completedAt: t.updated_at, summary: t.blocker || '완료된 작업' })),
          ].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
          const hasAny = upperItems.length + lowerItems.length > 0
          const nodeBg = isActive ? 'var(--green)' : isPast ? 'var(--green-tint-2)' : 'var(--paper-surface)'
          const nodeColor = isActive ? '#fff' : isPast ? 'var(--green-press)' : 'var(--ink-4)'
          const nodeBorder = isActive ? 'var(--green)' : isPast ? 'var(--green)' : 'var(--silver-3)'
          return (
            <div key={phase.id} style={{ position: 'relative', display: 'flex', gap: 12 }}>
              {/* Rail + node */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: nodeBg, border: `2px solid ${nodeBorder}`, color: nodeColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
                  flexShrink: 0, zIndex: 2,
                }}>
                  {isPast ? <IconCheck size={11} /> : String(idx + 1)}
                </div>
                {idx < BPR_PHASES.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 28, background: isPast ? 'var(--green)' : 'var(--silver-2)', marginTop: 2 }} />
                )}
              </div>
              {/* Phase content */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-sans)', fontWeight: isActive ? 700 : 500, fontSize: 14,
                    color: isActive ? 'var(--green-press)' : isPast ? 'var(--ink-1)' : 'var(--ink-3)',
                  }}>{phase.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>{phase.label}</span>
                  {isActive && <span className="j-badge j-badge-live" style={{ marginLeft: 'auto' }}><span className="j-badge-dot" />진행중</span>}
                </div>
                {!hasAny && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic', padding: '2px 0' }}>작업 없음</div>
                )}
                {upperItems.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: lowerItems.length > 0 ? 8 : 0 }}>
                    {upperItems.map(item => (
                      <UpperCard key={item.id} title={item.title} agent={item.agent} status={item.status} completedAt={item.completedAt} summary={item.summary}
                        onClick={() => openInboxTask({ task_id: item.id, assigned_agent: item.agent, title: item.title, status: item.status, reasoning: item.summary })} />
                    ))}
                  </div>
                )}
                {lowerItems.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lowerItems.map(item => <LowerCard key={item.task_id} task={item} onClick={() => openInboxTask(taskToRef(item))} />)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Horizontal timeline board (desktop ≥ lg) */}
      <div className="hidden lg:block" style={{ overflowX: 'auto', overflowY: 'visible', padding: '0 0 16px' }}>
        <div style={{
          position: 'relative',
          minWidth: 1680,
          display: 'grid',
          gridTemplateColumns: `repeat(${BPR_PHASES.length}, 1fr)`,
          paddingTop: 120,
          paddingBottom: 120,
          paddingLeft: 32,
          paddingRight: 32,
        }}>

          {/* ── Spine track ── */}
          <div style={{
            position: 'absolute',
            left: '7%', right: '7%',
            top: '50%', transform: 'translateY(-50%)',
            height: 2,
            background: 'var(--silver-2)',
            zIndex: 0,
          }}>
            {/* Progress fill */}
            <div style={{
              height: '100%',
              background: 'var(--green)',
              width: `${progressPct}%`,
              transition: 'width 800ms cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>

          {BPR_PHASES.map((phase, idx) => {
            const isPast = idx < activePhaseIndex
            const isActive = idx === activePhaseIndex
            const isFuture = idx > activePhaseIndex

            // Upper items: archived events + completed active tasks
            const archivedItems = archivedEvents.filter(e => e.phase === phase.id)
            const completedActiveTasks = activeTasks.filter(
              t => t.phase === phase.id && (t.status === 'done' || t.status === 'killed')
            )
            const upperItems = [
              ...archivedItems.map(e => ({
                id: e.id,
                title: e.title,
                agent: e.assigned_agent,
                status: e.status,
                completedAt: e.completed_at,
                summary: e.output_summary,
              })),
              ...completedActiveTasks.map(t => ({
                id: t.task_id,
                title: t.task_title,
                agent: t.agent,
                status: t.status,
                completedAt: t.updated_at,
                summary: t.blocker || '완료된 작업',
              })),
            ].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())

            // Lower items: running / pending / blocked
            const lowerItems = activeTasks.filter(
              t => t.phase === phase.id && t.status !== 'done' && t.status !== 'killed'
            )

            return (
              <div
                key={phase.id}
                style={{
                  position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  zIndex: 1,
                }}
              >
                {/* ── Upper branch cards ── */}
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(50% + 28px)',
                  width: 240,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 8,
                  justifyContent: 'flex-end',
                }}>
                  {upperItems.map(item => (
                    <UpperCard
                      key={item.id}
                      title={item.title}
                      agent={item.agent}
                      status={item.status}
                      completedAt={item.completedAt}
                      summary={item.summary}
                      onClick={() => openInboxTask({ task_id: item.id, assigned_agent: item.agent, title: item.title, status: item.status, reasoning: item.summary })}
                    />
                  ))}

                  {/* Vertical connector from cards down to node */}
                  {upperItems.length > 0 && (
                    <div style={{
                      width: 1,
                      height: 24,
                      background: 'var(--silver-3)',
                      marginBottom: -4,
                    }} />
                  )}
                </div>

                {/* ── Phase node (center of spine) ── */}
                <div style={{ marginTop: 'auto', marginBottom: 'auto' }}>
                  <PhaseNode phase={phase} isPast={isPast} isActive={isActive} />
                </div>

                {/* ── Lower branch cards ── */}
                <div style={{
                  position: 'absolute',
                  top: 'calc(50% + 68px)',
                  width: 240,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 8,
                }}>
                  {/* Vertical connector from node down to cards */}
                  {lowerItems.length > 0 && (
                    <div style={{
                      width: 1,
                      height: 24,
                      background: isFuture ? undefined : 'var(--silver-3)',
                      borderLeft: isFuture ? '1px dashed var(--silver-3)' : undefined,
                      marginTop: -4,
                    }} />
                  )}

                  {lowerItems.map(item => (
                    <LowerCard key={item.task_id} task={item} onClick={() => openInboxTask(taskToRef(item))} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes j-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
