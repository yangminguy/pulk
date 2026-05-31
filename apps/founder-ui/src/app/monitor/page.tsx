'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'

// ---------------------------------------------------------------------------
// Local Icon (same pattern as Sidebar.tsx)
// ---------------------------------------------------------------------------
const ICONS: Record<string, string> = {
  arrowR:      'M5 12h14 M12 5l7 7-7 7',
  chevD:       'M6 9l6 6 6-6',
  chevU:       'M18 15l-6-6-6 6',
  refresh:     'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  alert:       'M12 22a10 10 0 110-20 10 10 0 010 20z M12 8v4 M12 16h.01',
  check:       'M20 6L9 17l-5-5',
  activity:    'M22 12h-4l-3 9L9 3l-3 9H2',
  clock:       'M12 22a10 10 0 110-20 10 10 0 010 20z M12 6v6l4 2',
  x:           'M18 6L6 18 M6 6l12 12',
}

function Icon({ name, size = 16, stroke = 1.6 }: { name: string; size?: number; stroke?: number }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {d.split(/(?=M)/).map((seg, i) => <path key={i} d={seg.trim()} />)}
    </svg>
  )
}

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
// Agent owner badge color map — pastel pairs, not neon
// ---------------------------------------------------------------------------
const AGENT_PASTEL: Record<string, { bg: string; fg: string }> = {
  CMO:          { bg: 'var(--p-lav)',   fg: 'var(--pi-lav)' },
  CRO:          { bg: 'var(--p-sky)',   fg: 'var(--pi-sky)' },
  CPO:          { bg: 'var(--p-mint)',  fg: 'var(--pi-mint)' },
  CTO:          { bg: 'var(--p-butter)', fg: 'var(--pi-butter)' },
  COO:          { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
  CFO:          { bg: 'var(--p-sand)',  fg: 'var(--pi-sand)' },
  RiskQA:       { bg: 'var(--p-rose)',  fg: 'var(--pi-rose)' },
  CEO:          { bg: 'var(--p-lav)',   fg: 'var(--pi-lav)' },
  ChiefOfStaff: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
}

function AgentBadge({ agent }: { agent: string }) {
  const p = AGENT_PASTEL[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, lineHeight: 1.4,
      background: p.bg, color: p.fg,
      fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
    }}>
      {agent}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Status badge mapping → j-badge classes
// ---------------------------------------------------------------------------
type TaskStatus = 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed'
type RiskLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5'

const STATUS_BADGE: Record<TaskStatus, string> = {
  queued:       'j-badge j-badge-draft',
  running:      'j-badge j-badge-live',
  blocked:      'j-badge j-badge-blocked',
  needs_review: 'j-badge j-badge-review',
  done:         'j-badge j-badge-live',
  killed:       'j-badge j-badge-neutral',
}
const STATUS_LABELS: Record<TaskStatus, string> = {
  queued:       '대기',
  running:      '진행중',
  blocked:      '차단됨',
  needs_review: '검토필요',
  done:         '완료',
  killed:       '종료',
}
const STATUS_DOT: Record<TaskStatus, boolean> = {
  queued: true, running: true, blocked: true, needs_review: true, done: true, killed: false,
}

// Risk class (uses j-badge + j-risk-dN for background, but we render as a badge pill)
const RISK_CLASS: Record<RiskLevel, string> = {
  D1: 'j-badge j-risk-d1',
  D2: 'j-badge j-risk-d2',
  D3: 'j-badge j-risk-d3',
  D4: 'j-badge j-risk-d4',
  D5: 'j-badge j-risk-d5',
}

// Left accent bar color for cards that need attention
function cardAccentColor(status: TaskStatus): string | null {
  if (status === 'blocked') return 'var(--red)'
  if (status === 'needs_review') return 'var(--amber)'
  return null
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
// Filter tabs
// ---------------------------------------------------------------------------
type FilterType = 'all' | 'running' | 'blocked' | 'needs_review'

const TABS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'running', label: '진행중' },
  { key: 'blocked', label: '차단됨' },
  { key: 'needs_review', label: '검토필요' },
]

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------
function TaskCard({ task }: { task: any }) {
  const status: TaskStatus = task.status as TaskStatus
  const risk: RiskLevel | undefined = task.risk_level as RiskLevel | undefined
  const accent = cardAccentColor(status)
  const [showWork, setShowWork] = useState(false)

  const reasoning: string = typeof task.reasoning === 'string' ? task.reasoning : ''
  const nextAction: string = typeof task.next_action === 'string' ? task.next_action : ''
  const decision: string = typeof task.decision === 'string' ? task.decision : ''
  // Self-heal events are tagged by Hermes with a [CTO ...] / [CEO ...] prefix.
  const healMatch = reasoning.match(/^\[(CTO|CEO)\s[^\]]*\]/)
  const hasWork = !!(reasoning || nextAction || decision)

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      transition: 'border-color 120ms',
    }}>
      {/* Left accent bar */}
      {accent && (
        <div style={{ width: 4, flexShrink: 0, background: accent }} />
      )}

      <div style={{ flex: 1, padding: '14px 16px' }}>
        {/* Top row — badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          {/* Agent */}
          {task.agent && <AgentBadge agent={task.agent} />}

          {/* Status */}
          <span className={STATUS_BADGE[status] ?? 'j-badge j-badge-neutral'}>
            {STATUS_DOT[status] && <span className="j-badge-dot" />}
            {STATUS_LABELS[status] ?? task.status}
          </span>

          {/* Risk */}
          {risk && (
            <span className={`j-badge ${RISK_CLASS[risk] ?? 'j-badge-neutral'}`}>
              {risk}
            </span>
          )}

          {/* Approval required */}
          {task.approval_required && (
            <span className="j-badge j-badge-review">
              <span className="j-badge-dot" />
              승인필요
            </span>
          )}

          {/* Phase */}
          {task.phase && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {task.phase}
            </span>
          )}
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14,
          color: 'var(--ink-1)', marginBottom: 4, lineHeight: 1.35,
        }}>
          {task.task_title}
        </div>

        {/* Rationale */}
        {task.rationale && (
          <div style={{
            fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginBottom: task.blocker ? 6 : 0,
          }}>
            {task.rationale}
          </div>
        )}

        {/* Blocker */}
        {task.blocker && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            marginTop: 6, fontSize: 12.5, color: 'var(--red)',
            fontFamily: 'var(--font-sans)', lineHeight: 1.45, overflowWrap: 'anywhere',
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={13} stroke={1.8} /></span>
            {task.blocker}
          </div>
        )}

        {/* Agent work — what the agent actually did/decided */}
        {hasWork && (
          <div style={{ marginTop: 8 }}>
            {healMatch && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                color: 'var(--green-press)', background: 'var(--green-tint)',
                padding: '1px 7px', borderRadius: 999, marginBottom: 6,
              }}>
                ⟳ {healMatch[1]} 자가복구
              </span>
            )}
            {(nextAction || decision) && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 10.5, marginRight: 6 }}>현재 작업</span>
                {nextAction || decision}
              </div>
            )}
            {reasoning && (
              <>
                <button
                  type="button"
                  onClick={() => setShowWork(v => !v)}
                  style={{
                    marginTop: 4, background: 'none', border: 'none', padding: 0,
                    color: 'var(--green-press)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {showWork ? '판단 근거 접기' : '판단 근거 보기'}
                </button>
                {showWork && (
                  <div style={{
                    marginTop: 6, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55,
                    background: 'var(--bg-inset, var(--silver-1))', padding: '8px 10px',
                    borderRadius: 6, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
                  }}>
                    {reasoning}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Timestamp */}
        {task.updated_at && (
          <div style={{
            marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--ink-4)',
          }}>
            {relativeTime(task.updated_at)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Monitor content
// ---------------------------------------------------------------------------
function MonitorContent() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { selectedId, businesses } = useBusiness()
  const scope = selectedId  // null = 회사 공통, string = 특정 사업
  const scopeLabel = selectedId === null
    ? '회사 공통'
    : businesses.find(b => b.id === selectedId)?.name ?? '특정 사업'

  const load = useCallback(async () => {
    try {
      const [current, blocked] = await Promise.all([
        api.currentTasks(scope).catch(() => []),
        api.blockedTasks(scope).catch(() => []),
      ])
      const currentArr = Array.isArray(current) ? current : (current as any)?.data ?? []
      const blockedArr = Array.isArray(blocked) ? blocked : (blocked as any)?.data ?? []
      const map = new Map<string, any>()
      ;[...currentArr, ...blockedArr].forEach(t => map.set(t.task_id, t))
      setTasks(Array.from(map.values()))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    setLoading(true)
    load()
    if (!autoRefresh) return
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load, autoRefresh])

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'running') return t.status === 'running' || t.status === 'queued'
    if (filter === 'blocked') return t.status === 'blocked'
    if (filter === 'needs_review') return t.status === 'needs_review' || t.approval_required
    return true
  })

  // Summary counts
  const blockedCount  = tasks.filter(t => t.status === 'blocked').length
  const reviewCount   = tasks.filter(t => t.status === 'needs_review' || t.approval_required).length
  const runningCount  = tasks.filter(t => t.status === 'running').length

  const tabCount = (key: FilterType): number => {
    if (key === 'all') return tasks.length
    if (key === 'running') return tasks.filter(t => t.status === 'running' || t.status === 'queued').length
    if (key === 'blocked') return blockedCount
    if (key === 'needs_review') return reviewCount
    return 0
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>
      <PhaseTransitionPanel />

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            도구
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30,
            color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.15,
          }}>
            현황 모니터
          </h1>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            범위 · <span style={{ color: 'var(--green-press)', fontWeight: 600 }}>{scopeLabel}</span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        </div>
      </div>

      {/* Status summary strip */}
      {!loading && tasks.length > 0 && (
        <div style={{
          display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap',
        }}>
          <MetricPill label="진행중" value={runningCount} tone="live" />
          {blockedCount > 0 && <MetricPill label="차단됨" value={blockedCount} tone="blocked" />}
          {reviewCount > 0 && <MetricPill label="검토필요" value={reviewCount} tone="review" />}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 20,
        borderBottom: '1px solid var(--silver-2)',
      }}>
        {TABS.map(tab => {
          const active = filter === tab.key
          const count = tabCount(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                marginBottom: -1,
                padding: '8px 16px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--green-press)' : 'var(--ink-3)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 120ms, border-color 120ms',
              }}
            >
              {tab.label}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: active ? 'var(--green-press)' : 'var(--ink-4)',
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)', padding: '20px 0' }}>
          로딩 중…
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
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
            {filter === 'all' ? '활성 Task가 없습니다' : '해당 항목이 없습니다'}
          </div>
        </div>
      )}

      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(task => (
          <TaskCard key={task.task_id} task={task} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MetricPill — compact summary at top
// ---------------------------------------------------------------------------
function MetricPill({ label, value, tone }: { label: string; value: number; tone: 'live' | 'blocked' | 'review' }) {
  const TONE_STYLE = {
    live:    { background: 'var(--green-tint)', color: 'var(--green-press)' },
    blocked: { background: 'var(--red-tint)',   color: '#8C2A1F' },
    review:  { background: 'var(--amber-tint)', color: '#8A5408' },
  }
  const s = TONE_STYLE[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 8,
      ...s,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500 }}>
        {label}
      </span>
    </div>
  )
}

export default function MonitorPage() {
  return <AuthGate><MonitorContent /></AuthGate>
}
