'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import TabLayout from '@/components/TabLayout'
import Icon from '@/components/Icon'
import { api, type CmoMarketingPlan, type TaskItem } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'

// ── Risk badge classes ──────────────────────────────────────────────────────
const RISK_CLASS: Record<string, string> = {
  D1: 'j-risk-d1',
  D2: 'j-risk-d2',
  D3: 'j-risk-d3',
  D4: 'j-risk-d4',
  D5: 'j-risk-d5',
}

const CMO_TABS = [
  { id: 'chat', label: '대화' },
  { id: 'tasks', label: 'CMO 과제' },
]

// ── CmoResultCard — exported for test ───────────────────────────────────────
export function CmoResultCard({
  plan,
  onApprove,
  onReject,
  approved,
}: {
  plan: CmoMarketingPlan
  onApprove: () => void
  onReject: () => void
  approved: boolean
}) {
  const riskCls = RISK_CLASS[plan.risk_level] ?? ''

  return (
    <div style={{
      marginTop: 10,
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--paper-elevated)',
    }}>
      {/* Decision */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.4 }}>
          {plan.decision}
        </div>
      </div>

      {/* Reasoning */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div className="j-overline" style={{ marginBottom: 4 }}>판단 근거</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {plan.reasoning}
        </div>
      </div>

      {/* Next Action */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div style={{
          background: 'var(--green-tint)',
          border: '1px solid var(--green-tint-2)',
          borderRadius: 6,
          padding: '9px 12px',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-press)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowR" size={12} stroke={2} /> 다음 액션
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
            {plan.next_action}
          </div>
        </div>
      </div>

      {/* Risk + Approval CTA */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        {plan.risk_level && (
          <span className={`j-badge ${riskCls}`}>{plan.risk_level}</span>
        )}

        {approved ? (
          <span style={{
            marginLeft: 'auto',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--green-press)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <Icon name="check" size={13} stroke={2.2} />
            승인됨
          </span>
        ) : plan.requires_founder_approval ? (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onApprove} className="j-btn j-btn-primary j-btn-sm">
              <Icon name="check" size={13} stroke={2.2} />
              승인
            </button>
            <button onClick={onReject} className="j-btn j-btn-danger j-btn-sm">
              <Icon name="x" size={13} stroke={2} />
              수정 요청
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── CMO message type ────────────────────────────────────────────────────────
type CmoMsg = {
  role: 'founder' | 'cmo'
  text: string
  plan?: CmoMarketingPlan | null
  cmo_message_id?: string
  approved?: boolean
}

// ── Agent monogram chip ─────────────────────────────────────────────────────
function AgentChip() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 4,
        background: 'var(--wood-3)', color: '#fff',
        fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--font-mono)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>CM</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>CMO Agent</span>
    </span>
  )
}

// ── Chat Tab ────────────────────────────────────────────────────────────────
function CmoChatTab() {
  const { selectedId } = useBusiness()
  const [threadId] = useState(
    () => `cmo-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`,
  )
  const [messages, setMessages] = useState<CmoMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setErr(null)
    setSending(true)
    setMessages(m => [...m, { role: 'founder', text }])
    try {
      const res = await api.cmoChatMessage(threadId, text, { business_id: selectedId ?? null })
      setMessages(m => [...m, { role: 'cmo', text: res.reply, plan: res.plan, cmo_message_id: res.cmo_message_id }])
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  const handleApprove = async (idx: number, cmoMsgId: string) => {
    setErr(null)
    try {
      await api.cmoApprovePlan(cmoMsgId)
      setMessages(m => m.map((mm, i) => (i === idx ? { ...mm, approved: true } : mm)))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '승인 실패')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 64, color: 'var(--ink-4)' }}>
            <div style={{ fontSize: 14 }}>CMO에게 마케팅 전략을 이야기해보세요</div>
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--ink-4)' }}>
              예: &quot;PMF 메시지 A/B 테스트 계획해줘&quot;, &quot;타깃 포지셔닝 분석해줘&quot;
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'founder' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'founder' ? (
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
              <div style={{
                maxWidth: '90%',
                background: 'var(--paper-surface)',
                border: '1px solid var(--silver-2)',
                borderLeft: '4px solid var(--wood-3)',
                borderRadius: '4px 14px 14px 4px',
                padding: '12px 15px',
                fontSize: 14,
                color: 'var(--ink-1)',
                lineHeight: 1.55,
              }}>
                <div style={{ marginBottom: 8 }}>
                  <AgentChip />
                </div>
                <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                {msg.plan && msg.cmo_message_id && (
                  <CmoResultCard
                    plan={msg.plan}
                    approved={!!msg.approved}
                    onApprove={() => handleApprove(i, msg.cmo_message_id!)}
                    onReject={() => {}}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              background: 'var(--paper-surface)',
              border: '1px solid var(--silver-2)',
              borderLeft: '4px solid var(--wood-3)',
              borderRadius: '4px 14px 14px 4px',
              padding: '12px 15px',
              fontSize: 13.5,
              color: 'var(--ink-3)',
            }}>
              CMO Agent가 분석 중...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {err && (
        <div style={{
          fontSize: 12.5, color: 'var(--red)', marginBottom: 8,
          padding: '6px 10px', background: 'var(--red-tint)', borderRadius: 4,
        }}>
          {err}
        </div>
      )}

      {/* Input bar */}
      <div style={{ display: 'flex', gap: 9 }}>
        <input
          className="j-input"
          style={{ flex: 1, borderRadius: 999, padding: '11px 18px', fontSize: 14 }}
          placeholder="CMO에게 마케팅 전략을 이야기하세요..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="j-btn j-btn-primary"
          style={{ borderRadius: 999, padding: '0 20px', fontSize: 14 }}
        >
          <Icon name="send" size={15} stroke={1.8} />
          전송
        </button>
      </div>
    </div>
  )
}

// ── Tasks Tab (CMO only) ────────────────────────────────────────────────────
function CmoTasksTab() {
  const { selectedId } = useBusiness()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [selected, setSelected] = useState<TaskItem | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await api.getInboxTasks(null, selectedId)
      setTasks(all.filter((t: TaskItem) => t.agent === 'CMO'))
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 400 }}>
      {/* List */}
      <div style={{
        width: 280, flexShrink: 0, background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)', borderRadius: 8, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="j-overline">CMO 과제</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{tasks.length}건</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-4)', textAlign: 'center' }}>로딩 중...</div>}
          {!loading && tasks.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center' }}>CMO 과제가 없습니다.</div>}
          {tasks.map(t => (
            <button
              key={t.task_id}
              onClick={() => setSelected(t)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: selected?.task_id === t.task_id ? 'var(--green-tint)' : 'transparent',
                borderLeft: selected?.task_id === t.task_id ? '3px solid var(--green)' : '3px solid transparent',
                border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--silver-1)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.task_title}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2 }}>{t.status}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{
        flex: 1, background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)', borderRadius: 8,
        padding: selected ? 18 : 32,
        display: 'flex', flexDirection: 'column',
        alignItems: selected ? 'stretch' : 'center',
        justifyContent: selected ? 'flex-start' : 'center',
      }}>
        {selected ? (
          <>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ink-1)', margin: '0 0 12px' }}>
              {selected.task_title}
            </h3>
            {selected.rationale && (
              <div style={{ marginBottom: 12 }}>
                <div className="j-overline" style={{ marginBottom: 4 }}>수행 배경</div>
                <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0 }}>{selected.rationale}</p>
              </div>
            )}
            {selected.expected_output && (
              <div>
                <div className="j-overline" style={{ marginBottom: 4 }}>기대 산출물</div>
                <p style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6, margin: 0 }}>{selected.expected_output}</p>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>왼쪽에서 과제를 선택하세요.</p>
        )}
      </div>
    </div>
  )
}

// ── Page Shell ──────────────────────────────────────────────────────────────
function CmoContent() {
  const { selectedId, businesses } = useBusiness()
  const [activeTab, setActiveTab] = useState('chat')

  const selectedBusiness = businesses.find(b => b.id === selectedId)
  const contextLabel = selectedBusiness ? selectedBusiness.name : '회사 공통'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 3rem)' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 24,
          color: 'var(--ink-1)', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.1,
        }}>
          CMO Agent 마케팅
        </h1>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)',
          background: 'var(--silver-1)', border: '1px solid var(--silver-2)',
          borderRadius: 999, padding: '2px 9px',
        }}>
          {contextLabel}
        </span>
      </div>

      <TabLayout tabs={CMO_TABS} active={activeTab} onChange={setActiveTab}>
        {(tab) => (
          <>
            {tab === 'chat' && <CmoChatTab />}
            {tab === 'tasks' && <CmoTasksTab />}
          </>
        )}
      </TabLayout>
    </div>
  )
}

export default function CmoPage() {
  return <AuthGate><CmoContent /></AuthGate>
}
