'use client'
import { useState, type ReactNode } from 'react'

// StageGate — soft-gating wrapper: active=open, done=collapsible, locked=disabled.
export default function StageGate({
  title,
  state,
  children,
}: {
  title: string
  state: 'done' | 'active' | 'locked'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (state === 'active') {
    return <div style={{ marginBottom: 16 }}>{children}</div>
  }

  const done = state === 'done'
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => { if (done) setOpen(o => !o) }}
        disabled={!done}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          border: '1px solid var(--silver-2)',
          borderRadius: 8,
          background: done ? 'var(--bg-inset)' : 'var(--silver-1)',
          cursor: done ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? 'var(--green)' : 'transparent',
          border: done ? 'none' : '1px solid var(--silver-2)',
        }}>
          {done
            ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M3 4.5V3.2a2 2 0 1 1 4 0V4.5M2.6 4.5h4.8v3.2H2.6z" stroke="var(--ink-4)" strokeWidth="0.9"/></svg>}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: done ? 'var(--ink-2)' : 'var(--ink-4)' }}>
          {title}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>
          {done ? (open ? '접기' : '완료 · 보기') : '이전 단계 완료 후'}
        </span>
      </button>
      {done && open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}
