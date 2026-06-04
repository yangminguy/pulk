'use client'
import { BusinessContextSnapshot, BusinessContextSnapshotTask } from '@/lib/api'
import { useBusinessContextSnapshot } from '@/lib/use-business-context-snapshot'

// ── Status tokens (mirrors control-room palette) ─────────────────────────────
type StatusTone = 'live' | 'review' | 'blocked' | 'draft' | 'neutral'

const STATUS_TONE: Record<string, StatusTone> = {
  queued:       'draft',
  running:      'live',
  blocked:      'blocked',
  needs_review: 'review',
  done:         'neutral',
  killed:       'neutral',
}

const STATUS_LABELS: Record<string, string> = {
  queued:       '대기',
  running:      '진행중',
  needs_review: '검토필요',
  done:         '완료',
  blocked:      '차단됨',
  killed:       '종료',
}

const TONE_STYLES: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  live:    { bg: 'var(--green-tint)',  fg: 'var(--green-press)', dot: 'var(--green)' },
  review:  { bg: 'var(--amber-tint)', fg: '#8A5408',            dot: 'var(--amber)' },
  blocked: { bg: 'var(--red-tint)',   fg: '#8C2A1F',            dot: 'var(--red)'   },
  draft:   { bg: 'var(--silver-1)',   fg: 'var(--ink-2)',       dot: 'var(--silver-4)' },
  neutral: { bg: 'var(--silver-1)',   fg: 'var(--ink-3)',       dot: 'var(--silver-3)' },
}

// Agent monogram colors — matches SynthesisCard / chat page palette
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

// ── Small primitives ──────────────────────────────────────────────────────────

function AgentMonogram({ agent }: { agent: string }) {
  const color = AGENT_COLOR[agent] ?? 'var(--ink-3)'
  const mono = agent.slice(0, 2).toUpperCase()
  return (
    <span
      aria-label={agent}
      style={{
        width: 20,
        height: 20,
        borderRadius: 4,
        background: color,
        color: '#fff',
        fontSize: 8.5,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {mono}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  const { bg, fg, dot } = TONE_STYLES[tone]
  const label = STATUS_LABELS[status] ?? status
  const pulsing = status === 'running' || status === 'needs_review'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: 10.5,
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
          width: 5,
          height: 5,
          borderRadius: 999,
          background: dot,
          flexShrink: 0,
          animation: pulsing ? 'j-pulse 1.8s ease-in-out infinite' : undefined,
        }}
      />
      {label}
    </span>
  )
}

// ── Stat counter badge ────────────────────────────────────────────────────────
function StatBadge({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: StatusTone
}) {
  const { bg, fg } = TONE_STYLES[tone]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 14px',
        borderRadius: 8,
        background: bg,
        gap: 2,
        minWidth: 52,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color: fg, lineHeight: 1.2, fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: fg, opacity: 0.85, fontFamily: 'var(--font-sans)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Task row ─────────────────────────────────────────────────────────────────
function TaskRow({ task }: { task: BusinessContextSnapshotTask }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid var(--silver-1)',
      }}
    >
      <AgentMonogram agent={task.agent} />
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          color: 'var(--ink-1)',
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={task.task_title}
      >
        {task.task_title}
      </span>
      <StatusPill status={task.status} />
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SnapshotSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="사업 컨텍스트 스냅샷 로딩중"
      style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 12,
        padding: 20,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {[100, 60, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w}%`,
            borderRadius: 6,
            background: 'var(--silver-1)',
            animation: 'j-pulse 1.8s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────
export interface BusinessContextSnapshotCardProps {
  /** The business ID to display the snapshot for. Pass null to show empty state. */
  businessId: string | null
  /** Optional CSS class for the outer wrapper */
  className?: string
  /** Called when the user clicks the manual reload button */
  onReloaded?: () => void
}

/**
 * BusinessContextSnapshotCard
 *
 * Displays a summary "PT context snapshot" for a single business — headline,
 * lifecycle stage, current phase, task-count breakdown, active tasks list and
 * recent completions.  Data is fetched by `useBusinessContextSnapshot`.
 *
 * Usage:
 *   <BusinessContextSnapshotCard businessId={selectedId} />
 */
export function BusinessContextSnapshotCard({
  businessId,
  className,
  onReloaded,
}: BusinessContextSnapshotCardProps) {
  const { snapshot, loading, error, reload } = useBusinessContextSnapshot(businessId)

  const handleReload = () => {
    reload()
    onReloaded?.()
  }

  if (!businessId) {
    return (
      <div
        style={{
          border: '1px solid var(--silver-2)',
          borderRadius: 12,
          padding: 20,
          background: 'var(--surface)',
          color: 'var(--ink-3)',
          fontSize: 13,
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
        }}
        className={className}
      >
        사업을 선택하면 컨텍스트 스냅샷이 표시됩니다
      </div>
    )
  }

  if (loading && !snapshot) return <SnapshotSkeleton />

  if (error && !snapshot) {
    return (
      <div
        style={{
          border: '1px solid var(--red-tint)',
          borderRadius: 12,
          padding: 20,
          background: 'var(--red-tint)',
          color: 'var(--red)',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
        className={className}
      >
        <span>스냅샷 로드 실패: {error}</span>
        <button
          id="biz-snapshot-reload-btn"
          onClick={handleReload}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--red)',
            background: 'transparent',
            color: 'var(--red)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
          }}
        >
          재시도
        </button>
      </div>
    )
  }

  if (!snapshot) return null

  const {
    business_name,
    one_liner,
    current_phase,
    lifecycle_stage,
    active_tasks,
    recent_done_tasks,
    total_tasks,
    queued_count,
    running_count,
    done_count,
    needs_review_count,
    loaded_at,
  } = snapshot

  return (
    <section
      id={`biz-snapshot-${snapshot.business_id}`}
      aria-label={`${business_name} 컨텍스트 스냅샷`}
      className={className}
      style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 12,
        padding: '16px 20px',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ink-1)',
              fontFamily: 'var(--font-sans)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {business_name}
          </h3>
          {one_liner && (
            <p
              style={{
                margin: '3px 0 0',
                fontSize: 12,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {one_liner}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {lifecycle_stage && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 600,
                background: 'var(--p-butter)',
                color: 'var(--pi-butter)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {lifecycle_stage}
            </span>
          )}
          {current_phase && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 600,
                background: 'var(--green-tint)',
                color: 'var(--green-press)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {current_phase}
            </span>
          )}
        </div>
      </div>

      {/* Stat counters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatBadge label="진행중" value={running_count} tone="live" />
        <StatBadge label="검토필요" value={needs_review_count} tone="review" />
        <StatBadge label="대기" value={queued_count} tone="draft" />
        <StatBadge label="완료" value={done_count} tone="neutral" />
        <StatBadge label="전체" value={total_tasks} tone="neutral" />
      </div>

      {/* Active tasks */}
      {active_tasks.length > 0 && (
        <div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            진행 중인 작업
          </p>
          <div>
            {active_tasks.map(t => (
              <TaskRow key={t.task_id} task={t} />
            ))}
          </div>
        </div>
      )}

      {/* Recent completions */}
      {recent_done_tasks.length > 0 && (
        <div>
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            최근 완료
          </p>
          <div>
            {recent_done_tasks.map(t => (
              <TaskRow key={t.task_id} task={t} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {active_tasks.length === 0 && recent_done_tasks.length === 0 && (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          등록된 작업이 없습니다
        </p>
      )}

      {/* Footer — reload + timestamp */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--silver-1)',
          paddingTop: 8,
          marginTop: 2,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {new Date(loaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준
          {loading && ' · 갱신중…'}
        </span>
        <button
          id={`biz-snapshot-reload-${snapshot.business_id}`}
          onClick={handleReload}
          disabled={loading}
          aria-label="스냅샷 새로고침"
          style={{
            padding: '3px 9px',
            borderRadius: 6,
            border: '1px solid var(--silver-3)',
            background: 'transparent',
            color: loading ? 'var(--ink-3)' : 'var(--ink-2)',
            cursor: loading ? 'default' : 'pointer',
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            transition: 'opacity 0.15s',
            opacity: loading ? 0.5 : 1,
          }}
        >
          새로고침
        </button>
      </div>
    </section>
  )
}
