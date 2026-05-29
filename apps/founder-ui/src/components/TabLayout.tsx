'use client'
import { useState } from 'react'

export type Tab = {
  id: string
  label: string
}

const DEFAULT_TABS: Tab[] = [
  { id: 'chat', label: '💬 채팅' },
  { id: 'roadmap', label: '📍 로드맵' },
  { id: 'inbox', label: '📥 인박스' },
]

interface TabLayoutProps {
  tabs?: Tab[]
  defaultTab?: string
  children: (activeTab: string) => React.ReactNode
}

export default function TabLayout({ tabs = DEFAULT_TABS, defaultTab, children }: TabLayoutProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id ?? '')

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 border-b border-slate-700 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              active === tab.id
                ? 'text-white border-b-2 border-indigo-500 -mb-px'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {children(active)}
      </div>
    </div>
  )
}
