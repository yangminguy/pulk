'use client'
import { useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, type TaskItem } from '@/lib/api'

// ---------------------------------------------------------------------------
// Local Icon (same pattern as Sidebar.tsx)
// ---------------------------------------------------------------------------
const ICONS: Record<string, string> = {
  check:   'M20 6L9 17l-5-5',
  x:       'M18 6L6 18 M6 6l12 12',
  alert:   'M12 22a10 10 0 110-20 10 10 0 010 20z M12 8v4 M12 16h.01',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  inbox:   'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
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
// Risk styling — j-badge + j-risk-dN classes
// ---------------------------------------------------------------------------
const RISK_CLASS: Record<string, string> = {
  D3: 'j-badge j-risk-d3',
  D4: 'j-badge j-risk-d4',
  D5: 'j-badge j-risk-d5',
}

// Left accent bar color per risk level
function riskAccentColor(risk: string | undefined): string | null {
  if (risk === 'D5') return 'var(--red)'
  if (risk === 'D4') return '#D4841A'   // amber-orange
  if (risk === 'D3') return 'var(--amber)'
  return null
}

// Agent badge — pastel pairs
const AGENT_PASTEL: Record<string, { bg: string; fg: string }> = {
  CMO:          { bg: 'var(--p-lav)',    fg: 'var(--pi-lav)' },
  CRO:          { bg: 'var(--p-sky)',    fg: 'var(--pi-sky)' },
  CPO:          { bg: 'var(--p-mint)',   fg: 'var(--pi-mint)' },
  CTO:          { bg: 'var(--p-butter)', fg: 'var(--pi-butter)' },
  COO:          { bg: 'var(--p-peach)',  fg: 'var(--pi-peach)' },
  CFO:          { bg: 'var(--p-sand)',   fg: 'var(--pi-sand)' },
  RiskQA:       { bg: 'var(--p-rose)',   fg: 'var(--pi-rose)' },
  CEO:          { bg: 'var(--p-lav)',    fg: 'var(--pi-lav)' },
  ChiefOfStaff: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
}

function AgentBadge({ agent }: { agent: string }) {
  const p = AGENT_PASTEL[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
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
// Single approval card
// ---------------------------------------------------------------------------
function ApprovalCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: TaskItem
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const accent = riskAccentColor(item.risk_level ?? undefined)

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      transition: 'border-color 120ms',
    }}>
      {/* Left accent bar — risk severity indicator */}
      {accent && (
        <div style={{ width: 4, flexShrink: 0, background: accent }} />
      )}

      <div style={{ flex: 1, padding: '18px 20px' }}>
        {/* Badge row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          {item.agent && <AgentBadge agent={item.agent} />}
          {item.risk_level && (
            <span className={RISK_CLASS[item.risk_level] ?? 'j-badge j-badge-neutral'}>
              {item.risk_level}
            </span>
          )}
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15,
          color: 'var(--ink-1)', lineHeight: 1.35, marginBottom: 8,
        }}>
          {item.task_title}
        </div>

        {/* Rationale */}
        {item.rationale && (
          <p style={{
            margin: '0 0 6px 0',
            fontFamily: 'var(--font-sans)', fontSize: 13.5,
            color: 'var(--ink-2)', lineHeight: 1.55,
          }}>
            {item.rationale}
          </p>
        )}

        {/* Expected output */}
        {item.expected_output && (
          <p style={{
            margin: '0 0 4px 0',
            fontFamily: 'var(--font-sans)', fontSize: 12.5,
            color: 'var(--ink-3)', lineHeight: 1.5,
          }}>
            예상 산출물: {item.expected_output}
          </p>
        )}

        {/* Source instruction */}
        {item.source_instruction && (
          <p style={{
            margin: '0 0 14px 0',
            fontFamily: 'var(--font-mono)', fontSize: 11.5,
            color: 'var(--ink-4)', lineHeight: 1.5,
          }}>
            원본 지시: {item.source_instruction}
          </p>
        )}

        {/* Hairline */}
        <hr className="j-hairline" style={{ margin: '14px 0 14px 0' }} />

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onApprove}
            disabled={busy}
            className="j-btn j-btn-primary"
            style={{ gap: 6 }}
          >
            <Icon name="check" size={14} stroke={2} />
            승인
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="j-btn j-btn-danger"
            style={{ gap: 6 }}
          >
            <Icon name="x" size={14} />
            거절
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div style={{
      background: 'var(--green-tint)',
      border: '1px solid var(--green-tint-2)',
      borderRadius: 10,
      padding: '40px 32px',
      textAlign: 'center',
      marginTop: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'var(--green-tint-2)',
        color: 'var(--green-press)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <Icon name="check" size={22} stroke={2} />
      </div>
      <div style={{
        fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 20,
        color: 'var(--green-press)', marginBottom: 6, letterSpacing: '-0.01em',
      }}>
        현재 승인 대기 없음
      </div>
      <p style={{
        fontFamily: 'var(--font-sans)', fontSize: 13.5,
        color: 'var(--pi-mint)', margin: 0, lineHeight: 1.55,
        maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
      }}>
        모든 고위험 작업이 처리됐습니다. 새로운 승인 요청이 생기면 이 화면에 표시됩니다.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approval content
// ---------------------------------------------------------------------------
function ApprovalContent() {
  const [items, setItems] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    setLoading(true)
    try { setItems(await api.approvalQueue()) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const approve = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.approveTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
      showToast('승인되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally { setActionId(null) }
  }

  const reject = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.rejectTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
      showToast('거절되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally { setActionId(null) }
  }

  // Sort: D5 first, then D4, D3, rest
  const RISK_ORDER: Record<string, number> = { D5: 0, D4: 1, D3: 2 }
  const sorted = [...items].sort((a, b) => {
    const ra = RISK_ORDER[a.risk_level ?? ''] ?? 9
    const rb = RISK_ORDER[b.risk_level ?? ''] ?? 9
    return ra - rb
  })

  const hasD5 = sorted.some(i => i.risk_level === 'D5')

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 64px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
          }}>
            메인
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 30,
              color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.15,
            }}>
              승인 대기
            </h1>
            {/* Count badge — only visible when there are items */}
            {!loading && items.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 26, height: 26, borderRadius: 999,
                background: hasD5 ? 'var(--red-tint)' : 'var(--amber-tint)',
                color: hasD5 ? '#8C2A1F' : '#8A5408',
                fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, lineHeight: 1,
                padding: '0 6px',
              }}>
                {items.length}
              </span>
            )}
          </div>
        </div>

        <button onClick={load} className="j-btn j-btn-secondary j-btn-sm" style={{ gap: 5 }}>
          <Icon name="refresh" size={13} />
          새로고침
        </button>
      </div>

      {/* Risk legend — visible when queue has items */}
      {!loading && sorted.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>
            위험도
          </span>
          <span className="j-badge j-risk-d5">D5 — 최고위험</span>
          <span className="j-badge j-risk-d4">D4 — 고위험</span>
          <span className="j-badge j-risk-d3">D3 — 주의</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-4)', padding: '20px 0' }}>
          로딩 중…
        </div>
      )}

      {/* Empty state */}
      {!loading && sorted.length === 0 && <EmptyState />}

      {/* Card list — sorted by risk severity */}
      {!loading && sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map(item => (
            <ApprovalCard
              key={item.task_id}
              item={item}
              onApprove={() => approve(item.task_id)}
              onReject={() => reject(item.task_id)}
              busy={actionId === item.task_id}
            />
          ))}
        </div>
      )}

      {/* Toast — bottom right */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          borderRadius: 8,
          padding: '12px 18px',
          fontSize: 13.5,
          color: 'var(--ink-1)',
          fontFamily: 'var(--font-sans)',
          boxShadow: 'var(--shadow-3)',
          display: 'flex', alignItems: 'center', gap: 8,
          zIndex: 50,
        }}>
          <span style={{ color: 'var(--green)' }}>
            <Icon name="check" size={15} stroke={2} />
          </span>
          {toast}
        </div>
      )}
    </div>
  )
}

export default function ApprovalPage() {
  return <AuthGate><ApprovalContent /></AuthGate>
}
