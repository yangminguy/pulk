// NocoBase cmo:* REST 클라이언트 — 도메인 로직 없음(호출만).
// founder-ui/src/lib/api.ts 패턴 축약판. 로컬 콘솔 전용(admin 자동 로그인).

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:13000'
const TOKEN_KEY = 'bizpt_token'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export async function signIn(account = 'admin@nocobase.com', password = 'admin123'): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/auth:signIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    })
    const j = await r.json()
    const token = j?.data?.token
    if (!token) return false
    localStorage.setItem(TOKEN_KEY, token)
    return true
  } catch {
    return false
  }
}

async function call<T = unknown>(action: string, body?: unknown, timeoutMs = 120000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/api/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      signal: ctl.signal,
    })
    if (res.status === 401) throw new Error('401')
    const j = await res.json()
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(j).slice(0, 300)}`)
    // NocoBase는 { data: { ok, data } }로 이중 래핑
    const inner = j?.data
    return (inner && typeof inner === 'object' && 'data' in inner ? inner.data : inner) as T
  } finally {
    clearTimeout(timer)
  }
}

// 401이면 자동 재로그인 1회
async function callAuthed<T = unknown>(action: string, body?: unknown, timeoutMs?: number): Promise<T> {
  try {
    return await call<T>(action, body, timeoutMs)
  } catch (e) {
    if (String(e).includes('401')) {
      const ok = await signIn()
      if (ok) return call<T>(action, body, timeoutMs)
    }
    throw e
  }
}

export type Project = {
  id: string
  title?: string
  status: string
  current_page?: string
  tiger_enabled?: boolean
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

export type Card = {
  id: string
  stage?: string
  card_type?: string
  title?: string
  content?: unknown
  createdAt?: string
  [k: string]: unknown
}

export type Gate = {
  id: string
  gate_type?: string
  status?: string
  decision?: string
  [k: string]: unknown
}

export type ProjectDetail = {
  project: Project
  cards?: Card[]
  gates?: Gate[]
  [k: string]: unknown
}

export type Artifact = {
  id: string
  video_project_id: string
  stage: string
  summary?: string
  data?: unknown
  createdAt?: string
  updatedAt?: string
  project_title?: string
  project_status?: string
  key_topic_title?: string | null
}

export const api = {
  listProjects: () => callAuthed<{ projects: Project[] }>('cmo:listProjects'),
  listArtifacts: (stages: string[], project_id?: string) =>
    callAuthed<{ artifacts: Artifact[] }>('cmo:listArtifacts', { stages, ...(project_id ? { project_id } : {}) }),
  rejectStageGate: (project_id: string, decision: 'needs_revision' | 'rejected', note: string) =>
    callAuthed<{ gate_id: string; decision: string; status: string }>('cmo:rejectStageGate', { project_id, decision, note }),
  decideResearchCandidate: (project_id: string, video_id: string, verdict: 'adopt' | 'exclude', reason: string) =>
    callAuthed<{ judgments: unknown[] }>('cmo:decideResearchCandidate', { project_id, video_id, verdict, reason }),
  getProject: (project_id: string) => callAuthed<ProjectDetail>('cmo:getProject', { project_id }),
  createProject: (input: Record<string, unknown>) =>
    callAuthed<{ project_id: string; status: string }>('cmo:createProject', input),
  advanceStatus: (project_id: string) =>
    callAuthed<{ status: string }>('cmo:advanceStatus', { project_id }),
  approveStageGate: (project_id: string) =>
    callAuthed<{ status: string; gate_id: string }>('cmo:approveStageGate', { project_id }),
  decideGate: (gate_id: string, decision: 'approved' | 'rejected' | 'needs_revision', note?: string) =>
    callAuthed<{ status: string }>('cmo:decideGate', { gate_id, decision, note }),
  getRenderStatus: (project_id: string) =>
    callAuthed<{ render_job_id?: string; slug?: string; status?: string; render_qa?: unknown; project_status?: string | null }>(
      'cmo:getRenderStatus', { project_id }, 180000),
}
