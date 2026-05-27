'use client'
import { useAuth } from '@/lib/auth-context'
import LoginForm from './LoginForm'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <LoginForm />
  return <>{children}</>
}
