const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13001'

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

export const api = {
  signIn: (account: string, password: string) =>
    request<{ data: { token: string } }>('/api/auth:signIn', {
      method: 'POST',
      body: JSON.stringify({ account, password }),
    }).then(r => ({ token: r.data.token })),

  submitInstruction: (rawText: string) =>
    request<unknown>('/api/chat:submitInstruction', {
      method: 'POST',
      body: JSON.stringify({ raw_text: rawText, source: 'chat' }),
    }),

  generateWorkflow: (idea: string) =>
    request<unknown>('/api/chat:generateWorkflow', {
      method: 'POST',
      body: JSON.stringify({ idea }),
    }),

  currentTasks: () => request<unknown[]>('/api/monitor:currentTasks'),
  blockedTasks: () => request<unknown[]>('/api/monitor:blockedTasks'),
  approvalQueue: () => request<unknown[]>('/api/monitor:approvalQueue'),

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

  memoryCandidates: () => request<unknown[]>('/api/monitor:memoryCandidates'),

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
}
