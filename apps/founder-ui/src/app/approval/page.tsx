'use client'
import { useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

const RISK_COLORS: Record<string, string> = {
  D3: 'bg-yellow-700 text-yellow-100',
  D4: 'bg-orange-700 text-orange-100',
  D5: 'bg-red-700 text-red-100',
}

function ApprovalContent() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    try {
      const data = await api.approvalQueue()
      setItems(Array.isArray(data) ? data : (data as any)?.data ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const approve = async (id: string) => {
    setActionId(id)
    try {
      await api.approveTask(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('승인되었습니다 ✓')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  const reject = async (id: string) => {
    setActionId(id)
    try {
      await api.rejectTask(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('거절되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">승인 대기</h1>
        <span className="bg-red-600 text-white text-xs rounded-full px-2 py-0.5">{items.length}</span>
        <button onClick={load} className="ml-auto text-xs text-slate-400 hover:text-slate-200">새로고침</button>
      </div>

      {loading && <div className="text-slate-400">로딩 중...</div>}

      {!loading && items.length === 0 && (
        <div className="text-center text-slate-500 mt-16 text-sm">승인 대기 항목이 없습니다 ✓</div>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="bg-slate-800 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="bg-indigo-700 text-xs rounded px-2 py-0.5 font-medium shrink-0">
                {item.assigned_agent}
              </span>
              {item.risk_level && (
                <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${RISK_COLORS[item.risk_level] ?? 'bg-slate-700'}`}>
                  {item.risk_level}
                </span>
              )}
              <span className="font-medium text-sm">{item.title}</span>
            </div>
            {item.rationale && (
              <p className="text-sm text-slate-300 mb-2">{item.rationale}</p>
            )}
            {item.expected_output && (
              <p className="text-xs text-slate-500 mb-4">예상 산출물: {item.expected_output}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => approve(item.id)}
                disabled={actionId === item.id}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                ✅ 승인
              </button>
              <button
                onClick={() => reject(item.id)}
                disabled={actionId === item.id}
                className="bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                ❌ 거절
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-700 text-white text-sm rounded-xl px-5 py-3 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}

export default function ApprovalPage() {
  return <AuthGate><ApprovalContent /></AuthGate>
}
