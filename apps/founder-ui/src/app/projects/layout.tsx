'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthGate from '@/components/AuthGate'
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

function stageColor(stage: string | null): string {
  if (!stage) return 'text-slate-400'
  const s = stage.toLowerCase()
  if (s === 'active' || s === 'running') return 'text-green-400'
  if (s === 'idea' || s === 'draft') return 'text-yellow-400'
  if (s === 'deleted' || s === 'killed' || s === 'archived') return 'text-red-400'
  return 'text-slate-300'
}

function stageIcon(stage: string | null): string {
  if (!stage) return '⬜'
  const s = stage.toLowerCase()
  if (s === 'active' || s === 'running') return '🟢'
  if (s === 'idea' || s === 'draft') return '🟡'
  if (s === 'deleted' || s === 'killed' || s === 'archived') return '🛑'
  return '⬜'
}

function ProjectsSidebar({ businesses, loading }: { businesses: ActiveBusiness[]; loading: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col py-4 px-2 min-h-screen shrink-0">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-3">Projects</div>
      {loading && <div className="text-xs text-slate-500 px-2">로딩 중...</div>}
      {!loading && businesses.length === 0 && (
        <div className="text-xs text-slate-500 px-2">활성 프로젝트 없음</div>
      )}
      <nav className="space-y-0.5 flex-1 overflow-y-auto">
        {businesses.map((b) => {
          const href = `/projects/${b.id}`
          const isActive = pathname === href
          return (
            <Link
              key={b.id}
              href={href}
              className={`flex items-center justify-between gap-2 px-2 py-2 rounded text-sm transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className="truncate flex-1">{b.name}</span>
              <span title={b.lifecycle_stage ?? ''}>{stageIcon(b.lifecycle_stage)}</span>
            </Link>
          )
        })}
      </nav>
      <Link
        href="/projects"
        className={`mt-2 px-2 py-1.5 rounded text-xs transition-colors ${
          pathname === '/projects' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        + 전체 목록
      </Link>
    </aside>
  )
}

function ProjectsLayoutInner({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [loading, setLoading] = useState(true)

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
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div className="flex flex-1 -m-6 min-h-screen">
      <ProjectsSidebar businesses={businesses} loading={loading} />
      <div className="flex-1 p-6 overflow-auto">{children}</div>
    </div>
  )
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ProjectsLayoutInner>{children}</ProjectsLayoutInner>
    </AuthGate>
  )
}
