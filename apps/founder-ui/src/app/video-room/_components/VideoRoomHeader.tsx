'use client'
import AgentBadge from '@/components/AgentBadge'
import { STATUS_LABEL } from '../_lib/phases'
import type { CmoProject, CmoGate } from '../_lib/types'

// ── VideoRoomHeader ──────────────────────────────────────────────────────────
export default function VideoRoomHeader({
  project,
  gates,
}: {
  project: CmoProject
  gates: CmoGate[]
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
