'use client'
import { useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, type CurationSummaryData, type CurationSummaryItem } from '@/lib/api'

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
function IconRestore({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a5 5 0 1 1 1.46 3.54" /><path d="M3 12V8.5h3.5" />
    </svg>
  )
}
function IconBrain({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 3a2 2 0 0 0-2 2 2 2 0 0 0-1 3.5A2 2 0 0 0 3.5 12 2 2 0 0 0 7 12.5V4a1.5 1.5 0 0 0-1.5-1z" />
      <path d="M10.5 3a2 2 0 0 1 2 2 2 2 0 0 1 1 3.5A2 2 0 0 1 12.5 12 2 2 0 0 1 9 12.5V4a1.5 1.5 0 0 1 1.5-1z" />
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

const EMPTY_SUMMARY: CurationSummaryData = {
  week_start: '',
  saved: [],
  discarded: [],
  needs_review: [],
  totals: { saved: 0, discarded: 0, needs_review: 0 },
}

// ─── Section primitives ──────────────────────────────────────────────────────
function SectionHeader({ title, count, tone }: { title: string; count: number; tone: 'saved' | 'discarded' | 'review' }) {
  const badgeClass =
    tone === 'saved' ? 'j-badge-live' : tone === 'discarded' ? 'j-badge-blocked' : 'j-badge-review'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h2 className="j-h4" style={{ margin: 0, color: 'var(--ink-1)' }}>{title}</h2>
      <span className={`j-badge ${badgeClass}`} style={{ fontSize: 12 }}>
        <span className="j-badge-dot" />
        {count}건
      </span>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="j-body" style={{ color: 'var(--ink-3)', fontSize: 13, padding: '6px 2px', margin: 0 }}>
      {text}
    </p>
  )
}

function InsightText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-1)', margin: 0 }}>
      {children}
    </p>
  )
}

function MemoryContent() {
  const [summary, setSummary]   = useState<CurationSummaryData>(EMPTY_SUMMARY)
  const [loading, setLoading]   = useState(true)
  const [curating, setCurating] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // Kick the auto-curation sweep, then load the weekly summary.
  const load = async (sweep = true) => {
    if (sweep) setCurating(true)
    else setLoading(true)
    try {
      if (sweep) await api.curate()
      const data = await api.curationSummary()
      setSummary(data ?? EMPTY_SUMMARY)
    } catch {
      setSummary(EMPTY_SUMMARY)
    } finally {
      setCurating(false)
      setLoading(false)
    }
  }

  useEffect(() => { load(true) }, [])

  const override = async (id: string, decision: 'save' | 'discard' | 'restore', msg: string) => {
    setActionId(id)
    try {
      await api.overrideCuration(id, decision)
      await load(false)
      showToast(msg)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  const { totals } = summary
  const busy = loading || curating

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <p className="j-overline" style={{ marginBottom: 6 }}>지식 · Knowledge Auto-Curation</p>
          <h1 className="j-h2">지식</h1>
        </div>
        <button
          onClick={() => load(true)}
          disabled={busy}
          className="j-btn j-btn-secondary j-btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <IconRefresh />
          지금 정리
        </button>
      </div>

      {/* Headline explainer */}
      <div className="j-card" style={{ padding: '14px 16px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ color: 'var(--green-press)', flexShrink: 0, marginTop: 1 }}><IconBrain size={16} /></span>
        <p className="j-body" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
          지식은 알아서 저장·폐기됩니다. 저장은 <strong style={{ color: 'var(--ink-1)' }}>세컨 브레인</strong>에 적립되고,
          폐기는 30일간 보관 후 영구 삭제됩니다. 아래는 이번 주 자동 큐레이션 결과입니다.
          {summary.week_start && (
            <span style={{ color: 'var(--ink-3)' }}> (주 시작 {summary.week_start})</span>
          )}
        </p>
      </div>

      {/* Curating / loading state */}
      {busy && (
        <p className="j-body" style={{ color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="j-badge-dot" style={{ background: 'var(--green-press)' }} />
          {curating ? '자동 정리 중…' : '로딩 중…'}
        </p>
      )}

      {!busy && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* ── 이번 주 저장됨 (세컨 브레인) ── */}
          <section>
            <SectionHeader title="이번 주 저장됨 (세컨 브레인)" count={totals.saved} tone="saved" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.saved.length === 0 && <EmptyRow text="이번 주 세컨 브레인에 적립된 지식이 없습니다." />}
              {summary.saved.map((item: CurationSummaryItem) => (
                <div key={item.id} className="j-card" style={{ padding: '14px 16px' }}>
                  <InsightText>{item.insight}</InsightText>
                  <div style={{ marginTop: 10 }}>
                    <span className="j-badge j-badge-live" style={{ fontSize: 12 }}>
                      <IconBrain size={11} />
                      세컨브레인에 적립됨
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 자동 폐기됨 ── */}
          <section>
            <SectionHeader title="자동 폐기됨" count={totals.discarded} tone="discarded" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.discarded.length === 0 && <EmptyRow text="이번 주 자동 폐기된 지식이 없습니다." />}
              {summary.discarded.map((item: CurationSummaryItem) => {
                const isActing = actionId === item.id
                return (
                  <div key={item.id} className="j-card" style={{ padding: '14px 16px', opacity: isActing ? 0.6 : 1, transition: 'opacity 200ms' }}>
                    <InsightText>{item.insight}</InsightText>
                    {item.reason && (
                      <p className="j-meta" style={{ marginTop: 8 }}>폐기 사유: {item.reason}</p>
                    )}
                    <p className="j-meta" style={{ marginTop: 4, color: 'var(--ink-3)' }}>
                      30일 보관 후 영구 삭제됩니다{item.discarded_at ? ` · 폐기일 ${item.discarded_at.slice(0, 10)}` : ''}
                    </p>
                    <hr className="j-hairline" />
                    <div style={{ paddingTop: 4 }}>
                      <button
                        onClick={() => override(item.id, 'restore', '복원되었습니다')}
                        disabled={isActing}
                        className="j-btn j-btn-secondary j-btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <IconRestore />
                        복원
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── 확인 필요 ── */}
          <section>
            <SectionHeader title="확인 필요" count={totals.needs_review} tone="review" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.needs_review.length === 0 && <EmptyRow text="확인이 필요한 지식이 없습니다. 모두 자동 처리되었습니다." />}
              {summary.needs_review.map((item: CurationSummaryItem) => {
                const isActing = actionId === item.id
                return (
                  <div key={item.id} className="j-card" style={{ padding: '14px 16px', opacity: isActing ? 0.6 : 1, transition: 'opacity 200ms' }}>
                    <InsightText>{item.insight}</InsightText>
                    {item.reason && (
                      <p className="j-meta" style={{ marginTop: 8 }}>{item.reason}</p>
                    )}
                    <hr className="j-hairline" />
                    <div style={{ display: 'flex', gap: 8, paddingTop: 4, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => override(item.id, 'save', '세컨 브레인에 저장되었습니다')}
                        disabled={isActing}
                        className="j-btn j-btn-primary j-btn-sm"
                      >
                        <IconSave />
                        저장
                      </button>
                      <button
                        onClick={() => override(item.id, 'discard', '폐기되었습니다')}
                        disabled={isActing}
                        className="j-btn j-btn-danger j-btn-sm"
                      >
                        <IconTrash />
                        폐기
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* All-empty state */}
          {totals.saved === 0 && totals.discarded === 0 && totals.needs_review === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--green-tint)', color: 'var(--green-press)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <IconInbox size={28} />
              </div>
              <p className="j-h4" style={{ color: 'var(--ink-2)', marginBottom: 6 }}>이번 주 큐레이션 내역이 없습니다</p>
              <p className="j-body" style={{ fontSize: 14, maxWidth: 320, margin: '0 auto' }}>
                새로운 인사이트가 생성되면 자동으로 저장·폐기되어 이곳에 요약됩니다.
              </p>
            </div>
          )}
        </div>
      )}

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
