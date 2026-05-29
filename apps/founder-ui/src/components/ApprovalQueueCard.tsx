'use client'
import { useEffect, useState, useCallback } from 'react'
import { api, TaskItem } from '@/lib/api'

const RISK_COLORS: Record<string, string> = {
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
}

const HIGH_RISK = new Set(['D3', 'D4', 'D5'])

interface ApprovalQueueCardProps {
  businessId?: string | null
}

export default function ApprovalQueueCard({ businessId }: ApprovalQueueCardProps) {
  const [items, setItems] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const all = await api.approvalQueue()
    const filtered = all.filter(t =>
      t.approval_required &&
      t.risk_level != null &&
      HIGH_RISK.has(t.risk_level) &&
      (businessId == null || t.phase === null || true) // businessId filter placeholder: backend doesn't expose business_id on TaskItem yet, show all
    )
    setItems(filtered)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const approve = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.approveTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
    } catch {
      // silent — user can retry via refresh
    } finally {
      setActionId(null)
    }
  }

  const reject = async (taskId: string) => {
    setActionId(taskId)
    try {
      await api.rejectTask(taskId)
      setItems(prev => prev.filter(i => i.task_id !== taskId))
    } catch {
      // silent
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="border border-slate-700 rounded-xl p-3 text-xs text-slate-500 animate-pulse">
        승인 대기 확인 중...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-500 text-center">
        승인 대기 없음
      </div>
    )
  }

  const preview = items.slice(0, 4)

  return (
    <div className="border border-orange-800 rounded-xl overflow-hidden">
      <div className="bg-orange-900/40 px-4 py-2 text-xs text-orange-300 font-medium uppercase tracking-wide flex items-center justify-between">
        <span>승인 대기</span>
        <span className="text-orange-400">{items.length}건</span>
      </div>
      <div className="divide-y divide-slate-700">
        {preview.map(item => (
          <div key={item.task_id} className="px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              {item.risk_level && (
                <span className={`text-xs rounded px-1.5 py-0.5 shrink-0 ${RISK_COLORS[item.risk_level] ?? 'bg-slate-700 text-slate-300'}`}>
                  {item.risk_level}
                </span>
              )}
              <span className={`text-xs font-bold shrink-0 ${AGENT_COLORS[item.agent] ?? 'text-slate-300'}`}>
                {item.agent}
              </span>
              <span className="text-xs flex-1 truncate text-slate-200">{item.task_title}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => approve(item.task_id)}
                disabled={actionId === item.task_id}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded px-3 py-1 text-xs font-medium transition-colors"
              >
                승인
              </button>
              <button
                onClick={() => reject(item.task_id)}
                disabled={actionId === item.task_id}
                className="bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded px-3 py-1 text-xs font-medium transition-colors"
              >
                거절
              </button>
            </div>
          </div>
        ))}
      </div>
      {items.length > 4 && (
        <div className="px-4 py-2 text-xs text-slate-500 bg-slate-800/50">
          +{items.length - 4}건 더 있음 — 승인 페이지에서 전체 보기
        </div>
      )}
    </div>
  )
}
