'use client'
import type { AgentOutputLite } from '@/lib/api'

// Renders an executive's persisted work product (agent_tasks.output) as a
// structured, human-readable deliverable. Shared by the chat Inbox detail and
// the Monitor drill-down so the founder can read the real result everywhere.
export function AgentOutputDetail({ output }: { output: AgentOutputLite }) {
  const { goal, recommendation, options, action_items, insight_to_record, current_situation } = output

  const hasAny =
    goal || recommendation || current_situation ||
    (options && options.length) || (action_items && action_items.length) || insight_to_record
  if (!hasAny) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {goal && (
        <Field label="목표 (Goal)">
          <p style={pStyle}>{goal}</p>
        </Field>
      )}

      {recommendation && (
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

      {options && options.length > 0 && (
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
