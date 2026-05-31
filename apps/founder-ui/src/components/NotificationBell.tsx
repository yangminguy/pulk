'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'

// Top-right bell. Holds "오늘의 발견" (discoveries) out of the main column so it
// doesn't eat vertical space. Business-scoped via selectedId.
export default function NotificationBell() {
  const { selectedId } = useBusiness()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await api.getTodayDiscoveries(selectedId))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedId])

  const count = items.length

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (!open) load() }}
        aria-label="알림"
        className="fixed top-2.5 right-2.5 z-40 flex items-center justify-center"
        style={{
          width: 38, height: 38, borderRadius: 8,
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          color: 'var(--ink-1)',
          boxShadow: 'var(--shadow-2, 0 1px 3px rgba(0,0,0,0.08))',
          cursor: 'pointer',
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999,
            background: 'var(--green)', color: '#fff',
            fontSize: 9.5, fontWeight: 700, lineHeight: '15px', textAlign: 'center',
            fontFamily: 'var(--font-mono)',
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" style={{ background: 'transparent' }} />
          <div
            className="fixed z-50"
            style={{
              top: 52, right: 10, width: 'min(360px, calc(100vw - 20px))',
              maxHeight: '70vh', overflowY: 'auto',
              background: 'var(--paper-elevated)',
              border: '1px solid var(--silver-2)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-3, 0 8px 24px rgba(0,0,0,0.12))',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--silver-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>오늘의 발견 · 24H</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{count}건</span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {loading ? (
                <div style={{ padding: '16px 14px', fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center' }}>로딩 중…</div>
              ) : count === 0 ? (
                <div style={{ padding: '20px 14px', fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center', fontStyle: 'italic' }}>새로운 발견이 없습니다</div>
              ) : (
                items.map((d, i) => (
                  <div key={i} style={{ padding: '10px 14px', borderBottom: i < count - 1 ? '1px solid var(--silver-1)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <span className="j-badge j-badge-neutral" style={{ fontSize: 10 }}>{d.source}</span>
                    </div>
                    <p style={{
                      margin: 0, fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere',
                    }}>
                      {d.insight ?? d.summary ?? d.title ?? d.text ?? ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
