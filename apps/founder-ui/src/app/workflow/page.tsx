'use client'
import { useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api } from '@/lib/api'

interface WorkflowResult {
  id: string
  idea: string
  createdAt: string
  data: any
}

function ResultPanel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-700 rounded-xl p-4">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-sm text-slate-300">{children}</div>
    </div>
  )
}

function WorkflowResultView({ data }: { data: any }) {
  if (!data) return null

  const brief = data?.business_brief ?? data?.brief ?? data?.data?.business_brief ?? data?.data?.brief
  const pmfPlan = data?.pmf_experiment_plan ?? data?.pmf_plan ?? data?.data?.pmf_experiment_plan
  const staffing = data?.agent_staffing_plan ?? data?.staffing ?? data?.data?.agent_staffing_plan

  return (
    <div className="grid gap-4 mt-4">
      {brief && (
        <ResultPanel title="Business Brief" icon="📋">
          {brief.idea_summary && <div className="font-medium mb-1">{brief.idea_summary}</div>}
          {brief.core_problem && <div className="text-slate-400 mb-2">문제: {brief.core_problem}</div>}
          {brief.proposed_solution && <div className="text-slate-400 mb-2">해결책: {brief.proposed_solution}</div>}
          {brief.target_customer && <div className="text-xs text-slate-500">타겟: {brief.target_customer}</div>}
          {brief.differentiation && <div className="text-xs text-slate-500 mt-1">차별화: {brief.differentiation}</div>}
          {brief.recommended_phase && <div className="text-xs text-indigo-400 mt-2">추천 단계: {brief.recommended_phase}</div>}
          {typeof brief.founder_fit_score === 'number' && (
            <div className="text-xs text-slate-500 mt-1">Founder Fit: {brief.founder_fit_score}/100</div>
          )}
        </ResultPanel>
      )}

      {pmfPlan && (
        <ResultPanel title="PMF Plan" icon="🎯">
          {pmfPlan.hypothesis && <div className="mb-2">가설: {pmfPlan.hypothesis}</div>}
          {pmfPlan.experiment_type && <div className="text-xs text-slate-500">실험 유형: {pmfPlan.experiment_type}</div>}
          {pmfPlan.success_signal && <div className="text-xs text-slate-500 mt-1">성공 신호: {pmfPlan.success_signal}</div>}
          {pmfPlan.kill_criteria && <div className="text-xs text-red-400 mt-1">중단 기준: {pmfPlan.kill_criteria}</div>}
          {pmfPlan.timeline_days && <div className="text-xs text-slate-500 mt-1">기간: {pmfPlan.timeline_days}일</div>}
        </ResultPanel>
      )}

      {staffing && (
        <ResultPanel title="Staffing" icon="👥">
          <div className="space-y-2">
            {(staffing.roles ?? staffing.recommended_roles ?? []).map((r: any, i: number) => (
              <div key={i} className="border-l-2 border-indigo-600 pl-3">
                <div className="font-medium text-indigo-300">{r.role ?? r.agent ?? r}</div>
                {r.rationale && <div className="text-xs text-slate-400">{r.rationale}</div>}
                {r.responsibilities && <div className="text-xs text-slate-500">{r.responsibilities}</div>}
              </div>
            ))}
          </div>
        </ResultPanel>
      )}

      {/* Fallback: raw JSON if no structured fields found */}
      {!brief && !pmfPlan && !staffing && (
        <ResultPanel title="결과" icon="📄">
          <pre className="text-xs overflow-auto whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </ResultPanel>
      )}
    </div>
  )
}

function WorkflowContent() {
  const [idea, setIdea] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<WorkflowResult[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const generate = async () => {
    const text = idea.trim()
    if (!text || loading) return
    setLoading(true)
    setError('')
    try {
      const result = await api.generateWorkflow(text)
      const entry: WorkflowResult = {
        id: Date.now().toString(),
        idea: text,
        createdAt: new Date().toLocaleTimeString('ko-KR'),
        data: result,
      }
      setHistory(prev => [entry, ...prev].slice(0, 5))
      setExpanded(entry.id)
      setIdea('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'API 오류')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1">Workflow Factory</h1>
        <p className="text-sm text-slate-400">
          아이디어를 입력하면 CEO Agent가 Brief, PMF Plan, Staffing을 생성합니다.
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 mb-6">
        <textarea
          className="w-full bg-slate-700 rounded-lg px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          rows={4}
          placeholder="어떤 비즈니스를 구축하고 싶으신가요? 아이디어를 자유롭게 입력하세요..."
          value={idea}
          onChange={e => setIdea(e.target.value)}
          disabled={loading}
        />
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={generate}
          disabled={loading || !idea.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              CEO Agent가 분석 중...
            </span>
          ) : '워크플로 생성'}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          {history.map(entry => (
            <div key={entry.id} className="bg-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm text-left hover:bg-slate-750 transition-colors"
              >
                <div>
                  <span className="text-slate-300 font-medium line-clamp-1">{entry.idea}</span>
                  <span className="text-xs text-slate-500 ml-3">{entry.createdAt}</span>
                </div>
                <span className="text-slate-500 text-lg">{expanded === entry.id ? '▲' : '▼'}</span>
              </button>
              {expanded === entry.id && (
                <div className="px-5 pb-5">
                  <WorkflowResultView data={entry.data} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WorkflowPage() {
  return <AuthGate><WorkflowContent /></AuthGate>
}
