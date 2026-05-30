'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, TaskItem } from '@/lib/api'

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

// ── Main content ──────────────────────────────────────────────────────────────
function ControlRoomContent() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      setError(null)
      const all = await api.currentTasks()
      const ctoTasks = all.filter(t => t.agent === 'CTO')
      setTasks(ctoTasks)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '로드 실패')
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
            Control Room
          </h1>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
            30초 자동 새로고침
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

      {/* Hairline */}
      <div style={{ height: 1, background: 'var(--silver-2)' }} />

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
      {!loading && !error && tasks.length === 0 && (
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
          CTO에게 할당된 활성 태스크가 없습니다
        </div>
      )}

      {/* Task cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => {
          const riskStyle = task.risk_level ? (RISK_STYLES[task.risk_level] ?? null) : null

          return (
            <div
              key={task.task_id}
              className="j-card"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {/* Badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* Agent chip */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--green-press)',
                    background: 'var(--green-tint)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  CTO
                </span>

                <StatusBadge status={task.status} />

                {task.risk_level && riskStyle && (
                  <span
                    className={`j-risk-${task.risk_level.toLowerCase()}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11.5,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      background: riskStyle.bg,
                      color: riskStyle.fg,
                    }}
                  >
                    {task.risk_level}
                  </span>
                )}

                {task.approval_required && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11.5,
                      fontWeight: 500,
                      background: 'var(--amber-tint)',
                      color: '#8A5408',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    승인필요
                  </span>
                )}
              </div>

              {/* Title */}
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--ink-1)',
                  lineHeight: 1.4,
                }}
              >
                {task.task_title}
              </div>

              {/* Blocker */}
              {task.blocker && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    background: 'var(--red-tint)',
                    border: '1px solid var(--red)',
                    borderRadius: 5,
                    padding: '7px 10px',
                    fontSize: 12.5,
                    color: 'var(--red)',
                    lineHeight: 1.4,
                  }}
                >
                  <IconAlertTriangle size={13} />
                  <span>현재 단계: {task.blocker}</span>
                </div>
              )}

              {/* Rationale */}
              {task.rationale && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--ink-3)',
                    lineHeight: 1.55,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {task.rationale}
                </p>
              )}

              {/* Timestamp */}
              {task.updated_at && (
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--ink-4)',
                  }}
                >
                  {relativeTime(task.updated_at)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ControlRoomPage() {
  return <AuthGate><ControlRoomContent /></AuthGate>
}
