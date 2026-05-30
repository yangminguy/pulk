'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, ToolRequestItem } from '@/lib/api'

type FilterStatus = 'all' | 'needs_review' | 'done' | 'killed' | 'queued'

// ── Joinery badge tones ───────────────────────────────────────────────────────
type BadgeTone = 'live' | 'review' | 'blocked' | 'draft' | 'neutral'

const STATUS_TONE: Record<string, BadgeTone> = {
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

const BADGE_TONE_STYLES: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
  live:    { bg: 'var(--green-tint)',  fg: 'var(--green-press)', dot: 'var(--green)' },
  review:  { bg: 'var(--amber-tint)', fg: '#8A5408',            dot: 'var(--amber)' },
  blocked: { bg: 'var(--red-tint)',   fg: '#8C2A1F',            dot: 'var(--red)'   },
  draft:   { bg: 'var(--silver-1)',   fg: 'var(--ink-2)',       dot: 'var(--silver-4)' },
  neutral: { bg: 'var(--silver-1)',   fg: 'var(--ink-3)',       dot: 'var(--silver-3)' },
}

const PRIORITY_STYLES: Record<'high' | 'medium' | 'low', { bg: string; fg: string; label: string }> = {
  high:   { bg: 'var(--red-tint)',   fg: 'var(--red)',    label: '높음' },
  medium: { bg: 'var(--amber-tint)', fg: '#8A5408',       label: '보통' },
  low:    { bg: 'var(--silver-1)',   fg: 'var(--ink-3)',  label: '낮음' },
}

const RISK_STYLES: Record<string, { bg: string; fg: string }> = {
  D1: { bg: 'var(--green-tint)',  fg: 'var(--green-press)' },
  D2: { bg: 'var(--p-butter)',    fg: 'var(--pi-butter)'   },
  D3: { bg: 'var(--amber-tint)', fg: '#8A5408'              },
  D4: { bg: 'var(--p-peach)',     fg: 'var(--pi-peach)'    },
  D5: { bg: 'var(--red-tint)',   fg: 'var(--red)'           },
}

// ── Parsing helpers (preserve existing logic) ─────────────────────────────────
function parseOccurrences(rationale: string): number | null {
  const m = rationale.match(/repeated (\d+) times/)
  return m ? parseInt(m[1]!, 10) : null
}

function parseAgents(rationale: string): string[] {
  const m = rationale.match(/across agents?: ([^\\.]+)/)
  if (!m) return []
  return m[1]!.split(',').map(s => s.trim()).filter(Boolean)
}

function parsePatternName(title: string): string {
  return title.startsWith('Tool Request: ') ? title.slice('Tool Request: '.length) : title
}

function derivePriority(occurrences: number | null): 'high' | 'medium' | 'low' {
  if (occurrences === null) return 'low'
  if (occurrences >= 10) return 'high'
  if (occurrences >= 5) return 'medium'
  return 'low'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconRefresh({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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

// ── Filter tab component ──────────────────────────────────────────────────────
const TABS: { key: FilterStatus; label: string }[] = [
  { key: 'all',          label: '전체'    },
  { key: 'needs_review', label: '검토필요' },
  { key: 'queued',       label: '대기'    },
  { key: 'done',         label: '완료'    },
  { key: 'killed',       label: '종료'    },
]

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  const { bg, fg, dot } = BADGE_TONE_STYLES[tone]
  const label = STATUS_LABELS[status] ?? status
  const pulsing = status === 'running' || status === 'needs_review'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
        background: bg, color: fg, whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: 999, background: dot,
        animation: pulsing ? 'j-pulse 1.8s ease-in-out infinite' : undefined,
      }} />
      {label}
    </span>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────
function ToolRequestsContent() {
  const [items, setItems] = useState<ToolRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.listToolRequests()
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    if (!autoRefresh) return
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load, autoRefresh])

  const filtered = items.filter(item => {
    if (filter === 'all') return true
    return item.status === filter
  })

  const counts = TABS.reduce<Record<string, number>>((acc, tab) => {
    acc[tab.key] = tab.key === 'all'
      ? items.length
      : items.filter(i => i.status === tab.key).length
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
            letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px',
          }}>
            자동화 큐
          </p>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22,
            color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.01em',
          }}>
            Tool Requests
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            반복 작업 자동화 요청 추적
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, color: 'var(--ink-3)', cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--green)', cursor: 'pointer' }}
            />
            30초 자동 새로고침
          </label>
          <button onClick={load} className="j-btn j-btn-secondary j-btn-sm" aria-label="새로고침">
            <IconRefresh />
            새로고침
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--silver-2)',
          gap: 0,
        }}
      >
        {TABS.map(tab => {
          const isActive = filter === tab.key
          const count = counts[tab.key] ?? 0
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 16px',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--ink-1)' : 'var(--ink-3)',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--green)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                transition: 'color 120ms, border-color 120ms',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.color = 'var(--ink-2)'
                  el.style.background = 'var(--silver-1)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.color = 'var(--ink-3)'
                  el.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
                  color: isActive ? 'var(--green-press)' : 'var(--ink-4)',
                  background: isActive ? 'var(--green-tint)' : 'var(--silver-1)',
                  padding: '1px 7px', borderRadius: 999,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>로딩 중...</p>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          color: 'var(--ink-4)', fontSize: 13.5,
          background: 'var(--paper-surface)',
          border: '1px solid var(--silver-2)', borderRadius: 8,
        }}>
          {filter === 'all'
            ? 'Tool Request가 없습니다. Hermes 반복 분석기가 2시간마다 실행됩니다.'
            : '해당 상태의 항목이 없습니다.'}
        </div>
      )}

      {/* Item cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(item => {
          const patternName = parsePatternName(item.task_title)
          const occurrences = parseOccurrences(item.rationale)
          const agents = parseAgents(item.rationale)
          const priority = derivePriority(occurrences)
          const priorityStyle = PRIORITY_STYLES[priority]
          const riskStyle = item.risk_level ? (RISK_STYLES[item.risk_level] ?? null) : null

          return (
            <div
              key={item.task_id}
              className="j-card"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {/* Badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* Agent chip */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--green-press)', background: 'var(--green-tint)',
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  CTO
                </span>

                <StatusBadge status={item.status} />

                {/* Priority */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
                  borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                  background: priorityStyle.bg, color: priorityStyle.fg,
                  fontFamily: 'var(--font-sans)',
                }}>
                  {priorityStyle.label} 우선순위
                </span>

                {/* Risk */}
                {item.risk_level && riskStyle && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', borderRadius: 4,
                    fontSize: 11.5, fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    background: riskStyle.bg, color: riskStyle.fg,
                  }}>
                    {item.risk_level}
                  </span>
                )}

                {item.approval_required && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', borderRadius: 4,
                    fontSize: 11.5, fontWeight: 500,
                    background: 'var(--amber-tint)', color: '#8A5408',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    승인필요
                  </span>
                )}
              </div>

              {/* Pattern name */}
              <div style={{
                fontFamily: 'var(--font-sans)', fontWeight: 600,
                fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.4,
              }}>
                {patternName}
              </div>

              {/* Pattern summary */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {occurrences !== null && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    반복 횟수:{' '}
                    <span style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {occurrences}회
                    </span>
                  </span>
                )}
                {agents.length > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    관련 에이전트:{' '}
                    <span style={{ color: 'var(--ink-1)' }}>{agents.join(', ')}</span>
                  </span>
                )}
                {item.phase && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    Phase:{' '}
                    <span style={{ color: 'var(--ink-2)' }}>{item.phase}</span>
                  </span>
                )}
              </div>

              {/* Rationale */}
              <p style={{
                margin: 0, fontSize: 12.5, color: 'var(--ink-3)',
                lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {item.rationale}
              </p>

              {/* Blocker */}
              {item.blocker && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 6,
                  background: 'var(--red-tint)', border: '1px solid var(--red)',
                  borderRadius: 5, padding: '7px 10px',
                  fontSize: 12.5, color: 'var(--red)', lineHeight: 1.4,
                }}>
                  <IconAlertTriangle size={13} />
                  <span>차단: {item.blocker}</span>
                </div>
              )}

              {/* Timestamp */}
              <p style={{
                margin: 0, fontFamily: 'var(--font-mono)',
                fontSize: 11, color: 'var(--ink-4)',
              }}>
                {relativeTime(item.updated_at)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ToolRequestsPage() {
  return <AuthGate><ToolRequestsContent /></AuthGate>
}
