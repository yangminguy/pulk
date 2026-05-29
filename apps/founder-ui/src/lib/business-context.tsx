'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, ActiveBusiness } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

interface BusinessCtx {
  businesses: ActiveBusiness[]
  selectedId: string | null  // null = 회사 공통
  setSelectedId: (id: string | null) => void
  loadingBusinesses: boolean
  reload: () => void
}

const BusinessContext = createContext<BusinessCtx>({
  businesses: [],
  selectedId: null,
  setSelectedId: () => {},
  loadingBusinesses: false,
  reload: () => {},
})

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingBusinesses, setLoadingBusinesses] = useState(false)
  const { token } = useAuth()

  const reload = useCallback(async () => {
    setLoadingBusinesses(true)
    try {
      const data = await api.listActiveBusinesses()
      setBusinesses(data)
    } catch {
      setBusinesses([])
    } finally {
      setLoadingBusinesses(false)
    }
  }, [])

  // Wait for the auth token before fetching — BusinessProvider mounts above
  // AuthGate, so an unconditional fetch races the auto-login and 401s.
  useEffect(() => { if (token) reload() }, [token, reload])

  return (
    <BusinessContext.Provider value={{ businesses, selectedId, setSelectedId, loadingBusinesses, reload }}>
      {children}
    </BusinessContext.Provider>
  )
}

export const useBusiness = () => useContext(BusinessContext)
