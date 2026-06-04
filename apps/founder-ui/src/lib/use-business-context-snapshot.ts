'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { api, BusinessContextSnapshot } from '@/lib/api'

export interface UseBusinessContextSnapshotResult {
  snapshot: BusinessContextSnapshot | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * useBusinessContextSnapshot
 *
 * Loader hook for the BusinessContextSnapshotCard.
 * Fetches a snapshot of the selected business's PT context — current phase,
 * lifecycle stage, active/recent tasks and task-count breakdown.
 *
 * - Automatically re-fetches when `businessId` changes.
 * - Cancels in-flight requests on unmount or businessId change (via AbortController).
 * - Exposes a manual `reload` for pull-to-refresh.
 */
export function useBusinessContextSnapshot(
  businessId: string | null,
): UseBusinessContextSnapshotResult {
  const [snapshot, setSnapshot] = useState<BusinessContextSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = useCallback(
    async (id: string) => {
      // Cancel any running request
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      setLoading(true)
      setError(null)

      try {
        const snap = await api.getBusinessContextSnapshot(id)
        if (ctrl.signal.aborted) return
        setSnapshot(snap)
      } catch (err) {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : '스냅샷 로드 실패')
        setSnapshot(null)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    },
    [],
  )

  const reload = useCallback(() => {
    if (businessId) fetch(businessId)
  }, [businessId, fetch])

  useEffect(() => {
    if (!businessId) {
      setSnapshot(null)
      setLoading(false)
      setError(null)
      return
    }
    fetch(businessId)
    return () => {
      abortRef.current?.abort()
    }
  }, [businessId, fetch])

  return { snapshot, loading, error, reload }
}
