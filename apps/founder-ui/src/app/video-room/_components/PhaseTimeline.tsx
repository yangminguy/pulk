'use client'
import { PHASES, phaseState, phaseOfStatus, type PhaseKey } from '../_lib/phases'

// Map a 5-phase key to the backend's 3 current_page values (board to render).
export const PHASE_TO_PAGE: Record<PhaseKey, 'strategy' | 'production' | 'review_publish'> = {
  strategy: 'strategy',
  research: 'strategy',
  script: 'production',
  production: 'production',
  publish: 'review_publish',
}

// ── PhaseTimeline — 5-phase navigation derived from project.status ───────────
export default function PhaseTimeline({
  currentStatus,
  activePage,
  pendingByPage,
  onSelectPage,
}: {
  currentStatus: string
  activePage: string
  pendingByPage: Record<string, number>
  onSelectPage: (page: 'strategy' | 'production' | 'review_publish') => void
}) {
  const activePhaseKey = phaseOfStatus(currentStatus)
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, width: '100%' }}>
      {PHASES.map((phase, i) => {
        const state = phaseState(phase.key, currentStatus)
        const page = PHASE_TO_PAGE[phase.key]
        const isViewing = activePage === page
        const isCurrent = activePhaseKey === phase.key
        const pending = pendingByPage[page] ?? 0
        return (
          <button
            key={phase.key}
            onClick={() => onSelectPage(page)}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              border: 'none',
              borderBottom: isViewing ? '2px solid var(--green)' : '2px solid transparent',
              borderRight: i < PHASES.length - 1 ? '1px solid var(--silver-1)' : 'none',
              background: isViewing ? 'var(--bg-inset)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 120ms, border-color 120ms',
            }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
              background: state === 'done' ? 'var(--green)' : state === 'active' ? 'var(--ink-1)' : 'var(--silver-1)',
              color: state === 'pending' ? 'var(--ink-4)' : '#fff',
              border: state === 'pending' ? '1px solid var(--silver-2)' : 'none',
            }}>
              {state === 'done'
                ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : state === 'pending'
                  ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M3 4.5V3.2a2 2 0 1 1 4 0V4.5M2.6 4.5h4.8v3.2H2.6z" stroke="var(--ink-4)" strokeWidth="0.9"/></svg>
                  : i + 1}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{
                display: 'block',
                fontSize: 12.5,
                fontFamily: 'var(--font-sans)',
                fontWeight: isCurrent ? 700 : isViewing ? 600 : 400,
                color: state === 'pending' ? 'var(--ink-4)' : 'var(--ink-1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {phase.label}
              </span>
              {isCurrent && (
                <span style={{ display: 'block', fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                  진행 중
                </span>
              )}
            </span>
            {pending > 0 && (
              <span style={{
                flexShrink: 0,
                width: 16, height: 16, borderRadius: '50%',
                background: 'var(--pi-rose)', color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {pending}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
