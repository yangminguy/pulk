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

const RISK_STYLES: Record<string, string> = {
  D1: 'bg-slate-700 text-slate-300',
  D2: 'bg-blue-800 text-blue-200',
  D3: 'bg-yellow-800 text-yellow-200',
  D4: 'bg-orange-800 text-orange-200',
  D5: 'bg-red-800 text-red-200',
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-600 text-slate-200',
  running: 'bg-blue-700 text-blue-100',
  blocked: 'bg-red-700 text-red-100',
  needs_review: 'bg-yellow-700 text-yellow-100',
  done: 'bg-green-700 text-green-100',
  killed: 'bg-slate-700 text-slate-400',
}

const OPEN_ITEM_STYLES: Record<string, string> = {
  needs_review: 'bg-yellow-800 text-yellow-200',
  blocked: 'bg-red-800 text-red-200',
  pending_approval: 'bg-orange-800 text-orange-200',
}

const OPEN_ITEM_LABELS: Record<string, string> = {
  needs_review: '검토필요',
  blocked: '차단됨',
  pending_approval: '승인대기',
}

const AGENT_COLORS: Record<string, string> = {
  CEO: 'bg-indigo-800 text-indigo-200',
  CTO: 'bg-cyan-800 text-cyan-200',
  CMO: 'bg-pink-800 text-pink-200',
  CFO: 'bg-emerald-800 text-emerald-200',
  COO: 'bg-violet-800 text-violet-200',
  CPO: 'bg-amber-800 text-amber-200',
}

function AgentBadge({ agent }: { agent: string }) {
  const style = AGENT_COLORS[agent] ?? 'bg-slate-700 text-slate-300'
  return <span className={`text-xs rounded px-2 py-0.5 font-medium ${style}`}>{agent}</span>
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-base font-semibold text-slate-200 mb-3 border-b border-slate-700 pb-2">
      {title}
    </h2>
  )
}

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
    return <div className="text-slate-400">로딩 중...</div>
  }

  if (!business && !timeline) {
    return <div className="text-slate-500">프로젝트를 찾을 수 없습니다.</div>
  }

  const agentTasks = timeline?.agentTasks ?? []
  const handoffs = timeline?.handoffs ?? []
  const openItems = timeline?.openItems ?? []
  const decisions = timeline?.decisions ?? []

  // Merge agent tasks + handoffs into a unified activity feed, sorted by time
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
    <div className="space-y-8 max-w-4xl">
      {/* 1. Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">{business?.name ?? id}</h1>
          {business?.lifecycle_stage && (
            <span className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">
              {business.lifecycle_stage}
            </span>
          )}
          {business?.current_phase && (
            <span className="text-xs bg-indigo-800 text-indigo-200 rounded px-2 py-0.5">
              {business.current_phase}
            </span>
          )}
        </div>
        {business?.one_liner && (
          <p className="text-slate-400 text-sm">{business.one_liner}</p>
        )}
      </div>

      {/* 2. Current Status (STATUS.md) */}
      <section>
        <SectionHeader title="현재 상태 (STATUS.md)" />
        {statusMd ? (
          <pre className="text-xs text-slate-300 bg-slate-800 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {statusMd}
          </pre>
        ) : (
          <div className="text-slate-500 text-sm">STATUS.md 없음</div>
        )}
      </section>

      {/* 3. CTO Plan timeline — derived from agentTasks grouped by phase */}
      <section>
        <SectionHeader title="CTO Plan timeline" />
        {agentTasks.length === 0 ? (
          <div className="text-slate-500 text-sm">플랜 데이터 없음</div>
        ) : (
          <div className="space-y-2">
            {/* Group by phase */}
            {(() => {
              const phases = Array.from(new Set(agentTasks.map(t => t.phase ?? '(미분류)'))).slice(0, 10)
              return phases.map(phase => {
                const phaseTasks = agentTasks.filter(t => (t.phase ?? '(미분류)') === phase)
                const allDone = phaseTasks.every(t => t.status === 'done')
                const anyBlocked = phaseTasks.some(t => t.status === 'blocked')
                const phaseColor = allDone
                  ? 'bg-green-900 border-green-700'
                  : anyBlocked
                    ? 'bg-red-900 border-red-700'
                    : 'bg-slate-800 border-slate-700'
                return (
                  <div key={phase} className={`rounded-xl border p-3 ${phaseColor}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{phase}</span>
                      <span className="text-xs text-slate-400">{phaseTasks.length}개 태스크</span>
                      {allDone && <span className="text-xs text-green-400">완료</span>}
                      {anyBlocked && <span className="text-xs text-red-400">차단됨</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {phaseTasks.map(t => (
                        <span
                          key={t.task_id}
                          className={`text-xs rounded px-2 py-0.5 ${STATUS_STYLES[t.status] ?? 'bg-slate-700 text-slate-300'}`}
                          title={t.title}
                        >
                          {t.title.length > 30 ? t.title.slice(0, 30) + '…' : t.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </section>

      {/* 4. Agent activity feed */}
      <section>
        <SectionHeader title="Agent activity" />
        {feed.length === 0 ? (
          <div className="text-slate-500 text-sm">활동 없음</div>
        ) : (
          <div className="space-y-1.5">
            {feed.map((entry, i) => (
              <div key={i} className="bg-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 shrink-0 w-20">{relativeTime(entry.when)}</span>
                {entry.kind === 'task' ? (
                  <>
                    <AgentBadge agent={entry.agent} />
                    <span className="flex-1 text-slate-200">{entry.title}</span>
                    {entry.risk_level && (
                      <span className={`rounded px-1.5 py-0.5 ${RISK_STYLES[entry.risk_level] ?? 'bg-slate-700 text-slate-300'}`}>
                        {entry.risk_level}
                      </span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[entry.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {entry.status}
                    </span>
                  </>
                ) : (
                  <>
                    <AgentBadge agent={entry.from_agent} />
                    <span className="text-slate-400">→</span>
                    <AgentBadge agent={entry.to_agent} />
                    <span className="flex-1 text-slate-400 italic">{entry.note ?? 'handoff'}</span>
                    <span className="text-slate-600">task: {entry.task_id.slice(0, 8)}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Decision log */}
      <section>
        <SectionHeader title="Decision log" />
        {decisions.length === 0 ? (
          <div className="text-slate-500 text-sm">기록 없음</div>
        ) : (
          <div className="space-y-1.5">
            {decisions.map((d: DecisionRecord) => (
              <div key={d.task_id} className="bg-slate-800 rounded-lg px-3 py-2 text-xs flex items-center gap-3">
                <span className="text-slate-500 shrink-0">{relativeTime(d.at)}</span>
                <span className="text-slate-400 font-mono shrink-0">{d.task_id.slice(0, 8)}</span>
                <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[d.verdict] ?? 'bg-slate-700 text-slate-300'}`}>
                  {d.verdict}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Open items */}
      <section>
        <SectionHeader title="Open items" />
        {openItems.length === 0 ? (
          <div className="text-slate-500 text-sm">없음</div>
        ) : (
          <div className="space-y-1.5">
            {openItems.map((item: OpenItem) => (
              <div key={item.task_id} className="bg-slate-800 rounded-lg px-3 py-2 text-xs flex items-center gap-3">
                <span className={`rounded px-2 py-0.5 ${OPEN_ITEM_STYLES[item.kind] ?? 'bg-slate-700 text-slate-300'}`}>
                  {OPEN_ITEM_LABELS[item.kind] ?? item.kind}
                </span>
                <span className="text-slate-400 font-mono">{item.task_id.slice(0, 8)}</span>
                {item.note && <span className="text-slate-400">{item.note}</span>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
