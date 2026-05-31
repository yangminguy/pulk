'use client'
import { createContext, useContext, useEffect, useState } from 'react'

interface AuthCtx {
  token: string | null
  setToken: (t: string | null) => void
  signOut: () => void
}

const AuthContext = createContext<AuthCtx>({ token: null, setToken: () => {}, signOut: () => {} })

const ENV_TOKEN = process.env.NEXT_PUBLIC_NOCOBASE_TOKEN ?? ''
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13000'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(ENV_TOKEN || null)

  useEffect(() => {
    // 1순위: 빌드 시점에 주입된 영구 API key (Vercel env)
    if (ENV_TOKEN) {
      setTokenState(ENV_TOKEN)
      return
    }
    // 2순위: localStorage 캐시
    const t = localStorage.getItem('l5_token')
    if (t) {
      setTokenState(t)
      fetch(`${BASE}/api/auth:check`, { headers: { Authorization: `Bearer ${t}` } })
        .then(r => {
          if (!r.ok) {
            localStorage.removeItem('l5_token')
            setTokenState(null)
            return fetch(`${BASE}/api/auth:signIn`, {
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
    // 3순위: 자동 로그인 fallback (dev only)
    fetch(`${BASE}/api/auth:signIn`, {
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

  const signOut = () => {
    if (ENV_TOKEN) return  // env token이 주입된 환경에서는 로그아웃 disable
    setToken(null)
  }

  return <AuthContext.Provider value={{ token, setToken, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
