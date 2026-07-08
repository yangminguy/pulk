'use client'
import AgentBadge from '@/components/AgentBadge'
import { STATUS_LABEL } from '../_lib/phases'
import type { CmoProject, CmoGate } from '../_lib/types'

// ── 호랑이(Tiger) 토글 스위치 ────────────────────────────────────────────────
// ON이면 파이프라인 완료 시 호랑이가 실행 오류/병목을 회고해 CTO 개선 제안을 만든다.
// (제안은 🐯 자가개선에서 승인해야 실행 — 자동 코딩 없음.)
function TigerSwitch({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      data-testid="tiger-switch"
      title={enabled
        ? '호랑이 ON — 파이프라인 완료 시 오류·병목을 회고해 CTO 개선 제안을 만듭니다 (승인 후 실행)'
        : '호랑이 OFF — 완료 후 자동 회고를 하지 않습니다'}
      onClick={() => !busy && onToggle(!enabled)}
      disabled={busy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '3px 9px 3px 4px',
        borderRadius: 999,
        border: `1px solid ${enabled ? 'var(--green)' : 'var(--silver-2)'}`,
        background: enabled ? 'var(--green-tint)' : 'var(--silver-1)',
        cursor: busy ? 'wait' : 'pointer',
        flexShrink: 0,
        transition: 'background 140ms, border-color 140ms',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {/* track + knob */}
      <span style={{
        position: 'relative',
        width: 30,
        height: 17,
        borderRadius: 999,
        background: enabled ? 'var(--green)' : 'var(--silver-3, #C8C2B8)',
        transition: 'background 140ms',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute',
          top: 2,
          left: enabled ? 15 : 2,
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transition: 'left 140ms',
        }} />
      </span>
      <span style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: enabled ? 'var(--green-press)' : 'var(--ink-3)',
        whiteSpace: 'nowrap',
      }}>
        🐯 호랑이 {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

// ── VideoRoomHeader ──────────────────────────────────────────────────────────
export default function VideoRoomHeader({
  project,
  gates,
  tigerBusy = false,
  onToggleTiger,
}: {
  project: CmoProject
  gates: CmoGate[]
  tigerBusy?: boolean
  onToggleTiger?: (next: boolean) => void
}) {
  const pendingCount = gates.filter(g => g.status === 'pending').length
  const statusLabel = STATUS_LABEL[project.status] ?? project.status

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--silver-2)',
      padding: '12px 20px',
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        paddingRight: 48,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className="j-overline">CMO · Video Room</span>
            <AgentBadge agent="CMO" variant="chip" />
            {project.product && (
              <span style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                background: 'var(--silver-1)',
                border: '1px solid var(--silver-2)',
                borderRadius: 4,
                padding: '1px 7px',
                fontFamily: 'var(--font-mono)',
              }}>
                {project.product}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 500,
              fontSize: 20,
              color: 'var(--ink-1)',
              margin: 0,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {project.title}
            </h2>
            {onToggleTiger && (
              <TigerSwitch
                enabled={project.tiger_enabled === true}
                busy={tigerBusy}
                onToggle={onToggleTiger}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Status badge */}
          <span style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 600,
            background: 'var(--p-butter)',
            color: 'var(--pi-butter)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}>
            {statusLabel}
          </span>

          {/* Pending gate badge */}
          {pendingCount > 0 && (
            <span style={{
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              background: 'var(--p-rose)',
              color: 'var(--pi-rose)',
              fontFamily: 'var(--font-sans)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--pi-rose)' }} />
              승인 필요 {pendingCount}건
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
