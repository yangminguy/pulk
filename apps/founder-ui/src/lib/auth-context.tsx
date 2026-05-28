'use client'
import { createContext, useContext, useEffect, useState } from 'react'

interface AuthCtx {
  token: string | null
  setToken: (t: string | null) => void
  signOut: () => void
}

const AuthContext = createContext<AuthCtx>({ token: null, setToken: () => {}, signOut: () => {} })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('l5_token')
    if (t) {
      // 저장된 토큰 즉시 사용 (백그라운드에서 만료 체크)
      setTokenState(t)
      fetch('http://localhost:13000/api/auth:check', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => {
          if (!r.ok) {
            // 만료 → 재로그인
            localStorage.removeItem('l5_token')
            setTokenState(null)
            return fetch('http://localhost:13000/api/auth:signIn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
            }).then(r2 => r2.json()).then(d => {
              if (d?.data?.token) { setTokenState(d.data.token); localStorage.setItem('l5_token', d.data.token) }
            })
          }
        })
        .catch(() => {})
      return
    }
    // 토큰 없음 → 자동 로그인
    fetch('http://localhost:13000/api/auth:signIn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
    })
      .then(r => r.json())
      .then(d => { if (d?.data?.token) { setTokenState(d.data.token); localStorage.setItem('l5_token', d.data.token) } })
      .catch(() => {})
  }, [])

  const setToken = (t: string | null) => {
    setTokenState(t)
    if (t) localStorage.setItem('l5_token', t)
    else localStorage.removeItem('l5_token')
  }

  const signOut = () => setToken(null)

  return <AuthContext.Provider value={{ token, setToken, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
