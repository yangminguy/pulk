'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, TaskItem } from '@/lib/api'
import { useInboxNav, type InboxTaskRef } from '@/lib/inbox-nav'

function taskToRef(t: TaskItem): InboxTaskRef {
  return {
    task_id: t.task_id,
    assigned_agent: t.agent,
    title: t.task_title,
    status: t.status,
    risk_level: t.risk_level ?? undefined,
    approval_required: t.approval_required,
    rationale: t.rationale,
    expected_output: t.expected_output,
    blocker: t.blocker ?? undefined,
    source_instruction: t.source_instruction ?? undefined,
  }
}

const ICONS: Record<string, string> = {
  check:   'M20 6L9 17l-5-5',
  x:       'M18 6L6 18 M6 6l12 12',
  alert:   'M12 22a10 10 0 110-20 10 10 0 010 20z M12 8v4 M12 16h.01',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
}

function Icon({ name, size = 13, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
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

// Risk badge config — prominent but not alarming
const RISK_CONFIG: Record<string, { bg: string; fg: string }> = {
  D3: { bg: 'var(--amber-tint)', fg: '#8A5408' },
  D4: { bg: '#F7DCB6',           fg: '#8A4E26' },
  D5: { bg: 'var(--red-tint)',   fg: '#8C2A1F' },
}

// Agent monogram color map — matches reference screens-today AGENTS palette
const AGENT_COLOR: Record<string, string> = {
  CMO:    'var(--wood-3)',
  CRO:    'var(--wood-2)',
  CPO:    'var(--green-press)',
  CTO:    'var(--ink-2)',
  COO:    'var(--wood-4)',
  CFO:    'var(--silver-4)',
  RiskQA: 'var(--red)',
  CEO:    'var(--ink-1)',
}

const HIGH_RISK = new Set(['D3', 'D4', 'D5'])

interface ApprovalQueueCardProps {
  businessId?: string | null
}

export default function ApprovalQueueCard({ businessId }: ApprovalQueueCardProps) {
  const { openInboxTask } = useInboxNav()
  const [items, setItems] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const all = await api.approvalQueue()
    const filtered = all.filter(t =>
      t.approval_required &&
      t.risk_level != null &&
      HIGH_RISK.has(t.risk_level) &&
      (businessId == null || t.phase === null || true)
    )
    setItems(filtered)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const approve = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.approveTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
    } catch {
      // silent — user can retry
    } finally {
      setActionId(null)
    }
  }

  const reject = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.rejectTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
    } catch {
      // silent
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '12px 14px',
      }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>승인 대기</div>
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '50%', marginBottom: 6 }} />
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '70%' }} />
      </div>
    )
  }

  // Empty state — reassuring
  if (items.length === 0) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--green-tint)',
          color: 'var(--green-press)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="check" size={14} stroke={2} />
        </span>
        <div>
          <div className="j-overline" style={{ marginBottom: 1 }}>승인 대기</div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>현재 없음</span>
        </div>
      </div>
    )
  }

  const preview = items.slice(0, 4)

  return (
    <div style={{
      background: 'var(--amber-tint)',
      border: '1px solid #DDB87A',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid #DDB87A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="alert" size={13} stroke={1.8} />
          <span className="j-overline" style={{ color: '#8A5408' }}>승인 대기</span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 600,
          color: '#8A5408',
          background: 'rgba(199,125,17,0.15)',
          padding: '1px 7px',
          borderRadius: 999,
        }}>
          {items.length}건
        </span>
      </div>

      {/* item rows */}
      <div style={{ background: 'var(--paper-surface)' }}>
        {preview.map((item, i) => {
          const riskCfg = RISK_CONFIG[item.risk_level ?? ''] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-3)' }
          const agentColor = AGENT_COLOR[item.agent] ?? 'var(--ink-3)'
          const isActing = actionId === item.task_id

          return (
            <div key={item.task_id} style={{
              padding: '11px 14px',
              borderBottom: i < preview.length - 1 ? '1px solid var(--silver-1)' : 'none',
              opacity: isActing ? 0.5 : 1,
              transition: 'opacity 150ms',
            }}>
              {/* top row: risk + agent chip + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                {item.risk_level && (
                  <span className={`j-badge j-risk-${item.risk_level.toLowerCase()}`}>
                    {item.risk_level}
                  </span>
                )}
                {/* agent monogram */}
                <span style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: agentColor,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.agent?.slice(0, 2).toUpperCase()}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', flexShrink: 0 }}>
                  {item.agent}
                </span>
              </div>

              {/* task title — tap to open full detail in the inbox */}
              <button
                type="button"
                onClick={() => openInboxTask(taskToRef(item))}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-1)',
                  marginBottom: 9,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.task_title}
              </button>

              {/* action buttons */}
              <div style={{ display: 'flex', gap: 7 }}>
                <button
                  onClick={() => approve(item.task_id)}
                  disabled={isActing}
                  className="j-btn j-btn-primary j-btn-sm"
                >
                  <Icon name="check" size={12} stroke={2.2} />
                  승인
                </button>
                <button
                  onClick={() => reject(item.task_id)}
                  disabled={isActing}
                  className="j-btn j-btn-danger j-btn-sm"
                >
                  <Icon name="x" size={12} stroke={2} />
                  거절
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* overflow */}
      {items.length > 4 && (
        <div style={{
          padding: '8px 14px',
          background: 'var(--paper-canvas)',
          borderTop: '1px solid var(--silver-1)',
          fontSize: 11.5,
          color: 'var(--ink-4)',
        }}>
          +{items.length - 4}건 더 있음 — 승인 페이지에서 전체 보기
        </div>
      )}
    </div>
  )
}
