'use client'
import { Line, LineChart } from 'recharts'
import type { AgentOutputLite, IntroAnalysisData } from '@/lib/api'

// Renders an executive's persisted work product (agent_tasks.output) as a
// structured, human-readable deliverable. Shared by the chat Inbox detail and
// the Monitor drill-down so the founder can read the real result everywhere.
export function AgentOutputDetail({ output, agent = 'CMO' }: { output: AgentOutputLite; agent?: string }) {
  const introAnalysis = output.intro_analysis
  const hasIntroAnalysis = Boolean(introAnalysis && typeof introAnalysis.hook_score === 'number')
  const { goal, recommendation, options, action_items, insight_to_record, current_situation } = output
  const hasStrategyDecision = Boolean(recommendation && options && options.length > 0)
  const strategyOptions = options ?? []

  const hasAny =
    hasIntroAnalysis || goal || recommendation || current_situation ||
    (options && options.length) || (action_items && action_items.length) || insight_to_record
  if (!hasAny) return null

  if (hasIntroAnalysis) {
    return <IntroAnalysisPanel analysis={introAnalysis as IntroAnalysisData} agent={agent} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {goal && (
        <Field label="목표 (Goal)">
          <p style={pStyle}>{goal}</p>
        </Field>
      )}

      {hasStrategyDecision && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="j-overline">전략 결정 패널</div>

          <div style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 6, padding: '11px 13px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-press)', marginBottom: 5 }}>
              {agent} 추천
            </div>
            <p style={{ ...pStyle, color: 'var(--ink-1)' }}>{recommendation}</p>
          </div>

          <Field label="검토한 선택지 (Options)">
            <ul style={ulStyle}>
              {strategyOptions.map((o, i) => <li key={i} style={liStyle}>{o}</li>)}
            </ul>
          </Field>
        </div>
      )}

      {recommendation && !hasStrategyDecision && (
        <div style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 6, padding: '11px 13px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-press)', marginBottom: 5 }}>
            핵심 권고 (Recommendation)
          </div>
          <p style={{ ...pStyle, color: 'var(--ink-1)' }}>{recommendation}</p>
        </div>
      )}

      {!recommendation && current_situation && (
        <Field label="분석 본문 (Situation)">
          <p style={pStyle}>{current_situation}</p>
        </Field>
      )}

      {!hasStrategyDecision && options && options.length > 0 && (
        <Field label="검토한 선택지 (Options)">
          <ul style={ulStyle}>
            {options.map((o, i) => <li key={i} style={liStyle}>{o}</li>)}
          </ul>
        </Field>
      )}

      {action_items && action_items.length > 0 && (
        <Field label="실행 항목 (Action Items)">
          <ul style={ulStyle}>
            {action_items.map((a, i) => <li key={i} style={liStyle}>{a}</li>)}
          </ul>
        </Field>
      )}

      {insight_to_record && (
        <Field label="학습 인사이트 (Insight)">
          <p style={{ ...pStyle, color: 'var(--ink-2)', fontStyle: 'italic' }}>{insight_to_record}</p>
        </Field>
      )}
    </div>
  )
}

function IntroAnalysisPanel({ analysis, agent }: { analysis: IntroAnalysisData; agent: string }) {
  const scoreStyle = getHookScoreStyle(analysis.hook_score)
  const retentionData = analysis.retention_curve ?? []
  const segments = analysis.segments ?? []
  const suggestions = analysis.improvement_suggestions ?? []

  return (
    <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--silver-1)', background: 'var(--paper-elevated)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="j-overline">인트로 30초 분석</div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--green-press)', background: 'var(--green-tint)', padding: '2px 7px', borderRadius: 999 }}>
          {agent}
        </span>
      </div>

      <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {analysis.thumbnail_url && (
            <img src={analysis.thumbnail_url} alt="" style={{ width: 72, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 4, border: '1px solid var(--silver-2)', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {analysis.video_title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.35 }}>{analysis.video_title}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
              {typeof analysis.duration_sec === 'number' && <span>{analysis.duration_sec}초</span>}
              {analysis.video_url && (
                <a href={analysis.video_url} target="_blank" rel="noreferrer" style={{ color: 'var(--green-press)', overflowWrap: 'anywhere' }}>
                  영상 링크
                </a>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: scoreStyle.bg, border: `1px solid ${scoreStyle.border}`, borderRadius: 6, padding: '10px 12px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: scoreStyle.fg }}>훅 스코어</div>
          <div className="j-num" style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 700, color: scoreStyle.fg, lineHeight: 1 }}>
            {analysis.hook_score}/100
          </div>
        </div>

        {retentionData.length > 0 && (
          <div style={{ height: 80, width: '100%', border: '1px solid var(--silver-1)', borderRadius: 6, padding: 4 }}>
            <LineChart width={360} height={70} data={retentionData} margin={{ top: 5, right: 8, bottom: 5, left: 8 }}>
              <Line type="monotone" dataKey="pct" stroke="var(--green)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </div>
        )}

        {segments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {segments.map((segment, i) => {
              const verdictStyle = getVerdictStyle(segment.verdict)
              return (
                <div key={`${segment.label}-${i}`} style={{ border: '1px solid var(--silver-1)', borderRadius: 6, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <strong style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{segment.label}</strong>
                    <span className="j-num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{segment.start_sec}-{segment.end_sec}초</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, color: verdictStyle.fg, background: verdictStyle.bg, border: `1px solid ${verdictStyle.border}`, borderRadius: 999, padding: '1px 7px' }}>
                      {segment.verdict}
                    </span>
                  </div>
                  <p style={pStyle}>{segment.feedback}</p>
                </div>
              )
            })}
          </div>
        )}

        {analysis.overall_feedback && (
          <Field label="종합 피드백">
            <p style={pStyle}>{analysis.overall_feedback}</p>
          </Field>
        )}

        {suggestions.length > 0 && (
          <Field label="개선 제안">
            <ul style={ulStyle}>
              {suggestions.map((suggestion, i) => <li key={i} style={liStyle}>{suggestion}</li>)}
            </ul>
          </Field>
        )}
      </div>
    </div>
  )
}

function getHookScoreStyle(score: number) {
  if (score >= 70) return { bg: 'var(--green-tint)', border: 'var(--green-tint-2)', fg: 'var(--green-press)' }
  if (score >= 40) return { bg: 'var(--amber-tint)', border: 'var(--amber)', fg: '#8A5408' }
  return { bg: 'var(--red-tint)', border: 'var(--red)', fg: '#8C2A1F' }
}

function getVerdictStyle(verdict: string) {
  if (verdict === 'strong') return { bg: 'var(--green-tint)', border: 'var(--green-tint-2)', fg: 'var(--green-press)' }
  if (verdict === 'weak') return { bg: 'var(--red-tint)', border: 'var(--red)', fg: '#8C2A1F' }
  return { bg: 'var(--silver-1)', border: 'var(--silver-2)', fg: 'var(--ink-2)' }
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

const pStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
}
const ulStyle: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }
const liStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.55 }
