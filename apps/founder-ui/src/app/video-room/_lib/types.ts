// Shared types for the Video Room UI — mirror the backend cmo:* response shapes.

export type CmoProject = {
  id: string
  title: string
  product: string
  target_audience: string
  business_goal: string
  status: string
  current_page: 'strategy' | 'production' | 'review_publish'
  business_id?: string | null
  // 호랑이 회고 루프 — ON이면 파이프라인 완료 시 오류/병목 회고 → CTO 개선 제안.
  tiger_enabled?: boolean
}

export type CmoCard = {
  id: string
  video_project_id: string
  stage: string
  summary: string | null
  data: unknown
}

export type AppliedInsight = {
  insight: string
  how_applied: string
}

export type ScriptBeat = {
  scene_id: string
  scene_type: string
  rhythm_role?: string
  headline: string
  speaker_text: string
  duration: number
}

export type Intro30sData = {
  key_content_title?: string
  intro_script_30s?: string
  first_sentence?: string
  hook_structure?: string
  promise?: string
  curiosity_gap?: string
  applied_insights?: AppliedInsight[]
}

export type CmoGate = {
  id: string
  gate_type: string
  page: string
  title: string
  context: string | null
  options: string[]
  recommended_option: string | null
  status: 'pending' | 'approved' | 'needs_revision' | 'rejected'
}

export type CmoMessage = {
  role: 'founder' | 'cmo'
  text: string
  proposal: unknown
  gate: unknown
  ready_to_advance: boolean
}

export type RoadmapNode = {
  key: string
  label: string
  status: string
  state: 'done' | 'active' | 'pending'
}

export type ProjectDetail = {
  project: CmoProject
  cards: CmoCard[]
  gates: CmoGate[]
  messages: CmoMessage[]
  roadmap: RoadmapNode[]
}

export type ProjectListItem = {
  id: string
  title: string
  product?: string
  status?: string
  current_page?: string
}
