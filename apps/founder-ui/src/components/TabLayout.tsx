'use client'
import { useState } from 'react'

export type Tab = {
  id: string
  label: string
}

const DEFAULT_TABS: Tab[] = [
  { id: 'chat', label: '채팅' },
  { id: 'roadmap', label: '로드맵' },
  { id: 'inbox', label: '인박스' },
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
      <div
        role="tablist"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--silver-2)',
          marginBottom: 20,
          background: 'var(--paper-surface)',
        }}
      >
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.id)}
              style={{
                padding: '10px 18px',
                fontSize: 13.5,
                fontFamily: 'var(--font-sans)',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--ink-1)' : 'var(--ink-3)',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--green)'
                  : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                transition: 'color 120ms, border-color 120ms, background 120ms',
                whiteSpace: 'nowrap',
                borderRadius: '4px 4px 0 0',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = 'var(--silver-1)'
                  el.style.color = 'var(--ink-2)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = 'transparent'
                  el.style.color = 'var(--ink-3)'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div className="flex-1 min-h-0">
        {children(active)}
      </div>
    </div>
  )
}
