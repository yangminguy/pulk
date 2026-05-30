'use client'
import { useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

const PII_LABELS: Record<string, string> = {
  none:   '없음',
  low:    '낮음',
  medium: '중간',
  high:   '높음',
}

// ─── SVG icons ─────────────────────────────────────────────────────────────
function IconRefresh({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.6 0 3.05.68 4.07 1.77" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  )
}
function IconSave({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5v8H3V3h8l2 2z" /><path d="M10 3v4H5V3" /><rect x="5" y="10" width="6" height="3" rx="0.5" />
    </svg>
  )
}
function IconTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M5.5 4.5l.5 8h4l.5-8" />
    </svg>
  )
}
function IconInbox({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="26" height="22" rx="2" />
      <path d="M3 19h6l2.5 4h9L23 19h6" />
    </svg>
  )
}
function IconShield({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2L3 4v4c0 3.31 2.24 6.41 5 7 2.76-.59 5-3.69 5-7V4L8 2z" />
    </svg>
  )
}

// ─── PII badge helper ────────────────────────────────────────────────────────
function PiiBadge({ level }: { level: string }) {
  if (!level || level === 'none') {
    return (
      <span className="j-badge j-badge-live">
        <span className="j-badge-dot" />
        PII 없음
      </span>
    )
  }
  if (level === 'low') {
    return (
      <span className="j-badge j-badge-review">
        <IconShield size={11} />
        PII 낮음
      </span>
    )
  }
  // medium or high
  return (
    <span className="j-badge j-badge-blocked">
      <IconShield size={11} />
      PII {PII_LABELS[level] ?? level}
    </span>
  )
}

function MemoryContent() {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.memoryCandidates()
      setItems(Array.isArray(data) ? data : (data as any)?.data ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const save = async (id: string) => {
    setActionId(id)
    try {
      await api.saveMemory(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('메모리가 저장되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  const discard = async (id: string) => {
    setActionId(id)
    try {
      await api.discardMemory(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('폐기되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <p className="j-overline" style={{ marginBottom: 6 }}>회사 지식 승인 큐</p>
          <h1 className="j-h2" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            Memory Review
            {!loading && items.length > 0 && (
              <span className="j-badge j-badge-review" style={{ fontSize: 13, paddingTop: 4, paddingBottom: 4 }}>
                <span className="j-badge-dot" />
                {items.length}건 대기
              </span>
            )}
          </h1>
        </div>
        <button
          onClick={load}
          className="j-btn j-btn-secondary j-btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconRefresh />
          새로고침
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <p className="j-body" style={{ color: 'var(--ink-3)' }}>로딩 중...</p>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '72px 0', color: 'var(--ink-3)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--green-tint)', color: 'var(--green-press)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <IconInbox size={28} />
          </div>
          <p className="j-h4" style={{ color: 'var(--ink-2)', marginBottom: 6 }}>검토할 항목이 없습니다</p>
          <p className="j-body" style={{ fontSize: 14, maxWidth: 320, margin: '0 auto' }}>
            새로운 메모리 후보가 생성되면 이곳에 나타납니다. 지금은 모두 처리된 상태입니다.
          </p>
        </div>
      )}

      {/* Memory cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => {
          const isActing = actionId === item.id
          const hasPii   = item.pii_level && item.pii_level !== 'none'
          return (
            <div
              key={item.id}
              className="j-card"
              style={{
                padding: 0,
                overflow: 'hidden',
                opacity: isActing ? 0.6 : 1,
                transition: 'opacity 200ms',
              }}
            >
              {/* Card header strip */}
              <div style={{
                padding: '10px 16px',
                background: hasPii ? 'var(--red-tint)' : 'var(--paper-surface)',
                borderBottom: '1px solid var(--silver-1)',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                {item.assigned_agent && (
                  <span className="j-badge j-badge-neutral">
                    <span className="j-badge-dot" />
                    {item.assigned_agent}
                  </span>
                )}
                <PiiBadge level={item.pii_level ?? 'none'} />
              </div>

              {/* Card body */}
              <div style={{ padding: '14px 16px' }}>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--ink-1)',
                  margin: '0 0 10px',
                }}>
                  {item.insight_to_record ?? item.content ?? JSON.stringify(item)}
                </p>

                {item.title && (
                  <p className="j-meta" style={{ marginBottom: 14 }}>
                    출처: {item.title}
                  </p>
                )}

                <hr className="j-hairline" />

                <div style={{ display: 'flex', gap: 8, paddingTop: 4, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => save(item.id)}
                    disabled={isActing}
                    className="j-btn j-btn-primary j-btn-sm"
                  >
                    <IconSave />
                    저장
                  </button>
                  <button
                    onClick={() => discard(item.id)}
                    disabled={isActing}
                    className="j-btn j-btn-danger j-btn-sm"
                  >
                    <IconTrash />
                    폐기
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--ink-1)', color: 'var(--paper-canvas)',
          fontSize: 13, fontFamily: 'var(--font-sans)',
          borderRadius: 8, padding: '11px 18px',
          boxShadow: 'var(--shadow-3)',
          zIndex: 100,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default function MemoryPage() {
  return <AuthGate><MemoryContent /></AuthGate>
}
