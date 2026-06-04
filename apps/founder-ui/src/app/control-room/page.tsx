'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, ControlRoomBusiness, ControlRoomDevTask, CtoPlan } from '@/lib/api'
import { useBusiness } from '@/lib/business-context'

// ── Joinery status tokens ─────────────────────────────────────────────────────
type StatusTone = 'live' | 'review' | 'blocked' | 'draft' | 'neutral'

const STATUS_TONE: Record<string, StatusTone> = {
  queued:       'draft',
  running:      'live',
  blocked:      'blocked',
  needs_review: 'review',
  done:         'live',
  killed:       'neutral',
}

const STATUS_LABELS: Record<string, string> = {
  queued:       '대기',
  running:      '진행중',
  blocked:      '차단됨',
  needs_review: '검토필요',
  done:         '완료',
  killed:       '종료',
}

const BADGE_TONE_STYLES: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  live:    { bg: 'var(--green-tint)',  fg: 'var(--green-press)', dot: 'var(--green)' },
  review:  { bg: 'var(--amber-tint)', fg: '#8A5408',            dot: 'var(--amber)' },
  blocked: { bg: 'var(--red-tint)',   fg: '#8C2A1F',            dot: 'var(--red)'   },
  draft:   { bg: 'var(--silver-1)',   fg: 'var(--ink-2)',       dot: 'var(--silver-4)' },
  neutral: { bg: 'var(--silver-1)',   fg: 'var(--ink-3)',       dot: 'var(--silver-3)' },
}

// ── Risk badge ────────────────────────────────────────────────────────────────
const RISK_STYLES: Record<string, { bg: string; fg: string }> = {
  D1: { bg: 'var(--green-tint)',  fg: 'var(--green-press)' },
  D2: { bg: 'var(--p-butter)',    fg: 'var(--pi-butter)'   },
  D3: { bg: 'var(--amber-tint)', fg: '#8A5408'              },
  D4: { bg: 'var(--p-peach)',     fg: 'var(--pi-peach)'    },
  D5: { bg: 'var(--red-tint)',   fg: 'var(--red)'           },
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  const { bg, fg, dot } = BADGE_TONE_STYLES[tone]
  const label = STATUS_LABELS[status] ?? status
  const pulsing = status === 'running' || status === 'needs_review'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        lineHeight: 1.4,
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: dot,
          animation: pulsing ? 'j-pulse 1.8s ease-in-out infinite' : undefined,
        }}
      />
      {label}
    </span>
  )
}

// ── Agent chip ────────────────────────────────────────────────────────────────
const AGENT_PASTEL: Record<string, { bg: string; fg: string }> = {
  CTO:         { bg: 'var(--green-tint)', fg: 'var(--green-press)' },
  'claude-code': { bg: 'var(--p-lav)',   fg: 'var(--pi-lav)' },
  codex:       { bg: 'var(--p-sky)',     fg: 'var(--pi-sky)' },
  antigravity: { bg: 'var(--p-mint)',    fg: 'var(--pi-mint)' },
}

// Founder-friendly agent label — drops developer suffixes ("-code") so a
// non-developer reads "Claude가 작업 중", not "claude-code".
const AGENT_FRIENDLY: Record<string, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  antigravity: 'Antigravity',
  CTO: 'CTO',
}
function friendlyAgent(agent: string): string {
  return AGENT_FRIENDLY[agent] ?? agent
}

// "2 / 6" → "6단계 중 2단계" (plain progress; developer phase numbers hidden).
function plainProgress(phaseLabel: string | null | undefined): string | null {
  if (!phaseLabel) return null
  const m = phaseLabel.match(/(\d+)\s*\/\s*(\d+)/)
  if (!m) return null
  return `${m[2]}단계 중 ${m[1]}단계`
}

function AgentChip({ agent }: { agent: string }) {
  const p = AGENT_PASTEL[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: p.fg,
        background: p.bg,
        padding: '2px 8px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {agent}
    </span>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconRefresh({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function IconExternalLink({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <path d="M15 3h6v6" /><path d="M10 14L21 3" />
    </svg>
  )
}

function IconAlertTriangle({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconChevron({ size = 14, open }: { size?: number; open: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// ── ACR execution strip ───────────────────────────────────────────────────────
function hasAcr(t: ControlRoomDevTask): boolean {
  return !!(t.branch || t.phase_label || t.exec_status || t.log_tail || t.changed_files != null)
}

function AcrStrip({ task }: { task: ControlRoomDevTask }) {
  const [showLog, setShowLog] = useState(false)

  if (!hasAcr(task)) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
        실행 정보 없음
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5 }}>
        {task.branch && (
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--ink-4)' }}>branch</span>
            {task.branch}
          </span>
        )}
        {task.phase_label && (
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--ink-4)' }}>phase </span>{task.phase_label}
          </span>
        )}
        {task.exec_status && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', color: 'var(--ink-2)' }}>
            <span style={{
              width: 6, height: 6, borderRadius: 999,
              background: task.exec_status === 'running' ? 'var(--green)'
                : task.exec_status === 'needs_review' ? 'var(--amber)'
                : 'var(--silver-3)',
              animation: task.exec_status === 'running' ? 'j-pulse 1.8s ease-in-out infinite' : undefined,
            }} />
            {task.exec_status}
          </span>
        )}
        {task.changed_files != null && (
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>
            {task.changed_files}개 파일
          </span>
        )}
      </div>

      {task.log_tail && (
        <div>
          <button
            type="button"
            onClick={() => setShowLog(v => !v)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--green-press)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {showLog ? '로그 접기' : '로그 보기'}
          </button>
          {showLog && (
            <pre style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--ink-3)',
              background: 'var(--bg-inset, var(--silver-1))',
              padding: '8px 10px',
              borderRadius: 6,
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}>
              {task.log_tail}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dev-task row (founder-friendly) ───────────────────────────────────────────
// Leads with plain language a non-developer reads ("Claude가 작업 중 · 6단계 중
// 4단계"); the developer data (branch hash, phase numbers, files, log, risk
// level) is tucked behind a collapsed "개발 상세".
function DevTaskRow({ task }: { task: ControlRoomDevTask }) {
  const riskStyle = task.risk_level ? (RISK_STYLES[task.risk_level] ?? null) : null
  const live = hasAcr(task)
  const execStatus = task.exec_status ?? task.status
  const progress = plainProgress(task.phase_label)
  // The CLI actually on the current phase (Claude/Codex/Antigravity); falls back
  // to the L5 owner (CTO) before ACR data arrives.
  const displayAgent = task.acr_agent || task.agent
  const who = friendlyAgent(displayAgent)
  const doing =
    execStatus === 'running' ? `${who}가 작업 중`
    : execStatus === 'done' ? `${who} · 완료`
    : execStatus === 'needs_review' ? `${who} · 검토 필요`
    : execStatus === 'blocked' ? `${who} · 막힘`
    : execStatus === 'queued' ? '시작 대기'
    : who

  return (
    <div
      className="j-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
    >
      {/* Header: who's on it (actual CLI) + plain status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <AgentChip agent={displayAgent} />
        <StatusBadge status={execStatus} />
      </div>

      {/* Title — what this task is */}
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--ink-1)',
          lineHeight: 1.4,
        }}
      >
        {task.title}
      </div>

      {/* Plain progress line — who + where in the work */}
      {(live || progress) && (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{doing}</span>
          {progress && (
            <>
              <span style={{ color: 'var(--ink-4)' }}>·</span>
              <span>{progress}</span>
            </>
          )}
        </div>
      )}

      {/* Forecast token budget (추정) — shown until the task is done */}
      {execStatus !== 'done' && task.est_tokens_low != null && task.est_tokens_high != null && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-4)' }}>
          예상 토큰 약 {Math.round(task.est_tokens_low / 1000)}k–{Math.round(task.est_tokens_high / 1000)}k
        </div>
      )}

      {/* Developer details — collapsed for non-developers */}
      {(live || (task.risk_level && riskStyle)) && (
        <details style={{ marginTop: -1 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5,
              color: 'var(--ink-4)',
              userSelect: 'none',
              outline: 'none',
            }}
          >
            개발 상세
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {task.risk_level && riskStyle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>위험도</span>
                <span
                  className={`j-risk-${task.risk_level.toLowerCase()}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                    borderRadius: 4, fontSize: 11.5, fontWeight: 600,
                    fontFamily: 'var(--font-mono)', background: riskStyle.bg, color: riskStyle.fg,
                  }}
                >
                  {task.risk_level}
                </span>
              </div>
            )}
            <AcrStrip task={task} />
          </div>
        </details>
      )}
    </div>
  )
}

// ── Project section ───────────────────────────────────────────────────────────
function ProjectNode({ project }: { project: ControlRoomBusiness['projects'][number] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 13,
          color: 'var(--ink-2)',
        }}>
          {project.project_name}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {project.dev_tasks.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 12, borderLeft: '1px solid var(--silver-2)' }}>
        {project.dev_tasks.map(task => (
          <DevTaskRow key={task.task_id} task={task} />
        ))}
      </div>
    </div>
  )
}

// ── Business section ──────────────────────────────────────────────────────────
function BusinessNode({ business }: { business: ControlRoomBusiness }) {
  const [open, setOpen] = useState(true)
  const taskCount = business.projects.reduce((n, p) => n + p.dev_tasks.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--ink-3)', textAlign: 'left',
        }}
      >
        <IconChevron open={open} />
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 17,
          color: 'var(--ink-1)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          {business.business_name}
        </h2>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {taskCount}개 과제
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 22 }}>
          {business.projects.map(project => (
            <ProjectNode key={project.project_id ?? '(no project)'} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────
// ── M10: CTO conversational planning panel ────────────────────────────────────
type PlanningMsg = {
  role: 'founder' | 'cto'
  text: string
  plan?: CtoPlan | null
  cto_message_id?: string
  approved?: boolean
}

function PlanCard({
  plan,
  onApprove,
  approving,
  approved,
}: {
  plan: CtoPlan
  onApprove: () => void
  approving: boolean
  approved: boolean
}) {
  const newProject = plan.project_proposal?.is_new_project
  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--silver-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        CTO 제안 계획
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {newProject && (
          <div
            style={{
              background: 'var(--amber-tint)',
              border: '1px solid var(--amber)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12.5,
              color: '#8A5408',
              lineHeight: 1.5,
            }}
          >
            <strong>새 프로젝트 제안</strong> — &ldquo;{plan.project_proposal!.suggested_project_title}&rdquo;
            {plan.project_proposal!.rationale ? <span> · {plan.project_proposal!.rationale}</span> : null}
          </div>
        )}

        {/* PRD */}
        {plan.prd && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4, fontWeight: 600 }}>제품 요구 (PRD)</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55 }}>{plan.prd}</p>
          </div>
        )}

        {/* Roadmap */}
        {plan.roadmap_items.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 600 }}>
              로드맵 ({plan.roadmap_items.length}단계)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plan.roadmap_items.map(r => (
                <div key={r.sequence} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--green)',
                      minWidth: 18,
                    }}
                  >
                    {r.sequence}
                  </span>
                  <div>
                    <span style={{ fontSize: 12.5, color: 'var(--ink-1)', fontWeight: 500 }}>{r.title}</span>
                    {r.summary ? (
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}> — {r.summary}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        {plan.tasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 600 }}>
              실행 작업 ({plan.tasks.length}개) · CTO가 배정
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {plan.tasks.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    #{t.roadmap_sequence}
                  </span>
                  <span style={{ color: 'var(--ink-1)' }}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token budget forecast (추정) */}
        {plan.token_estimate && plan.token_estimate.task_count > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--silver-1)',
              borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>예상 토큰</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-1)' }}>
              약 {Math.round(plan.token_estimate.low / 1000)}k–{Math.round(plan.token_estimate.high / 1000)}k
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
              · 작업 {plan.token_estimate.task_count}개 추정치 (실제 사용량은 실행 후 집계)
            </span>
          </div>
        )}

        {/* Approve */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
          {approved ? (
            <span style={{ fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}>
              ✓ 승인됨 — 작업이 컨트롤룸에 배정되었습니다
            </span>
          ) : (
            <>
              <button
                onClick={onApprove}
                disabled={approving}
                className="j-btn j-btn-primary j-btn-sm"
              >
                {approving ? '승인 중...' : '이 계획 승인'}
              </button>
              <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
                승인하면 로드맵·작업이 생성되고 CTO가 실행을 시작합니다.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CtoPlanningPanel({ onApproved }: { onApproved: () => void }) {
  const { selectedId } = useBusiness()
  const [open, setOpen] = useState(false)
  const [threadId] = useState(
    () => `cto-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`,
  )
  const [messages, setMessages] = useState<PlanningMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setErr(null)
    setSending(true)
    setMessages(m => [...m, { role: 'founder', text }])
    try {
      const res = await api.ctoPlanMessage(threadId, text, { business_id: selectedId ?? null })
      setMessages(m => [...m, { role: 'cto', text: res.reply, plan: res.plan, cto_message_id: res.cto_message_id }])
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  const approve = async (idx: number, ctoMessageId: string) => {
    setApprovingId(ctoMessageId)
    setErr(null)
    try {
      await api.ctoApprovePlan(ctoMessageId)
      setMessages(m => m.map((mm, i) => (i === idx ? { ...mm, approved: true } : mm)))
      onApproved()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '승인 실패')
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <IconChevron open={open} />
        <div>
          <div style={{ fontSize: 14, color: 'var(--ink-1)', fontWeight: 600 }}>CTO와 기획하기</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            아이디어를 이야기하면 CTO가 PRD·로드맵·작업으로 정리해 제안합니다.
          </div>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--silver-2)', padding: '14px 16px' }}>
          {/* Conversation */}
          {messages.length === 0 && (
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>
              예: &ldquo;세컨브레인에 검색 기능을 넣고 싶어&rdquo; — CTO가 질문하거나 바로 계획을 제안합니다.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    alignSelf: m.role === 'founder' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.55,
                    background: m.role === 'founder' ? 'var(--ink-1)' : 'var(--silver-1)',
                    color: m.role === 'founder' ? 'var(--paper-pure)' : 'var(--ink-1)',
                  }}
                >
                  {m.text}
                </div>
                {m.role === 'cto' && m.plan && m.cto_message_id && (
                  <PlanCard
                    plan={m.plan}
                    approving={approvingId === m.cto_message_id}
                    approved={!!m.approved}
                    onApprove={() => approve(i, m.cto_message_id!)}
                  />
                )}
              </div>
            ))}
            {sending && (
              <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--ink-4)' }}>CTO가 생각 중...</div>
            )}
          </div>

          {err && (
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--red)' }}>{err}</p>
          )}

          {/* Input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="CTO에게 만들고 싶은 것을 이야기하세요..."
              className="j-input"
              style={{ flex: 1, fontSize: 13, padding: '8px 12px' }}
              disabled={sending}
            />
            <button onClick={send} disabled={sending || !input.trim()} className="j-btn j-btn-primary j-btn-sm">
              보내기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ControlRoomContent() {
  const { businesses, selectedId, setSelectedId } = useBusiness()
  const [tree, setTree] = useState<ControlRoomBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await api.controlRoomTree(selectedId ?? undefined)
      setTree(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '로드 실패')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    setLoading(true)
    load()
    if (!autoRefresh) return
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load, autoRefresh])

  // Degraded banner: every dev-task lacks ACR execution data
  const allTasks = tree.flatMap(b => b.projects.flatMap(p => p.dev_tasks))
  const acrMissing = allTasks.length > 0 && allTasks.every(t => !hasAcr(t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--ink-3)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              margin: '0 0 4px',
            }}
          >
            CTO
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 500,
              fontSize: 22,
              color: 'var(--ink-1)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            CTO 개발 현황
          </h1>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Business selector */}
          {businesses.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(e.target.value || null)}
              className="j-input"
              style={{ fontSize: 12.5, padding: '5px 8px', cursor: 'pointer' }}
            >
              <option value="">전체</option>
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          {/* Auto-refresh toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: 'var(--ink-3)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--green)', cursor: 'pointer' }}
            />
            10초 자동 새로고침
          </label>

          {/* Refresh button */}
          <button
            onClick={load}
            className="j-btn j-btn-secondary j-btn-sm"
            aria-label="새로고침"
          >
            <IconRefresh size={13} />
            새로고침
          </button>

          {/* Open Agent Control Room */}
          <button
            onClick={() => window.open('http://localhost:3001', '_blank')}
            className="j-btn j-btn-primary j-btn-sm"
          >
            <IconExternalLink size={13} />
            Agent Control Room
          </button>
        </div>
      </div>

      {/* Header note */}
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        CTO에게 맡긴 개발 과제 현황. 실행 데이터는 ACR에서 가져옵니다(연결 시).
      </p>

      {/* Hairline */}
      <div style={{ height: 1, background: 'var(--silver-2)' }} />

      {/* M10: CTO conversational planning */}
      <CtoPlanningPanel onApproved={load} />

      {/* ACR degraded banner */}
      {!loading && acrMissing && (
        <div
          style={{
            background: 'var(--amber-tint)',
            border: '1px solid var(--amber)',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12.5,
            color: '#8A5408',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <IconAlertTriangle />
          Agent Control Room에 연결할 수 없습니다 — 실행 정보 없이 L5 상태만 표시합니다.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>로딩 중...</p>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'var(--red-tint)',
            border: '1px solid var(--red)',
            borderRadius: 6,
            padding: '12px 14px',
            fontSize: 13,
            color: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <IconAlertTriangle />
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && tree.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            color: 'var(--ink-4)',
            fontSize: 13.5,
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderRadius: 8,
          }}
        >
          진행 중인 개발 과제가 없습니다.
        </div>
      )}

      {/* Tree */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {tree.map(business => (
          <BusinessNode key={business.business_id ?? '(common)'} business={business} />
        ))}
      </div>
    </div>
  )
}

export default function ControlRoomPage() {
  return <AuthGate><ControlRoomContent /></AuthGate>
}
