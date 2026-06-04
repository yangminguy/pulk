'use client'
import { useState, useEffect, type ReactNode } from 'react'

type ThreeColumnLayoutProps = {
  left: ReactNode
  center: ReactNode
  right: ReactNode
  leftWidth?: number
  rightWidth?: number
}

type Tab = 'list' | 'preview' | 'settings'

const TAB_LABELS: Record<Tab, string> = {
  list: '목록',
  preview: '미리보기',
  settings: '설정',
}

export default function ThreeColumnLayout({
  left,
  center,
  right,
  leftWidth = 240,
  rightWidth = 320,
}: ThreeColumnLayoutProps) {
  const [mobile, setMobile] = useState(false)
  const [tab, setTab] = useState<Tab>('list')

  useEffect(() => {
    function onResize() {
      setMobile(window.innerWidth <= 768)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (mobile) {
    const content = tab === 'list' ? left : tab === 'preview' ? center : right
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--silver-2)',
            background: 'var(--bg)',
          }}
        >
          {(['list', 'preview', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent',
                background: 'transparent',
                color: tab === t ? 'var(--ink-1)' : 'var(--ink-3)',
                fontWeight: tab === t ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px`,
        height: 'calc(100vh - 80px)',
        gap: 0,
      }}
    >
      <div
        style={{
          overflowY: 'auto',
          borderRight: '1px solid var(--silver-2)',
          padding: 16,
        }}
      >
        {left}
      </div>
      <div
        style={{
          overflowY: 'auto',
          borderRight: '1px solid var(--silver-2)',
          padding: 16,
        }}
      >
        {center}
      </div>
      <div
        style={{
          overflowY: 'auto',
          padding: 16,
        }}
      >
        {right}
      </div>
    </div>
  )
}
