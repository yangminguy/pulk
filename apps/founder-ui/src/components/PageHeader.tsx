'use client'

import type { ReactNode } from 'react'

interface PageHeaderProps {
  overline?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export default function PageHeader({ overline, title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {overline && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--ink-3)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              {overline}
            </div>
          )}
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 500,
            fontSize: 30,
            color: 'var(--ink-1)',
            margin: 0,
            letterSpacing: '-0.015em',
            lineHeight: 1.15,
          }}>
            {title}
          </h1>
          {subtitle && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
