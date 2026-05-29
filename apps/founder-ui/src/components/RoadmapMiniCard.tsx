'use client'
import { useEffect, useState } from 'react'
import { api, RoadmapItem } from '@/lib/api'

const STATUS_COLORS: Record<string, string> = {
  done: 'bg-green-800 text-green-200',
  in_progress: 'bg-blue-800 text-blue-200',
  blocked: 'bg-red-800 text-red-200',
  pending: 'bg-slate-700 text-slate-300',
}

interface RoadmapMiniCardProps {
  businessId: string | null
}

export default function RoadmapMiniCard({ businessId }: RoadmapMiniCardProps) {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getRoadmapItems(businessId).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [businessId])

  if (loading) {
    return (
      <div className="border border-slate-700 rounded-xl p-3 text-xs text-slate-500 animate-pulse">
        로드맵 로딩 중...
      </div>
    )
  }

  if (items.length === 0) return null

  const preview = items.slice(0, 4)

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <div className="bg-slate-700 px-4 py-2 text-xs text-slate-400 font-medium uppercase tracking-wide flex items-center justify-between">
        <span>로드맵 미리보기</span>
        <span className="text-slate-500">{items.length}건</span>
      </div>
      <div className="divide-y divide-slate-700">
        {preview.map(item => (
          <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
            <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${STATUS_COLORS[item.status] ?? 'bg-slate-700 text-slate-300'}`}>
              {item.status}
            </span>
            <span className="text-sm flex-1 truncate">{item.title}</span>
            {item.due_date && (
              <span className="text-xs text-slate-500 shrink-0">{item.due_date.slice(0, 10)}</span>
            )}
          </div>
        ))}
      </div>
      {items.length > 4 && (
        <div className="px-4 py-2 text-xs text-slate-500 bg-slate-800/50">
          +{items.length - 4}건 더 있음 — 로드맵 탭에서 전체 보기
        </div>
      )}
    </div>
  )
}
