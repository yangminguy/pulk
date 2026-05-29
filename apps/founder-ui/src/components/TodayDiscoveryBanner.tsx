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
  // A summary that is itself an HTML document (e.g. a changelog fetch that
  // returned a full page) is not a real discovery — drop it entirely.
  if (/<!doctype html|<html[\s>]/i.test(raw)) return ''
  const text = raw
    // strip tags, including a trailing tag truncated without its closing '>'
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

  // Sanitize summaries and drop any that are empty after cleaning.
  const cleaned = items
    .map(item => ({ id: item.id, text: cleanSummary(item.summary) }))
    .filter(item => item.text.length > 0)

  // Graceful: hide entirely when no usable data.
  if (loading || cleaned.length === 0) return null

  return (
    <div className="border border-indigo-700 bg-indigo-900/30 rounded-xl px-4 py-3 mb-3">
      <div className="text-xs text-indigo-400 font-medium mb-2 uppercase tracking-wide">
        오늘의 발견 (24h)
      </div>
      <ul className="space-y-1">
        {cleaned.map(item => (
          <li key={item.id} className="text-sm text-slate-200 flex items-start gap-2">
            <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
