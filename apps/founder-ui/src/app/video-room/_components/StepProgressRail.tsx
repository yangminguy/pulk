'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { PHASES, STATUS_LABEL, phaseState, statusOrder, type PhaseKey } from '../_lib/phases'
import { PHASE_TO_PAGE } from './PhaseTimeline'

type StageGuides = Record<string, { label: string; focus: string }>

function PhaseIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--green)', fontSize: 10,
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink-1)',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />
      </span>
    )
  }
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--silver-1)', border: '1px solid var(--silver-2)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--silver-2)' }} />
    </span>
  )
}

function StatusIcon({ state }: { state: 'done' | 'current' | 'pending' }) {
  if (state === 'done') {
    return (
      <span style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--green)',
      }}>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--ink-1)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
      </span>
    )
  }
  return (
    <span style={{
      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
      border: '1.5px solid var(--silver-2)', background: 'transparent',
    }} />
  )
}

export default function StepProgressRail({
  currentStatus,
  onNavigate,
}: {
  currentStatus: string
  onNavigate: (page: 'strategy' | 'production' | 'review_publish') => void
}) {
  const [guides, setGuides] = useState<StageGuides>({})

  useEffect(() => {
    api.cmoGetStageGuides()
      .then(r => setGuides(r.guides ?? {}))
      .catch(() => { /* graceful: labels only */ })
  }, [])

  const currentOrder = statusOrder(currentStatus)

  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      borderRight: '1px solid var(--silver-2)',
      background: 'var(--bg-surface)',
      overflowY: 'auto',
      padding: '12px 0',
    }}>
      {PHASES.map((phase, phaseIdx) => {
        const state = phaseState(phase.key as PhaseKey, currentStatus)
        const isActive = state === 'active'
        const page = PHASE_TO_PAGE[phase.key as PhaseKey]

        return (
          <div key={phase.key}>
            {/* Phase header row */}
            <button
              onClick={() => onNavigate(page)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: isActive ? 'var(--bg-inset)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '3px solid var(--green)' : '3px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <PhaseIcon state={state} />
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 700 : state === 'done' ? 500 : 400,
                color: state === 'pending' ? 'var(--ink-4)' : 'var(--ink-1)',
                flex: 1,
              }}>
                {phaseIdx + 1}. {phase.label}
              </span>
              {state === 'active' && (
                <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                  진행 중
                </span>
              )}
            </button>

            {/* Sub-statuses — expand only for active phase */}
            {isActive && (
              <div style={{ paddingLeft: 14, paddingBottom: 4 }}>
                {/* connector line */}
                <div style={{
                  marginLeft: 9,
                  borderLeft: '1.5px solid var(--silver-2)',
                  paddingLeft: 16,
                }}>
                  {phase.statuses.map(status => {
                    const sOrder = statusOrder(status)
                    const curOrder = statusOrder(currentStatus)
                    const statusState: 'done' | 'current' | 'pending' =
                      sOrder < curOrder ? 'done' :
                      sOrder === curOrder ? 'current' : 'pending'

                    const focus = guides[status]?.focus
                    const label = STATUS_LABEL[status] ?? status

                    return (
                      <div key={status} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        padding: '5px 0',
                        opacity: statusState === 'pending' ? 0.55 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <StatusIcon state={statusState} />
                          <span style={{
                            fontSize: 12,
                            fontWeight: statusState === 'current' ? 700 : 400,
                            color: statusState === 'current' ? 'var(--ink-1)' : 'var(--ink-3)',
                          }}>
                            {label}
                          </span>
                        </div>
                        {statusState === 'current' && focus && (
                          <div style={{
                            marginLeft: 20,
                            fontSize: 11,
                            color: 'var(--ink-4)',
                            lineHeight: 1.4,
                            padding: '3px 8px',
                            background: 'var(--silver-1)',
                            borderRadius: 4,
                          }}>
                            {focus}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
