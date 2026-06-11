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
export type IntroAnalysisData = {
  video_title?: string
  video_url?: string
  thumbnail_url?: string
  duration_sec?: number
  hook_score: number
  retention_curve?: Array<{ sec: number; pct: number }>
  segments?: Array<{
    label: string
    start_sec: number
    end_sec: number
    verdict: 'strong' | 'neutral' | 'weak' | string
    feedback: string
  }>
  overall_feedback?: string
  improvement_suggestions?: string[]
}

export type ProductStrategyData = {
  product: string
  target: string
  problem: string
  goal: string
  confidence?: number
  rationale?: string
}

export type PullingContentSetData = {
  hook: string
  problem: string
  solution: string
  benefit: string
  cta: string
}

export type AgentOutputLite = {
  goal?: string
  current_situation?: string
  bottleneck?: string
  recommendation?: string
  options?: string[]
  action_items?: string[]
  insight_to_record?: string
  confidence_level?: string
  intro_analysis?: IntroAnalysisData
  product_strategy?: ProductStrategyData
  pulling_content_set?: PullingContentSetData
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
// PRD §8.2 ExecutionRun.checks — per verifier gate. Absent gate = not reported.
export type AcrCheckStatus = 'pass' | 'fail' | 'skipped'
export type AcrChecks = {
  typecheck?: AcrCheckStatus
  lint?: AcrCheckStatus
  test?: AcrCheckStatus
  build?: AcrCheckStatus
  playwright?: AcrCheckStatus
  boundary?: AcrCheckStatus
}
// PRD §8.1 — one prior run attempt (compact summary; full run lives in ACR).
export type AcrRunSummary = {
  run_id: string
  status: string
  agent?: string | null
  branch?: string | null
  checks?: AcrChecks | null
  created_at?: string | null
}
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
  /** CTO Harness 복잡도(C0~C5). ACR이 dispatch intent.complexity 를 echo. null = 미표시. */
  complexity?: string | null
  /** Forecast token range (추정, from classification — not measured usage). */
  est_tokens_low?: number | null
  est_tokens_high?: number | null
  /** Measured token usage + cost from the CLI runtime (via ACR), when available. */
  actual_total_tokens?: number | null
  actual_cost_usd?: number | null
  // PRD §18.1 task ▸ run axes (null/empty when ACR absent → UI hides them).
  /** Latest ExecutionRun id; scopes retry/review. */
  run_id?: string | null
  /** PRD §8.2 verifier gate outcomes for the latest run. */
  checks?: AcrChecks | null
  /** PRD §16 ResultPacket.nextAction — what to do next. */
  next_action?: string | null
  /** PRD §16 ResultPacket.recommendation (merge_ready/human_review/…). */
  recommendation?: string | null
  /** PRD §8.1 prior run attempts (newest first). */
  run_history?: AcrRunSummary[] | null
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

// Native Orchestration — CTO가 나눈 phase를 claude/codex/agy CLI로 직접 실행한 내역.
// native_phase_runs 테이블에 기록 → 사업별 task 그룹으로 조회(GET /api/monitor:nativeRuns).
export type NativeRunRow = {
  id: string
  phase_name: string
  agent: 'claude-code' | 'codex' | 'antigravity'   // 토큰 풀
  runtime: string
  status: 'merged' | 'held' | 'failed' | 'waited'
  output: string          // 에이전트 작업 보고서 전체 본문(길 수 있음)
  diff_summary?: string
  changed_files?: number
  verdict?: string
  started_at: string
  ended_at?: string
}
export type BusinessRunGroup = {
  l5_task_id: string
  task_title: string
  business_id: string | null
  phases: NativeRunRow[]   // started_at 오름차순
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

// CMO conversational marketing planning.
export type CmoMarketingPlan = {
  decision: string
  reasoning: string
  next_action: string
  risk_level: string
  requires_founder_approval: boolean
}
export type CmoChatMessageResult = {
  reply: string
  plan?: CmoMarketingPlan | null
  proposal: any | null
  gate: any | null
  ready_to_advance: boolean
  status: string
  cmo_message_id: string
}
export type CmoApproveResult = { approved: boolean; task_ids: string[] }
export type CmoCreateProjectInput = {
  title: string
  product: string
  target_audience: string
  business_goal: string
  /** 고객이 겪는 핵심 문제 — 프로젝트 생성 시 1회 입력(키 콘텐츠 분석 입력). */
  customer_problem?: string
  /** 핵심 제안/기능 요약 — 프로젝트 생성 시 1회 입력. */
  core_offer?: string
  business_id?: string | null
  project_type?: string | null
}

// CMO v3 키 콘텐츠 — 주제 후보 1개. 본문구조·도입방향·CTA 없음(제작 단계로).
export type KeyContentCandidate = {
  id: string
  title: string
  thumbnail_promise: string
  selection_reasons: {
    viewtrap: string
    feature_benefit: string
    customer_problem: string
    funnel_application: string
  }
}
// CMO v3 풀링 — 풀링 주제 후보 1개. 본문구조·도입방향·CTA 없음(제작 단계로).
// shape는 l5-core PullingCandidate 도메인 계약과 동일.
export type PullingCandidate = {
  id: string
  order: number
  title: string
  selection_reasons: {
    consumer_stage: string
    bridge_to_key: string
    search_demand: string
    problem_addressed: string
  }
}
// CMO v3 R7 성과 재학습 — 완료 영상 성과(수동 입력) + 추출 인사이트.
// shape는 l5-core PerformanceRecord / InsightCandidate 도메인 계약과 동일.
export type VideoPerformanceRecord = {
  project_id: string
  view_count: number
  completion_rate: number
  ctr: number
  retention_notes?: string
  feedback?: string
  summary: string
}
export type CompletionInsightCandidate = {
  id: string
  insight: string
  usage: 'hook' | 'intro' | 'pulling' | 'topic'
}
// CMO v3 R4 제작 — 썸네일 후보 1개. shape는 l5-core ThumbnailCandidate 도메인 계약과 동일.
export type ThumbnailCandidate = {
  candidate_id: string
  copy: string
  visual_direction: string
  click_logic: string
  used_insights: string[]
}
export type ThumbnailPlanDraft = {
  content_id: string
  thumbnail_direction: string
  candidates: ThumbnailCandidate[]
  recommended: string
  why_recommended: string
  risk_notes: string[]
}
// CMO 제목 디벨롭 8단계 (PRD cmo-title-development §19) — UI 표시 전용 타입(도메인 로직 없음).
export type TitleDevelopmentReferenceInput = {
  id: string
  research_session_id: string
  source: 'viewtrap' | 'youtube' | 'manual'
  url?: string
  title: string
  thumbnail_text: string
  thumbnail_structure: string
  topic: string
  view_count: number
  performance_grade: 'Good' | 'Great'
  contribution_grade: 'Good' | 'Great'
  topic_similarity: 'exact' | 'expanded_same_meaning'
  similarity_reason: string
  selected_reason: string
}
export type TitleCombination = {
  id: string
  combination_type: string
  title_draft: string
  thumbnail_text_draft: string
  thumbnail_direction: string
  awkwardness_score: number
  awkwardness_reason?: string
  passed: boolean
  selected_for_next_step: boolean
}
export type TitleStepResult = {
  step_number: number
  step_name: string
  input_titles: string[]
  output_titles: string[]
  method_explanation: string
  cmo_reasoning: string
  rejected_titles: { title: string; reason: string }[]
  selected_titles_for_next_step: string[]
}
export type FinalTitleEvaluation = {
  title: string
  thumbnail_direction: string
  target_fit: number
  desire_clarity: number
  problem_sharpness: number
  curiosity_gap: number
  script_match: number
  thumbnail_fit: number
  total_score: number
  recommendation: 'upload_candidate' | 'revise' | 'rerun_reference_search'
  reason: string
  risks: string[]
  required_script_additions?: string[]
}
export type TitleDevelopmentRun = {
  id: string
  pulling_topic: string
  target_audience: string
  combinations: TitleCombination[]
  step_results: TitleStepResult[]
  final_candidates: FinalTitleEvaluation[]
  selected_title: string
  selected_thumbnail_direction: string
  approval_status: 'draft' | 'approved' | 'needs_revision'
  second_brain_summary?: string
}
export type TitleDevelopmentResult =
  | { ok: true; run: TitleDevelopmentRun; fallback_count: number }
  | { ok: false; next_action: string; failed_references: { reference_id: string; reasons: string[] }[] }

// CMO v3 R4 제작 — 원고 초안(도입30초 + 로직블록 + 통합원고 + QA).
export type ScriptDraftResult = {
  intro_30s: {
    first_sentence: string
    hook_type: string
    tension: string
    viewer_promise: string
    script: string
    used_materials: string[]
    used_script_insights: string[]
    why_it_works: string
  }
  logic_blocks: {
    block_id: string
    draft: string
    used_materials: string[]
    used_voc_lines: string[]
    used_claims: string[]
    transition_out: string
    risk_notes: string[]
  }[]
  integrated_script: {
    full_script: string
    section_map: string[]
    removed_repetition: string[]
    added_transitions: string[]
    strategy_alignment_notes: string[]
  }
  qa: {
    strategy_fit_score: number
    audience_fit_score: number
    voice_fit_score: number
    sales_logic_score: number
    fact_safety_score: number
    overall_pass: boolean
    missing_parts: string[]
    revision_requests: string[]
  }
}
export type CmoSaveCardInput = {
  project_id: string
  stage: string
  summary?: string
  data?: unknown
}
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

  // CMO conversational marketing planning — project_id-based (Video Room).
  cmoChatMessage: (
    project_id: string,
    founder_message: string,
    opts?: { business_id?: string | null },
  ) =>
    request<{ data: { ok: boolean; data: CmoChatMessageResult } }>('/api/cmo:chatMessage', {
      method: 'POST',
      body: JSON.stringify({ project_id, founder_message, ...(opts ?? {}) }),
    }).then(r => unwrap(r)) as Promise<CmoChatMessageResult>,

  cmoApprovePlan: (cmo_message_id: string) =>
    request<{ data: { ok: boolean; data: CmoApproveResult } }>('/api/cmo:approvePlan', {
      method: 'POST',
      body: JSON.stringify({ cmo_message_id }),
    }).then(r => unwrap(r)) as Promise<CmoApproveResult>,

  cmoCreateProject: (input: CmoCreateProjectInput) =>
    request<{ data: { ok: boolean; data: { project_id: string; status: string } } }>('/api/cmo:createProject', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(r => unwrap(r)),

  cmoListProjects: () =>
    request<{ data: { ok: boolean; data: { projects: unknown[] } } }>('/api/cmo:listProjects', {
      method: 'POST',
      body: JSON.stringify({}),
    }).then(r => unwrap(r)),

  cmoGetProject: (project_id: string) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/cmo:getProject', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)),

  cmoAdvanceStatus: (project_id: string) =>
    request<{ data: { ok: boolean; data: { status: string } } }>('/api/cmo:advanceStatus', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)),

  cmoDecideGate: (gate_id: string, decision: 'approved' | 'rejected' | 'needs_revision', note?: string) =>
    request<{ data: { ok: boolean; data: { gate_id: string; decision: string; status: string } } }>('/api/cmo:decideGate', {
      method: 'POST',
      body: JSON.stringify({ gate_id, decision, note }),
    }).then(r => unwrap(r)),

  // 새 보드 흐름(R1/R4 등)의 승인 게이트 통과 — pending gate row가 없을 때 사장님 권한으로 전진.
  cmoApproveStageGate: (project_id: string) =>
    request<{ data: { ok: boolean; data: { status: string; gate_id: string } } }>('/api/cmo:approveStageGate', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ status: string; gate_id: string }>,

  cmoSaveCard: (input: CmoSaveCardInput) =>
    request<{ data: { ok: boolean; data: { card_id: string } } }>('/api/cmo:saveCard', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(r => unwrap(r)),

  cmoBuildSlideDeck: (project_id: string, opts?: { design_theme?: string; slides?: unknown[] }) =>
    request<{ data: { ok: boolean; data: { slide_deck_spec_id: string; spec: unknown } } }>('/api/cmo:buildSlideDeck', {
      method: 'POST',
      body: JSON.stringify({ project_id, ...(opts ?? {}) }),
    }).then(r => unwrap(r)),

  cmoSubmitRender: (project_id: string, slide_deck_spec_id: string) =>
    request<{ data: { ok: boolean; data: { render_job_id: string; job: unknown } } }>('/api/cmo:submitRender', {
      method: 'POST',
      body: JSON.stringify({ project_id, slide_deck_spec_id }),
    }).then(r => unwrap(r)),

  cmoRunQA: (project_id: string, render_job_id: string, checks?: Record<string, string>) =>
    request<{ data: { ok: boolean; data: { qa_result_id: string; result: unknown } } }>('/api/cmo:runQA', {
      method: 'POST',
      body: JSON.stringify({ project_id, render_job_id, checks }),
    }).then(r => unwrap(r)),

  cmoCreateUploadDraft: (input: { project_id: string; render_job_id: string; title: string; description?: string; tags?: string[] }) =>
    request<{ data: { ok: boolean; data: { upload_draft_id: string; draft: unknown } } }>('/api/cmo:createUploadDraft', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(r => unwrap(r)),

  // CMO pipeline — new methods (backend agent implementing same contract)
  cmoLoadPTContext: (
    project_id: string,
    source_refs: string[],
    opts?: { business_id?: string; rules?: string[] },
  ) =>
    request<{ data: { ok: boolean; data: { context_loaded: boolean; snapshot: unknown } } }>('/api/cmo:loadPTContext', {
      method: 'POST',
      body: JSON.stringify({ project_id, business_id: opts?.business_id, source_refs, rules: opts?.rules }),
    }).then(r => unwrap(r)),

  cmoAttachVoice: (
    project_id: string,
    file_url: string,
    opts?: { scene_ref?: string; duration_sec?: number },
  ) =>
    request<{ data: { ok: boolean; data: { voice: unknown } } }>('/api/cmo:attachVoice', {
      method: 'POST',
      body: JSON.stringify({ project_id, scene_ref: opts?.scene_ref, file_url, duration_sec: opts?.duration_sec }),
    }).then(r => unwrap(r)),

  cmoCommitStrategyArtifact: (
    project_id: string,
    stage: string,
    payload: unknown,
  ) =>
    request<{ data: { ok: boolean; data: { artifact: unknown } } }>('/api/cmo:commitStrategyArtifact', {
      method: 'POST',
      body: JSON.stringify({ project_id, stage, payload }),
    }).then(r => unwrap(r)),

  cmoSaveScript: (project_id: string, beats: unknown[]) =>
    request<{ data: { ok: boolean; data: { beats: unknown[] } } }>('/api/cmo:saveScript', {
      method: 'POST',
      body: JSON.stringify({ project_id, beats }),
    }).then(r => unwrap(r)),

  cmoSendToFactory: (project_id: string) =>
    request<{ data: { ok: boolean; data: { job_path: string; validated: boolean } } }>('/api/cmo:sendToFactory', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)),

  generateVideoExecutionBrief: (params: { project_id: string; content_card_id: string; [key: string]: unknown }) =>
    request<{ data: { ok: boolean; data: { brief_id: string; brief: unknown; factory_job_url?: string } } }>('/api/cmo:generateVideoExecutionBrief', {
      method: 'POST',
      body: JSON.stringify(params),
    }).then(r => unwrap(r)),

  cmoGetScriptRoomData: (params: { project_id: string; content_card_id: string }) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/cmo:getScriptRoomData', {
      method: 'POST',
      body: JSON.stringify(params),
    }).then(r => unwrap(r)),

  cmoRequestScriptRevision: (params: { project_id: string; content_card_id: string; revision_target: string }) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/cmo:requestScriptRevision', {
      method: 'POST',
      body: JSON.stringify(params),
    }).then(r => unwrap(r)),

  cmoSendBriefToFactory: (params: { project_id: string; content_card_id: string; brief_id?: string; brief: unknown }) =>
    request<{ data: { ok: boolean; data: { factory_result_url?: string } } }>('/api/cmo:sendBriefToFactory', {
      method: 'POST',
      body: JSON.stringify(params),
    }).then(r => unwrap(r)),

  // 상품 정의(승인 단계): Step1~7 분석 + 뷰트랩 검색 키워드. 후보 생성 X.
  cmoProposeProductDefinition: (project_id: string) =>
    request<{ data: { ok: boolean; data: { draft: Record<string, unknown>; viewtrap_keywords: string[]; progress: number } } }>('/api/cmo:proposeProductDefinition', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)),

  // CMO v3 — 키 콘텐츠 기획 보고서(시장성→후보3→판매논리→추천). 상품정의 승인 후.
  cmoProposeKeyContentReport: (project_id: string) =>
    request<{ data: { ok: boolean; data: Record<string, unknown> } }>('/api/cmo:proposeKeyContentReport', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)),

  // CMO v3 — stage guides: { [status]: { label, focus } } for StepProgressRail.
  cmoGetStageGuides: () =>
    request<{ data: { ok: boolean; data: { guides: Record<string, { label: string; focus: string }> } } }>('/api/cmo:getStageGuides', {
      method: 'POST',
      body: JSON.stringify({}),
    }).then(r => unwrap(r)) as Promise<{ guides: Record<string, { label: string; focus: string }> }>,

  // CMO v3 키 콘텐츠 — 자동분석 11스텝 → 서로 다른 주제 후보 3개 + 분석 진행률(0~8) 반환.
  // 상품·고객문제는 프로젝트 생성 시 이미 받았으므로 인자 없이 호출 가능.
  cmoProposeKeyContentDraft: (project_id: string) =>
    request<{ data: { ok: boolean; data: { candidates: KeyContentCandidate[]; progress: number } } }>('/api/cmo:proposeKeyContentDraft', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ candidates: KeyContentCandidate[]; progress: number }>,

  // CMO v3 키 콘텐츠 — 사장님이 후보 1개 선택 → 풀링 입력 확정 + 다음 단계 advance.
  cmoSelectKeyContentCandidate: (project_id: string, candidate_id: string) =>
    request<{ data: { ok: boolean; data: { choice: unknown; status: string | null } } }>('/api/cmo:selectKeyContentCandidate', {
      method: 'POST',
      body: JSON.stringify({ project_id, candidate_id }),
    }).then(r => unwrap(r)) as Promise<{ choice: unknown; status: string | null }>,

  // CMO v3 키 콘텐츠 11스텝 — 사장님 편집본 저장.
  cmoSaveKeyContentStep: (project_id: string, step: string, data: unknown) =>
    request<{ data: { ok: boolean; data: unknown } }>('/api/cmo:saveKeyContentStep', {
      method: 'POST',
      body: JSON.stringify({ project_id, step, data }),
    }).then(r => unwrap(r)),

  // CMO v3 키 콘텐츠 11스텝 — Step8 Viewtrap 검증 제출.
  cmoSubmitViewtrapValidation: (project_id: string, payload: {
    validated_keywords: string[]
    candidate_titles: string[]
    performance_score: 'normal' | 'good' | 'great'
    contribution_score: 'normal' | 'good' | 'great'
    growth_status: 'growing' | 'stalled' | 'unknown'
    channel_value_risk: boolean
    person_value_risk: boolean
  }) =>
    request<{ data: { ok: boolean; data: { validation: { verdict: 'use' | 'watch' | 'reject'; [key: string]: unknown } } } }>('/api/cmo:submitViewtrapValidation', {
      method: 'POST',
      body: JSON.stringify({ project_id, payload }),
    }).then(r => unwrap(r)) as Promise<{ validation: { verdict: 'use' | 'watch' | 'reject'; [key: string]: unknown } }>,

  // CMO v3 키 콘텐츠 11스텝 — Step11 확정.
  cmoCommitKeyContentPlan: (project_id: string, payload: {
    title: string
    thumbnail_promise: string
    intro_direction: string
    body_structure: string[]
    cta: string
  }) =>
    request<{ data: { ok: boolean; data: { approved_topic: unknown } } }>('/api/cmo:commitKeyContentPlan', {
      method: 'POST',
      body: JSON.stringify({ project_id, payload }),
    }).then(r => unwrap(r)) as Promise<{ approved_topic: unknown }>,

  // CMO v3 풀링 — 선택된 키 콘텐츠로 시청자를 끌어오는 풀링 주제 후보 N개 자동 제안.
  // 키 콘텐츠는 이미 택1 확정됨 → 인자는 project_id만. pulling_candidates 카드 upsert.
  cmoProposePullingCandidates: (project_id: string) =>
    request<{ data: { ok: boolean; data: { candidates: PullingCandidate[]; progress?: number } } }>('/api/cmo:proposePullingCandidates', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ candidates: PullingCandidate[]; progress?: number }>,

  // CMO v3 풀링 — 사장님이 풀링 세트를 통째로 승인 → pulling_plan 확정 + 다음(제작) 단계 advance.
  cmoCommitPullingPlan: (project_id: string) =>
    request<{ data: { ok: boolean; data: { key_topic_title: string; pulling_topics: PullingCandidate[] } } }>('/api/cmo:commitPullingPlan', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ key_topic_title: string; pulling_topics: PullingCandidate[] }>,

  // CMO v3 R4 제작 — 확정 키콘텐츠 + 전략 컨텍스트 → 썸네일 후보 N개 자동 제안.
  cmoProposeThumbnailPlanDraft: (project_id: string) =>
    request<{ data: { ok: boolean; data: ThumbnailPlanDraft } }>('/api/cmo:proposeThumbnailPlanDraft', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<ThumbnailPlanDraft>,

  // CMO v3 R4 제작 — 사장님이 썸네일 후보 1개 택1 → thumbnail_choice 확정 + 다음 단계 advance.
  cmoCommitThumbnailPlan: (project_id: string, candidate_id: string) =>
    request<{ data: { ok: boolean; data: { selected: ThumbnailCandidate; status: string | null } } }>('/api/cmo:commitThumbnailPlan', {
      method: 'POST',
      body: JSON.stringify({ project_id, candidate_id }),
    }).then(r => unwrap(r)) as Promise<{ selected: ThumbnailCandidate; status: string | null }>,

  // CMO 제목 디벨롭 8단계 — Viewtrap 레퍼런스 2개 입력 → 교차조합 → 2~8단계 → 평가 → title_development 카드.
  // 레퍼런스 검증 실패 시 { ok:false, failed_references } 반환(추가 레퍼런스 요청). 도메인 로직은 서버(l5-core).
  cmoProposeTitleDevelopment: (
    project_id: string,
    references: TitleDevelopmentReferenceInput[],
    opts?: { pulling_topic?: string; pulling_content_id?: string; target_audience?: string; business_goal?: string; script_summary?: string },
  ) =>
    request<{ data: TitleDevelopmentResult }>('/api/cmo:proposeTitleDevelopment', {
      method: 'POST',
      body: JSON.stringify({ project_id, references, ...(opts ?? {}) }),
    }).then(r => unwrap(r)) as Promise<TitleDevelopmentResult>,

  // CMO v3 R4 제작 — 전략 brief/자료 → 도입30초 + 로직블록 + 통합원고 + QA 초안 자동 생성.
  cmoProposeScriptDraft: (project_id: string) =>
    request<{ data: { ok: boolean; data: ScriptDraftResult } }>('/api/cmo:proposeScriptDraft', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<ScriptDraftResult>,

  // CMO v3 R4 제작 — 사장님 원고 승인 → 다음 단계 advance(script_approval 게이트 전까지).
  cmoCommitScriptDraft: (project_id: string) =>
    request<{ data: { ok: boolean; data: { status: string | null } } }>('/api/cmo:commitScriptDraft', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ status: string | null }>,

  // CMO v3 R7 성과 재학습 — 완료 영상 성과(수동 입력) 기록 + 인사이트 추출.
  cmoRecordVideoPerformance: (
    project_id: string,
    performance_data: { view_count: number; completion_rate: number; ctr: number; retention_notes?: string; feedback?: string },
  ) =>
    request<{ data: { ok: boolean; data: { performance: VideoPerformanceRecord; insights: CompletionInsightCandidate[] } } }>('/api/cmo:recordVideoPerformance', {
      method: 'POST',
      body: JSON.stringify({ project_id, performance_data }),
    }).then(r => unwrap(r)) as Promise<{ performance: VideoPerformanceRecord; insights: CompletionInsightCandidate[] }>,

  cmoGetCompletedVideoInsights: (project_id: string) =>
    request<{ data: { ok: boolean; data: { insights: CompletionInsightCandidate[]; performance: VideoPerformanceRecord | null } } }>('/api/cmo:getCompletedVideoInsights', {
      method: 'POST',
      body: JSON.stringify({ project_id }),
    }).then(r => unwrap(r)) as Promise<{ insights: CompletionInsightCandidate[]; performance: VideoPerformanceRecord | null }>,

  // CMO v3 skill-chain execution — runs CmoOrchestrator with default rule-based selection.
  // D3+ skills pause execution and return pending_skills for founder approval.
  cmoRunContentStrategy: (project_id: string, task?: Record<string, unknown>) =>
    request<{ data: { ok: boolean; data: { skill_results: unknown[]; handler_result: unknown; pending_skills: string[] } } }>('/api/cmo:runContentStrategy', {
      method: 'POST',
      body: JSON.stringify({ project_id, ...(task ? { task } : {}) }),
    }).then(r => unwrap(r)),

  closeInstruction: (id: string) =>
    request<{ data: unknown }>('/api/founder_instructions:update', {
      method: 'POST',
      body: JSON.stringify({ filterByTk: id, values: { status: 'closed' } }),
    }).then(r => r.data),

  updateTaskOutput: (taskId: string, output: Partial<AgentOutputLite>) =>
    request<{ data: unknown }>('/api/agent_tasks:update', {
      method: 'POST',
      body: JSON.stringify({ filterByTk: taskId, values: { output } }),
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

  // Native Orchestration — Claude Code/codex/agy phase 실행 내역을 사업별 task 그룹으로.
  // businessId 규약은 liveStatus와 동일: 특정 id | null→'common' | undefined→생략(전체).
  nativeRuns: (businessId?: string | null) => {
    const params = new URLSearchParams()
    if (businessId !== undefined) params.set('business_id', businessId ?? 'common')
    const qs = params.toString()
    return request<{ data: { ok: boolean; data: BusinessRunGroup[] } }>(
      `/api/monitor:nativeRuns${qs ? `?${qs}` : ''}`
    )
      .then(r => unwrap(r) as BusinessRunGroup[])
      .catch(() => [] as BusinessRunGroup[])
  },

  // P3-3 — control room tree (Business ▸ Project ▸ dev-task)
  controlRoomTree: (businessId?: string) =>
    request<{ data: { ok: boolean; data: ControlRoomBusiness[] } }>(
      `/api/monitor:controlRoomTree${businessId ? `?business_id=${encodeURIComponent(businessId)}` : ''}`
    )
      .then(r => unwrap(r) as ControlRoomBusiness[])
      .catch(() => [] as ControlRoomBusiness[]),

  // PRD §9.1 — retry a task = create a NEW ExecutionRun for it (ACR Kernel owns
  // the run; this is a thin POST). Returns the new run id when ACR is reachable.
  // Resolves to null (never throws) when ACR isn't deployed so the button can
  // surface a soft failure without breaking the Control Room.
  acrRetryRun: (runId: string) =>
    request<{ data: { ok: boolean; data: { run_id?: string } } }>('/api/monitor:retryRun', {
      method: 'POST',
      body: JSON.stringify({ run_id: runId }),
    })
      .then(r => unwrap(r) as { run_id?: string })
      .catch(() => null),

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
