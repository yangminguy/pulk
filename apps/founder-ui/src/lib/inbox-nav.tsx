'use client'
import { createContext, useContext } from 'react'

// A roadmap/mini-card click hands the full task to the inbox detail view so it can render
// without re-fetching or depending on the needs_review list filter.
export type InboxTaskRef = {
  task_id: string
  assigned_agent: string
  title: string
  rationale?: string
  expected_output?: string
  decision?: string
  reasoning?: string
  next_action?: string
  blocker?: string
  risk_level?: string
  status?: string
  approval_required?: boolean
  source_instruction?: string
}

type InboxNavCtx = { openInboxTask: (t: InboxTaskRef) => void }

export const InboxNavContext = createContext<InboxNavCtx>({ openInboxTask: () => {} })
export const useInboxNav = () => useContext(InboxNavContext)
