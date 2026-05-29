'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useBusiness } from '@/lib/business-context'

const PHASE_SHORT: Record<string, string> = {
  direction_alignment: '방향정렬',
  pmf_diagnosis: 'PMF진단',
  execution_build: '실행빌드',
  sales_distribution_test: '세일즈',
  productization_review: '제품화',
  scale_automation: '스케일',
}

const NAV_TOOLS = [
  { href: '/monitor', label: '현황 모니터', icon: '📊' },
  { href: '/workflow', label: '워크플로 팩토리', icon: '🏭' },
  { href: '/memory', label: 'Memory Review', icon: '🧠' },
  { href: '/control-room', label: 'Control Room', icon: '🎛' },
  { href: '/tool-requests', label: 'Tool Requests', icon: '🔧' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { token, signOut } = useAuth()
  const { businesses, selectedId, setSelectedId, loadingBusinesses, reload } = useBusiness()

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'
    }`

  // Navigating to /chat with a business selected — highlight chat link
  const isChatActive = pathname === '/chat' || pathname === '/'

  return (
    <aside className="w-52 bg-slate-800 flex flex-col py-6 px-3 min-h-screen shrink-0">
      <div className="text-lg font-bold text-white mb-6 px-2">L5 OS</div>

      {/* 사업 섹션 */}
      <div className="mb-4">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">활성 사업</span>
          <button
            onClick={reload}
            className="text-slate-600 hover:text-slate-400 text-xs"
            title="새로고침"
          >
            ↻
          </button>
        </div>

        {loadingBusinesses && (
          <div className="px-3 py-1 text-xs text-slate-600">로딩 중...</div>
        )}

        {!loadingBusinesses && businesses.map(b => {
          const isSelected = selectedId === b.id
          return (
            <button
              key={b.id}
              onClick={() => { setSelectedId(b.id) }}
              className={`w-full text-left flex flex-col gap-0.5 px-3 py-2 rounded text-sm transition-colors ${
                isSelected ? 'bg-indigo-700 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className="truncate font-medium">{b.name || b.one_liner || `사업 ${b.id}`}</span>
              {b.current_phase && (
                <span className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {PHASE_SHORT[b.current_phase] ?? b.current_phase}
                </span>
              )}
            </button>
          )
        })}

        {!loadingBusinesses && businesses.length === 0 && (
          <div className="px-3 py-1 text-xs text-slate-600">사업 없음</div>
        )}
      </div>

      {/* 회사 공통 섹션 */}
      <div className="mb-5">
        <div className="px-2 mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">공통</span>
        </div>
        <button
          onClick={() => setSelectedId(null)}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
            selectedId === null ? 'bg-indigo-700 text-white' : 'text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span>🌐</span>
          <span>회사 공통</span>
        </button>
      </div>

      <div className="border-t border-slate-700 pt-4 mb-2">
        <div className="px-2 mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">메인</span>
        </div>
        <Link
          href="/chat"
          className={navLinkClass(isChatActive)}
        >
          <span>💬</span>
          <span>CEO 채팅</span>
        </Link>
        <Link
          href="/approval"
          className={navLinkClass(pathname === '/approval')}
        >
          <span>✅</span>
          <span>승인 대기</span>
        </Link>
        <Link
          href="/projects"
          className={navLinkClass(pathname.startsWith('/projects'))}
        >
          <span>🗂️</span>
          <span>Projects</span>
        </Link>
      </div>

      {/* 도구 */}
      <nav className="flex-1 space-y-1">
        <div className="px-2 mb-1 mt-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">도구</span>
        </div>
        {NAV_TOOLS.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={navLinkClass(pathname === href)}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {token && (
        <button
          onClick={signOut}
          className="mt-4 text-xs text-slate-500 hover:text-slate-300 px-3"
        >
          로그아웃
        </button>
      )}
    </aside>
  )
}
