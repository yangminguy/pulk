'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'

export default function MobileShell() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="lg:hidden fixed top-2.5 left-2.5 z-40 flex items-center justify-center"
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          color: 'var(--ink-1)',
          boxShadow: 'var(--shadow-2, 0 1px 3px rgba(0,0,0,0.08))',
          cursor: 'pointer',
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40"
          style={{ background: 'rgba(26,22,18,0.42)', backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ willChange: 'transform', height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </div>
    </>
  )
}
