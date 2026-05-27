'use client'
import { useState, useRef, useEffect } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

interface Message {
  id: string
  role: 'founder' | 'ceo'
  text: string
  data?: {
    goal?: string
    phase?: string
    risk_level?: string
    tasks?: Array<{ assigned_agent: string; title: string; rationale?: string }>
  }
}

const PHASE_LABELS: Record<string, string> = {
  direction_alignment: '방향 정렬',
  pmf_diagnosis: 'PMF 진단',
  execution_build: '실행 빌드',
  sales_distribution_test: '세일즈 테스트',
  productization_review: '제품화 검토',
  scale_automation: '스케일/자동화',
}

const RISK_COLORS: Record<string, string> = {
  D1: 'bg-green-700',
  D2: 'bg-blue-700',
  D3: 'bg-yellow-700',
  D4: 'bg-orange-700',
  D5: 'bg-red-700',
}

function CEOResponse({ data }: { data: Message['data'] }) {
  if (!data) return null
  return (
    <div className="mt-2 space-y-2">
      {data.goal && (
        <div className="text-sm text-slate-300">
          <span className="text-slate-500">목표:</span> {data.goal}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {data.phase && (
          <span className="text-xs bg-indigo-700 rounded px-2 py-0.5">
            {PHASE_LABELS[data.phase] ?? data.phase}
          </span>
        )}
        {data.risk_level && (
          <span className={`text-xs rounded px-2 py-0.5 ${RISK_COLORS[data.risk_level] ?? 'bg-slate-700'}`}>
            {data.risk_level}
          </span>
        )}
      </div>
      {data.tasks && data.tasks.length > 0 && (
        <div className="space-y-1 mt-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">배정된 Task</div>
          {data.tasks.map((t, i) => (
            <div key={i} className="bg-slate-700 rounded px-3 py-2 text-sm">
              <span className="font-medium text-indigo-400">{t.assigned_agent}</span>
              <span className="mx-2 text-slate-500">—</span>
              <span>{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChatContent() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')

    const founderMsg: Message = { id: Date.now().toString(), role: 'founder', text }
    setMessages(prev => [...prev, founderMsg])
    setLoading(true)

    try {
      const res = await api.submitInstruction(text)
      const interp = (res as any)?.data?.interpretation ?? (res as any)?.interpretation ?? res
      const tasks = (res as any)?.data?.tasks ?? (res as any)?.tasks ?? []
      const ceoMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ceo',
        text: (interp as any)?.goal ?? '지시를 처리했습니다.',
        data: {
          goal: (interp as any)?.goal,
          phase: (interp as any)?.phase,
          risk_level: (interp as any)?.risk_level,
          tasks,
        },
      }
      setMessages(prev => [...prev, ceoMsg])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'API 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-bold">CEO Agent 채팅</h1>
        <p className="text-sm text-slate-400">지시를 입력하면 CEO Agent가 해석하고 Executive Task를 배정합니다.</p>
      </div>

      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-16 text-sm">
            비즈니스 지시를 입력해보세요
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'founder' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${
                msg.role === 'founder'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}
            >
              {msg.role === 'ceo' && (
                <div className="text-xs text-indigo-400 mb-1 font-medium">CEO Agent</div>
              )}
              <div>{msg.text}</div>
              {msg.role === 'ceo' && <CEOResponse data={msg.data} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 animate-pulse">
              CEO Agent가 분석 중...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="text-red-400 text-sm mb-2">{error}</div>}

      <div className="flex gap-2">
        <input
          className="flex-1 bg-slate-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="비즈니스 지시를 입력하세요... (예: PMF 메시지 실험 계획해줘)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl px-5 py-3 text-sm font-medium transition-colors"
        >
          전송
        </button>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return <AuthGate><ChatContent /></AuthGate>
}
