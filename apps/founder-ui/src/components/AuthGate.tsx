'use client'
import { useAuth } from '@/lib/auth-context'
import LoginForm from '@/components/LoginForm'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()

  if (!token) {
    return <LoginForm />
  }

  return <>{children}</>
}
