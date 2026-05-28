'use client'
import { useAuth } from '@/lib/auth-context'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-gray-400 text-sm animate-pulse">연결 중...</div>
    </div>
  )
  return <>{children}</>
}
