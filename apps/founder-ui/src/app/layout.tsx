import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = { title: 'L5 Business OS' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-900 text-slate-100 min-h-screen flex">
        <AuthProvider>
          <Sidebar />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
