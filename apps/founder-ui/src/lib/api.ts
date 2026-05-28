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

export const api = {
  signIn: (account: string, password: string) =>
    request<{ data: { token: string } }>('/api/auth:signIn', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    }).then(r => ({ token: r.data.token })),

  submitInstruction: (rawText: string) =>
    request<{ data: { ok: boolean; data: { instruction: { id: string }; interpretation: Record<string, unknown>; tasks: unknown[] } } }>('/api/chat:submitInstruction', {
      method: 'POST',
      body: JSON.stringify({ raw_text: rawText, source: 'chat' }),
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

  executeTask: (task_id: string) =>
    request<{ data: { ok: boolean; data: { task_id: string; status: string; approval_required: boolean; output: Record<string, unknown>; handoff: Record<string, unknown> } } }>('/api/agent:executeTask', {
      method: 'POST',
      body: JSON.stringify({ task_id }),
    }).then(r => unwrap(r)),
}
