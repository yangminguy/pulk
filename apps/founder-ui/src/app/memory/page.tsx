'use client'
import { useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

const PII_LABELS: Record<string, string> = {
  none: '없음',
  low: '낮음',
  medium: '중간',
  high: '높음',
}

function MemoryContent() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    try {
      const data = await api.memoryCandidates()
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

  const save = async (id: string) => {
    setActionId(id)
    try {
      await api.saveMemory(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('메모리가 저장되었습니다 💾')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  const discard = async (id: string) => {
    setActionId(id)
    try {
      await api.discardMemory(id)
      setItems(prev => prev.filter(i => i.id !== id))
      showToast('폐기되었습니다')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '오류')
    } finally {
      setActionId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Memory Review</h1>
        <span className="bg-indigo-600 text-white text-xs rounded-full px-2 py-0.5">{items.length}</span>
        <button onClick={load} className="ml-auto text-xs text-slate-400 hover:text-slate-200">새로고침</button>
      </div>

      {loading && <div className="text-slate-400">로딩 중...</div>}

      {!loading && items.length === 0 && (
        <div className="text-center text-slate-500 mt-16 text-sm">검토할 메모리 후보가 없습니다</div>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="bg-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              {item.assigned_agent && (
                <span className="bg-indigo-700 text-xs rounded px-2 py-0.5">{item.assigned_agent}</span>
              )}
              {item.pii_level && item.pii_level !== 'none' && (
                <span className="bg-red-800 text-red-200 text-xs rounded px-2 py-0.5">
                  🔴 PII: {PII_LABELS[item.pii_level] ?? item.pii_level}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-200 mb-2">
              {item.insight_to_record ?? item.content ?? JSON.stringify(item)}
            </p>
            {item.title && (
              <p className="text-xs text-slate-500 mb-4">출처: {item.title}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => save(item.id)}
                disabled={actionId === item.id}
                className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                💾 저장
              </button>
              <button
                onClick={() => discard(item.id)}
                disabled={actionId === item.id}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                🗑 폐기
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

export default function MemoryPage() {
  return <AuthGate><MemoryContent /></AuthGate>
}
