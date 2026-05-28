'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, TaskItem } from '@/lib/api'

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-600 text-slate-200',
  running: 'bg-blue-700 text-blue-100',
  blocked: 'bg-red-700 text-red-100',
  needs_review: 'bg-yellow-700 text-yellow-100',
  done: 'bg-green-700 text-green-100',
  killed: 'bg-slate-700 text-slate-400 line-through',
}

const STATUS_LABELS: Record<string, string> = {
  queued: '대기',
  running: '진행중',
  blocked: '차단됨',
  needs_review: '검토필요',
  done: '완료',
  killed: '종료',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function ControlRoomContent() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      setError(null)
      const all = await api.currentTasks()
      const ctoTasks = all.filter(t => t.agent === 'CTO')
      setTasks(ctoTasks)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '로드 실패')
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
        <h1 className="text-xl font-bold">CTO Control Room</h1>
        <button
          onClick={() => window.open('http://localhost:3001', '_blank')}
          className="ml-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded px-4 py-2 transition-colors"
        >
          Agent Control Room 열기
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={e => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          30초 자동 새로고침
        </label>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-200">
          새로고침
        </button>
      </div>

      {loading && <div className="text-slate-400">로딩 중...</div>}

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div className="text-center text-slate-500 mt-12 text-sm">
          CTO에게 할당된 활성 태스크가 없습니다
        </div>
      )}

      <div className="grid gap-3">
        {tasks.map(task => (
          <div key={task.task_id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-cyan-400">CTO</span>
              <span className={`text-xs rounded px-2 py-0.5 ${STATUS_STYLES[task.status] ?? 'bg-slate-600 text-slate-200'}`}>
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
              {task.risk_level && (
                <span className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">
                  {task.risk_level}
                </span>
              )}
              {task.approval_required && (
                <span className="text-xs bg-yellow-900 text-yellow-300 rounded px-2 py-0.5">승인필요</span>
              )}
            </div>
            <div className="font-medium text-sm mb-1">{task.task_title}</div>
            {task.blocker && (
              <div className="text-xs text-orange-400 mt-1">
                현재 단계: {task.blocker}
              </div>
            )}
            {task.rationale && (
              <div className="text-xs text-slate-400 line-clamp-2 mt-1">{task.rationale}</div>
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

export default function ControlRoomPage() {
  return <AuthGate><ControlRoomContent /></AuthGate>
}
