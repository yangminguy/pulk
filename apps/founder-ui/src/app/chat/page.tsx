'use client'
import { useState, useRef, useEffect } from 'react'
import AuthGate from '@/components/AuthGate'
import TabLayout from '@/components/TabLayout'
import RoadmapMiniCard from '@/components/RoadmapMiniCard'
import TodayDiscoveryBanner from '@/components/TodayDiscoveryBanner'
import ApprovalQueueCard from '@/components/ApprovalQueueCard'
import { api } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'

const PHASE_LABELS: Record<string, string> = {
  direction_alignment: '방향 정렬',
  pmf_diagnosis: 'PMF 진단',
  execution_build: '실행 빌드',
  sales_distribution_test: '세일즈 테스트',
  productization_review: '제품화 검토',
  scale_automation: '스케일/자동화',
}

const RISK_COLORS: Record<string, string> = {
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
}

type ProposedTask = {
  id: string
  assigned_agent: string
  title: string
  rationale: string
  risk_level?: string
  approval_required?: boolean
}

type CEOMessage = {
  id: string
  role: 'founder' | 'ceo'
  text: string
  instructionId?: string
  interpretation?: {
    goal?: string
    phase?: string
    risk_level?: string
    assumptions?: string[]
    success_criteria?: string[]
  }
  proposedTasks?: ProposedTask[]
  planStatus?: 'pending' | 'approved' | 'rejected'
}

function ProposedTasksPanel({
  tasks,
  instructionId,
  planStatus,
  onApprove,
  onReject,
}: {
  tasks: ProposedTask[]
  instructionId: string
  planStatus: 'pending' | 'approved' | 'rejected'
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)

  const approve = async () => {
    setLoading(true)
    try { onApprove(instructionId) } finally { setLoading(false) }
  }
  const reject = async () => {
    setLoading(true)
    try { onReject(instructionId) } finally { setLoading(false) }
  }

  return (
    <div className="mt-3 border border-slate-600 rounded-xl overflow-hidden">
      <div className="bg-slate-700 px-4 py-2 text-xs text-slate-400 font-medium uppercase tracking-wide">
        배정 예정 Task ({tasks.length}건)
      </div>
      <div className="divide-y divide-slate-700">
        {tasks.map((t, i) => (
          <div key={i} className="px-4 py-3 flex items-start gap-3">
            <span className={`text-sm font-bold shrink-0 ${AGENT_COLORS[t.assigned_agent] ?? 'text-slate-300'}`}>
              {t.assigned_agent}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{t.title}</div>
              <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.rationale}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              {t.risk_level && (
                <span className={`text-xs rounded px-2 py-0.5 ${RISK_COLORS[t.risk_level] ?? 'bg-slate-700'}`}>
                  {t.risk_level}
                </span>
              )}
              {t.approval_required && (
                <span className="text-xs bg-yellow-900 text-yellow-300 rounded px-2 py-0.5">승인필요</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {planStatus === 'pending' && (
        <div className="px-4 py-3 bg-slate-750 border-t border-slate-600 flex gap-3 items-center">
          <span className="text-xs text-slate-400 flex-1">
            승인하면 각 임원에게 Task가 배정됩니다. 거절하면 모든 Task가 취소됩니다.
          </span>
          <button
            onClick={approve}
            disabled={loading}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            승인 — 임원 배정
          </button>
          <button
            onClick={reject}
            disabled={loading}
            className="bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
          >
            거절
          </button>
        </div>
      )}

      {planStatus === 'approved' && (
        <div className="px-4 py-2 bg-green-900/30 border-t border-green-700 text-xs text-green-400">
          승인됨 — 각 임원에게 Task가 배정됐습니다
        </div>
      )}

      {planStatus === 'rejected' && (
        <div className="px-4 py-2 bg-red-900/30 border-t border-red-700 text-xs text-red-400">
          거절됨 — 모든 Task가 취소됐습니다
        </div>
      )}
    </div>
  )
}

// D4/D5 approval card embedded in chat — shows tasks requiring high-risk approval
function ApprovalEmbedCard({ tasks }: { tasks: ProposedTask[] }) {
  const highRisk = tasks.filter(t => t.risk_level === 'D4' || t.risk_level === 'D5')
  if (highRisk.length === 0) return null

  return (
    <div className="border border-orange-700 bg-orange-900/20 rounded-xl overflow-hidden mb-3">
      <div className="bg-orange-900/40 px-4 py-2 text-xs text-orange-300 font-medium uppercase tracking-wide">
        고위험 승인 필요 ({highRisk.length}건)
      </div>
      <div className="divide-y divide-orange-900/40">
        {highRisk.map((t, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center gap-3">
            <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${RISK_COLORS[t.risk_level!] ?? ''}`}>
              {t.risk_level}
            </span>
            <span className={`text-sm font-bold shrink-0 ${AGENT_COLORS[t.assigned_agent] ?? 'text-slate-300'}`}>
              {t.assigned_agent}
            </span>
            <span className="text-sm flex-1 truncate">{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatTab({ businessId }: { businessId: string | null }) {
  const [messages, setMessages] = useState<CEOMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Collect all pending high-risk tasks across all messages for the approval embed card
  const allPendingHighRiskTasks = messages
    .filter(m => m.role === 'ceo' && m.planStatus === 'pending' && m.proposedTasks)
    .flatMap(m => m.proposedTasks ?? [])
    .filter(t => t.risk_level === 'D4' || t.risk_level === 'D5')

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')

    const founderMsg: CEOMessage = { id: Date.now().toString(), role: 'founder', text }
    setMessages(prev => [...prev, founderMsg])
    setLoading(true)

    try {
      // Pass business_id context; null means 회사 공통
      const res = await api.submitInstruction(text, businessId)
      const interp = (res as any)?.interpretation ?? {}
      const tasks: ProposedTask[] = ((res as any)?.tasks ?? []).map((t: any) => ({
        id: t.id,
        assigned_agent: t.assigned_agent,
        title: t.title,
        rationale: t.rationale,
        risk_level: t.risk_level,
        approval_required: t.approval_required,
      }))
      const instructionId = (res as any)?.instruction?.id ?? ''

      const ceoMsg: CEOMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ceo',
        text: interp?.goal ?? '지시를 분석했습니다.',
        instructionId,
        interpretation: interp,
        proposedTasks: tasks,
        planStatus: 'pending',
      }
      setMessages(prev => [...prev, ceoMsg])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'API 오류')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (instructionId: string) => {
    try {
      await api.approvePlan(instructionId)
      setMessages(prev => prev.map(m =>
        m.instructionId === instructionId ? { ...m, planStatus: 'approved' } : m
      ))

      const msg = messages.find(m => m.instructionId === instructionId)
      if (msg?.proposedTasks) {
        for (const task of msg.proposedTasks) {
          try {
            await api.executeTask(task.id)
          } catch (err) {
            console.error(`Failed to execute task ${task.id}:`, err)
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '승인 실패')
    }
  }

  const handleReject = async (instructionId: string) => {
    try {
      await api.rejectPlan(instructionId)
      setMessages(prev => prev.map(m =>
        m.instructionId === instructionId ? { ...m, planStatus: 'rejected' } : m
      ))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '거절 실패')
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Left: chat messages + input (primary) */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* D4/D5 inline embed card — shown above messages only on narrow screens where the right panel stacks below */}
        <div className="lg:hidden">
          {allPendingHighRiskTasks.length > 0 && (
            <ApprovalEmbedCard tasks={allPendingHighRiskTasks} />
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-auto space-y-4 my-3 pr-1">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 mt-16 text-sm">
              비즈니스 지시를 입력해보세요<br/>
              <span className="text-xs text-slate-600">예: &quot;PMF 메시지 실험 계획해줘&quot;, &quot;신규 고객 온보딩 프로세스 만들어줘&quot;</span>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'founder' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-xl px-4 py-3 text-sm ${
                msg.role === 'founder'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-100'
              }`}>
                {msg.role === 'ceo' && (
                  <div className="text-xs text-indigo-400 mb-1 font-medium">CEO Agent</div>
                )}
                <div>{msg.text}</div>

                {msg.role === 'ceo' && msg.interpretation && (
                  <div className="mt-2 space-y-1">
                    <div className="flex flex-wrap gap-2">
                      {msg.interpretation.phase && (
                        <span className="text-xs bg-indigo-700 rounded px-2 py-0.5">
                          {PHASE_LABELS[msg.interpretation.phase] ?? msg.interpretation.phase}
                        </span>
                      )}
                      {msg.interpretation.risk_level && (
                        <span className={`text-xs rounded px-2 py-0.5 ${RISK_COLORS[msg.interpretation.risk_level] ?? 'bg-slate-700'}`}>
                          {msg.interpretation.risk_level}
                        </span>
                      )}
                    </div>
                    {msg.interpretation.success_criteria && msg.interpretation.success_criteria.length > 0 && (
                      <div className="text-xs text-slate-400 mt-1">
                        성공 기준: {msg.interpretation.success_criteria.join(' · ')}
                      </div>
                    )}
                  </div>
                )}

                {msg.role === 'ceo' && msg.proposedTasks && msg.proposedTasks.length > 0 && msg.instructionId && (
                  <ProposedTasksPanel
                    tasks={msg.proposedTasks}
                    instructionId={msg.instructionId}
                    planStatus={msg.planStatus ?? 'pending'}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                )}
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
            placeholder="비즈니스 지시를 입력하세요..."
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

      {/* Right: status panel — fixed width on large screens, stacks below on narrow */}
      <div className="w-full lg:w-80 shrink-0 overflow-y-auto space-y-3 lg:max-h-full">
        <RoadmapMiniCard businessId={businessId} />
        <ApprovalQueueCard businessId={businessId} />
        <TodayDiscoveryBanner businessId={businessId} />
      </div>
    </div>
  )
}

function RoadmapTab({ businessId }: { businessId: string | null }) {
  return (
    <div className="space-y-4">
      <RoadmapMiniCard businessId={businessId} />
      <div className="text-xs text-slate-500 text-center mt-4">
        전체 로드맵 뷰는 슬라이스 2.4에서 구현 예정입니다.
      </div>
    </div>
  )
}

function InboxTab({ businessId }: { businessId: string | null }) {
  return (
    <div>
      <TodayDiscoveryBanner businessId={businessId} />
      <div className="text-xs text-slate-500 text-center mt-8">
        인박스 항목은 슬라이스 2.4에서 구현 예정입니다.
      </div>
    </div>
  )
}

function ChatContent() {
  const { selectedId, businesses } = useBusiness()

  const selectedBusiness = businesses.find(b => b.id === selectedId)
  const contextLabel = selectedBusiness
    ? selectedBusiness.name
    : '회사 공통'

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-xl font-bold">CEO Agent 채팅</h1>
        <span className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">
          {contextLabel}
        </span>
        <p className="text-sm text-slate-400 ml-1 hidden sm:block">
          지시를 입력하면 CEO Agent가 해석하고 임원 Task 플랜을 제안합니다.
        </p>
      </div>

      <TabLayout>
        {(activeTab) => (
          <>
            {activeTab === 'chat' && <ChatTab businessId={selectedId} />}
            {activeTab === 'roadmap' && <RoadmapTab businessId={selectedId} />}
            {activeTab === 'inbox' && <InboxTab businessId={selectedId} />}
          </>
        )}
      </TabLayout>
    </div>
  )
}

export default function ChatPage() {
  return <AuthGate><ChatContent /></AuthGate>
}
