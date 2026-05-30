'use client'
import { useEffect, useState } from 'react'
import { api, TodayDiscovery } from '@/lib/api'

interface TodayDiscoveryBannerProps {
  businessId: string | null
}

/**
 * Discovery summaries can arrive as raw HTML (e.g. a changelog fetch that
 * returned a full HTML page). A non-technical founder must never see markup —
 * strip tags, decode common entities, collapse whitespace, and truncate.
 */
function cleanSummary(raw: string): string {
  if (!raw) return ''
  if (/<!doctype html|<html[\s>]/i.test(raw)) return ''
  const text = raw
    .replace(/<[^>]*>?/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 200 ? text.slice(0, 200) + '…' : text
}

export default function TodayDiscoveryBanner({ businessId }: TodayDiscoveryBannerProps) {
  const [items, setItems] = useState<TodayDiscovery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getTodayDiscoveries(businessId).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [businessId])

  const cleaned = items
    .map(item => ({ id: item.id, text: cleanSummary(item.summary) }))
    .filter(item => item.text.length > 0)

  // Graceful: hide entirely when no usable data.
  if (loading || cleaned.length === 0) return null

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
      }}>
        {/* small green dot accent */}
        <span style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: 'var(--green)',
          flexShrink: 0,
        }} />
        <span className="j-overline">오늘의 발견 · 24h</span>
      </div>

      {/* discovery rows */}
      <div>
        {cleaned.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex',
            gap: 10,
            padding: '10px 14px',
            borderBottom: i < cleaned.length - 1 ? '1px solid var(--silver-1)' : 'none',
            alignItems: 'flex-start',
          }}>
            {/* bullet */}
            <span style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: 'var(--silver-3)',
              flexShrink: 0,
              marginTop: 6,
            }} />
            <span style={{
              fontSize: 13,
              color: 'var(--ink-1)',
              lineHeight: 1.5,
            }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
