'use client'
import { useEffect, useState, useCallback } from 'react'

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13000'

function getToken(): string | null {
  if (process.env.NEXT_PUBLIC_NOCOBASE_TOKEN) return process.env.NEXT_PUBLIC_NOCOBASE_TOKEN
  if (typeof window === 'undefined') return null
  return localStorage.getItem('l5_token')
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Consultation = {
  id: string
  task_id: string
  business_id: string | null
  from_agent: string
  question: string
  options: string[] | null
  status: string
  founder_response: string | null
  resolved_at: string | null
  createdAt: string
}

// ── Icon primitive ────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  chat:    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  check:   'M20 6L9 17l-5-5',
  send:    'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
}

function Icon({ name, size = 13, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {d.split(/(?=M)/).map((seg, i) => <path key={i} d={seg.trim()} />)}
    </svg>
  )
}

// ── Agent monogram color map ───────────────────────────────────────────────────

const AGENT_COLOR: Record<string, string> = {
  CMO:    'var(--wood-3)',
  CRO:    'var(--wood-2)',
  CPO:    'var(--green-press)',
  CTO:    'var(--ink-2)',
  COO:    'var(--wood-4)',
  CFO:    'var(--silver-4)',
  RiskQA: 'var(--red)',
  CEO:    'var(--ink-1)',
}

// ── ConsultationCard ──────────────────────────────────────────────────────────

interface ConsultationCardProps {
  businessId?: string | null
}

export default function ConsultationCard({ businessId }: ConsultationCardProps) {
  const [items, setItems] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const query = businessId
        ? `/api/consultation:list?status=awaiting_founder&business_id=${encodeURIComponent(businessId)}`
        : '/api/consultation:list?status=awaiting_founder'
      const res = await apiRequest<{ data: { ok: boolean; data: Consultation[] } }>(query)
      setItems(res.data?.data ?? [])
    } catch {
      // silent — consultation table may not be ready
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const respond = async (id: string, response: string) => {
    if (!response.trim()) return
    setSubmitting(id)
    try {
      await apiRequest('/api/consultation:respond', {
        method: 'POST',
        body: JSON.stringify({ id, founder_response: response }),
      })
      // Optimistic removal
      setItems(prev => prev.filter(c => c.id !== id))
      setResponses(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch {
      // silent — user can retry
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '12px 14px',
      }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>임원 협의</div>
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '60%', marginBottom: 6 }} />
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '40%' }} />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--green-tint)',
          color: 'var(--green-press)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="check" size={14} stroke={2} />
        </span>
        <div>
          <div className="j-overline" style={{ marginBottom: 1 }}>임원 협의</div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>대기 중인 협의 없음</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--green)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="chat" size={13} stroke={1.8} />
          <span className="j-overline">임원 협의</span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--green-press)',
          background: 'var(--green-tint)',
          padding: '1px 7px',
          borderRadius: 999,
        }}>
          {items.length}건
        </span>
      </div>

      {/* consultation rows */}
      {items.map((item, i) => {
        const agentColor = AGENT_COLOR[item.from_agent] ?? 'var(--ink-3)'
        const isSubmitting = submitting === item.id
        const response = responses[item.id] ?? ''

        return (
          <div key={item.id} style={{
            padding: '12px 14px',
            borderBottom: i < items.length - 1 ? '1px solid var(--silver-1)' : 'none',
            opacity: isSubmitting ? 0.5 : 1,
            transition: 'opacity 150ms',
          }}>
            {/* agent chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <span style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: agentColor,
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {item.from_agent?.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                {item.from_agent} Agent
              </span>
            </div>

            {/* question */}
            <div style={{
              fontSize: 13,
              color: 'var(--ink-1)',
              lineHeight: 1.5,
              marginBottom: 10,
              fontWeight: 500,
            }}>
              {item.question}
            </div>

            {/* options as buttons or textarea */}
            {item.options && item.options.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2 }}>
                {item.options.map((opt, oi) => (
                  <button
                    key={oi}
                    disabled={isSubmitting}
                    onClick={() => respond(item.id, opt)}
                    className="j-btn j-btn-sm"
                    style={{
                      background: response === opt ? 'var(--green-tint)' : 'var(--paper-elevated)',
                      border: `1px solid ${response === opt ? 'var(--green)' : 'var(--silver-2)'}`,
                      color: response === opt ? 'var(--green-press)' : 'var(--ink-1)',
                      borderRadius: 6,
                      padding: '5px 12px',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 7 }}>
                <textarea
                  className="j-input j-textarea"
                  value={response}
                  onChange={e => setResponses(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="창업자 답변을 입력하세요…"
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    minHeight: 52,
                    maxHeight: 80,
                    fontSize: 12.5,
                    resize: 'vertical',
                  }}
                />
                <button
                  onClick={() => respond(item.id, response)}
                  disabled={isSubmitting || !response.trim()}
                  className="j-btn j-btn-primary j-btn-sm"
                  style={{ alignSelf: 'flex-end', flexShrink: 0 }}
                >
                  <Icon name="send" size={12} stroke={1.8} />
                  전송
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
