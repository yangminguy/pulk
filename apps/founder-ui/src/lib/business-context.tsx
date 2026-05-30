'use client'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api, ActiveBusiness, ProjectItem } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

interface BusinessCtx {
  businesses: ActiveBusiness[]
  selectedId: string | null  // null = 회사 공통
  setSelectedId: (id: string | null) => void
  loadingBusinesses: boolean
  reload: () => void
  projects: ProjectItem[]
  selectedProjectId: string | null
  setSelectedProjectId: (id: string | null) => void
  loadingProjects: boolean
  reloadProjects: (targetBusinessId: string | null, forceSelectId?: string | null) => Promise<void>
}

const BusinessContext = createContext<BusinessCtx>({
  businesses: [],
  selectedId: null,
  setSelectedId: () => {},
  loadingBusinesses: false,
  reload: () => {},
  projects: [],
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  loadingProjects: false,
  reloadProjects: async () => {},
})

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<ActiveBusiness[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingBusinesses, setLoadingBusinesses] = useState(false)
  const { token } = useAuth()

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(false)

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

  const reloadProjects = useCallback(async (targetBusinessId: string | null, forceSelectId?: string | null) => {
    if (!targetBusinessId) {
      setProjects([])
      setSelectedProjectId(null)
      return
    }
    setLoadingProjects(true)
    try {
      const data = await api.listProjects(targetBusinessId)
      setProjects(data)
      if (data.length > 0) {
        if (forceSelectId && data.some(p => p.id === forceSelectId)) {
          setSelectedProjectId(forceSelectId)
        } else {
          setSelectedProjectId(prev => {
            if (prev && data.some(p => p.id === prev)) {
              return prev
            }
            return data[0].id
          })
        }
      } else {
        setSelectedProjectId(null)
      }
    } catch {
      setProjects([])
      setSelectedProjectId(null)
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  // Wait for the auth token before fetching — BusinessProvider mounts above
  // AuthGate, so an unconditional fetch races the auto-login and 401s.
  useEffect(() => { if (token) reload() }, [token, reload])

  useEffect(() => {
    reloadProjects(selectedId)
  }, [selectedId, reloadProjects])

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        selectedId,
        setSelectedId,
        loadingBusinesses,
        reload,
        projects,
        selectedProjectId,
        setSelectedProjectId,
        loadingProjects,
        reloadProjects,
      }}
    >
      {children}
    </BusinessContext.Provider>
  )
}

export const useBusiness = () => useContext(BusinessContext)
