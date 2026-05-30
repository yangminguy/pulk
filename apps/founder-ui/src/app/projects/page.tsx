'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { api, ActiveBusiness } from '@/lib/api'

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

const PHASES = ['방향 정렬', 'PMF 진단', '실행 빌드', '세일즈 테스트', '제품화', '스케일']

function stageIndicator(stage: string | null): { color: string; label: string } {
  if (!stage) return { color: 'var(--silver-4)', label: '알수없음' }
  const s = stage.toLowerCase()
  if (s === 'active' || s === 'running') return { color: 'var(--green)', label: '활성' }
  if (s === 'idea' || s === 'draft') return { color: 'var(--amber)', label: '아이디어' }
  if (s === 'deleted' || s === 'killed' || s === 'archived') return { color: 'var(--red)', label: '종료' }
  return { color: 'var(--silver-4)', label: stage }
}

function PhaseProgress({ currentPhase }: { currentPhase: string | null }) {
  const cur = currentPhase
    ? PHASES.findIndex(p => p === currentPhase || currentPhase.toLowerCase().includes(p.toLowerCase()))
    : -1

  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
      {PHASES.map((p, i) => (
        <div key={p} style={{ flex: 1 }} title={p}>
          <div style={{
            height: 4,
            borderRadius: 999,
            background: i < cur
              ? 'var(--green-tint-2)'
              : i === cur
              ? 'var(--green)'
              : 'var(--silver-1)',
            transition: 'background var(--dur-2)',
          }} />
        </div>
      ))}
    </div>
  )
}

function PhaseBadge({ phase }: { phase: string | null }) {
  if (!phase) return null
  return (
    <span className="j-badge j-badge-neutral" style={{ fontFamily: 'var(--font-sans)' }}>
      {phase}
    </span>
  )
}

export default function ProjectsPage() {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.listActiveBusinesses()
      setBusinesses(data)
    } catch {
      setBusinesses([])
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
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
        <h1 className="j-h2">프로젝트</h1>
        <span className="j-meta">활성 사업 포트폴리오</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--green)' }}
            />
            30초 자동 새로고침
          </label>
          <button
            onClick={load}
            className="j-btn j-btn-ghost j-btn-sm"
            aria-label="새로고침"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            새로고침
          </button>
        </div>
      </div>

      {loading && (
        <div className="j-meta" style={{ padding: '32px 0' }}>로딩 중...</div>
      )}

      {!loading && businesses.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '64px 0',
          color: 'var(--ink-3)',
          fontSize: 14,
          fontFamily: 'var(--font-sans)',
        }}>
          활성 프로젝트가 없습니다.
        </div>
      )}

      {/* Business card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 14,
      }}>
        {businesses.map((b) => {
          const { color: stageColor, label: stageLabel } = stageIndicator(b.lifecycle_stage)
          return (
            <Link
              key={b.id}
              href={`/projects/${b.id}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="j-card j-card-hover" style={{ padding: 20 }}>
                {/* Stage dot + name row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <span style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: stageColor,
                    flexShrink: 0,
                  }} title={stageLabel} />
                  <h2 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 22,
                    fontWeight: 500,
                    color: 'var(--ink-1)',
                    margin: 0,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                    flex: 1,
                  }}>
                    {b.name}
                  </h2>
                  <span className="j-meta" style={{ flexShrink: 0 }}>{relativeTime(b.updated_at)}</span>
                </div>

                {/* Phase badge */}
                {b.current_phase && (
                  <div style={{ marginBottom: 4 }}>
                    <PhaseBadge phase={b.current_phase} />
                  </div>
                )}

                {/* One-liner */}
                {b.one_liner && (
                  <p className="j-ui-sm" style={{ marginTop: 6, marginBottom: 0 }}>
                    {b.one_liner}
                  </p>
                )}

                {/* Phase progress bar */}
                <PhaseProgress currentPhase={b.current_phase} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
