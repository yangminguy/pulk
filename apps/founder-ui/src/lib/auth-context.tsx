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
    if (t) setTokenState(t)
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
