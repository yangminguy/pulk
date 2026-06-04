'use client'
import { useState } from 'react'

// ── Icon primitive (matches chat/page.tsx pattern) ───────────────────────────
const ICONS: Record<string, string> = {
  check:  'M20 6L9 17l-5-5',
  arrowR: 'M5 12h14 M12 5l7 7-7 7',
  pause:  'M6 4h4v16H6z M14 4h4v16h-4z',
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

// Agent monogram colors — matches chat/page.tsx AGENT_COLOR palette
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

function AgentChip({ agent }: { agent: string }) {
  const color = AGENT_COLOR[agent] ?? 'var(--ink-3)'
  const mono = agent.slice(0, 2).toUpperCase()
  return (
    <span style={{
      width: 22,
      height: 22,
      borderRadius: 4,
      background: color,
      color: '#fff',
      fontSize: 9.5,
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {mono}
    </span>
  )
}

interface SynthesisCardProps {
  instructionId: string
  decisionSummary: string
  contributions: { agent: string; task_id?: string; task_title: string; summary: string; status: string }[]
  openGaps: string[]
  nextActions: { kind: 'approve' | 'delegate' | 'hold'; label: string; target_agent?: string; reason: string }[]
  onAction: (kind: 'approve' | 'delegate' | 'hold', targetAgent?: string) => Promise<void>
  /** Open this exec's full work product in the inbox (click a contribution). */
  onOpenTask?: (taskId: string, contribution: { agent: string; task_title: string; status: string }) => void
}

export default function SynthesisCard({
  decisionSummary,
  contributions,
  openGaps,
  nextActions,
  onAction,
  onOpenTask,
}: SynthesisCardProps) {
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState(false)

  const run = async (kind: 'approve' | 'delegate' | 'hold', targetAgent?: string) => {
    if (busy) return
    if (kind === 'hold') {
      setHeld(true)
      return
    }
    setBusy(true)
    try {
      await onAction(kind, targetAgent)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--green)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--paper-surface)',
      opacity: held ? 0.6 : 1,
    }}>
      {/* header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--silver-1)',
        background: 'var(--paper-elevated)',
      }}>
        <span className="j-overline">운영 종합 보고 · Chief of Staff</span>
      </div>

      {/* decision summary */}
      <div style={{ padding: '13px 14px' }}>
        <div style={{
          fontSize: 13.5,
          color: 'var(--ink-1)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {decisionSummary}
        </div>
      </div>

      {/* contributions */}
      {contributions.length > 0 && (
        <div style={{ borderTop: '1px solid var(--silver-1)' }}>
          <div style={{ padding: '9px 14px 4px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="j-overline">임원별 기여</span>
            {onOpenTask && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>클릭하면 상세 결과 보기</span>}
          </div>
          {contributions.map((c, i) => {
            const killed = c.status === 'killed'
            const clickable = Boolean(onOpenTask && c.task_id)
            return (
              <div
                key={i}
                onClick={clickable ? () => onOpenTask!(c.task_id!, c) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTask!(c.task_id!, c) } } : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '9px 14px',
                  borderTop: i > 0 ? '1px solid var(--silver-1)' : 'none',
                  opacity: killed ? 0.5 : 1,
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'background 120ms',
                }}
                onMouseEnter={clickable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--silver-1)' } : undefined}
                onMouseLeave={clickable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' } : undefined}
              >
                <AgentChip agent={c.agent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.35 }}>
                    {c.task_title}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.5 }}>
                    {c.summary}
                  </div>
                </div>
                {clickable && <span style={{ color: 'var(--ink-4)', flexShrink: 0, marginTop: 2 }}><Icon name="arrowR" size={13} stroke={2} /></span>}
              </div>
            )
          })}
        </div>
      )}

      {/* open gaps */}
      {openGaps.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--silver-1)',
          background: 'var(--amber-tint)',
          padding: '11px 14px',
        }}>
          <div className="j-overline" style={{ color: '#8A5408', marginBottom: 6 }}>남은 공백</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {openGaps.map((g, i) => (
              <li key={i} style={{ fontSize: 12.5, color: '#8A5408', lineHeight: 1.5 }}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* next-action buttons */}
      {nextActions.length > 0 && (
        <div style={{
          padding: '11px 14px',
          borderTop: '1px solid var(--silver-1)',
          background: 'var(--paper-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}>
          {nextActions.map((a, i) => {
            const cls =
              a.kind === 'approve'  ? 'j-btn j-btn-primary j-btn-sm' :
              a.kind === 'delegate' ? 'j-btn j-btn-secondary j-btn-sm' :
                                      'j-btn j-btn-ghost j-btn-sm'
            const iconName = a.kind === 'approve' ? 'check' : a.kind === 'delegate' ? 'arrowR' : 'pause'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => run(a.kind, a.target_agent)}
                  disabled={busy || held}
                  className={cls}
                >
                  <Icon name={iconName} size={13} stroke={2} />
                  {a.label}
                  {a.kind === 'delegate' && a.target_agent ? ` · ${a.target_agent}` : ''}
                </button>
                {a.reason && (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1, minWidth: 120 }}>
                    {a.reason}
                  </span>
                )}
              </div>
            )
          })}
          {held && (
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>보류됨 — 나중에 다시 결정합니다</span>
          )}
        </div>
      )}
    </div>
  )
}
