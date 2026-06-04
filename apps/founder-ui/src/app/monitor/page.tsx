'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import AgentBadge, { EXECUTIVE_AGENTS } from '@/components/AgentBadge'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'
import { api, type LiveStatusGroup, type LiveStatusAgent, type TaskItem } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'
import { AgentOutputDetail } from '@/components/AgentOutputDetail'

// ---------------------------------------------------------------------------
// Interfaces (unchanged from original)
// ---------------------------------------------------------------------------
interface PhaseInfo {
  current_phase: string
  current_phase_label: string
  next_phase: string | null
  next_phase_label: string | null
  phase_index: number
  total_phases: number
  requires_approval: boolean
}

interface TransitionSummary {
  from_phase_label: string
  to_phase_label: string
  completed_count: number
  blocked_count: number
  needs_review_count: number
  success_criteria_met: Array<{ title: string; outcome: string }>
  outstanding_items: Array<{ title: string; status: string; reason: string }>
  key_learnings: string[]
  next_phase_plan: {
    primary_owners: string[]
    success_criteria: string[]
    expected_outcome: string
  }
  message: string
}

// ---------------------------------------------------------------------------
// Live-status visual map (P2 — Real-time Agent Monitoring)
// ---------------------------------------------------------------------------
type LiveStatus =
  | 'queued' | 'investigating' | 'talking' | 'awaiting_founder'
  | 'awaiting_delegation' | 'under_review' | 'done' | 'blocked'

type LiveMeta = {
  label: string
  emoji: string
  dot: string        // dot color token
  badge: string      // j-badge class for the status pill
  pulse?: boolean     // pulsing dot for live work
}

const LIVE_META: Record<LiveStatus, LiveMeta> = {
  investigating:       { label: '조사 중',    emoji: '🔍', dot: 'var(--green)',    badge: 'j-badge j-badge-live',    pulse: true },
  talking:             { label: '대화 중',    emoji: '💬', dot: 'var(--blue)',     badge: 'j-badge j-badge-ref' },
  awaiting_founder:    { label: '창업자 대기', emoji: '⏳', dot: 'var(--amber)',    badge: 'j-badge j-badge-review' },
  awaiting_delegation: { label: '위임 대기',  emoji: '🤝', dot: 'var(--amber)',    badge: 'j-badge j-badge-review' },
  under_review:        { label: 'CEO 검토',   emoji: '🧠', dot: 'var(--silver-4)', badge: 'j-badge j-badge-neutral' },
  done:                { label: '완료',       emoji: '✓',  dot: 'var(--silver-4)', badge: 'j-badge j-badge-draft' },
  blocked:             { label: '차단됨',     emoji: '⛔', dot: 'var(--red)',      badge: 'j-badge j-badge-blocked' },
  queued:              { label: '대기열',     emoji: '·',  dot: 'var(--silver-4)', badge: 'j-badge j-badge-draft' },
}

function liveMeta(s: string): LiveMeta {
  return LIVE_META[s as LiveStatus] ?? LIVE_META.queued
}

// Status dot — pulses (green) for active investigation, static otherwise.
function StatusDot({ live_status }: { live_status: string }) {
  const m = liveMeta(live_status)
  return (
    <span
      className={m.pulse ? 'monitor-dot-pulse' : undefined}
      style={{
        width: 9, height: 9, borderRadius: 999, flexShrink: 0,
        background: m.dot, display: 'inline-block',
      }}
    />
  )
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// ---------------------------------------------------------------------------
// Phase Transition Panel — redesigned
// ---------------------------------------------------------------------------
function PhaseTransitionPanel() {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [summary, setSummary] = useState<TransitionSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    setLoading(true)
    api.currentPhase().then(setPhase).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const openForm = async () => {
    setShowForm(true)
    if (!phase?.next_phase) return
    setSummaryLoading(true)
    try {
      const s = await api.transitionSummary(phase.current_phase, phase.next_phase)
      setSummary(s as TransitionSummary)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '요약 로딩 실패')
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleRequest = async () => {
    if (!phase?.next_phase || !reason.trim()) return
    setSubmitting(true)
    try {
      await api.requestTransition(phase.current_phase, phase.next_phase, reason)
      showToast('Phase 전환 요청이 승인 대기열에 추가됐습니다 (D5)')
      setShowForm(false)
      setReason('')
      setSummary(null)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 10,
      marginBottom: 28,
      overflow: 'hidden',
    }}>
      {/* Phase hero strip */}
      <div style={{ padding: '20px 24px 18px', borderBottom: showForm ? '1px solid var(--silver-2)' : undefined }}>
        {/* Overline */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
          letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12,
        }}>
          BPR Phase &nbsp;·&nbsp; {phase ? `${phase.phase_index + 1} / ${phase.total_phases}` : '—'}
        </div>

        {/* Current → Next row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Current phase node */}
          <div style={{
            background: 'var(--green-tint)',
            border: '1px solid var(--green-tint-2)',
            borderRadius: 8,
            padding: '8px 16px',
          }}>
            <div style={{
              fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22,
              color: 'var(--green-press)', letterSpacing: '-0.01em', lineHeight: 1.2,
            }}>
              {phase?.current_phase_label ?? '로딩 중'}
            </div>
          </div>

          {/* Arrow */}
          {phase?.next_phase && (
            <>
              <div style={{ color: 'var(--silver-3)', display: 'flex', alignItems: 'center' }}>
                <Icon name="arrowR" size={18} stroke={1.4} />
              </div>
              {/* Next phase node */}
              <div style={{
                background: 'var(--paper-elevated)',
                border: '1px solid var(--silver-2)',
                borderRadius: 8,
                padding: '8px 16px',
              }}>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 20,
                  color: 'var(--ink-3)', letterSpacing: '-0.01em', lineHeight: 1.2,
                }}>
                  {phase?.next_phase_label}
                </div>
              </div>
            </>
          )}

          <div style={{ flex: 1 }} />

          {/* Transition CTA */}
          {phase?.next_phase && (
            <button
              onClick={() => (showForm ? setShowForm(false) : openForm())}
              className="j-btn j-btn-secondary j-btn-sm"
              style={{ gap: 6 }}
            >
              {showForm
                ? <><Icon name="x" size={13} /> 닫기</>
                : <><span>다음 Phase 전환</span><Icon name="arrowR" size={13} /></>
              }
            </button>
          )}
        </div>

        {/* Progress bar */}
        {phase && (
          <div style={{ display: 'flex', gap: 5, marginTop: 16 }}>
            {Array.from({ length: phase.total_phases }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4, flex: 1, borderRadius: 999,
                  background: i <= phase.phase_index ? 'var(--green)' : 'var(--silver-2)',
                  transition: 'background 200ms',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transition form */}
      {showForm && phase?.next_phase && (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Transition labels */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--ink-1)', fontWeight: 500 }}>
              {phase.current_phase_label}
            </span>
            <Icon name="arrowR" size={14} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--green-press)', fontWeight: 600 }}>
              {phase.next_phase_label}
            </span>
            <span className="j-badge j-risk-d5" style={{ marginLeft: 4 }}>D5 승인 필요</span>
          </div>

          {summaryLoading && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>
              전환 요약 로딩 중…
            </div>
          )}

          {summary && (
            <div style={{
              background: 'var(--paper-elevated)',
              border: '1px solid var(--silver-2)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {/* Counts strip */}
              <div style={{
                display: 'flex', gap: 20, padding: '12px 16px',
                borderBottom: '1px solid var(--silver-1)',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--green-press)', fontFamily: 'var(--font-sans)' }}>
                  <Icon name="check" size={13} stroke={2} />
                  완료 <strong style={{ fontFamily: 'var(--font-mono)' }}>{summary.completed_count}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--red)', fontFamily: 'var(--font-sans)' }}>
                  <Icon name="alert" size={13} />
                  차단 <strong style={{ fontFamily: 'var(--font-mono)' }}>{summary.blocked_count}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--amber)', fontFamily: 'var(--font-sans)' }}>
                  <Icon name="clock" size={13} />
                  검토 <strong style={{ fontFamily: 'var(--font-mono)' }}>{summary.needs_review_count}</strong>
                </span>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Success criteria */}
                {summary.success_criteria_met.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                      충족된 성공 기준
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {summary.success_criteria_met.map((s, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-1)' }}>
                          <Icon name="check" size={13} stroke={2} />
                          <span>{s.title} <span style={{ color: 'var(--ink-3)' }}>— {s.outcome}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Outstanding items */}
                {summary.outstanding_items.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                      미해결 항목
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {summary.outstanding_items.map((s, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-1)' }}>
                          <span style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={13} /></span>
                          <span>{s.title} <span style={{ color: 'var(--ink-3)' }}>({s.status})</span> — <span style={{ color: 'var(--ink-2)' }}>{s.reason}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key learnings */}
                {summary.key_learnings.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                      핵심 인사이트
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {summary.key_learnings.map((l, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink-1)' }}>
                          <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }}>·</span>
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next phase plan */}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    다음 Phase 계획
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div>주관: <span style={{ color: 'var(--ink-2)' }}>{summary.next_phase_plan.primary_owners.join(', ')}</span></div>
                    <div>성공 기준: <span style={{ color: 'var(--ink-2)' }}>{summary.next_phase_plan.success_criteria.join(' · ')}</span></div>
                    <div>기대 결과: <span style={{ color: 'var(--ink-2)' }}>{summary.next_phase_plan.expected_outcome}</span></div>
                  </div>
                </div>

                {summary.message && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
                    {summary.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reason textarea */}
          <textarea
            className="j-input j-textarea"
            rows={2}
            placeholder="전환 사유를 입력하세요 (예: PMF 신호 3개 달성, 첫 유료 전환 발생)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleRequest}
              disabled={submitting || !reason.trim()}
              className="j-btn j-btn-primary"
            >
              {submitting ? '요청 중…' : '전환 요청 (승인 대기열로)'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="j-btn j-btn-ghost"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          margin: '0 24px 16px',
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          borderRadius: 6,
          padding: '9px 14px',
          fontSize: 13,
          color: 'var(--ink-2)',
          fontFamily: 'var(--font-sans)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Counterpart chip — AgentBadge for executives, plain pill for Founder/CEO
// ---------------------------------------------------------------------------
function CounterpartChip({ counterpart }: { counterpart: string }) {
  const isExec = EXECUTIVE_AGENTS.has(counterpart) && counterpart !== 'CEO'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>→</span>
      {isExec ? (
        <AgentBadge agent={counterpart} />
      ) : (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 8px', borderRadius: 999,
          fontSize: 11.5, fontWeight: 600, lineHeight: 1.4,
          background: 'var(--silver-1)', color: 'var(--ink-2)',
          fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
        }}>
          {counterpart}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status legend — rendered once
// ---------------------------------------------------------------------------
const LEGEND_ORDER: LiveStatus[] = [
  'investigating', 'talking', 'awaiting_founder', 'under_review', 'done', 'blocked', 'queued',
]

function StatusLegend() {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
      padding: '12px 16px', marginBottom: 24,
      background: 'var(--paper-surface)', border: '1px solid var(--silver-2)',
      borderRadius: 8,
    }}>
      {LEGEND_ORDER.map(s => {
        const m = LIVE_META[s]
        return (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <StatusDot live_status={s} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-3)' }}>
              {m.label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent live card — one per agent under an instruction group
// ---------------------------------------------------------------------------
function AgentLiveCard({ agent, onSelect }: { agent: LiveStatusAgent; onSelect?: (taskId: string) => void }) {
  const m = liveMeta(agent.live_status)
  const accent =
    agent.live_status === 'blocked' ? 'var(--red)'
    : agent.live_status === 'awaiting_founder' || agent.live_status === 'awaiting_delegation' ? 'var(--amber)'
    : null

  return (
    <div
      onClick={() => onSelect?.(agent.task_id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(agent.task_id) } }}
      style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'border-color 120ms, box-shadow 120ms',
      }}
      onMouseEnter={e => { if (onSelect) { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--green)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.06)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--silver-2)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {accent && <div style={{ width: 4, flexShrink: 0, background: accent }} />}

      <div style={{ flex: 1, padding: '12px 16px' }}>
        {/* Top row — dot + agent + status badge + counterpart */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <StatusDot live_status={agent.live_status} />
          {agent.agent && <AgentBadge agent={agent.agent} />}
          <span className={m.badge}>{m.emoji} {m.label}</span>
          {agent.counterpart && <CounterpartChip counterpart={agent.counterpart} />}
          {agent.risk_level && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {agent.risk_level}
            </span>
          )}
        </div>

        {/* Task title */}
        <div style={{
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14,
          color: 'var(--ink-1)', marginBottom: 4, lineHeight: 1.35,
        }}>
          {agent.task_title}
        </div>

        {/* Current action one-liner */}
        {agent.current_action && (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {agent.current_action}
          </div>
        )}

        {/* Timestamp */}
        {agent.updated_at && (
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
            {relativeTime(agent.updated_at)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instruction group — section header + agent cards
// ---------------------------------------------------------------------------
function InstructionGroup({ group, onSelect }: { group: LiveStatusGroup; onSelect?: (taskId: string) => void }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Group header */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: 10, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17,
          color: 'var(--ink-1)', letterSpacing: '-0.01em', lineHeight: 1.3,
        }}>
          {group.instruction_text || '미지정 지시'}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          에이전트 {group.agents.length}
        </span>
      </div>

      {/* Agent cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {group.agents.map(a => (
          <AgentLiveCard key={a.task_id} agent={a} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Monitor content
// ---------------------------------------------------------------------------
function MonitorContent() {
  const [groups, setGroups] = useState<LiveStatusGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [drillTaskId, setDrillTaskId] = useState<string | null>(null)
  const { selectedId, businesses } = useBusiness()
  const scope = selectedId  // null = 회사 공통, string = 특정 사업
  const scopeLabel = selectedId === null
    ? '회사 공통'
    : businesses.find(b => b.id === selectedId)?.name ?? '특정 사업'

  const load = useCallback(async () => {
    try {
      const data = await api.liveStatus(scope)
      setGroups(Array.isArray(data) ? data : [])
    } catch {
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [scope])

  // Reload immediately when scope changes.
  useEffect(() => {
    setLoading(true)
    load()
  }, [scope, load])

  // Visibility-aware 8s polling: skip ticks while the tab is hidden,
  // and refresh once on becoming visible again.
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, 8000)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [autoRefresh, load])

  const totalAgents = groups.reduce((n, g) => n + g.agents.length, 0)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>
      {/* Pulsing dot keyframes for live (investigating) status */}
      <style>{`
        @keyframes monitorDotPulse {
          0%   { box-shadow: 0 0 0 0 rgba(31,166,77,0.45); }
          70%  { box-shadow: 0 0 0 5px rgba(31,166,77,0); }
          100% { box-shadow: 0 0 0 0 rgba(31,166,77,0); }
        }
        .monitor-dot-pulse { animation: monitorDotPulse 1.6s ease-out infinite; }
      `}</style>

      <PhaseTransitionPanel />

      <PageHeader
        overline="도구"
        title="현황 모니터"
        subtitle={<>범위 · <span style={{ color: 'var(--green-press)', fontWeight: 600 }}>{scopeLabel}</span></>}
        actions={(
          <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--green)', width: 14, height: 14 }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.04em' }}>
              자동 새로고침
            </span>
          </label>
          <button onClick={load} className="j-btn j-btn-secondary j-btn-sm" style={{ gap: 5 }}>
            <Icon name="refresh" size={13} />
            새로고침
          </button>
          </>
        )}
      />

      {/* Legend */}
      {!loading && totalAgents > 0 && <StatusLegend />}

      {/* Loading */}
      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)', padding: '20px 0' }}>
          로딩 중…
        </div>
      )}

      {/* Empty state */}
      {!loading && totalAgents === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--silver-1)', color: 'var(--ink-3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <Icon name="activity" size={20} stroke={1.4} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            진행 중인 작업이 없습니다.
          </div>
        </div>
      )}

      {/* Instruction-grouped live view */}
      {!loading && groups.map(g => (
        <InstructionGroup key={g.instruction_id || '__none__'} group={g} onSelect={setDrillTaskId} />
      ))}

      {drillTaskId && <TaskDrillDownModal taskId={drillTaskId} onClose={() => setDrillTaskId(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drill-down modal — how an agent actually worked (full output + handoff chain)
// ---------------------------------------------------------------------------
function TaskDrillDownModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<TaskItem | null>(null)
  const [handoffs, setHandoffs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([api.getTaskDetail(taskId), api.getTaskHandoffs(taskId)])
      .then(([t, hs]) => { if (alive) { setTask(t as TaskItem | null); setHandoffs(Array.isArray(hs) ? hs : []) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [taskId])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,24,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--paper-surface)', border: '1px solid var(--silver-2)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--silver-1)', background: 'var(--paper-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="j-overline">에이전트 작업 상세</span>
          <button onClick={onClose} className="j-btn j-btn-secondary j-btn-sm" aria-label="닫기">
            <Icon name="x" size={14} stroke={2} /> 닫기
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)' }}>로딩 중…</div>
          ) : (
            <>
              {task && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {task.agent && <AgentBadge agent={task.agent} />}
                    {task.status && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{task.status}</span>}
                    {task.risk_level && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{task.risk_level}</span>}
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 17, color: 'var(--ink-1)', margin: 0, lineHeight: 1.35 }}>
                    {task.task_title || (task as any).title}
                  </h2>
                </div>
              )}

              {task?.blocker && (
                <div style={{ background: 'var(--amber-tint)', border: '1px solid #DDB87A', borderRadius: 6, padding: '11px 13px', fontSize: 12.5, color: '#8A5408' }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>병목 (Blocker)</div>
                  <div style={{ lineHeight: 1.5 }}>{task.blocker}</div>
                </div>
              )}

              {/* The real work product */}
              {task?.output ? (
                <AgentOutputDetail agent={task.agent} output={task.output} />
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>아직 산출물이 기록되지 않았습니다.</div>
              )}

              {/* Handoff chain — how the work moved between agents / CEO */}
              {handoffs.length > 0 && (
                <div>
                  <div className="j-overline" style={{ marginBottom: 8 }}>업무 이관 기록 (Handoffs)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {handoffs.map((h: any) => (
                      <div key={h.id} style={{ border: '1px solid var(--silver-1)', borderRadius: 6, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>
                          {h.from_agent} → {h.to_agent}
                        </div>
                        {h.context && <p style={{ fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>{h.context}</p>}
                        {h.what_was_completed && <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, margin: '6px 0 0' }}>✓ {h.what_was_completed}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MonitorPage() {
  return <AuthGate><MonitorContent /></AuthGate>
}
