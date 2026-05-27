'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

interface PhaseInfo {
  current_phase: string
  current_phase_label: string
  next_phase: string | null
  next_phase_label: string | null
  phase_index: number
  total_phases: number
  requires_approval: boolean
}

function PhaseTransitionPanel() {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    setLoading(true)
    api.currentPhase().then(setPhase).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleRequest = async () => {
    if (!phase?.next_phase || !reason.trim()) return
    setSubmitting(true)
    try {
      await api.requestTransition(phase.current_phase, phase.next_phase, reason)
      showToast('Phase 전환 요청이 승인 대기열에 추가됐습니다 (D5)')
      setShowForm(false)
      setReason('')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-slate-800 rounded-xl p-4 mb-5 border border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 uppercase tracking-wide">BPR Phase</span>
          <span className="bg-indigo-700 text-indigo-100 text-sm font-medium rounded px-3 py-0.5">
            {phase?.current_phase_label ?? '로딩 중'}
          </span>
          {phase && (
            <span className="text-xs text-slate-500">
              {phase.phase_index + 1} / {phase.total_phases}
            </span>
          )}
        </div>
        {phase?.next_phase && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700 rounded px-3 py-1 transition-colors"
          >
            다음 Phase로 전환 →
          </button>
        )}
      </div>

      {/* Phase progress bar */}
      {phase && (
        <div className="flex gap-1 mt-2">
          {Array.from({ length: phase.total_phases }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= phase.phase_index ? 'bg-indigo-500' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      )}

      {showForm && phase?.next_phase && (
        <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
          <div className="text-sm text-slate-300">
            <span className="text-indigo-400">{phase.current_phase_label}</span>
            <span className="mx-2 text-slate-500">→</span>
            <span className="text-green-400">{phase.next_phase_label}</span>
            <span className="ml-2 text-xs bg-red-900 text-red-300 rounded px-2 py-0.5">D5 승인 필요</span>
          </div>
          <textarea
            className="w-full bg-slate-700 rounded px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500"
            rows={2}
            placeholder="전환 사유를 입력하세요 (예: PMF 신호 3개 달성, 첫 유료 전환 발생)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleRequest}
              disabled={submitting || !reason.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded px-4 py-1.5 text-sm font-medium transition-colors"
            >
              {submitting ? '요청 중...' : '전환 요청 (승인 대기열로)'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-200 text-sm px-3"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="mt-3 bg-slate-700 text-white text-xs rounded px-3 py-2">{toast}</div>
      )}
    </div>
  )
}

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
      // deduplicate by task_id
      const map = new Map<string, any>()
      ;[...currentArr, ...blockedArr].forEach(t => map.set(t.task_id, t))
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
    if (t.agent) acc[t.agent] = (acc[t.agent] ?? 0) + 1
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
      <PhaseTransitionPanel />
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
          <div key={task.task_id} className="bg-slate-800 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`font-bold text-sm ${AGENT_COLORS[task.agent] ?? 'text-slate-300'}`}>
                {task.agent}
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
            <div className="font-medium text-sm mb-1">{task.task_title}</div>
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
