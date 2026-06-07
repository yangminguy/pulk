// Mirror types for CMO / Script Room v3.1 — do NOT import from @l5/core directly.
// Contract reference: docs/CMO_TO_FACTORY_CONTRACT.md (cmo_to_factory_v2)

export type ContentType = 'key' | 'pulling'

export type ConsumerStage = 'phenomenon' | 'desire' | 'plan' | 'action' | 'reward'

// Per-card pipeline status badges
export type ContentCardStatus =
  | 'idle'
  | 'research'
  | 'strategy'
  | 'script'
  | 'qa'
  | 'video'
  | 'done'
  | 'error'

export type ThumbnailCandidate = {
  hook_text: string
  image_url?: string
  rationale?: string
}

export type ContentCard = {
  id: string
  content_type: ContentType
  /** "pulling_1" | "pulling_2" | ... "pulling_5" | "key" */
  slot: string
  title: string
  covered_stages: ConsumerStage[]
  primary_stage?: ConsumerStage
  status: ContentCardStatus
  thumbnail_candidates?: ThumbnailCandidate[]
  /** Factory result link once video_execution_brief has been sent */
  factory_result_url?: string
  /** Populated after generateVideoExecutionBrief succeeds */
  brief_id?: string
}

// VideoExecutionBrief — CMO → Factory contract (cmo_to_factory_v2)
// Only fields the UI needs to display / send. Full schema in CMO_TO_FACTORY_CONTRACT.md.
export type LogicBlock = {
  block_id: string
  role: string
  speaker_text: string
  communication_goal: string
  viewer_reaction_target: string
  required_evidence?: string[]
  visual_intent_hint?: string
}

export type AssetRequest = {
  need: string
  preferred_asset_type: 'face_video' | 'screen_work' | 'reference_image' | 'source_screenshot' | 'reference_video'
  reason: string
}

export type VideoExecutionBrief = {
  schema_version: 'cmo_to_factory_v2'
  content_card_id: string
  content_type: ContentType
  title: string
  target_viewer: {
    who: string
    knowledge_level: string
    pain: string
    desired_reaction: string
  }
  strategy: {
    core_message: string
    covered_stages: ConsumerStage[]
    role_in_content_set: string
    bridge_to_key_content?: string
  }
  script: {
    full_script: string
    intro_30s: string
    logic_blocks: LogicBlock[]
  }
  source_materials?: {
    market_research_pack_id?: string
    voc_pack_id?: string
    claim_evidence_report_id?: string
    script_material_pack_id?: string
    used_insights?: {
      thumbnail?: string[]
      script?: string[]
      founder_voice?: string[]
    }
  }
  asset_requests?: AssetRequest[]
  constraints: {
    tone: string
    avoid?: string[]
    format: 'youtube_16_9' | 'shorts_9_16'
  }
}

// API response shape for cmo:generateVideoExecutionBrief
export type GenerateBriefResult = {
  brief_id: string
  brief: VideoExecutionBrief
  factory_job_url?: string
}

// ── Research Room — typed pack shapes (props for ResearchRoomPanel) ───────────

export type MarketResearchPack = {
  topic?: string
  why_this_topic_matters?: string
  market_context?: string[]
  competitor_content_patterns?: string[]
  unanswered_questions?: string[]
  common_misunderstandings?: string[]
  example_materials?: string[]
  content_opportunities?: string[]
  score?: number
  sources?: string[]
  gate1_pass?: boolean
}

export type VoiceOfCustomerPack = {
  repeated_phrases?: string[]
  pain_expressions?: string[]
  desire_expressions?: string[]
  objection_expressions?: string[]
  realistic_situations?: string[]
  must_use_language?: string[]
  avoid_language?: string[]
  score?: number
  sources?: string[]
  gate1_pass?: boolean
}

export type ClaimEvidenceReport = {
  safe_claims?: string[]
  risky_claims?: string[]
  unverified_claims?: string[]
  safe_wording?: string[]
  proof_points?: string[]
  claims_to_avoid?: string[]
  score?: number
  sources?: string[]
  gate1_pass?: boolean
}

export type AudienceFitReport = {
  overall_score?: number
  pain_fit?: number
  desire_fit?: number
  language_fit?: number
  curiosity_fit?: number
  trust_fit?: number
  action_fit?: number
  what_target_wants_to_hear?: string[]
  what_target_does_not_want_to_hear?: string[]
  must_answer_questions?: string[]
  recommended_angle?: string
  sources?: string[]
  gate1_pass?: boolean
}

export type ScriptMaterialPack = {
  topic?: string
  target_viewer?: string
  core_message_candidates?: string[]
  viewer_language?: string[]
  pain_scenes?: string[]
  desire_scenes?: string[]
  proof_points?: string[]
  examples?: string[]
  counterarguments?: string[]
  metaphors?: string[]
  story_candidates?: string[]
  must_use_lines?: string[]
  must_avoid_lines?: string[]
  safe_claims?: string[]
  cta_materials?: string[]
  score?: number
  sources?: string[]
  gate1_pass?: boolean
}

// ── CMO Video Strategy Brief — typed shape (props for StrategyBriefPanel) ─────

export type CmoLogicBlock = {
  block_id: string
  role: string
  covered_stages: ConsumerStage[]
  main_claim: string
  supporting_materials?: string[]
  viewer_emotion?: string
  transition_to_next_block?: string
  visual_intent_hint?: string
}

export type CmoVideoStrategyBrief = {
  content_id?: string
  content_type?: ContentType
  topic?: string
  channel_context?: {
    current_position?: string
    content_pillar?: string
    role_in_content_set?: string
    bridge_from_previous_content?: string
    bridge_to_next_content?: string
  }
  target_viewer?: {
    who?: string
    current_belief?: string
    hidden_desire?: string
    main_pain?: string
    objection?: string
    language_style?: string[]
  }
  consumer_desire_coverage?: {
    covered_stages: ConsumerStage[]
    primary_stage?: string
    stage_explanation?: string
  }
  video_promise?: string
  core_message?: string
  strategic_angle?: string
  logic_blocks?: CmoLogicBlock[]
  intro_direction?: string
  thumbnail_direction?: string
  script_tone_direction?: string
  cta?: string
  risk_notes?: string[]
}

// Research Room panel data shapes (display only — agent writes these)
export type ResearchRoomData = {
  market_research_pack?: MarketResearchPack
  voice_of_customer_pack?: VoiceOfCustomerPack
  claim_evidence_report?: ClaimEvidenceReport
  audience_fit_report?: AudienceFitReport
  script_material_pack?: ScriptMaterialPack
}

export type StrategyBriefData = {
  cmo_video_strategy_brief?: CmoVideoStrategyBrief
}

export type ScriptRoomData = {
  intro_30s?: unknown
  integrated_script?: unknown
  voice_matched_script?: unknown
  script_qa_report?: unknown
}

export type VideoExecutionBriefData = {
  brief?: VideoExecutionBrief
  brief_id?: string
  factory_result_url?: string
}

// Tab IDs for the right panel
export type ScriptRoomTab = 'research' | 'strategy' | 'script' | 'video_brief'

// ── ScriptRoomPanel types ─────────────────────────────────────────────────────

export type RevisionRequest = {
  target: string   // e.g. "intro_writer", "logic_block_writer_a"
  reason: string
}

export type ScriptQaReport = {
  strategy_fit_score: number
  audience_fit_score: number
  voice_fit_score: number
  sales_logic_score: number
  fact_safety_score: number
  desire_stage_coverage?: Partial<Record<ConsumerStage, boolean>>
  logic_block_alignment?: string[]
  missing_parts?: string[]
  revision_requests?: RevisionRequest[]
  overall_pass: boolean
}

export type ScriptRoomPanelData = {
  intro_30s?: {
    first_sentence?: string
    script?: string
    hook_type?: string
    tension?: string
    viewer_promise?: string
    why_it_works?: string
  }
  logic_block_drafts?: Array<{
    block_id: string
    role?: string
    draft: string
    used_materials?: string[]
    used_voc_lines?: string[]
  }>
  integrated_script?: {
    full_script: string
    section_map?: string[]
    removed_repetition?: string[]
    added_transitions?: string[]
  }
  voice_matched_script?: {
    full_script: string
    changed_phrases?: string[]
    preserved_logic?: boolean
  }
  script_qa_report?: ScriptQaReport
}

// ── VideoExecutionBriefPanel types ────────────────────────────────────────────

export const BRIEF_FORBIDDEN_FIELDS = [
  'scene_type',
  'best_medium',
  'bestMedium',
  'duration',
  'timeline',
  'timeline_json',
  'scenes',
  'message_unit_id',
] as const

export type BriefForbiddenField = (typeof BRIEF_FORBIDDEN_FIELDS)[number]

export type BriefValidationResult = {
  valid: boolean
  errors: string[]
  forbidden_found: BriefForbiddenField[]
}

export function validateVideoExecutionBrief(brief: unknown): BriefValidationResult {
  const errors: string[] = []
  const forbidden_found: BriefForbiddenField[] = []

  if (!brief || typeof brief !== 'object') {
    return { valid: false, errors: ['brief is not an object'], forbidden_found }
  }

  const b = brief as Record<string, unknown>

  if (b['schema_version'] !== 'cmo_to_factory_v2') {
    errors.push("schema_version must be 'cmo_to_factory_v2'")
  }

  for (const f of ['schema_version', 'content_card_id', 'content_type', 'title']) {
    if (!b[f]) errors.push(`missing required field: ${f}`)
  }

  const tv = b['target_viewer'] as Record<string, unknown> | undefined
  for (const f of ['who', 'knowledge_level', 'pain', 'desired_reaction']) {
    if (!tv?.[f]) errors.push(`missing required field: target_viewer.${f}`)
  }

  const strategy = b['strategy'] as Record<string, unknown> | undefined
  for (const f of ['core_message', 'covered_stages', 'role_in_content_set']) {
    if (!strategy?.[f]) errors.push(`missing required field: strategy.${f}`)
  }

  const script = b['script'] as Record<string, unknown> | undefined
  for (const f of ['full_script', 'intro_30s', 'logic_blocks']) {
    if (!script?.[f]) errors.push(`missing required field: script.${f}`)
  }

  if (Array.isArray(script?.['logic_blocks'])) {
    const blocks = script!['logic_blocks'] as Record<string, unknown>[]
    if (blocks.length < 1) {
      errors.push('script.logic_blocks must have at least 1 block')
    }
    for (const block of blocks) {
      if (!block['block_id']) errors.push('logic_block missing block_id')
      if (!block['communication_goal']) errors.push(`logic_block ${String(block['block_id'])} missing communication_goal`)
      if (!block['viewer_reaction_target']) errors.push(`logic_block ${String(block['block_id'])} missing viewer_reaction_target`)
      for (const ff of BRIEF_FORBIDDEN_FIELDS) {
        if (ff in block && block[ff] !== null && block[ff] !== undefined && !forbidden_found.includes(ff)) {
          forbidden_found.push(ff)
        }
      }
    }
  } else if (script?.['logic_blocks'] !== undefined) {
    errors.push('script.logic_blocks must be array')
  }

  const constraints = b['constraints'] as Record<string, unknown> | undefined
  for (const f of ['tone', 'format']) {
    if (!constraints?.[f]) errors.push(`missing required field: constraints.${f}`)
  }

  for (const ff of BRIEF_FORBIDDEN_FIELDS) {
    if (ff in b && b[ff] !== null && b[ff] !== undefined && !forbidden_found.includes(ff)) {
      forbidden_found.push(ff)
    }
  }

  for (const ff of forbidden_found) {
    errors.push(`forbidden field present: ${ff}`)
  }

  return { valid: errors.length === 0, errors, forbidden_found }
}
