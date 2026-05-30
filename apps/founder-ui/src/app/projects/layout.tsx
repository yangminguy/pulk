'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthGate from '@/components/AuthGate'
import { api, ActiveBusiness } from '@/lib/api'

function stageColor(stage: string | null): string {
  if (!stage) return 'var(--silver-4)'
  const s = stage.toLowerCase()
  if (s === 'active' || s === 'running') return 'var(--green)'
  if (s === 'idea' || s === 'draft') return 'var(--amber)'
  if (s === 'deleted' || s === 'killed' || s === 'archived') return 'var(--red)'
  return 'var(--silver-4)'
}

function ProjectsSidebar({ businesses, loading }: { businesses: ActiveBusiness[]; loading: boolean }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 220,
      background: 'var(--paper-surface)',
      borderRight: '1px solid var(--silver-2)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 8px',
      minHeight: '100vh',
      flexShrink: 0,
    }}>
      <div className="j-overline" style={{ padding: '0 8px', marginBottom: 12 }}>Projects</div>
      {loading && (
        <div className="j-meta" style={{ padding: '0 8px' }}>로딩 중...</div>
      )}
      {!loading && businesses.length === 0 && (
        <div className="j-meta" style={{ padding: '0 8px' }}>활성 프로젝트 없음</div>
      )}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {businesses.map((b) => {
          const href = `/projects/${b.id}`
          const isActive = pathname === href
          return (
            <Link
              key={b.id}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                color: isActive ? 'var(--ink-1)' : 'var(--ink-2)',
                background: isActive ? 'var(--green-tint)' : 'transparent',
                textDecoration: 'none',
                transition: 'background var(--dur-1)',
                fontWeight: isActive ? 500 : 400,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--silver-1)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: stageColor(b.lifecycle_stage),
                flexShrink: 0,
              }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.name}
              </span>
            </Link>
          )
        })}
      </nav>
      <Link
        href="/projects"
        style={{
          marginTop: 8,
          padding: '6px 8px',
          borderRadius: 'var(--radius-md)',
          fontSize: 12,
          fontFamily: 'var(--font-sans)',
          color: pathname === '/projects' ? 'var(--green-press)' : 'var(--ink-3)',
          background: pathname === '/projects' ? 'var(--green-tint)' : 'transparent',
          textDecoration: 'none',
          transition: 'background var(--dur-1)',
        }}
      >
        + 전체 목록
      </Link>
    </aside>
  )
}

function ProjectsLayoutInner({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [loading, setLoading] = useState(true)

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
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div style={{ display: 'flex', flex: 1, margin: '-24px', minHeight: '100vh' }}>
      <ProjectsSidebar businesses={businesses} loading={loading} />
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>{children}</div>
    </div>
  )
}

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <ProjectsLayoutInner>{children}</ProjectsLayoutInner>
    </AuthGate>
  )
}
