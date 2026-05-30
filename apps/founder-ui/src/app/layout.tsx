import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { BusinessProvider } from '@/lib/business-context'
import Sidebar from '@/components/Sidebar'

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
            <Sidebar />
            <main className="flex-1 overflow-auto" style={{ background: 'var(--paper-canvas)' }}>
              {children}
            </main>
          </BusinessProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
