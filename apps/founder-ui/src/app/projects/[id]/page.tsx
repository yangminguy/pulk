'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { api, ActiveBusiness, ProjectTimeline, OpenItem, DecisionRecord } from '@/lib/api'

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// ── Joinery token maps (light) ───────────────────────────────────────────────

const RISK_STYLES: Record<string, { bg: string; fg: string }> = {
  D1: { bg: 'var(--green-tint)',  fg: 'var(--green-press)' },
  D2: { bg: 'var(--blue-tint)',   fg: '#1F4A9E' },
  D3: { bg: 'var(--amber-tint)',  fg: '#8A5408' },
  D4: { bg: '#F7DCB6',            fg: '#8A4E26' },
  D5: { bg: 'var(--red-tint)',    fg: '#8C2A1F' },
}

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  queued:       { bg: 'var(--silver-1)',  fg: 'var(--ink-2)' },
  running:      { bg: 'var(--blue-tint)', fg: '#1F4A9E' },
  blocked:      { bg: 'var(--red-tint)',  fg: '#8C2A1F' },
  needs_review: { bg: 'var(--amber-tint)',fg: '#8A5408' },
  done:         { bg: 'var(--green-tint)',fg: 'var(--green-press)' },
  killed:       { bg: 'var(--silver-1)',  fg: 'var(--ink-3)' },
}

const OPEN_ITEM_STYLES: Record<string, { bg: string; fg: string }> = {
  needs_review:    { bg: 'var(--amber-tint)', fg: '#8A5408' },
  blocked:         { bg: 'var(--red-tint)',   fg: '#8C2A1F' },
  pending_approval:{ bg: '#F7DCB6',           fg: '#8A4E26' },
}

const OPEN_ITEM_LABELS: Record<string, string> = {
  needs_review:    '검토필요',
  blocked:         '차단됨',
  pending_approval:'승인대기',
}

// Pastel agent colors — light mode
const AGENT_COLORS: Record<string, { bg: string; fg: string }> = {
  CEO: { bg: 'var(--p-lav)',   fg: 'var(--pi-lav)' },
  CTO: { bg: 'var(--p-sky)',   fg: 'var(--pi-sky)' },
  CMO: { bg: 'var(--p-rose)',  fg: 'var(--pi-rose)' },
  CFO: { bg: 'var(--p-mint)',  fg: 'var(--pi-mint)' },
  COO: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
  CPO: { bg: 'var(--p-butter)',fg: 'var(--pi-butter)' },
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Pill({
  bg,
  fg,
  children,
  mono = false,
}: {
  bg: string
  fg: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 500,
      lineHeight: 1.4,
      background: bg,
      color: fg,
      whiteSpace: 'nowrap',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    }}>
      {children}
    </span>
  )
}

function AgentBadge({ agent }: { agent: string }) {
  const s = AGENT_COLORS[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return <Pill bg={s.bg} fg={s.fg}>{agent}</Pill>
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return <Pill bg={s.bg} fg={s.fg}>{status}</Pill>
}

function RiskPill({ risk }: { risk: string }) {
  const s = RISK_STYLES[risk] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
  return <Pill bg={s.bg} fg={s.fg} mono>{risk}</Pill>
}

// SectionHead — overline + serif h2 + optional right action
function SectionHead({ overline, title, action }: { overline: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: '1px solid var(--silver-2)',
    }}>
      <div>
        <div className="j-overline" style={{ marginBottom: 5 }}>{overline}</div>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 22,
          color: 'var(--ink-1)',
          margin: 0,
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
        }}>{title}</h2>
      </div>
      {action}
    </div>
  )
}

// Phase progress strip
const PHASES = ['방향 정렬', 'PMF 진단', '실행 빌드', '세일즈 테스트', '제품화', '스케일']

function PhaseStrip({ currentPhase }: { currentPhase: string | null }) {
  const cur = currentPhase
    ? PHASES.findIndex(p => p === currentPhase || currentPhase.toLowerCase().includes(p.toLowerCase()))
    : -1
  const nextPhase = cur >= 0 && cur < PHASES.length - 1 ? PHASES[cur + 1] : null

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      marginBottom: 32,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="j-overline">BPR PHASE · {cur >= 0 ? cur + 1 : '–'} / {PHASES.length}</div>
        <div style={{ flex: 1 }} />
        {currentPhase && (
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--green-press)',
            background: 'var(--green-tint)',
            padding: '3px 10px',
            borderRadius: 999,
          }}>{currentPhase}</span>
        )}
        {nextPhase && (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--ink-3)',
            }}>{nextPhase}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {PHASES.map((p, i) => (
          <div key={p} style={{ flex: 1 }} title={p}>
            <div style={{
              height: 5,
              borderRadius: 999,
              background: i < cur
                ? 'var(--green-tint-2)'
                : i === cur
                ? 'var(--green)'
                : 'var(--silver-1)',
            }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id

  const [business, setBusiness] = useState<ActiveBusiness | null>(null)
  const [timeline, setTimeline] = useState<ProjectTimeline | null>(null)
  const [statusMd, setStatusMd] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [businesses, tl, md] = await Promise.all([
        api.listActiveBusinesses(),
        api.getProjectTimeline(id),
        api.getProjectStatusMd(id),
      ])
      const found = businesses.find(b => b.id === id) ?? null
      setBusiness(found)
      setTimeline(tl)
      setStatusMd(md)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <div className="j-meta" style={{ padding: '32px 0' }}>로딩 중...</div>
  }

  if (!business && !timeline) {
    return <div className="j-meta" style={{ padding: '32px 0' }}>프로젝트를 찾을 수 없습니다.</div>
  }

  const agentTasks = timeline?.agentTasks ?? []
  const handoffs = timeline?.handoffs ?? []
  const openItems = timeline?.openItems ?? []
  const decisions = timeline?.decisions ?? []

  type FeedEntry =
    | { kind: 'task'; when: string | null; agent: string; title: string; status: string; risk_level: string | null; task_id: string }
    | { kind: 'handoff'; when: string | null; from_agent: string; to_agent: string; task_id: string; note: string | null }

  const feed: FeedEntry[] = [
    ...agentTasks.map(t => ({
      kind: 'task' as const,
      when: t.updated_at,
      agent: t.agent,
      title: t.title,
      status: t.status,
      risk_level: t.risk_level,
      task_id: t.task_id,
    })),
    ...handoffs.map(h => ({
      kind: 'handoff' as const,
      when: h.created_at,
      from_agent: h.from_agent,
      to_agent: h.to_agent,
      task_id: h.task_id,
      note: h.note,
    })),
  ]
    .sort((a, b) => {
      if (!a.when && !b.when) return 0
      if (!a.when) return 1
      if (!b.when) return -1
      return new Date(b.when).getTime() - new Date(a.when).getTime()
    })
    .slice(0, 30)

  return (
    <div style={{ maxWidth: 840 }}>
      {/* 1. Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <h1 className="j-h1" style={{ margin: 0 }}>{business?.name ?? id}</h1>
          {business?.lifecycle_stage && (
            <span className="j-badge j-badge-live" style={{ marginTop: 4 }}>
              <span className="j-badge-dot" />
              {business.lifecycle_stage}
            </span>
          )}
        </div>
        {business?.one_liner && (
          <p className="j-body" style={{ margin: 0 }}>{business.one_liner}</p>
        )}
      </div>

      {/* 2. Phase strip */}
      <PhaseStrip currentPhase={business?.current_phase ?? null} />

      {/* 3. Current Status (STATUS.md) */}
      <section style={{ marginBottom: 40 }}>
        <SectionHead overline="현황" title="현재 상태" />
        {statusMd ? (
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            color: 'var(--ink-2)',
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.65,
            margin: 0,
          }}>
            {statusMd}
          </pre>
        ) : (
          <div className="j-meta">STATUS.md 없음</div>
        )}
      </section>

      {/* 4. CTO Plan timeline */}
      <section style={{ marginBottom: 40 }}>
        <SectionHead overline="실행 계획" title="CTO Plan Timeline" />
        {agentTasks.length === 0 ? (
          <div className="j-meta">플랜 데이터 없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const phases = Array.from(new Set(agentTasks.map(t => t.phase ?? '(미분류)'))).slice(0, 10)
              return phases.map(phase => {
                const phaseTasks = agentTasks.filter(t => (t.phase ?? '(미분류)') === phase)
                const allDone = phaseTasks.every(t => t.status === 'done')
                const anyBlocked = phaseTasks.some(t => t.status === 'blocked')
                return (
                  <div key={phase} style={{
                    border: '1px solid',
                    borderColor: allDone
                      ? 'var(--green-tint-2)'
                      : anyBlocked
                      ? 'var(--red-tint)'
                      : 'var(--silver-2)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    background: allDone
                      ? 'var(--green-tint)'
                      : anyBlocked
                      ? 'var(--red-tint)'
                      : 'var(--paper-surface)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span className="j-ui" style={{ fontWeight: 600 }}>{phase}</span>
                      <span className="j-meta">{phaseTasks.length}개 태스크</span>
                      {allDone && (
                        <span style={{ fontSize: 11.5, color: 'var(--green-press)', fontWeight: 500 }}>완료</span>
                      )}
                      {anyBlocked && (
                        <span style={{ fontSize: 11.5, color: '#8C2A1F', fontWeight: 500 }}>차단됨</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {phaseTasks.map(t => {
                        const s = STATUS_STYLES[t.status] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
                        return (
                          <span
                            key={t.task_id}
                            title={t.title}
                            style={{
                              fontSize: 11.5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: s.bg,
                              color: s.fg,
                              fontFamily: 'var(--font-sans)',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.title.length > 30 ? t.title.slice(0, 30) + '…' : t.title}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </section>

      {/* 5. Agent activity feed */}
      <section style={{ marginBottom: 40 }}>
        <SectionHead overline="에이전트" title="Agent Activity" />
        {feed.length === 0 ? (
          <div className="j-meta">활동 없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feed.map((entry, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--paper-surface)',
                  border: '1px solid var(--silver-1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <span className="j-mono" style={{ color: 'var(--ink-3)', flexShrink: 0, minWidth: 64 }}>
                  {relativeTime(entry.when)}
                </span>
                {entry.kind === 'task' ? (
                  <>
                    <AgentBadge agent={entry.agent} />
                    <span className="j-ui" style={{ flex: 1, minWidth: 120 }}>{entry.title}</span>
                    {entry.risk_level && <RiskPill risk={entry.risk_level} />}
                    <StatusPill status={entry.status} />
                  </>
                ) : (
                  <>
                    <AgentBadge agent={entry.from_agent} />
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <AgentBadge agent={entry.to_agent} />
                    <span className="j-ui-sm" style={{ flex: 1, fontStyle: 'italic', color: 'var(--ink-3)' }}>
                      {entry.note ?? 'handoff'}
                    </span>
                    <span className="j-mono" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                      {entry.task_id.slice(0, 8)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Decision log */}
      <section style={{ marginBottom: 40 }}>
        <SectionHead overline="기록" title="Decision Log" />
        {decisions.length === 0 ? (
          <div className="j-meta">기록 없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {decisions.map((d: DecisionRecord, i: number) => (
              <div
                key={d.task_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 0',
                  borderBottom: i < decisions.length - 1 ? '1px solid var(--silver-1)' : 'none',
                }}
              >
                <span className="j-mono" style={{ color: 'var(--ink-4)', flexShrink: 0, minWidth: 72 }}>
                  {relativeTime(d.at)}
                </span>
                <span className="j-mono" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>
                  {d.task_id.slice(0, 8)}
                </span>
                <StatusPill status={d.verdict} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 7. Open items */}
      <section style={{ marginBottom: 40 }}>
        <SectionHead overline="미결" title="Open Items" />
        {openItems.length === 0 ? (
          <div className="j-meta">없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openItems.map((item: OpenItem) => {
              const s = OPEN_ITEM_STYLES[item.kind] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
              return (
                <div
                  key={item.task_id}
                  style={{
                    background: 'var(--paper-surface)',
                    border: '1px solid var(--silver-2)',
                    borderLeft: `3px solid ${s.fg}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Pill bg={s.bg} fg={s.fg}>
                    {OPEN_ITEM_LABELS[item.kind] ?? item.kind}
                  </Pill>
                  <span className="j-mono" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                    {item.task_id.slice(0, 8)}
                  </span>
                  {item.note && (
                    <span className="j-ui-sm" style={{ flex: 1 }}>{item.note}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
