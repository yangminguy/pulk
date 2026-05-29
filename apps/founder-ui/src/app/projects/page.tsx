'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, ActiveBusiness } from '@/lib/api'

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function stageIcon(stage: string | null): string {
  if (!stage) return '⬜'
  const s = stage.toLowerCase()
  if (s === 'active' || s === 'running') return '🟢'
  if (s === 'idea' || s === 'draft') return '🟡'
  if (s === 'deleted' || s === 'killed' || s === 'archived') return '🛑'
  return '⬜'
}

function PhaseBadge({ phase }: { phase: string | null }) {
  if (!phase) return null
  return (
    <span className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">{phase}</span>
  )
}

export default function ProjectsPage() {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.listActiveBusinesses()
      setBusinesses(data)
    } catch {
      setBusinesses([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    if (!autoRefresh) return
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load, autoRefresh])

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-xl font-bold">Projects</h1>
        <span className="text-xs text-slate-400">활성 프로젝트 목록</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          30초 자동 새로고침
        </label>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-200">새로고침</button>
      </div>

      {loading && <div className="text-slate-400">로딩 중...</div>}

      {!loading && businesses.length === 0 && (
        <div className="text-center text-slate-500 mt-12 text-sm">
          활성 프로젝트가 없습니다.
        </div>
      )}

      <div className="grid gap-3">
        {businesses.map((b) => (
          <Link
            key={b.id}
            href={`/projects/${b.id}`}
            className="block bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-lg">{stageIcon(b.lifecycle_stage)}</span>
              <span className="font-medium">{b.name}</span>
              <PhaseBadge phase={b.current_phase} />
              <span className="ml-auto text-xs text-slate-500">{relativeTime(b.updated_at)}</span>
            </div>
            {b.one_liner && (
              <div className="text-xs text-slate-400 ml-8">{b.one_liner}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
