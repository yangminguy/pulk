'use client'
import { useEffect, useState } from 'react'
import { api, RoadmapItem } from '@/lib/api'
import { useInboxNav, type InboxTaskRef } from '@/lib/inbox-nav'

function taskToRef(t: RoadmapItem): InboxTaskRef {
  // RoadmapItem is a lightweight roadmap row (id == agent_tasks id). The inbox
  // detail re-fetches the full task + handoffs by task_id for the rest.
  return {
    task_id: t.id,
    assigned_agent: t.agent ?? '—',
    title: t.title,
    status: t.status,
    rationale: t.objective ?? undefined,
  }
}

const ICONS: Record<string, string> = {
  check:    'M20 6L9 17l-5-5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  clock:    'M12 22a10 10 0 110-20 10 10 0 010 20z M12 6v6l4 2',
  dot:      'M12 13a1 1 0 100-2 1 1 0 000 2z',
}

function Icon({ name, size = 13, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {d.split(/(?=M)/).map((seg, i) => <path key={i} d={seg.trim()} />)}
    </svg>
  )
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  done:        { label: '완료',    bg: 'var(--green-tint)',  fg: 'var(--green-press)', icon: 'check' },
  in_progress: { label: '진행중',  bg: 'var(--blue-tint)',   fg: '#1F4A9E',            icon: 'activity' },
  blocked:     { label: '차단됨',  bg: 'var(--red-tint)',    fg: '#8C2A1F',            icon: 'dot' },
  pending:     { label: '대기',    bg: 'var(--silver-1)',    fg: 'var(--ink-3)',        icon: 'clock' },
}

interface RoadmapMiniCardProps {
  businessId: string | null
}

export default function RoadmapMiniCard({ businessId }: RoadmapMiniCardProps) {
  const { openInboxTask } = useInboxNav()
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getRoadmapItems(businessId).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [businessId])

  if (loading) {
    return (
      <div style={{
        background: 'var(--paper-surface)',
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '12px 14px',
      }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>로드맵 미리보기</div>
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '60%', marginBottom: 6 }} />
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '80%', marginBottom: 6 }} />
        <div style={{ height: 12, background: 'var(--silver-1)', borderRadius: 4, width: '45%' }} />
      </div>
    )
  }

  if (items.length === 0) return null

  const preview = items.slice(0, 4)

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span className="j-overline">로드맵 미리보기</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {items.length}건
        </span>
      </div>

      {/* rows */}
      <div>
        {preview.map((item, i) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openInboxTask(taskToRef(item))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 14px',
                borderBottom: i < preview.length - 1 ? '1px solid var(--silver-1)' : 'none',
              }}>
              {/* status badge */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 999,
                background: cfg.bg,
                color: cfg.fg,
                fontSize: 11,
                fontWeight: 500,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}>
                <Icon name={cfg.icon} size={11} />
                {cfg.label}
              </span>

              {/* assigned agent */}
              {item.agent && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                  background: 'var(--silver-1)',
                  color: 'var(--ink-2)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>
                  {item.agent}
                </span>
              )}

              {/* title */}
              <span style={{
                fontSize: 13,
                color: 'var(--ink-1)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.title}
              </span>

              {/* due date */}
              {item.due_date && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  flexShrink: 0,
                }}>
                  {item.due_date.slice(5, 10)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* overflow hint */}
      {items.length > 4 && (
        <div style={{
          padding: '8px 14px',
          background: 'var(--paper-canvas)',
          borderTop: '1px solid var(--silver-1)',
          fontSize: 11.5,
          color: 'var(--ink-4)',
        }}>
          +{items.length - 4}건 — 로드맵 탭에서 전체 보기
        </div>
      )}
    </div>
  )
}
