'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useBusiness } from '@/lib/business-context'
import { api } from '@/lib/api'

const PHASE_SHORT: Record<string, string> = {
  direction_alignment: '방향정렬',
  pmf_diagnosis: 'PMF진단',
  execution_build: '실행빌드',
  sales_distribution_test: '세일즈',
  productization_review: '제품화',
  scale_automation: '스케일',
}

const ICONS: Record<string, string> = {
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  factory: 'M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z M17 18h.01 M12 18h.01 M7 18h.01',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5 M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  building: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-3',
  plus: 'M12 5v14 M5 12h14',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  dot: 'M12 13a1 1 0 100-2 1 1 0 000 2z',
}

function Icon({ name, size = 16, stroke = 1.6, color = 'currentColor' }: { name: string; size?: number; stroke?: number; color?: string }) {
  const d = ICONS[name]
  if (!d) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(/(?=M)/).map((seg, i) => <path key={i} d={seg.trim()} />)}
    </svg>
  )
}

const NAV_TOOLS = [
  { href: '/monitor', label: '현황 모니터', icon: 'activity' },
  { href: '/workflow', label: '워크플로 팩토리', icon: 'factory' },
  { href: '/memory', label: 'Memory Review', icon: 'database' },
  { href: '/control-room', label: 'Control Room', icon: 'sliders' },
  { href: '/tool-requests', label: 'Tool Requests', icon: 'wrench' },
]

function navItemStyle(active: boolean, hover: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '8px 10px',
    borderRadius: 5,
    fontSize: 13.5,
    cursor: 'pointer',
    position: 'relative',
    userSelect: 'none',
    transition: 'background 120ms',
    color: active ? 'var(--green-press)' : 'var(--ink-2)',
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--green-tint)' : hover ? 'var(--silver-1)' : 'transparent',
    textDecoration: 'none',
  }
}

function ActiveBar({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span
      style={{
        position: 'absolute',
        left: -12,
        top: 8,
        bottom: 8,
        width: 2,
        background: 'var(--green)',
        borderRadius: 2,
      }}
    />
  )
}

function Overline({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--ink-3)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '4px 10px 7px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function NavLink({ href, label, icon, active, onNavigate }: { href: string; label: string; icon: string; active: boolean; onNavigate?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      href={href}
      style={navItemStyle(active, hover)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onNavigate}
    >
      <ActiveBar show={active} />
      <Icon name={icon} size={17} stroke={1.6} />
      <span style={{ flex: 1 }}>{label}</span>
    </Link>
  )
}

function IconButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  const [h, setH] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: h ? 'var(--silver-1)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--ink-3)',
        padding: '4px 6px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        transition: 'background 120ms',
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      {children}
    </button>
  )
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()
  const { token, signOut } = useAuth()
  const {
    businesses,
    selectedId,
    setSelectedId,
    loadingBusinesses,
    reload,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    reloadProjects,
  } = useBusiness()

  const [showBizModal, setShowBizModal] = useState(false)
  const [bizTitle, setBizTitle] = useState('')
  const [bizOneLiner, setBizOneLiner] = useState('')

  const [showProjModal, setShowProjModal] = useState(false)
  const [projTitle, setProjTitle] = useState('')
  const [projDesc, setProjDesc] = useState('')

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bizTitle.trim()) return
    try {
      const newBiz = await api.createBusiness(bizTitle, bizOneLiner)
      setShowBizModal(false)
      setBizTitle('')
      setBizOneLiner('')
      reload()
      setSelectedId(newBiz.id)
    } catch {
      alert('사업 생성에 실패했습니다.')
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !projTitle.trim()) return
    try {
      const newProj = await api.createProject(selectedId, projTitle, projDesc)
      setShowProjModal(false)
      setProjTitle('')
      setProjDesc('')
      await reloadProjects(selectedId, newProj.id)
    } catch {
      alert('프로젝트 생성에 실패했습니다.')
    }
  }

  const isChatActive = pathname === '/chat' || pathname === '/'

  return (
    <aside
      style={{
        width: 232,
        flexShrink: 0,
        borderRight: '1px solid var(--silver-2)',
        background: 'var(--paper-surface)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        height: '100%',
        minHeight: '100dvh',
        boxSizing: 'border-box',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 6px 4px' }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: 'var(--green)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            fontFamily: 'var(--font-serif)',
          }}
        >
          L
        </span>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.01em' }}>비즈니스 OS</span>
      </div>

      {/* 활성 사업 */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 7px' }}>
          <Overline style={{ padding: 0 }}>활성 사업</Overline>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton onClick={() => setShowBizModal(true)} title="새 사업 생성">
              <Icon name="plus" size={11} stroke={2} color="var(--green-press)" />
              <span style={{ color: 'var(--green-press)' }}>추가</span>
            </IconButton>
            <IconButton onClick={reload} title="새로고침">
              <Icon name="refresh" size={12} stroke={1.8} />
            </IconButton>
          </div>
        </div>

        {loadingBusinesses && (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-4)' }}>로딩 중…</div>
        )}

        {!loadingBusinesses && businesses.length === 0 && (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>아직 사업이 없습니다</div>
        )}

        {!loadingBusinesses && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {businesses.map(b => {
              const isSelected = selectedId === b.id
              return <BusinessRow
                key={b.id}
                business={b}
                isSelected={isSelected}
                onSelect={() => setSelectedId(b.id)}
                projects={isSelected ? projects : []}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onAddProject={() => setShowProjModal(true)}
              />
            })}
          </div>
        )}
      </section>

      {/* 회사 공통 */}
      <section>
        <Overline>공통</Overline>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            ...navItemStyle(selectedId === null, false),
            border: 'none',
            width: '100%',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <ActiveBar show={selectedId === null} />
          <Icon name="building" size={17} stroke={1.6} />
          <span style={{ flex: 1 }}>회사 공통</span>
        </button>
      </section>

      {/* 메인 */}
      <section style={{ borderTop: '1px solid var(--silver-2)', paddingTop: 10 }}>
        <Overline>메인</Overline>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavLink href="/chat" label="CEO 채팅" icon="message" active={isChatActive} onNavigate={onNavigate} />
          <NavLink href="/approval" label="승인 대기" icon="check" active={pathname === '/approval'} onNavigate={onNavigate} />
          <NavLink href="/projects" label="프로젝트" icon="folder" active={pathname.startsWith('/projects')} onNavigate={onNavigate} />
        </nav>
      </section>

      {/* 도구 */}
      <section style={{ flex: 1 }}>
        <Overline>도구</Overline>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_TOOLS.map(t => <NavLink key={t.href} {...t} active={pathname === t.href} onNavigate={onNavigate} />)}
        </nav>
      </section>

      {/* Footer / signout */}
      {token && (
        <div style={{ borderTop: '1px solid var(--silver-2)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={signOut}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-3)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              borderRadius: 4,
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-3)' }}
          >
            <Icon name="logout" size={14} stroke={1.6} />
            로그아웃
          </button>
        </div>
      )}

      {/* 사업 생성 모달 */}
      {showBizModal && (
        <Modal title="새로운 사업 생성" onClose={() => setShowBizModal(false)}>
          <form onSubmit={handleCreateBusiness} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="사업명">
              <input
                type="text"
                required
                value={bizTitle}
                onChange={e => setBizTitle(e.target.value)}
                placeholder="예: 마케팅 자동화 솔루션"
                className="j-input"
              />
            </Field>
            <Field label="한 줄 설명">
              <input
                type="text"
                value={bizOneLiner}
                onChange={e => setBizOneLiner(e.target.value)}
                placeholder="예: AI 기반 콘텐츠 기획 대행"
                className="j-input"
              />
            </Field>
            <ModalActions onCancel={() => setShowBizModal(false)} submitLabel="생성" />
          </form>
        </Modal>
      )}

      {/* 프로젝트 생성 모달 */}
      {showProjModal && (
        <Modal title="새 프로젝트" onClose={() => setShowProjModal(false)}>
          <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="프로젝트명">
              <input
                type="text"
                required
                value={projTitle}
                onChange={e => setProjTitle(e.target.value)}
                placeholder="예: 마케팅 USP 추출 분석"
                className="j-input"
              />
            </Field>
            <Field label="설명">
              <textarea
                value={projDesc}
                onChange={e => setProjDesc(e.target.value)}
                placeholder="프로젝트 상세 설명…"
                className="j-input j-textarea"
                rows={4}
              />
            </Field>
            <ModalActions onCancel={() => setShowProjModal(false)} submitLabel="생성" />
          </form>
        </Modal>
      )}
    </aside>
  )
}

function BusinessRow({
  business,
  isSelected,
  onSelect,
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
}: {
  business: any
  isSelected: boolean
  onSelect: () => void
  projects: any[]
  selectedProjectId: string | null
  onSelectProject: (id: string) => void
  onAddProject: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          padding: '8px 10px',
          borderRadius: 5,
          border: 'none',
          background: isSelected ? 'var(--green-tint)' : hover ? 'var(--silver-1)' : 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 120ms',
          position: 'relative',
        }}
      >
        <ActiveBar show={isSelected} />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: isSelected ? 600 : 500,
            color: isSelected ? 'var(--green-press)' : 'var(--ink-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {business.name || business.one_liner || `사업 ${business.id}`}
        </span>
        {business.current_phase && (
          <span style={{ fontSize: 10.5, color: isSelected ? 'var(--green-press)' : 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
            {PHASE_SHORT[business.current_phase] ?? business.current_phase}
          </span>
        )}
      </button>

      {isSelected && (
        <div style={{ paddingLeft: 12, marginTop: 4, marginLeft: 10, borderLeft: '1px solid var(--silver-2)', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px' }}>
            <span style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>프로젝트</span>
            <IconButton onClick={onAddProject} title="새 프로젝트">
              <Icon name="plus" size={10} stroke={2} color="var(--green-press)" />
              <span style={{ color: 'var(--green-press)' }}>추가</span>
            </IconButton>
          </div>
          {projects.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--ink-4)', padding: '2px 6px', fontStyle: 'italic' }}>없음</span>
          )}
          {projects.map(p => {
            const isProjSelected = selectedProjectId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProject(p.id)}
                title={p.name}
                style={{
                  textAlign: 'left',
                  padding: '5px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  border: 'none',
                  background: isProjSelected ? 'var(--paper-elevated)' : 'transparent',
                  color: isProjSelected ? 'var(--ink-1)' : 'var(--ink-2)',
                  fontWeight: isProjSelected ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  borderLeft: isProjSelected ? '2px solid var(--green)' : '2px solid transparent',
                  paddingLeft: 6,
                }}
                onMouseEnter={e => { if (!isProjSelected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--silver-1)' }}
                onMouseLeave={e => { if (!isProjSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,22,18,0.32)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          borderRadius: 10,
          padding: 20,
          width: '100%',
          maxWidth: 440,
          boxShadow: 'var(--shadow-3)',
        }}
      >
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22, color: 'var(--ink-1)', margin: '0 0 16px 0', letterSpacing: '-0.01em' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-3)', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </label>
  )
}

function ModalActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
      <button type="button" onClick={onCancel} className="j-btn j-btn-ghost">취소</button>
      <button type="submit" className="j-btn j-btn-primary">{submitLabel}</button>
    </div>
  )
}
