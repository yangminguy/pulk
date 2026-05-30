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

// SVG icon primitives — no emoji
function IconDoc({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h7l3 3v9H3V2z" /><path d="M10 2v3h3" /><path d="M6 7h5M6 10h3" />
    </svg>
  )
}
function IconTarget({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconPeople({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2.5" /><path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" />
      <circle cx="11.5" cy="5" r="2" /><path d="M11.5 9.5c1.93 0 3.5 1.57 3.5 3.5" />
    </svg>
  )
}
function IconChevron({ dir = 'down', size = 14 }: { dir?: 'up' | 'down'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: dir === 'up' ? 'rotate(180deg)' : undefined }}>
      <path d="M3 6l5 5 5-5" />
    </svg>
  )
}
function IconSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
function IconWarning({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L14.5 13H1.5L8 1.5z" /><path d="M8 6v3M8 11h.01" />
    </svg>
  )
}
function IconStop({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
    </svg>
  )
}

// ─── Panel tint configs ────────────────────────────────────────────────────
const PANEL_TINTS = {
  brief: { bg: 'var(--p-mint)', ink: 'var(--pi-mint)', strip: 'var(--green-tint-2)' },
  pmf:   { bg: 'var(--p-sky)',  ink: 'var(--pi-sky)',  strip: 'var(--blue-tint)' },
  staff: { bg: 'var(--p-butter)', ink: 'var(--pi-butter)', strip: '#FBEFD9' },
  raw:   { bg: 'var(--p-sand)', ink: 'var(--pi-sand)', strip: 'var(--silver-1)' },
}

interface ResultPanelProps {
  title: string
  tint: keyof typeof PANEL_TINTS
  icon: React.ReactNode
  children: React.ReactNode
}
function ResultPanel({ title, tint, icon, children }: ResultPanelProps) {
  const t = PANEL_TINTS[tint]
  return (
    <div className="j-card" style={{ padding: 0, overflow: 'hidden', background: 'var(--paper-elevated)' }}>
      {/* Tinted header strip */}
      <div style={{ background: t.strip, padding: '10px 16px', borderBottom: '1px solid var(--silver-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: t.ink, display: 'flex', alignItems: 'center' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 16, color: t.ink, letterSpacing: '-0.01em' }}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function LabeledRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
      <span className="j-overline">{label}</span>
      <span className="j-body" style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.5 }}>{value}</span>
    </div>
  )
}

function WorkflowResultView({ data }: { data: any }) {
  if (!data) return null

  const brief    = data?.business_brief ?? data?.brief ?? data?.data?.business_brief ?? data?.data?.brief
  const pmfPlan  = data?.pmf_experiment_plan ?? data?.pmf_plan ?? data?.data?.pmf_experiment_plan
  const staffing = data?.agent_staffing_plan ?? data?.staffing ?? data?.data?.agent_staffing_plan

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      {brief && (
        <ResultPanel title="Business Brief" tint="brief" icon={<IconDoc />}>
          {brief.idea_summary && (
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15, color: 'var(--ink-1)', marginBottom: 10, lineHeight: 1.4 }}>
              {brief.idea_summary}
            </p>
          )}
          <hr className="j-hairline" />
          {brief.core_problem      && <LabeledRow label="핵심 문제"   value={brief.core_problem} />}
          {brief.proposed_solution && <LabeledRow label="해결책"      value={brief.proposed_solution} />}
          {brief.target_customer   && <LabeledRow label="타겟 고객"   value={brief.target_customer} />}
          {brief.differentiation   && <LabeledRow label="차별화 요소" value={brief.differentiation} />}
          {/* Priority signals */}
          {(brief.recommended_phase || typeof brief.founder_fit_score === 'number') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {brief.recommended_phase && (
                <span className="j-badge j-badge-ref">
                  <span className="j-badge-dot" />
                  추천 단계: {brief.recommended_phase}
                </span>
              )}
              {typeof brief.founder_fit_score === 'number' && (
                <span className="j-badge j-badge-live">
                  <span className="j-badge-dot" />
                  Founder Fit {brief.founder_fit_score}/100
                </span>
              )}
            </div>
          )}
        </ResultPanel>
      )}

      {pmfPlan && (
        <ResultPanel title="PMF Experiment Plan" tint="pmf" icon={<IconTarget />}>
          {pmfPlan.hypothesis && <LabeledRow label="가설"      value={pmfPlan.hypothesis} />}
          {pmfPlan.experiment_type && <LabeledRow label="실험 유형" value={pmfPlan.experiment_type} />}
          {pmfPlan.success_signal  && (
            <div style={{ marginBottom: 10 }}>
              <span className="j-overline" style={{ display: 'block', marginBottom: 4 }}>PMF 성공 신호</span>
              <span className="j-badge j-badge-live" style={{ borderRadius: 4 }}>
                <span className="j-badge-dot" />{pmfPlan.success_signal}
              </span>
            </div>
          )}
          {pmfPlan.kill_criteria && (
            <div style={{ marginBottom: 10 }}>
              <span className="j-overline" style={{ display: 'block', marginBottom: 4 }}>중단 기준</span>
              <span className="j-badge j-badge-blocked" style={{ borderRadius: 4 }}>
                <IconStop size={11} />{pmfPlan.kill_criteria}
              </span>
            </div>
          )}
          {pmfPlan.timeline_days && (
            <span className="j-mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>실험 기간: {pmfPlan.timeline_days}일</span>
          )}
        </ResultPanel>
      )}

      {staffing && (
        <ResultPanel title="Agent Staffing Plan" tint="staff" icon={<IconPeople />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(staffing.roles ?? staffing.recommended_roles ?? []).map((r: any, i: number) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--silver-1)', display: 'flex', gap: 12 }}>
                <div style={{ width: 3, borderRadius: 999, background: 'var(--green)', flexShrink: 0, marginTop: 2, marginBottom: 2 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, color: 'var(--ink-1)', marginBottom: 3 }}>
                    {r.role ?? r.agent ?? r}
                  </div>
                  {r.rationale && (
                    <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>{r.rationale}</p>
                  )}
                  {r.responsibilities && (
                    <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, margin: '3px 0 0' }}>{r.responsibilities}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ResultPanel>
      )}

      {!brief && !pmfPlan && !staffing && (
        <ResultPanel title="결과" tint="raw" icon={<IconDoc />}>
          <pre className="j-mono" style={{ fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </ResultPanel>
      )}
    </div>
  )
}

function WorkflowContent() {
  const [idea, setIdea]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
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
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <p className="j-overline" style={{ marginBottom: 6 }}>Workflow Factory</p>
        <h1 className="j-h2">전략 문서 생성</h1>
        <p className="j-body" style={{ marginTop: 6, maxWidth: 520 }}>
          사업 아이디어를 입력하면 CEO Agent가 Business Brief, PMF Plan, Staffing Plan을 생성합니다.
        </p>
      </div>

      {/* Input workbench */}
      <div className="j-card" style={{ padding: 20, marginBottom: 28, background: 'var(--paper-elevated)' }}>
        <label className="j-overline" style={{ display: 'block', marginBottom: 10 }}>사업 아이디어</label>
        <textarea
          className="j-input j-textarea"
          rows={5}
          placeholder="어떤 비즈니스를 구축하고 싶으신가요? 아이디어를 자유롭게 입력하세요..."
          value={idea}
          onChange={e => setIdea(e.target.value)}
          disabled={loading}
          style={{ marginBottom: 12 }}
        />
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
            <IconWarning />
            <span>{error}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="j-meta">최근 5건 보관</span>
          <button
            onClick={generate}
            disabled={loading || !idea.trim()}
            className="j-btn j-btn-primary j-btn-lg"
          >
            {loading ? (
              <>
                <IconSpinner size={15} />
                CEO Agent 분석 중...
              </>
            ) : '워크플로 생성'}
          </button>
        </div>
      </div>

      {/* History accordion */}
      {history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="j-overline" style={{ marginBottom: 4 }}>생성 기록</p>
          {history.map(entry => (
            <div key={entry.id} className="j-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  gap: 12,
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="j-ui" style={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.idea}
                  </span>
                  <span className="j-mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, display: 'block' }}>{entry.createdAt}</span>
                </div>
                <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>
                  <IconChevron dir={expanded === entry.id ? 'up' : 'down'} />
                </span>
              </button>
              {expanded === entry.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--silver-1)' }}>
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
