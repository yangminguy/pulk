'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

type TaskStatus = 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed'
type RiskLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5'

const STATUS_STYLES: Record<TaskStatus, string> = {
  queued: 'bg-slate-600 text-slate-200',
  running: 'bg-blue-700 text-blue-100',
  blocked: 'bg-red-700 text-red-100',
  needs_review: 'bg-yellow-700 text-yellow-100',
  done: 'bg-green-700 text-green-100',
  killed: 'bg-slate-700 text-slate-400 line-through',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  queued: '대기',
  running: '진행중',
  blocked: '차단됨',
  needs_review: '검토필요',
  done: '완료',
  killed: '종료',
}

const RISK_STYLES: Record<RiskLevel, string> = {
  D1: 'bg-green-800 text-green-200',
  D2: 'bg-blue-800 text-blue-200',
  D3: 'bg-yellow-800 text-yellow-200',
  D4: 'bg-orange-800 text-orange-200',
  D5: 'bg-red-800 text-red-200',
}

const AGENT_COLORS: Record<string, string> = {
  CMO: 'text-purple-400',
  CRO: 'text-blue-400',
  CPO: 'text-green-400',
  CTO: 'text-cyan-400',
  COO: 'text-orange-400',
  CFO: 'text-yellow-400',
  RiskQA: 'text-red-400',
  CEO: 'text-indigo-400',
  ChiefOfStaff: 'text-pink-400',
}

type FilterType = 'all' | 'running' | 'blocked' | 'needs_review'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function MonitorContent() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const [current, blocked] = await Promise.all([
        api.currentTasks().catch(() => []),
        api.blockedTasks().catch(() => []),
      ])
      const currentArr = Array.isArray(current) ? current : (current as any)?.data ?? []
      const blockedArr = Array.isArray(blocked) ? blocked : (blocked as any)?.data ?? []
      // deduplicate by id
      const map = new Map<string, any>()
      ;[...currentArr, ...blockedArr].forEach(t => map.set(t.id, t))
      setTasks(Array.from(map.values()))
    } catch {
      setTasks([])
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

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'running') return t.status === 'running' || t.status === 'queued'
    if (filter === 'blocked') return t.status === 'blocked'
    if (filter === 'needs_review') return t.status === 'needs_review' || t.approval_required
    return true
  })

  // Agent summary
  const agentCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    if (t.assigned_agent) acc[t.assigned_agent] = (acc[t.assigned_agent] ?? 0) + 1
    return acc
  }, {})

  const TABS: { key: FilterType; label: string }[] = [
    { key: 'all', label: `전체 (${tasks.length})` },
    { key: 'running', label: `진행중` },
    { key: 'blocked', label: `차단됨` },
    { key: 'needs_review', label: `승인필요` },
  ]

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h1 className="text-xl font-bold">Executive Monitor</h1>
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

      {/* Agent summary row */}
      {Object.keys(agentCounts).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {Object.entries(agentCounts).map(([agent, count]) => (
            <span key={agent} className={`font-medium ${AGENT_COLORS[agent] ?? 'text-slate-300'}`}>
              {agent}: {count}건
            </span>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              filter === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-slate-400">로딩 중...</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-slate-500 mt-12 text-sm">
          {filter === 'all' ? '활성 Task가 없습니다' : '해당 항목이 없습니다'}
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map(task => (
          <div key={task.id} className="bg-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`font-bold text-sm ${AGENT_COLORS[task.assigned_agent] ?? 'text-slate-300'}`}>
                {task.assigned_agent}
              </span>
              <span className={`text-xs rounded px-2 py-0.5 ${STATUS_STYLES[task.status as TaskStatus] ?? 'bg-slate-600'}`}>
                {STATUS_LABELS[task.status as TaskStatus] ?? task.status}
              </span>
              {task.risk_level && (
                <span className={`text-xs rounded px-2 py-0.5 ${RISK_STYLES[task.risk_level as RiskLevel] ?? 'bg-slate-600'}`}>
                  {task.risk_level}
                </span>
              )}
              {task.approval_required && (
                <span className="text-xs bg-yellow-900 text-yellow-300 rounded px-2 py-0.5">승인필요</span>
              )}
              {task.phase && (
                <span className="text-xs text-slate-500">{task.phase}</span>
              )}
            </div>
            <div className="font-medium text-sm mb-1">{task.title}</div>
            {task.rationale && (
              <div className="text-xs text-slate-400 line-clamp-2 mb-2">{task.rationale}</div>
            )}
            {task.blocker && (
              <div className="text-xs text-red-400 mt-1">⚠ {task.blocker}</div>
            )}
            {task.updated_at && (
              <div className="text-xs text-slate-600 mt-2">{relativeTime(task.updated_at)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MonitorPage() {
  return <AuthGate><MonitorContent /></AuthGate>
}
