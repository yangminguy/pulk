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

  const brief = data?.brief ?? data?.data?.brief ?? data
  const pmfPlan = data?.pmf_plan ?? data?.data?.pmf_plan
  const staffing = data?.staffing ?? data?.data?.staffing

  return (
    <div className="grid gap-4 mt-4">
      {(brief?.title || brief?.description) && (
        <ResultPanel title="Brief" icon="📋">
          {brief.title && <div className="font-medium mb-1">{brief.title}</div>}
          {brief.description && <div className="text-slate-400 mb-2">{brief.description}</div>}
          {brief.target_audience && (
            <div className="text-xs text-slate-500">타겟: {brief.target_audience}</div>
          )}
          {brief.value_proposition && (
            <div className="text-xs text-slate-500 mt-1">가치 제안: {brief.value_proposition}</div>
          )}
        </ResultPanel>
      )}

      {pmfPlan && (
        <ResultPanel title="PMF Plan" icon="🎯">
          {pmfPlan.hypothesis && <div className="mb-2">가설: {pmfPlan.hypothesis}</div>}
          {pmfPlan.experiment_type && <div className="text-xs text-slate-500">실험: {pmfPlan.experiment_type}</div>}
          {pmfPlan.success_metric && <div className="text-xs text-slate-500 mt-1">성공 지표: {pmfPlan.success_metric}</div>}
          {pmfPlan.timeline && <div className="text-xs text-slate-500 mt-1">기간: {pmfPlan.timeline}</div>}
        </ResultPanel>
      )}

      {staffing?.roles && staffing.roles.length > 0 && (
        <ResultPanel title="Staffing" icon="👥">
          <div className="space-y-2">
            {staffing.roles.map((r: any, i: number) => (
              <div key={i} className="border-l-2 border-indigo-600 pl-3">
                <div className="font-medium text-indigo-300">{r.role}</div>
                {r.rationale && <div className="text-xs text-slate-400">{r.rationale}</div>}
              </div>
            ))}
          </div>
        </ResultPanel>
      )}

      {/* Fallback: raw JSON if no structured fields found */}
      {!brief?.title && !pmfPlan && !staffing && (
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
