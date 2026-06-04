const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13000'
const ENV_TOKEN = process.env.NEXT_PUBLIC_NOCOBASE_TOKEN ?? ''

function getToken(): string | null {
  if (ENV_TOKEN) return ENV_TOKEN
  if (typeof window === 'undefined') return null
  return localStorage.getItem('l5_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// Unwrap NocoBase's { data: { ok, data: ... } } nesting
function unwrap<T>(r: { data: { ok?: boolean; data?: T } | T }): T {
  const inner = r.data
  if (inner && typeof inner === 'object' && 'data' in inner) {
    return (inner as { data: T }).data as T
  }
  return inner as T
}

// The executive's full work product, persisted on agent_tasks.output.
export type AgentOutputLite = {
  goal?: string
  current_situation?: string
  bottleneck?: string
  recommendation?: string
  options?: string[]
  action_items?: string[]
  insight_to_record?: string
  confidence_level?: string
}

export type TaskItem = {
  task_id: string
  agent: string
  task_title: string
  source_instruction: string | null
  rationale: string
  status: string
  expected_output: string
  approval_required: boolean
  risk_level: string | null
  phase: string | null
  source_ref: string | null
  blocker: string | null
  output?: AgentOutputLite | null
  updated_at: string
}

export type ToolRequestItem = {
  task_id: string
  task_title: string
  rationale: string
  status: string
  risk_level: string | null
  phase: string | null
  source_ref: string | null
  blocker: string | null
  approval_required: boolean
  updated_at: string
  created_at: string
  self_mod_status?: string | null
  acr_branch?: string | null
  acr_diff?: string | null
  acr_pr_url?: string | null
}

// P2 — live agent status
export type LiveStatusAgent = {
  task_id: string
  agent: string
  task_title: string
  raw_status: string
  live_status: string
  counterpart: string | null
  current_action: string
  risk_level: string | null
  phase: string | null
  approval_required: boolean
  updated_at: string
}
export type LiveStatusGroup = {
  instruction_id: string
  instruction_text: string
  agents: LiveStatusAgent[]
}

// P3-3 — control room tree
export type ControlRoomDevTask = {
  task_id: string
  title: string
  agent: string
  /** CLI running the current phase (claude-code/codex/antigravity) from ACR. */
  acr_agent?: string | null
  status: string
  risk_level: string | null
  phase: string | null
  branch?: string | null
  phase_label?: string | null
  exec_status?: string | null
  changed_files?: number | null
  log_tail?: string | null
  /** Forecast token range (추정, from classification — not measured usage). */
  est_tokens_low?: number | null
  est_tokens_high?: number | null
  /** Measured token usage + cost from the CLI runtime (via ACR), when available. */
  actual_total_tokens?: number | null
  actual_cost_usd?: number | null
}
export type ControlRoomProject = {
  project_id: string | null
  project_name: string
  dev_tasks: ControlRoomDevTask[]
}
export type ControlRoomBusiness = {
  business_id: string | null
  business_name: string
  projects: ControlRoomProject[]
}

// P3-2 — curation summary
export type CurationSummaryItem = {
  id: string
  insight: string
  reason?: string | null
  discarded_at?: string | null
}
export type CurationSummaryData = {
  week_start: string
  saved: CurationSummaryItem[]
  discarded: CurationSummaryItem[]
  needs_review: CurationSummaryItem[]
  totals: { saved: number; discarded: number; needs_review: number }
}

export type ActiveBusiness = {
  id: string
  name: string
  one_liner: string | null
  current_phase: string | null
  lifecycle_stage: string | null
  updated_at: string | null
}

// Business PT Context Snapshot — summary loaded by useBusinessContextSnapshot
export type BusinessContextSnapshotTask = {
  task_id: string
  agent: string
  task_title: string
  status: string
  risk_level: string | null
  updated_at: string
}

export type BusinessContextSnapshot = {
  business_id: string
  business_name: string
  one_liner: string | null
  current_phase: string | null
  lifecycle_stage: string | null
  active_tasks: BusinessContextSnapshotTask[]
  recent_done_tasks: BusinessContextSnapshotTask[]
  total_tasks: number
  queued_count: number
  running_count: number
  done_count: number
  needs_review_count: number
  loaded_at: string
}

export type AgentTaskSummary = {
  task_id: string
  agent: string
  title: string
  status: string
  risk_level: string | null
  phase: string | null
  source_ref: string | null
  updated_at: string | null
}

export type HandoffSummary = {
  id: string
  from_agent: string
  to_agent: string
  task_id: string
  note: string | null
  created_at: string | null
}

export type HandoffItem = {
  id: string
  task_id: string
  from_agent: string
  to_agent: string
  context: string | null
  next_action: string | null
  blocker: string | null
  what_was_completed: string | null
  what_remains_open: string | null
  why_next_agent_needed: string | null
  createdAt: string
  updatedAt: string
}

export type OpenItem = {
  kind: 'needs_review' | 'blocked' | 'pending_approval'
  task_id: string
  note?: string
}

export type DecisionRecord = {
  task_id: string
  verdict: string
  rationale: string
  at: string
}

export type ProjectTimeline = {
  agentTasks: AgentTaskSummary[]
  handoffs: HandoffSummary[]
  openItems: OpenItem[]
  decisions: DecisionRecord[]
}

export type RoadmapItem = {
  id: string
  title: string
  status: string
  phase: string | null
  priority: number | null
  due_date: string | null
  business_id: string | null
  agent?: string | null
  objective?: string | null
}

export type TodayDiscovery = {
  id: string
  summary: string
  source: string | null
  created_at: string
  business_id: string | null
}

export type ProjectItem = {
  id: string
  business_id: string
  name: string
  description: string
  status: string | null
  updated_at: string | null
}

export type ChatMessageItem = {
  id: string
  project_id: string
  role: 'founder' | 'ceo' | 'chief_of_staff'
  text: string
  metadata?: {
    kind?: 'synthesis'
    deliverable_id?: string
    decision_summary?: string
    contributions?: Array<{ agent: string; task_id?: string; task_title: string; summary: string; status: string }>
    open_gaps?: string[]
    next_actions?: Array<{ kind: 'approve' | 'delegate' | 'hold'; label: string; target_agent?: string; reason: string }>
    instructionId?: string
    planStatus?: 'pending' | 'approved' | 'rejected'
    goal?: string
    phase?: string
    risk_level?: string
    assumptions?: string[]
    success_criteria?: string[]
    proposed_tasks?: Array<{
      id: string
      assigned_agent: string
      title: string
      rationale: string
      expected_output: string
      risk_level?: string
      approval_required?: boolean
    }>
    needs_business_clarification?: boolean
    business_clarification_question?: string
  }
  createdAt: string
}

export type ProjectRoadmapEventItem = {
  id: string
  project_id: string
  task_id: string
  title: string
  assigned_agent: string
  status: string
  risk_level: string
  phase: string
  rationale: string
  output_summary: string
  completed_at: string
}

// M10: CTO conversational planning.
export type CtoPlanRoadmapItem = { title: string; summary: string; objective: string; sequence: number }
export type CtoPlanTask = { title: string; rationale: string; expected_output: string; roadmap_sequence: number }
export type CtoProjectProposal = {
  is_new_project: boolean
  business_id: string | null
  suggested_project_title: string
  rationale: string
}
export type PlanTokenEstimate = {
  task_count: number
  low: number
  high: number
  mid: number
}
export type CtoPlan = {
  prd: string
  roadmap_items: CtoPlanRoadmapItem[]
  tasks: CtoPlanTask[]
  project_proposal: CtoProjectProposal | null
  token_estimate?: PlanTokenEstimate | null
}
export type RoadmapProgressItem = {
  id: string
  title: string
  sequence: number
  project_id: string | null
  business_id: string | null
  total: number
  done: number
  status: 'planned' | 'active' | 'done'
}
export type RoadmapProgressSummary = {
  item_count: number
  done_items: number
  total_tasks: number
  done_tasks: number
  percent: number
}
export type RoadmapProgressResult = { items: RoadmapProgressItem[]; summary: RoadmapProgressSummary }

export type CtoPlanMessageResult = { reply: string; plan: CtoPlan | null; cto_message_id: string }
export type CtoApproveResult = {
  new_project: boolean
  project_id: string | null
  instruction_id: string
  roadmap_item_ids: string[]
  task_ids: string[]
  already_approved?: boolean
}

export const api = {
  signIn: (account: string, password: string) =>
    request<{ data: { token: string } }>('/api/auth:signIn', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    }).then(r => ({ token: r.data.token })),

  submitInstruction: (rawText: string, projectId?: string | null, businessId?: string | null) =>
    request<{ data: { ok: boolean; data: { instruction: { id: string }; interpretation: Record<string, unknown>; tasks: unknown[] } } }>('/api/chat:submitInstruction', {
      method: 'POST',
      body: JSON.stringify({ raw_text: rawText, source: 'chat', project_id: projectId ?? null, business_id: businessId ?? null }),
    }).then(r => unwrap(r)),

  approvePlan: (instruction_id: string) =>
    request<{ data: { ok: boolean; data: { approved: number; tasks: unknown[] } } }>('/api/chat:approvePlan', {
      method: 'POST',
      body: JSON.stringify({ instruction_id }),
    }).then(r => unwrap(r)),

  rejectPlan: (instruction_id: string) =>
    request<{ data: { ok: boolean; data: { rejected: boolean } } }>('/api/chat:rejectPlan', {
      method: 'POST',
      body: JSON.stringify({ instruction_id }),
    }).then(r => unwrap(r)),

  // M10: one founder→CTO planning turn (reply, and a plan once the CTO is ready).
  ctoPlanMessage: (
    thread_id: string,
    founder_message: string,
    opts?: { business_id?: string | null; project_id?: string | null; project_title?: string | null },
  ) =>
    request<{ data: { ok: boolean; data: CtoPlanMessageResult } }>('/api/cto:planMessage', {
      method: 'POST',
      body: JSON.stringify({ thread_id, founder_message, ...(opts ?? {}) }),
    }).then(r => unwrap(r)) as Promise<CtoPlanMessageResult>,

  // M10: approve a proposed plan in one go (PRD + roadmap + tasks + optional project).
  ctoApprovePlan: (cto_message_id: string) =>
    request<{ data: { ok: boolean; data: CtoApproveResult } }>('/api/cto:approvePlan', {
      method: 'POST',
      body: JSON.stringify({ cto_message_id }),
    }).then(r => unwrap(r)) as Promise<CtoApproveResult>,

  // M9.5: roadmap burndown — per-milestone done/total task progress.
  ctoRoadmapProgress: (businessId?: string | null) =>
    request<{ data: { ok: boolean; data: RoadmapProgressResult } }>('/api/cto:roadmapProgress', {
      method: 'POST',
      body: JSON.stringify({ business_id: businessId ?? null }),
    }).then(r => unwrap(r)) as Promise<RoadmapProgressResult>,

  closeInstruction: (id: string) =>
    request<{ data: unknown }>('/api/founder_instructions:update', {
      method: 'POST',
      body: JSON.stringify({ filterByTk: id, values: { status: 'closed' } }),
    }).then(r => r.data),

  generateWorkflow: (idea: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/chat:generateWorkflow', {
      method: 'POST',
      body: JSON.stringify({ idea }),
    }).then(r => unwrap(r)),

  currentTasks: (businessId?: string | null) =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>(
      `/api/monitor:currentTasks${businessId !== undefined ? `?business_id=${encodeURIComponent(businessId ?? 'common')}` : ''}`
    )
      .then(r => unwrap(r) as TaskItem[])
      .catch(() => [] as TaskItem[]),

  blockedTasks: (businessId?: string | null) =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>(
      `/api/monitor:blockedTasks${businessId !== undefined ? `?business_id=${encodeURIComponent(businessId ?? 'common')}` : ''}`
    )
      .then(r => unwrap(r) as TaskItem[])
      .catch(() => [] as TaskItem[]),

  approvalQueue: (businessId?: string | null) =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>(
      `/api/monitor:approvalQueue${businessId !== undefined ? `?business_id=${encodeURIComponent(businessId ?? 'common')}` : ''}`
    )
      .then(r => unwrap(r) as TaskItem[])
      .catch(() => [] as TaskItem[]),

  approveTask: (taskId: string) =>
    request<unknown>('/api/monitor:approveTask', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),

  rejectTask: (taskId: string) =>
    request<unknown>('/api/monitor:rejectTask', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    }),

  memoryCandidates: () =>
    request<{ data: { ok: boolean; data: unknown[] } }>('/api/monitor:memoryCandidates')
      .then(r => unwrap(r) as unknown[])
      .catch(() => []),

  saveMemory: (id: string) =>
    request<unknown>('/api/monitor:saveMemory', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  discardMemory: (id: string) =>
    request<unknown>('/api/monitor:discardMemory', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  // P2 — live agent status, grouped by instruction. Pass businessId to scope to
  // a business (null/undefined → 'common' so the monitor matches the sidebar
  // selection; backend treats missing param as all-businesses).
  liveStatus: (businessId?: string | null, instructionId?: string) => {
    const params = new URLSearchParams()
    if (businessId !== undefined) params.set('business_id', businessId ?? 'common')
    if (instructionId) params.set('instruction_id', instructionId)
    const qs = params.toString()
    return request<{ data: { ok: boolean; data: LiveStatusGroup[] } }>(
      `/api/monitor:liveStatus${qs ? `?${qs}` : ''}`
    )
      .then(r => unwrap(r) as LiveStatusGroup[])
      .catch(() => [] as LiveStatusGroup[])
  },

  // P3-3 — control room tree (Business ▸ Project ▸ dev-task)
  controlRoomTree: (businessId?: string) =>
    request<{ data: { ok: boolean; data: ControlRoomBusiness[] } }>(
      `/api/monitor:controlRoomTree${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`
    )
      .then(r => unwrap(r) as ControlRoomBusiness[])
      .catch(() => [] as ControlRoomBusiness[]),

  // P3-2 — knowledge auto-curation
  curationSummary: () =>
    request<{ data: { ok: boolean; data: CurationSummaryData } }>('/api/monitor:curationSummary')
      .then(r => unwrap(r) as CurationSummaryData)
      .catch(() => ({ week_start: '', saved: [], discarded: [], needs_review: [], totals: { saved: 0, discarded: 0, needs_review: 0 } } as CurationSummaryData)),

  curate: () =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/monitor:curate', { method: 'POST', body: '{}' })
      .then(r => unwrap(r))
      .catch(() => null),

  overrideCuration: (id: string, decision: 'save' | 'discard' | 'restore') =>
    request<unknown>('/api/monitor:overrideCuration', {
      method: 'POST',
      body: JSON.stringify({ id, decision }),
    }),

  // P3-4 — Tool Request → CTO self-modification
  sendToolRequestToCTO: (task_id: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/monitor:sendToCTO', {
      method: 'POST',
      body: JSON.stringify({ task_id }),
    }).then(r => r.data),

  applySelfMod: (task_id: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/monitor:applySelfMod', {
      method: 'POST',
      body: JSON.stringify({ task_id }),
    }).then(r => r.data),

  rollbackSelfMod: (task_id: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/monitor:rollbackSelfMod', {
      method: 'POST',
      body: JSON.stringify({ task_id }),
    }).then(r => r.data),

  currentPhase: () =>
    request<{ data: {
      current_phase: string
      current_phase_label: string
      next_phase: string | null
      next_phase_label: string | null
      phase_index: number
      total_phases: number
      requires_approval: boolean
    }}>('/api/bpr:currentPhase').then(r => r.data),

  requestTransition: (from_phase: string, to_phase: string, reason: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/bpr:requestTransition', {
      method: 'POST',
      body: JSON.stringify({ from_phase, to_phase, reason }),
    }).then(r => r.data),

  transitionSummary: (from_phase: string, to_phase: string) =>
    request<{ data: { ok: boolean; data: {
      from_phase: string
      from_phase_label: string
      to_phase: string
      to_phase_label: string
      effective_at: string
      completed_count: number
      blocked_count: number
      needs_review_count: number
      success_criteria_met: Array<{ title: string; outcome: string }>
      outstanding_items: Array<{ title: string; status: string; reason: string }>
      key_learnings: string[]
      next_phase_plan: {
        primary_owners: string[]
        success_criteria: string[]
        expected_outcome: string
      }
      requires_approval: boolean
      message: string
    } } }>('/api/bpr:transitionSummary', {
      method: 'POST',
      body: JSON.stringify({ from_phase, to_phase }),
    }).then(r => r.data.data),

  listToolRequests: (status?: string) =>
    request<{ data: { ok: boolean; data: ToolRequestItem[] } }>(
      `/api/monitor:toolRequests${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`
    )
      .then(r => unwrap(r) as ToolRequestItem[])
      .catch(() => [] as ToolRequestItem[]),

  executeTask: (task_id: string) =>
    request<{ data: { ok: boolean; data: { task_id: string; status: string; approval_required: boolean; output: Record<string, unknown>; handoff: Record<string, unknown> } } }>('/api/agent:executeTask', {
      method: 'POST',
      body: JSON.stringify({ task_id }),
    }).then(r => unwrap(r)),

  listActiveBusinesses: () =>
    request<{ data: { ok: boolean; data: ActiveBusiness[] } }>('/api/business:listActive')
      .then(r => unwrap(r) as ActiveBusiness[])
      .catch(() => [] as ActiveBusiness[]),

  createBusiness: (title: string, oneLiner?: string) =>
    request<{ data: ActiveBusiness }>('/api/businesses:create', {
      method: 'POST',
      body: JSON.stringify({ title, one_liner: oneLiner ?? '', status: 'active' }),
    }).then(r => r.data),

  getProjectTimeline: (businessId: string) =>
    request<{ data: { ok: boolean; data: ProjectTimeline } }>(
      `/api/monitor:projectTimeline?business_id=${encodeURIComponent(businessId)}`
    )
      .then(r => unwrap(r) as ProjectTimeline)
      .catch(() => ({ agentTasks: [], handoffs: [], openItems: [], decisions: [] } as ProjectTimeline)),

  getProjectStatusMd: async (businessId: string): Promise<string> => {
    const res = await fetch(`/api/projects/${encodeURIComponent(businessId)}/status-md`)
    if (!res.ok) return ''
    return res.text()
  },

  // Slice 2.4 — not yet implemented on backend; safe empty fallback
  getRoadmapItems: (businessId: string | null) =>
    request<{ data: { ok: boolean; data: RoadmapItem[] } }>(
      `/api/roadmap:list${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`
    )
      .then(r => unwrap(r) as RoadmapItem[])
      .catch(() => [] as RoadmapItem[]),

  // Slice 2.4 — not yet implemented on backend; safe empty fallback
  getTodayDiscoveries: (businessId: string | null) =>
    request<{ data: { ok: boolean; data: TodayDiscovery[] } }>(
      `/api/discovery:today${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`
    )
      .then(r => unwrap(r) as TodayDiscovery[])
      .catch(() => [] as TodayDiscovery[]),

  // M9.4 — completion alerts for the top-right bell: recently synthesized
  // deliverables (one per completed instruction = "전체 결과 완료"). Sort by
  // createdAt (camelCase) — created_at silently returns [] (NocoBase ts gotcha).
  getCompletionAlerts: (businessId: string | null) => {
    let query = `/api/founder_deliverables:list?sort=-createdAt&pageSize=10`
    if (businessId && businessId !== 'common') {
      query += `&filter[business_id]=${encodeURIComponent(businessId)}`
    }
    return request<{ data: Array<{ decision_summary?: string; instruction_id?: string; createdAt?: string }> }>(query)
      .then(r => (r.data ?? []).map(d => ({
        source: '완료',
        summary: d.decision_summary ?? '산출물 완료',
        createdAt: d.createdAt,
        instructionId: d.instruction_id,
      })))
      .catch(() => [] as Array<{ source: string; summary: string; createdAt?: string; instructionId?: string }>)
  },

  listProjects: (businessId?: string | null) =>
    request<{ data: { ok: boolean; data: ProjectItem[] } }>(
      `/api/project:listActive${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`
    )
      .then(r => unwrap(r) as ProjectItem[])
      .catch(() => [] as ProjectItem[]),

  createProject: (businessId: string, title: string, description?: string) =>
    request<{ data: ProjectItem }>('/api/projects:create', {
      method: 'POST',
      body: JSON.stringify({ business_id: businessId, title, description: description ?? '', status: 'active' }),
    }).then(r => r.data),

  chatHistory: (projectId: string) =>
    request<{ data: { ok: boolean; data: ChatMessageItem[] } }>(
      `/api/chat:history?project_id=${encodeURIComponent(projectId)}`
    )
      .then(r => unwrap(r) as ChatMessageItem[])
      .catch(() => [] as ChatMessageItem[]),

  getProjectRoadmapEvents: (projectId: string) =>
    request<{ data: ProjectRoadmapEventItem[] }>(
      `/api/project_roadmap_events:list?filter[project_id]=${encodeURIComponent(projectId)}&sort=completed_at`
    )
      .then(r => r.data as ProjectRoadmapEventItem[])
      .catch(() => [] as ProjectRoadmapEventItem[]),

  getProjectTasks: (projectId: string) =>
    request<{ data: TaskItem[] }>(
      `/api/agent_tasks:list?filter[project_id]=${encodeURIComponent(projectId)}&pageSize=200`
    )
      .then(r => r.data as TaskItem[])
      .catch(() => [] as TaskItem[]),

  getInboxTasks: (_projectId: string | null, businessId: string | null) => {
    // Inbox shows every executive's work (in-progress + needs_review + done),
    // not just review-pending, so the founder can see what each agent is doing
    // and read the real deliverable. Killed tasks are excluded. Newest first.
    //
    // Scoped by BUSINESS only — not project. The founder selects a business and
    // wants every exec's task for it in one place; auto-selecting a project would
    // hide tasks filed under a different project of the same business (the
    // "shows in roadmap but missing from inbox" bug).
    let query = `/api/agent_tasks:list?filter[status][$ne]=killed&sort=-updatedAt&pageSize=200`
    if (businessId && businessId !== 'common') {
      query += `&filter[business_id]=${encodeURIComponent(businessId)}`
    } else {
      query += `&filter[business_id][$empty]=true`
    }
    return request<{ data: TaskItem[] }>(query)
      .then(r => r.data as TaskItem[])
      .catch(() => [] as TaskItem[])
  },

  getTaskHandoffs: (taskId: string) =>
    request<{ data: HandoffItem[] }>(
      `/api/agent_handoffs:list?filter[task_id]=${encodeURIComponent(taskId)}`
    )
      .then(r => r.data as HandoffItem[])
      .catch(() => [] as HandoffItem[]),

  // Single agent_task with its full output — used by the monitor drill-down.
  getTaskDetail: (taskId: string) =>
    request<{ data: TaskItem[] }>(
      `/api/agent_tasks:list?filter[id]=${encodeURIComponent(taskId)}&pageSize=1`
    )
      .then(r => (Array.isArray(r.data) ? r.data[0] ?? null : null))
      .catch(() => null),

  // Business PT Context Snapshot — aggregates tasks by status for a single business.
  // Drives BusinessContextSnapshotCard and useBusinessContextSnapshot.
  getBusinessContextSnapshot: async (businessId: string): Promise<BusinessContextSnapshot | null> => {
    try {
      const [bizRes, taskRes] = await Promise.all([
        request<{ data: ActiveBusiness[] }>(
          `/api/businesses:list?filter[id]=${encodeURIComponent(businessId)}&pageSize=1`
        ),
        request<{ data: TaskItem[] }>(
          `/api/agent_tasks:list?filter[business_id]=${encodeURIComponent(businessId)}&sort=-updatedAt&pageSize=200`
        ),
      ])
      const biz: ActiveBusiness | undefined = Array.isArray(bizRes.data)
        ? bizRes.data[0]
        : (bizRes.data as unknown as ActiveBusiness)
      if (!biz) return null
      const tasks: TaskItem[] = Array.isArray(taskRes.data) ? taskRes.data : []
      const active = tasks.filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'needs_review')
      const done   = tasks.filter(t => t.status === 'done').slice(0, 5)
      const snap: BusinessContextSnapshot = {
        business_id: biz.id,
        business_name: biz.name,
        one_liner: biz.one_liner,
        current_phase: biz.current_phase,
        lifecycle_stage: biz.lifecycle_stage,
        active_tasks: active.slice(0, 10).map(t => ({
          task_id: t.task_id,
          agent: t.agent,
          task_title: t.task_title,
          status: t.status,
          risk_level: t.risk_level,
          updated_at: t.updated_at,
        })),
        recent_done_tasks: done.map(t => ({
          task_id: t.task_id,
          agent: t.agent,
          task_title: t.task_title,
          status: t.status,
          risk_level: t.risk_level,
          updated_at: t.updated_at,
        })),
        total_tasks: tasks.length,
        queued_count: tasks.filter(t => t.status === 'queued').length,
        running_count: tasks.filter(t => t.status === 'running').length,
        done_count: tasks.filter(t => t.status === 'done').length,
        needs_review_count: tasks.filter(t => t.status === 'needs_review').length,
        loaded_at: new Date().toISOString(),
      }
      return snap
    } catch {
      return null
    }
  },
}
