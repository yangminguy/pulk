import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { BusinessProvider } from '@/lib/business-context'
import MobileShell from '@/components/MobileShell'
import NotificationBell from '@/components/NotificationBell'
import Bell from '@/components/Bell'

export const metadata: Metadata = { title: 'L5 Business OS — Founder Console' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body
        className="min-h-screen flex"
        style={{ background: 'var(--paper-canvas)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}
      >
        <AuthProvider>
          <BusinessProvider>
            <MobileShell />
            <NotificationBell />
            <Bell />
            <main className="flex-1 min-w-0 overflow-auto pt-12 lg:pt-0" style={{ background: 'var(--paper-canvas)' }}>
              {children}
            </main>
          </BusinessProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
