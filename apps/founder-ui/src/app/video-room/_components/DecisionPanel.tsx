'use client'
import type { CmoGate } from '../_lib/types'

// ── DecisionPanel ────────────────────────────────────────────────────────────
export default function DecisionPanel({
  gates,
  onDecide,
  deciding,
}: {
  gates: CmoGate[]
  onDecide: (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected', note?: string) => void
  deciding: string | null
}) {
  const pending = gates.filter(g => g.status === 'pending')

  if (pending.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--ink-4)', fontSize: 13, textAlign: 'center' }}>
        대기 중인 승인 항목이 없습니다. 승인하면 자동으로 다음 단계가 진행됩니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="j-overline" style={{ marginBottom: 4 }}>Decision Panel</div>

      {pending.map(gate => (
        <div key={gate.id} style={{
          border: '1px solid var(--p-rose)',
          borderLeft: '4px solid var(--pi-rose)',
          borderRadius: 8,
          background: 'var(--paper-surface)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--silver-1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>
              {gate.title}
            </div>
            {gate.context && (
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                {gate.context}
              </p>
            )}
          </div>

          {gate.recommended_option && (
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--silver-1)',
              background: 'var(--p-rose)',
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--pi-rose)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                CMO 추천
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--pi-rose)', fontWeight: 500 }}>
                {gate.recommended_option}
              </div>
            </div>
          )}

          <div style={{ padding: '10px 14px', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              onClick={() => onDecide(gate.id, 'approved')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-sm"
              style={{
                background: 'var(--p-rose)',
                color: 'var(--pi-rose)',
                border: '1px solid var(--pi-rose)',
                fontWeight: 600,
              }}
            >
              승인
            </button>
            <button
              onClick={() => onDecide(gate.id, 'needs_revision')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-secondary j-btn-sm"
            >
              수정 요청
            </button>
            <button
              onClick={() => onDecide(gate.id, 'rejected')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-danger j-btn-sm"
            >
              보류
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
