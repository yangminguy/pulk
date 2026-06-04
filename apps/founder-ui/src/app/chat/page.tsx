'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import TabLayout from '@/components/TabLayout'
import RoadmapMiniCard from '@/components/RoadmapMiniCard'
import ApprovalQueueCard from '@/components/ApprovalQueueCard'
import ConsultationCard from '@/components/ConsultationCard'
import SynthesisCard from '@/components/SynthesisCard'
import RoadmapTimeline from '@/components/RoadmapTimeline'
import { AgentOutputDetail } from '@/components/AgentOutputDetail'
import Icon from '@/components/Icon'
import { api } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'
import { InboxNavContext, useInboxNav, type InboxTaskRef } from '@/lib/inbox-nav'

// ── Constants ────────────────────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  direction_alignment:      '방향 정렬',
  pmf_diagnosis:            'PMF 진단',
  execution_build:          '실행 빌드',
  sales_distribution_test:  '세일즈 테스트',
  productization_review:    '제품화 검토',
  scale_automation:         '스케일/자동화',
}

// Risk badge classes — use j-risk-* from globals.css
const RISK_CLASS: Record<string, string> = {
  D1: 'j-risk-d1',
  D2: 'j-risk-d2',
  D3: 'j-risk-d3',
  D4: 'j-risk-d4',
  D5: 'j-risk-d5',
}

const INBOX_STATUS_CLASS: Record<string, string> = {
  queued: 'j-badge-draft',
  running: 'j-badge-live',
  blocked: 'j-badge-blocked',
  needs_review: 'j-badge-review',
  done: 'j-badge-live',
  killed: 'j-badge-neutral',
}
const INBOX_STATUS_LABEL: Record<string, string> = {
  queued: '대기',
  running: '진행중',
  blocked: '차단됨',
  needs_review: '검토필요',
  done: '완료',
  killed: '종료',
}

// Agent monogram colors — matches primitives.jsx AGENTS palette
const AGENT_COLOR: Record<string, string> = {
  CMO:    'var(--wood-3)',
  CRO:    'var(--wood-2)',
  CPO:    'var(--green-press)',
  CTO:    'var(--ink-2)',
  COO:    'var(--wood-4)',
  CFO:    'var(--silver-4)',
  RiskQA: 'var(--red)',
  CEO:    'var(--ink-1)',
}

// ── Types ────────────────────────────────────────────────────────────────────
type ProposedTask = {
  id: string
  assigned_agent: string
  title: string
  rationale: string
  risk_level?: string
  approval_required?: boolean
}

type SynthesisPayload = {
  decision_summary: string
  contributions: { agent: string; task_title: string; summary: string; status: string }[]
  open_gaps: string[]
  next_actions: { kind: 'approve' | 'delegate' | 'hold'; label: string; target_agent?: string; reason: string }[]
}

type CEOMessage = {
  id: string
  role: 'founder' | 'ceo' | 'chief_of_staff'
  text: string
  instructionId?: string
  synthesis?: SynthesisPayload
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

// ── Agent chip (monogram square + label) ────────────────────────────────────
function AgentChip({ agent, showLabel = true }: { agent: string; showLabel?: boolean }) {
  const color = AGENT_COLOR[agent] ?? 'var(--ink-3)'
  const mono = agent.slice(0, 2).toUpperCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: color,
        color: '#fff',
        fontSize: 9.5,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {mono}
      </span>
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>{agent}</span>
      )}
    </span>
  )
}

// ── Proposed Tasks Panel (executive dispatch cards) ──────────────────────────
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
    try { await onApprove(instructionId) } finally { setLoading(false) }
  }
  const reject = async () => {
    setLoading(true)
    try { await onReject(instructionId) } finally { setLoading(false) }
  }

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--paper-elevated)',
    }}>
      {/* dispatch header */}
      <div style={{
        padding: '8px 13px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span className="j-overline">배정 예정 Task · {tasks.length}건</span>
        {/* avatar stack */}
        <div style={{ display: 'flex', gap: -2 }}>
          {tasks.slice(0, 4).map((t, i) => (
            <span key={i} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: tasks.length - i }}>
              <AgentChip agent={t.assigned_agent} showLabel={false} />
            </span>
          ))}
        </div>
      </div>

      {/* task rows — executive dispatch cards */}
      {tasks.map((t, i) => {
        const riskCls = RISK_CLASS[t.risk_level ?? ''] ?? ''
        return (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            padding: '11px 13px',
            borderBottom: i < tasks.length - 1 ? '1px solid var(--silver-1)' : 'none',
          }}>
            <AgentChip agent={t.assigned_agent} showLabel={false} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.3 }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.45 }}>
                {t.rationale}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
              {t.risk_level && (
                <span className={`j-badge ${riskCls}`}>{t.risk_level}</span>
              )}
              {t.approval_required && (
                <span className="j-badge j-badge-review">승인필요</span>
              )}
            </div>
          </div>
        )
      })}

      {/* CTA footer */}
      {planStatus === 'pending' && (
        <div style={{
          padding: '11px 13px',
          background: 'var(--paper-surface)',
          borderTop: '1px solid var(--silver-1)',
          display: 'flex',
          gap: 9,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1, minWidth: 140 }}>
            승인하면 각 임원에게 Task가 배정됩니다. 거절하면 모든 Task가 취소됩니다.
          </span>
          <button
            onClick={approve}
            disabled={loading}
            className="j-btn j-btn-primary j-btn-sm"
          >
            <Icon name="check" size={13} stroke={2.2} />
            승인 — 임원 배정
          </button>
          <button
            onClick={reject}
            disabled={loading}
            className="j-btn j-btn-danger j-btn-sm"
          >
            <Icon name="x" size={13} stroke={2} />
            거절
          </button>
        </div>
      )}

      {planStatus === 'approved' && (
        <div style={{
          padding: '10px 13px',
          background: 'var(--green-tint)',
          borderTop: '1px solid var(--green-tint-2)',
          fontSize: 12.5,
          color: 'var(--green-press)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}>
          <Icon name="check" size={14} stroke={2} />
          승인됨 — 각 임원에게 Task가 배정됐습니다
        </div>
      )}

      {planStatus === 'rejected' && (
        <div style={{
          padding: '10px 13px',
          background: 'var(--red-tint)',
          borderTop: '1px solid #E8C5BF',
          fontSize: 12.5,
          color: '#8C2A1F',
          fontWeight: 600,
        }}>
          거절됨 — 모든 Task가 취소됐습니다
        </div>
      )}
    </div>
  )
}

// ── High-risk embed card (shown on narrow screens, above message list) ───────
function ApprovalEmbedCard({ tasks }: { tasks: ProposedTask[] }) {
  const highRisk = tasks.filter(t => t.risk_level === 'D4' || t.risk_level === 'D5')
  if (highRisk.length === 0) return null

  return (
    <div style={{
      border: '1px solid #DDB87A',
      borderRadius: 6,
      overflow: 'hidden',
      marginBottom: 12,
      background: 'var(--amber-tint)',
    }}>
      <div style={{
        padding: '8px 13px',
        borderBottom: '1px solid #DDB87A',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
      }}>
        <Icon name="alert" size={13} stroke={1.8} />
        <span className="j-overline" style={{ color: '#8A5408' }}>
          고위험 승인 필요 ({highRisk.length}건)
        </span>
      </div>
      <div style={{ background: 'var(--paper-surface)' }}>
        {highRisk.map((t, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '9px 13px',
            borderBottom: i < highRisk.length - 1 ? '1px solid var(--silver-1)' : 'none',
          }}>
            <span className={`j-badge ${RISK_CLASS[t.risk_level!] ?? ''}`}>{t.risk_level}</span>
            <AgentChip agent={t.assigned_agent} showLabel={false} />
            <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-1)' }}>
              {t.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CEO interpretation panel ─────────────────────────────────────────────────
function InterpretationPanel({ interpretation }: {
  interpretation: NonNullable<CEOMessage['interpretation']>
}) {
  const { phase, risk_level, assumptions, success_criteria } = interpretation
  if (!phase && !risk_level && !assumptions?.length && !success_criteria?.length) return null

  return (
    <div style={{
      marginTop: 10,
      paddingTop: 10,
      borderTop: '1px solid var(--silver-1)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* phase + risk row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {phase && (
          <span className="j-badge j-badge-ref">{PHASE_LABELS[phase] ?? phase}</span>
        )}
        {risk_level && (
          <span className={`j-badge ${RISK_CLASS[risk_level] ?? 'j-badge-neutral'}`}>
            {risk_level}
          </span>
        )}
      </div>

      {/* assumptions */}
      {assumptions && assumptions.length > 0 && (
        <div>
          <div className="j-overline" style={{ marginBottom: 4 }}>가정 (Assumptions)</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {assumptions.join(' · ')}
          </div>
        </div>
      )}

      {/* success criteria */}
      {success_criteria && success_criteria.length > 0 && (
        <div>
          <div className="j-overline" style={{ marginBottom: 4 }}>성공 기준</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {success_criteria.join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chat Tab ─────────────────────────────────────────────────────────────────
function ChatTab({ businessId }: { businessId: string | null }) {
  const { selectedProjectId } = useBusiness()
  const { openInboxTask } = useInboxNav()
  const [messages, setMessages] = useState<CEOMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchHistory = useCallback(async (projId: string) => {
    setLoading(true)
    setError('')
    try {
      const history = await api.chatHistory(projId)
      const formatted = history.map(m => {
        const meta = m.metadata ?? {}
        return {
          id: m.id,
          role: m.role,
          text: m.text,
          instructionId: meta.instructionId,
          interpretation: {
            goal: meta.goal,
            phase: meta.phase,
            risk_level: meta.risk_level,
            assumptions: meta.assumptions,
            success_criteria: meta.success_criteria,
          },
          proposedTasks: meta.proposed_tasks,
          planStatus: meta.planStatus ?? (meta.proposed_tasks ? 'pending' : undefined),
          synthesis: meta.kind === 'synthesis' ? {
            decision_summary: meta.decision_summary ?? m.text,
            contributions: meta.contributions ?? [],
            open_gaps: meta.open_gaps ?? [],
            next_actions: meta.next_actions ?? [],
          } : undefined,
        } as CEOMessage
      })
      setMessages(formatted)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '대화 기록 로드 실패')
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      fetchHistory(selectedProjectId)
    } else {
      setMessages([])
    }
  }, [selectedProjectId, fetchHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      const res = await api.submitInstruction(text, selectedProjectId, businessId)

      if (selectedProjectId) {
        await fetchHistory(selectedProjectId)
      } else if ((res as any)?.needs_clarification) {
        // CEO needs more info before planning — show the question, no plan card.
        const r = res as any
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'ceo',
          text: r.clarification_question ?? '진행을 위해 추가 정보가 필요합니다.',
        }])
      } else {
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
      }
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
      if (selectedProjectId) {
        await fetchHistory(selectedProjectId)
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
      if (selectedProjectId) {
        await fetchHistory(selectedProjectId)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '거절 실패')
    }
  }

  const handleSynthesisAction = useCallback(async (
    instructionId: string,
    msg: CEOMessage,
    kind: 'approve' | 'delegate' | 'hold',
    targetAgent?: string,
  ) => {
    // 'delegate' was removed — the synthesis card no longer spawns new tasks.
    // It only closes (approve) or holds; detail is read in the inbox.
    void msg; void targetAgent
    try {
      if (kind === 'approve') {
        await api.closeInstruction(instructionId)
      }
      if (selectedProjectId) {
        await fetchHistory(selectedProjectId)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '처리 실패')
    }
  }, [selectedProjectId, fetchHistory])

  // No project selected state
  if (businessId !== null && !selectedProjectId) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        padding: 32,
        textAlign: 'center',
      }}>
        <span style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'var(--silver-1)',
          color: 'var(--ink-3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Icon name="folder" size={22} stroke={1.5} />
        </span>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--ink-1)',
          marginBottom: 8,
        }}>
          활성 프로젝트가 선택되지 않았습니다
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--ink-3)', maxWidth: 360, lineHeight: 1.6, marginBottom: 16 }}>
          왼쪽 사이드바의 활성 사업 하위에 있는{' '}
          <strong style={{ color: 'var(--green-press)' }}>프로젝트</strong>를 선택하거나,{' '}
          <strong style={{ color: 'var(--green-press)' }}>+ 추가</strong> 버튼을 눌러 프로젝트를 먼저 생성해 주세요.
        </p>
        <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
          대화 및 수립된 로드맵은 프로젝트 단위로 격리되어 안전하게 영속 보존됩니다.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Left: chat messages + input */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* D4/D5 inline embed — narrow screens only */}
        <div className="lg:hidden">
          {allPendingHighRiskTasks.length > 0 && (
            <ApprovalEmbedCard tasks={allPendingHighRiskTasks} />
          )}
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-auto my-3 pr-1" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              marginTop: 64,
              color: 'var(--ink-4)',
            }}>
              <div style={{ fontSize: 14 }}>비즈니스 지시를 입력해보세요</div>
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--ink-4)' }}>
                예: &quot;PMF 메시지 실험 계획해줘&quot;, &quot;신규 고객 온보딩 프로세스 만들어줘&quot;
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: msg.role === 'founder' ? 'flex-end' : 'flex-start',
            }}>
              {msg.role === 'founder' ? (
                // Founder bubble — right, paper-elevated card
                <div style={{
                  maxWidth: '78%',
                  background: 'var(--paper-elevated)',
                  border: '1px solid var(--silver-2)',
                  borderRadius: '14px 14px 4px 14px',
                  padding: '12px 15px',
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  lineHeight: 1.55,
                }}>
                  {msg.text}
                </div>
              ) : (
                // CEO bubble — left, paper-surface + 4px green accent bar
                <div style={{
                  maxWidth: '90%',
                  background: 'var(--paper-surface)',
                  border: '1px solid var(--silver-2)',
                  borderLeft: '4px solid var(--green)',
                  borderRadius: '4px 14px 14px 4px',
                  padding: '12px 15px',
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  lineHeight: 1.55,
                }}>
                  {/* CEO agent label */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginBottom: 8,
                  }}>
                    <AgentChip agent="CEO" showLabel={false} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
                      {msg.role === 'chief_of_staff' ? 'Chief of Staff' : 'CEO Agent'}
                    </span>
                  </div>

                  {/* synthesis deliverable card */}
                  {msg.synthesis && msg.instructionId ? (
                    <SynthesisCard
                      instructionId={msg.instructionId}
                      decisionSummary={msg.synthesis.decision_summary}
                      contributions={msg.synthesis.contributions}
                      openGaps={msg.synthesis.open_gaps}
                      nextActions={msg.synthesis.next_actions}
                      onAction={(kind, targetAgent) =>
                        handleSynthesisAction(msg.instructionId!, msg, kind, targetAgent)}
                      onOpenTask={(taskId, c) =>
                        openInboxTask({ task_id: taskId, assigned_agent: c.agent, title: c.task_title, status: c.status })}
                    />
                  ) : (
                  <>
                  {/* main message text */}
                  <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                  {/* interpretation panel */}
                  {msg.interpretation && (
                    <InterpretationPanel interpretation={msg.interpretation} />
                  )}

                  {/* proposed tasks */}
                  {msg.proposedTasks && msg.proposedTasks.length > 0 && msg.instructionId && (
                    <ProposedTasksPanel
                      tasks={msg.proposedTasks}
                      instructionId={msg.instructionId}
                      planStatus={msg.planStatus ?? 'pending'}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  )}
                  </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicator */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                background: 'var(--paper-surface)',
                border: '1px solid var(--silver-2)',
                borderLeft: '4px solid var(--green)',
                borderRadius: '4px 14px 14px 4px',
                padding: '12px 15px',
                fontSize: 13.5,
                color: 'var(--ink-3)',
              }}>
                CEO Agent가 분석 중…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            fontSize: 12.5,
            color: 'var(--red)',
            marginBottom: 8,
            padding: '6px 10px',
            background: 'var(--red-tint)',
            borderRadius: 4,
          }}>
            {error}
          </div>
        )}

        {/* Input bar */}
        <div style={{ display: 'flex', gap: 9 }}>
          <input
            className="j-input"
            style={{
              flex: 1,
              borderRadius: 999,
              padding: '11px 18px',
              fontSize: 14,
            }}
            placeholder="비즈니스 지시를 입력하세요…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="j-btn j-btn-primary"
            style={{ borderRadius: 999, padding: '0 20px', fontSize: 14 }}
          >
            <Icon name="send" size={15} stroke={1.8} />
            전송
          </button>
        </div>
      </div>

      {/* Right: status rail */}
      <div className="w-full lg:w-80 shrink-0 overflow-y-auto lg:max-h-full" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <RoadmapMiniCard businessId={businessId} />
        <ApprovalQueueCard businessId={businessId} />
        <ConsultationCard businessId={businessId} />
      </div>
    </div>
  )
}

// ── Roadmap Tab ──────────────────────────────────────────────────────────────
function RoadmapTab({ businessId }: { businessId: string | null }) {
  return (
    <div className="space-y-4">
      <RoadmapTimeline />
    </div>
  )
}

// ── Inbox Tab ────────────────────────────────────────────────────────────────
function InboxTab({ businessId, pendingTask, onPendingConsumed }: { businessId: string | null; pendingTask?: InboxTaskRef | null; onPendingConsumed?: () => void }) {
  const { selectedProjectId } = useBusiness()
  const [tasks, setTasks] = useState<any[]>([])
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [handoffs, setHandoffs] = useState<any[]>([])
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const reviewable = await api.getInboxTasks(selectedProjectId, businessId)
      setTasks(reviewable)
      if (selectedTask && !reviewable.some((t: any) => t.task_id === selectedTask.task_id)) {
        setSelectedTask(null)
        setHandoffs([])
      }
    } catch (err) {
      setError('검토 대상 태스크 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId, businessId, selectedTask])

  useEffect(() => {
    loadTasks()
  }, [selectedProjectId, businessId, loadTasks])

  const selectTask = async (task: any) => {
    setSelectedTask(task)
    setHandoffs([])
    setFeedback('')
    try {
      const taskId = task.task_id || task.id
      // Roadmap/mini-card refs carry no output — fetch the full task so the real
      // work product (AgentOutputDetail) renders the same as a list-selected task.
      const [res, detail] = await Promise.all([
        api.getTaskHandoffs(taskId),
        task.output ? Promise.resolve(null) : api.getTaskDetail(taskId),
      ])
      setHandoffs(res)
      if (detail) {
        setSelectedTask((prev: any) =>
          prev && (prev.task_id || prev.id) === taskId
            ? { ...detail, ...prev, output: detail.output ?? prev.output }
            : prev
        )
      }
    } catch (err) {
      console.error('Handoff 로드 실패:', err)
    }
  }

  // Roadmap / mini-card click hands a task in → open its detail directly.
  useEffect(() => {
    if (pendingTask) {
      selectTask(pendingTask)
      onPendingConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTask])

  const handleApprove = async () => {
    if (!selectedTask || actionLoading) return
    const taskId = selectedTask.task_id || selectedTask.id
    setActionLoading(true)
    try {
      await api.approveTask(taskId)
      await loadTasks()
      setSelectedTask(null)
      setHandoffs([])
      setFeedback('')
    } catch (err) {
      setError('태스크 승인 실패')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedTask || actionLoading) return
    const taskId = selectedTask.task_id || selectedTask.id
    setActionLoading(true)
    try {
      await api.rejectTask(taskId)
      await loadTasks()
      setSelectedTask(null)
      setHandoffs([])
      setFeedback('')
    } catch (err) {
      setError('수정 요청 실패')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 9rem)', minHeight: 500, gap: 16 }}>
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 lg:overflow-hidden">
        {/* Left list pane — full width on mobile; hidden when a task is open (master-detail) */}
        <div
          className={`${selectedTask ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[300px] lg:flex-shrink-0 max-h-[70vh] lg:max-h-full`}
          style={{
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* pane header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--silver-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span className="j-overline">임원 과제 현황</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
              {tasks.length}건
            </span>
          </div>

          {/* list body */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '20px 14px', color: 'var(--ink-4)', fontSize: 12, textAlign: 'center' }}>
                로딩 중…
              </div>
            ) : tasks.length === 0 ? (
              <div style={{ padding: '32px 14px', color: 'var(--ink-4)', fontSize: 12.5, textAlign: 'center' }}>
                표시할 임원 과제가 없습니다.
              </div>
            ) : (
              tasks.map(task => {
                const isSelected = selectedTask && (selectedTask.task_id === task.task_id || selectedTask.id === task.id)
                const agentColor = AGENT_COLOR[task.assigned_agent] ?? 'var(--ink-3)'
                const riskCls = RISK_CLASS[task.risk_level ?? ''] ?? ''
                return (
                  <button
                    key={task.task_id || task.id}
                    onClick={() => selectTask(task)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 14px',
                      background: isSelected ? 'var(--green-tint)' : 'transparent',
                      borderBottom: '1px solid var(--silver-1)',
                      border: 'none',
                      borderLeft: isSelected ? '3px solid var(--green)' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--silver-1)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <AgentChip agent={task.assigned_agent} showLabel={false} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>
                        {task.assigned_agent} Agent
                      </span>
                      <span className={`j-badge ${INBOX_STATUS_CLASS[task.status] ?? 'j-badge-neutral'}`} style={{ marginLeft: 'auto' }}>
                        {INBOX_STATUS_LABEL[task.status] ?? task.status}
                      </span>
                      {task.risk_level && (
                        <span className={`j-badge ${riskCls}`}>
                          {task.risk_level}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 3, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.expected_output}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right detail pane — full width on mobile; hidden until a task is selected */}
        <div
          className={`${selectedTask ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-h-0`}
          style={{
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 300,
          }}
        >
          {selectedTask ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* detail header */}
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--silver-1)',
                background: 'var(--paper-elevated)',
              }}>
                <button
                  type="button"
                  onClick={() => { setSelectedTask(null); setHandoffs([]) }}
                  className="lg:hidden"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', padding: '0 0 8px', cursor: 'pointer',
                    color: 'var(--green-press)', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                  }}
                >
                  ← 목록으로
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  <AgentChip agent={selectedTask.assigned_agent} />
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>결과 보고 및 검토</span>
                </div>
                <h2 style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 500,
                  fontSize: 18,
                  color: 'var(--ink-1)',
                  lineHeight: 1.35,
                  margin: 0,
                  overflowWrap: 'anywhere',
                }}>
                  {selectedTask.title}
                </h2>
                {/* status / risk / approval / time */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 9 }}>
                  {selectedTask.status && (
                    <span className={`j-badge ${INBOX_STATUS_CLASS[selectedTask.status] ?? 'j-badge-neutral'}`}>
                      {INBOX_STATUS_LABEL[selectedTask.status] ?? selectedTask.status}
                    </span>
                  )}
                  {selectedTask.risk_level && (
                    <span className={`j-badge ${RISK_CLASS[selectedTask.risk_level] ?? 'j-badge-neutral'}`}>{selectedTask.risk_level}</span>
                  )}
                  {selectedTask.approval_required && (
                    <span className="j-badge j-badge-review">승인필요</span>
                  )}
                  {(selectedTask.updated_at || selectedTask.updatedAt) && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
                      {new Date(selectedTask.updated_at || selectedTask.updatedAt).toLocaleString('ko-KR')}
                    </span>
                  )}
                </div>
              </div>

              {/* scrollable content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* task meta — stacked on mobile, 2-col on desktop */}
                <div
                  className="grid grid-cols-1 lg:grid-cols-2 gap-3"
                  style={{
                    background: 'var(--paper-elevated)',
                    border: '1px solid var(--silver-1)',
                    borderRadius: 6,
                    padding: '13px 14px',
                  }}
                >
                  <div>
                    <div className="j-overline" style={{ marginBottom: 5 }}>수행 배경 (Rationale)</div>
                    <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere' }}>
                      {selectedTask.rationale || '—'}
                    </p>
                  </div>
                  <div>
                    <div className="j-overline" style={{ marginBottom: 5 }}>기대 산출물</div>
                    <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere' }}>
                      {selectedTask.expected_output || '—'}
                    </p>
                  </div>
                </div>

                {/* 에이전트 판단 & 결과 — decision / reasoning / next_action */}
                {(selectedTask.decision || selectedTask.reasoning || selectedTask.next_action) && (
                  <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--silver-1)', background: 'var(--paper-elevated)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="j-overline">에이전트 판단 &amp; 결과</span>
                      {typeof selectedTask.reasoning === 'string' && /^\[(CTO|CEO)\s/.test(selectedTask.reasoning) && (
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--green-press)', background: 'var(--green-tint)', padding: '1px 7px', borderRadius: 999 }}>
                          ⟳ {selectedTask.reasoning.match(/^\[(CTO|CEO)\s/)![1]} 자가복구
                        </span>
                      )}
                    </div>
                    <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {selectedTask.decision && (
                        <div>
                          <div className="j-overline" style={{ marginBottom: 5 }}>결정 (Decision)</div>
                          <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere' }}>{selectedTask.decision}</p>
                        </div>
                      )}
                      {selectedTask.next_action && (
                        <div style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 6, padding: '10px 12px' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-press)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon name="arrowR" size={12} stroke={2} /> 다음 액션 (Next Action)
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55, margin: 0, overflowWrap: 'anywhere' }}>{selectedTask.next_action}</p>
                        </div>
                      )}
                      {selectedTask.reasoning && (
                        <div>
                          <div className="j-overline" style={{ marginBottom: 5 }}>판단 근거 (Reasoning)</div>
                          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{selectedTask.reasoning}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 원 지시 (source instruction) */}
                {selectedTask.source_instruction && (
                  <div style={{ background: 'var(--bg-inset, var(--silver-1))', borderRadius: 6, padding: '10px 12px' }}>
                    <div className="j-overline" style={{ marginBottom: 5 }}>Founder 원 지시</div>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0, overflowWrap: 'anywhere' }}>{selectedTask.source_instruction}</p>
                  </div>
                )}

                {/* blocker */}
                {selectedTask.blocker && (
                  <div style={{
                    background: 'var(--amber-tint)',
                    border: '1px solid #DDB87A',
                    borderRadius: 6,
                    padding: '11px 13px',
                    fontSize: 12.5,
                    color: '#8A5408',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}>
                    <Icon name="alert" size={14} stroke={1.8} />
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 3 }}>분석된 병목 요인 (Blocker)</div>
                      <div style={{ lineHeight: 1.5 }}>{selectedTask.blocker}</div>
                    </div>
                  </div>
                )}

                {/* agent deliverable */}
                <div style={{
                  border: '1px solid var(--silver-2)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '9px 13px',
                    borderBottom: '1px solid var(--silver-1)',
                    background: 'var(--paper-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <Icon name="note" size={13} stroke={1.6} />
                    <span className="j-overline">에이전트 최종 분석 & 산출물</span>
                  </div>

                  <div style={{ padding: '14px 13px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Real work product (agent_tasks.output) — the concrete deliverable */}
                    {selectedTask.output && <AgentOutputDetail agent={selectedTask.agent} output={selectedTask.output} />}
                    {handoffs.length === 0 && !selectedTask.output ? (
                      <div>
                        <div className="j-overline" style={{ marginBottom: 6 }}>상세 결과 내용</div>
                        <div style={{
                          background: 'var(--paper-elevated)',
                          border: '1px solid var(--silver-1)',
                          borderRadius: 4,
                          padding: '10px 12px',
                          fontSize: 12.5,
                          color: 'var(--ink-1)',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {selectedTask.expected_output}
                        </div>
                      </div>
                    ) : (
                      handoffs.map((handoff: any) => (
                        <div key={handoff.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {handoff.context && (
                            <div>
                              <div className="j-overline" style={{ marginBottom: 6 }}>분석 본문 및 결과 (Context)</div>
                              <div style={{
                                background: 'var(--paper-elevated)',
                                border: '1px solid var(--silver-1)',
                                borderRadius: 4,
                                padding: '10px 12px',
                                fontSize: 12.5,
                                color: 'var(--ink-1)',
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                              }}>
                                {handoff.context}
                              </div>
                            </div>
                          )}
                          {handoff.next_action && (
                            <div style={{
                              background: 'var(--green-tint)',
                              border: '1px solid var(--green-tint-2)',
                              borderRadius: 6,
                              padding: '10px 12px',
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-press)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Icon name="arrowR" size={12} stroke={2} />
                                COO가 정의한 다음 액션 (Next Action)
                              </div>
                              <p style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5, margin: 0 }}>
                                {handoff.next_action}
                              </p>
                            </div>
                          )}
                          {handoff.what_was_completed && (
                            <div>
                              <div className="j-overline" style={{ marginBottom: 6 }}>완료된 사항</div>
                              <p style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.55, margin: 0 }}>
                                {handoff.what_was_completed}
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* action panel — only for review-pending tasks. In-progress /
                  done tasks are read-only (the founder is just viewing the work). */}
              {(selectedTask.status === 'needs_review' || selectedTask.approval_required) ? (
              <div style={{
                padding: '14px 18px',
                borderTop: '1px solid var(--silver-1)',
                background: 'var(--paper-elevated)',
              }}>
                {error && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 5 }}>
                      에이전트에게 전달할 피드백 (수정 요청 시 필수 입력)
                    </label>
                    <textarea
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder="수정이 필요한 부분이나 추가 피드백을 남겨주세요…"
                      className="j-input j-textarea"
                      style={{ minHeight: 60, maxHeight: 100, fontSize: 12.5 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleReject}
                      disabled={actionLoading || !feedback.trim()}
                      className="j-btn j-btn-danger j-btn-sm"
                    >
                      <Icon name="x" size={13} stroke={2} />
                      수정 요청하기
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="j-btn j-btn-primary j-btn-sm"
                    >
                      <Icon name="check" size={13} stroke={2.2} />
                      {actionLoading ? '승인 처리 중…' : '최종 승인 완료'}
                    </button>
                  </div>
                </div>
              </div>
              ) : (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--silver-1)', background: 'var(--paper-elevated)', fontSize: 12, color: 'var(--ink-4)', textAlign: 'center' }}>
                {selectedTask.status === 'done' ? '완료된 과제입니다. 결과를 확인하세요.' : '진행 중인 과제입니다.'}
              </div>
              )}
            </div>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              textAlign: 'center',
            }}>
              <span style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'var(--silver-1)',
                color: 'var(--ink-4)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <Icon name="inbox" size={20} stroke={1.5} />
              </span>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500, marginBottom: 5 }}>
                검토할 에이전트 산출물을 왼쪽 목록에서 선택해 주세요.
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--ink-4)', maxWidth: 280, lineHeight: 1.6 }}>
                에이전트가 완료한 태스크를 클릭하면 구체적인 지침서(SOP)나 마케팅 가설 등의 상세 분석 결과물이 여기에 렌더링됩니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page shell ───────────────────────────────────────────────────────────────
function ChatContent() {
  const { selectedId, businesses, selectedProjectId, projects } = useBusiness()
  const [activeTab, setActiveTab] = useState('chat')
  const [pendingTask, setPendingTask] = useState<InboxTaskRef | null>(null)
  const openInboxTask = useCallback((t: InboxTaskRef) => {
    setPendingTask(t)
    setActiveTab('inbox')
  }, [])

  const selectedBusiness = businesses.find(b => b.id === selectedId)
  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const contextLabel = selectedBusiness
    ? `${selectedBusiness.name}${selectedProject ? ` ↳ ${selectedProject.name}` : ''}`
    : '회사 공통'

  return (
    <InboxNavContext.Provider value={{ openInboxTask }}>
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 3rem)' }}>
      {/* page header */}
      <div style={{
        marginBottom: 16,
        display: 'flex',
        alignItems: 'baseline',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 24,
          color: 'var(--ink-1)',
          letterSpacing: '-0.01em',
          margin: 0,
          lineHeight: 1.1,
        }}>
          CEO Agent 채팅
        </h1>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          background: 'var(--silver-1)',
          border: '1px solid var(--silver-2)',
          borderRadius: 999,
          padding: '2px 9px',
        }}>
          {contextLabel}
        </span>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginLeft: 2, display: 'none' }}
          className="sm:block">
          지시를 입력하면 CEO Agent가 해석하고 임원 Task 플랜을 제안합니다.
        </p>
      </div>

      <TabLayout active={activeTab} onChange={setActiveTab}>
        {(tab) => (
          <>
            {tab === 'chat' && <ChatTab businessId={selectedId} />}
            {tab === 'roadmap' && <RoadmapTab businessId={selectedId} />}
            {tab === 'inbox' && (
              <InboxTab
                businessId={selectedId}
                pendingTask={pendingTask}
                onPendingConsumed={() => setPendingTask(null)}
              />
            )}
          </>
        )}
      </TabLayout>
    </div>
    </InboxNavContext.Provider>
  )
}

export default function ChatPage() {
  return <AuthGate><ChatContent /></AuthGate>
}
