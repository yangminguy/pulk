const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13000'

function getToken(): string | null {
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
}

export type ActiveBusiness = {
  id: string
  name: string
  one_liner: string | null
  current_phase: string | null
  lifecycle_stage: string | null
  updated_at: string | null
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
  role: 'founder' | 'ceo'
  text: string
  metadata?: {
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

  generateWorkflow: (idea: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/chat:generateWorkflow', {
      method: 'POST',
      body: JSON.stringify({ idea }),
    }).then(r => unwrap(r)),

  currentTasks: () =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>('/api/monitor:currentTasks')
      .then(r => unwrap(r) as TaskItem[])
      .catch(() => [] as TaskItem[]),

  blockedTasks: () =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>('/api/monitor:blockedTasks')
      .then(r => unwrap(r) as TaskItem[])
      .catch(() => [] as TaskItem[]),

  approvalQueue: () =>
    request<{ data: { ok: boolean; data: TaskItem[] } }>('/api/monitor:approvalQueue')
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

  getInboxTasks: (projectId: string | null, businessId: string | null) => {
    let query = `/api/agent_tasks:list?filter[status]=needs_review&pageSize=200`
    if (projectId) {
      query += `&filter[$or][0][project_id]=${encodeURIComponent(projectId)}&filter[$or][1][project_id][$empty]=true`
    } else {
      query += `&filter[project_id][$empty]=true`
    }
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
}
