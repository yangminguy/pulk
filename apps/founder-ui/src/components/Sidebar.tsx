'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const NAV = [
  { href: '/chat', label: 'CEO 채팅', icon: '💬' },
  { href: '/monitor', label: '현황 모니터', icon: '📊' },
  { href: '/approval', label: '승인 대기', icon: '✅' },
  { href: '/workflow', label: '워크플로 팩토리', icon: '🏭' },
  { href: '/memory', label: 'Memory Review', icon: '🧠' },
  { href: '/control-room', label: 'Control Room', icon: '🎛' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { token, signOut } = useAuth()

  return (
    <aside className="w-52 bg-slate-800 flex flex-col py-6 px-3 min-h-screen">
      <div className="text-lg font-bold text-white mb-8 px-2">L5 OS</div>
      <nav className="flex-1 space-y-1">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
              pathname === href
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
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
