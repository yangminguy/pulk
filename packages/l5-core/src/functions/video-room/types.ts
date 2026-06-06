// CMO Video Room — domain type contract.
//
// Single source of truth for the Video Room data model, derived verbatim from
// PRD v1.1 §12 (cmo_video_room_prd_v1.1.md). Every backend resource, l5-core
// function module, and founder-ui card imports its types from here so the
// shape never diverges across layers.

// ── Shared enums ──────────────────────────────────────────────────────────

/** Consumer journey stage used across content planning and references. */
export type ConsumerStage = '현상' | '욕구' | '계획' | '행동' | '보상';

export type SourceType = 'notion' | 'second_brain' | 'memory' | 'manual';

export type ApprovalStatus = 'draft' | 'approved' | 'needs_revision';

// ── Full project state machine (PRD §10) ───────────────────────────────────

export type VideoRoomStatus =
  | 'strategy_chat'
  | 'business_pt_context_loading'
  | 'product_defined'
  | 'key_content_ideation'
  | 'viewtrap_key_research'
  | 'key_content_approval'
  | 'viewtrap_pulling_research'
  | 'pulling_content_set_selection'
  | 'pulling_content_set_approval'
  | 'thumbnail_pattern_extraction'
  | 'intro_30s_analysis'
  | 'hook_draft_approval'
  | 'script_planning'
  | 'script_draft'
  | 'script_approval'
  | 'voice_recording'
  | 'slide_deck'
  | 'rendering'
  | 'qa'
  | 'video_qa_approval'
  | 'upload_draft'
  | 'upload_approval'
  | 'completed'
  | 'paused';

export type VideoRoomPage = 'strategy' | 'production' | 'review_publish';

export type BusinessGoal = 'consulting_lead' | 'product_sale' | 'waitlist' | 'brand_growth';

export type VideoProjectType = 'single_video' | 'key_content_set';

// ── 12.1 VideoRoomProject ───────────────────────────────────────────────────
// Note: a separate, simpler `VideoProject` (draft/generating/completed) already
// exists in ../video-project for the raw render lifecycle. This is the
// strategy-workflow project the PRD describes.

export interface VideoRoomProject {
  id: string;
  title: string;
  business_id?: string | null;
  product: string;
  target_audience: string;
  business_goal: BusinessGoal;
  project_type: VideoProjectType;
  status: VideoRoomStatus;
  current_page: VideoRoomPage;
  owner_agent_id: 'cmo';
  created_at: string;
  updated_at: string;
}

// ── 12.0 BusinessPTContextSnapshot ──────────────────────────────────────────

export interface BusinessPTSourceRef {
  source_id: string;
  title: string;
  source_type: SourceType;
  url?: string;
}

export interface BusinessPTContextSnapshot {
  id: string;
  video_project_id: string;
  loaded_at: string;
  source_refs: BusinessPTSourceRef[];
  key_principles: string[];
  key_content_rules: string[];
  pulling_content_rules: string[];
  thumbnail_intro_rules: string[];
  script_structure_rules: string[];
  caution_notes: string[];
  freshness_status: 'fresh' | 'stale' | 'needs_refresh';
}

// ── 7.2 KeyContentCandidate ─────────────────────────────────────────────────

export interface KeyContentCandidate {
  id: string;
  title: string;
  target_problem: string;
  consumer_stages: ConsumerStage[];
  sales_logic: string;
  cta: string;
  why_this_can_sell: string;
  research_status: 'not_researched' | 'researching' | 'validated' | 'rejected';
}

// ── 7.4 SelectedKeyContent ──────────────────────────────────────────────────

export interface SelectedKeyContent {
  id: string;
  title: string;
  core_problem: string;
  consumer_stages: ConsumerStage[];
  sales_logic: string;
  cta: string;
  selected_reason: string;
  viewtrap_evidence: ViewtrapReference[];
  approval_status: ApprovalStatus;
}

// ── 12.2 KeyContentSet ──────────────────────────────────────────────────────

export interface KeyContentSet {
  id: string;
  video_project_id: string;
  product: string;
  target_audience: string;
  selected_key_content_id: string;
  pulling_content_ids: string[];
  funnel_logic: string;
  approval_status: ApprovalStatus;
}

// ── 12.3 ViewtrapResearchSession ────────────────────────────────────────────

export const VIEWTRAP_URL = 'https://app.viewtrap.com/video-search' as const;

export interface ViewtrapResearchSession {
  id: string;
  video_project_id: string;
  research_type: 'key_content' | 'pulling_content' | 'thumbnail' | 'intro_30s';
  viewtrap_url: typeof VIEWTRAP_URL;
  search_keywords: string[];
  browser_session_ref?: string;
  status: 'not_started' | 'researching' | 'completed' | 'needs_more_research';
  findings_summary: string;
  created_at: string;
  completed_at?: string;
}

// ── 12.4 ReferenceCandidate ─────────────────────────────────────────────────

export interface ReferenceCandidate {
  id: string;
  research_session_id: string;
  title: string;
  url: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  view_count?: number;
  subscriber_count?: number;
  uploaded_at?: string;
  recent_growth_signal?: 'low' | 'medium' | 'high';
  contribution_score?: number;
  thumbnail_ref?: string;
  consumer_stage: ConsumerStage;
  selected_for:
    | 'key_content'
    | 'pulling_content'
    | 'thumbnail_pattern'
    | 'intro_pattern'
    | 'script_structure';
  selection_reason: string;
}

// ── 7.7 ViewtrapReference (reference attached to a content plan) ─────────────

export interface ViewtrapReference {
  id: string;
  content_plan_id: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  title: string;
  url: string;
  channel_name?: string;
  subscriber_count?: number;
  view_count?: number;
  uploaded_at?: string;
  recent_view_growth?: string;
  contribution_score?: number;
  selected_reason: string;
  consumer_stage: ConsumerStage;
  thumbnail_image_ref?: string;
}

// ── 12.5 PullingContentSet ──────────────────────────────────────────────────

export interface PullingContentPlan {
  id: string;
  order: 1 | 2 | 3 | 4 | 5;
  role: '문제 인식' | '문제 심화' | '욕구 형성' | '계획 진입' | '키 콘텐츠 브릿지';
  consumer_stage: ConsumerStage;
  title: string;
  purpose: string;
  bridge_to_key: string;
}

export interface PullingContentSet {
  id: string;
  key_content_id: string;
  pulling_contents: PullingContentPlan[];
  set_logic: string;
  funnel_coverage: {
    phenomenon: string[];
    desire: string[];
    plan: string[];
    action_bridge: string;
  };
  approval_status: ApprovalStatus;
}

// ── 12.6 ThumbnailPattern ───────────────────────────────────────────────────

export type ThumbnailHookType =
  | 'loss'
  | 'gain'
  | 'curiosity'
  | 'warning'
  | 'authority'
  | 'result'
  | 'contrast';

export interface ThumbnailPattern {
  id: string;
  reference_video_id: string;
  raw_thumbnail_text: string;
  hook_type: ThumbnailHookType;
  structure: string;
  reusable_formula: string;
  adapted_thumbnail_candidates: string[];
}

// ── 12.7 Intro30sAnalysis ───────────────────────────────────────────────────

export interface AppliedInsight {
  insight: string;
  how_applied: string;
}

export interface Intro30sComposition {
  id: string;
  key_content_title: string;
  intro_script_30s: string;
  first_sentence: string;
  hook_structure: string;
  promise: string;
  curiosity_gap: string;
  applied_insights: AppliedInsight[];
}

export interface Intro30sAnalysis {
  id: string;
  reference_video_id: string;
  transcript_30s: string;
  first_sentence: string;
  hook_structure: string;
  tension_device: string;
  viewer_identity_called: string;
  promise_made: string;
  curiosity_gap: string;
  reusable_intro_formula: string;
  adapted_intro_candidates: string[];
}

// ── 12.8 SecondBrainInsightMerge ────────────────────────────────────────────

export interface SecondBrainInsightMerge {
  id: string;
  content_plan_id: string;
  retrieved_insights: {
    source_id: string;
    title: string;
    insight: string;
    usage: 'hook' | 'logic' | 'example' | 'sales_argument' | 'cta';
  }[];
  applied_to_thumbnail: string[];
  applied_to_intro: string[];
  applied_to_script_structure: string[];
}

// ── 12.9 ContentApprovalGate ────────────────────────────────────────────────
// Distinct from the risk-based ContentApprovalGate in ../approval.ts; this is
// the founder decision gate that drives the Video Room workflow.

export type VideoRoomGateType =
  | 'key_content_approval'
  | 'pulling_content_set_approval'
  | 'hook_draft_approval'
  | 'script_approval'
  | 'video_qa_approval'
  | 'upload_approval';

export type VideoRoomGateStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

export interface VideoRoomApprovalGate {
  id: string;
  video_project_id: string;
  gate_type: VideoRoomGateType;
  page: VideoRoomPage;
  title: string;
  context: string;
  options: string[];
  recommended_option?: string;
  status: VideoRoomGateStatus;
  decided_by?: 'founder' | 'ceo';
  decided_at?: string;
}

// ── 12.10 SlideDeckSpec ─────────────────────────────────────────────────────

export type SlideVisualType =
  | 'text'
  | 'comparison'
  | 'framework'
  | 'quote'
  | 'checklist'
  | 'bridge'
  | 'cta';

export interface SlideSpec {
  index: number;
  start_time?: number;
  end_time?: number;
  headline: string;
  body?: string;
  visual_type: SlideVisualType;
  speaker_text: string;
  animation_hint?: string;
}

export interface VideoRoomSlideDeckSpec {
  id: string;
  video_project_id: string;
  script_draft_id: string;
  voice_recording_id: string;
  aspect_ratio: '16:9' | '9:16';
  design_theme: string;
  slides: SlideSpec[];
}

// ── 12.11 RenderJob ─────────────────────────────────────────────────────────

export interface RenderJob {
  id: string;
  video_project_id: string;
  slide_deck_spec_id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  output_video_ref?: string;
  thumbnail_ref?: string;
  qa_report_ref?: string;
  youtube_metadata_ref?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// ── 12.12 VideoQAResult ─────────────────────────────────────────────────────

export type QACheckResult = 'pass' | 'fail';

export interface VideoQAResult {
  id: string;
  video_project_id: string;
  render_job_id: string;
  checks: {
    business_pt_structure: QACheckResult;
    pulling_to_key_bridge: QACheckResult;
    script_matches_approved_draft: QACheckResult;
    slide_readability: QACheckResult;
    audio_sync: QACheckResult;
    visual_quality: QACheckResult;
    upload_metadata_ready: QACheckResult;
  };
  overall_status: 'pass' | 'needs_revision';
  notes?: string;
}

// ── UploadDraft (PRD §9.6) ──────────────────────────────────────────────────

export interface UploadDraft {
  id: string;
  video_project_id: string;
  render_job_id: string;
  title: string;
  description: string;
  tags: string[];
  visibility: 'private' | 'unlisted' | 'public';
  thumbnail_ref?: string;
  scheduled_at?: string;
  approval_status: VideoRoomGateStatus;
}

// ── Script production types (PRD §8) ────────────────────────────────────────

export interface ScriptPlan {
  id: string;
  video_project_id: string;
  approved_title: string;
  sections: string[];
}

export interface ScriptDraft {
  id: string;
  video_project_id: string;
  script_plan_id: string;
  full_script: string;
  approval_status: ApprovalStatus;
}

export interface ReadingScript {
  id: string;
  video_project_id: string;
  script_draft_id: string;
  slides: { slide: number; lines: string[]; emphasis?: string[] }[];
}

export interface VoiceRecording {
  id: string;
  video_project_id: string;
  file_ref: string | null;
  duration_seconds?: number;
  quality_status: 'unchecked' | 'pass' | 'needs_rerecording';
}

// ── CMO / Script Room v3.1 — Contract Types ───────────────────────────────
// Appended per PRD v3.1 + CMO_TO_FACTORY_CONTRACT.md (2026-06-06).
// All types below are append-only; nothing above is modified.

// ── ConsumerStage English mapping ──────────────────────────────────────────

/** English enum for brief contracts (Factory uses en values). */
export type ConsumerStageEn = 'phenomenon' | 'desire' | 'plan' | 'action' | 'reward';

/** Maps Korean ConsumerStage values to the English equivalents used in briefs. */
export const CONSUMER_STAGE_EN: Record<ConsumerStage, ConsumerStageEn> = {
  '현상': 'phenomenon',
  '욕구': 'desire',
  '계획': 'plan',
  '행동': 'action',
  '보상': 'reward',
} as const;

// ── Research Packs (PRD §3) ────────────────────────────────────────────────

/** PRD §3.1 Market Research Pack */
export interface MarketResearchPack {
  topic: string;
  why_this_topic_matters: string;
  market_context: string[];
  competitor_content_patterns: string[];
  unanswered_questions: string[];
  common_misunderstandings: string[];
  example_materials: string[];
  content_opportunities: string[];
}

/** PRD §3.2 Voice of Customer Pack */
export interface VoiceOfCustomerPack {
  repeated_phrases: string[];
  pain_expressions: string[];
  desire_expressions: string[];
  objection_expressions: string[];
  realistic_situations: string[];
  must_use_language: string[];
  avoid_language: string[];
}

/** PRD §3.3 Claim Evidence Report */
export interface ClaimEvidenceReport {
  safe_claims: string[];
  risky_claims: string[];
  unverified_claims: string[];
  safe_wording: string[];
  proof_points: string[];
  claims_to_avoid: string[];
}

/** PRD §3.4 Audience Fit Report */
export interface AudienceFitReport {
  overall_score: number;
  pain_fit: number;
  desire_fit: number;
  language_fit: number;
  curiosity_fit: number;
  trust_fit: number;
  action_fit: number;
  what_target_wants_to_hear: string[];
  what_target_does_not_want_to_hear: string[];
  must_answer_questions: string[];
  recommended_angle: string;
}

/** PRD §3.5 Script Material Pack */
export interface ScriptMaterialPack {
  topic: string;
  target_viewer: string;
  core_message_candidates: string[];
  viewer_language: string[];
  pain_scenes: string[];
  desire_scenes: string[];
  proof_points: string[];
  examples: string[];
  counterarguments: string[];
  metaphors: string[];
  story_candidates: string[];
  must_use_lines: string[];
  must_avoid_lines: string[];
  safe_claims: string[];
  cta_materials: string[];
}

// ── CMO Video Strategy Brief (PRD §4) ────────────────────────────────────

/** A single logic block within the CMO Video Strategy Brief. */
export interface LogicBlock {
  block_id: string;
  role: string;
  covered_stages: ConsumerStageEn[];
  main_claim: string;
  supporting_materials: string[];
  viewer_emotion: string;
  transition_to_next_block: string;
  visual_intent_hint?: string;
}

/** PRD §4 CMO Video Strategy Brief */
export interface CmoVideoStrategyBrief {
  content_id: string;
  content_type: 'key' | 'pulling';
  topic: string;
  channel_context: {
    current_position: string;
    content_pillar: string;
    role_in_content_set: string;
    bridge_from_previous_content: string;
    bridge_to_next_content: string;
  };
  target_viewer: {
    who: string;
    current_belief: string;
    hidden_desire: string;
    main_pain: string;
    objection: string;
    language_style: string[];
  };
  consumer_desire_coverage: {
    covered_stages: ConsumerStageEn[];
    primary_stage: ConsumerStageEn;
    stage_explanation: string;
  };
  video_promise: string;
  core_message: string;
  strategic_angle: string;
  logic_blocks: LogicBlock[];
  intro_direction: string;
  thumbnail_direction: string;
  script_tone_direction: string;
  cta: string;
  risk_notes: string[];
}

// ── Content Set Validation (PRD §8) ───────────────────────────────────────

/** Single content entry within the validation matrix. */
export interface ContentSetEntry {
  content_id: string;
  content_type: 'key' | 'pulling';
  title: string;
  covered_stages: ConsumerStageEn[];
  primary_stage: ConsumerStageEn;
  bridge_to_key: string;
}

/** PRD §8 Content Set Validation Matrix */
export interface ContentSetValidation {
  contents: ContentSetEntry[];
  stage_coverage: Record<ConsumerStageEn, string[]>;
  sequence_logic: {
    is_sequential: boolean;
    explanation: string;
  };
  missing_stages: ConsumerStageEn[];
  overlap_risk: string[];
  revision_needed: boolean;
}

// ── Script Room types (PRD §5) ────────────────────────────────────────────

/** PRD §5.1 Intro 30s output */
export interface Intro30s {
  first_sentence: string;
  hook_type: string;
  tension: string;
  viewer_promise: string;
  script: string;
  used_materials: string[];
  used_script_insights: string[];
  why_it_works: string;
}

/** PRD §5.2 Logic Block Writer output (one block's draft) */
export interface ScriptPart {
  block_id: string;
  draft: string;
  used_materials: string[];
  used_voc_lines: string[];
  used_claims: string[];
  transition_out: string;
  risk_notes: string[];
}

/** PRD §5.3 Script Integrator output */
export interface IntegratedScript {
  full_script: string;
  section_map: string[];
  removed_repetition: string[];
  added_transitions: string[];
  strategy_alignment_notes: string[];
}

/** PRD §5.4 Founder Voice Agent output */
export interface VoiceMatchedScript {
  full_script: string;
  voice_profile_used: Record<string, unknown>;
  changed_phrases: string[];
  preserved_logic: boolean;
}

/** PRD §6 CMO Script QA Report */
export interface ScriptQaReport {
  strategy_fit_score: number;
  audience_fit_score: number;
  voice_fit_score: number;
  sales_logic_score: number;
  fact_safety_score: number;
  desire_stage_coverage: Record<ConsumerStageEn, boolean>;
  logic_block_alignment: string[];
  missing_parts: string[];
  revision_requests: string[];
  overall_pass: boolean;
}

// ── Thumbnail Plan (PRD §12 / agent 8) ───────────────────────────────────

/** Thumbnail candidate plan produced by Thumbnail Strategy Agent. */
export interface ThumbnailPlan {
  content_id: string;
  thumbnail_direction: string;
  candidates: {
    candidate_id: string;
    headline_text: string;
    hook_type: ThumbnailHookType;
    visual_concept: string;
    used_insight_ids: string[];
  }[];
  selected_candidate_id?: string;
  approval_status: ApprovalStatus;
}

// ── VideoExecutionBrief (CMO_TO_FACTORY_CONTRACT.md §1–7) ─────────────────

/** A single logic block as it appears in the VideoExecutionBrief.
 *  scene_type / best_medium / duration are intentionally absent. */
export interface BriefLogicBlock {
  block_id: string;
  role: string;
  speaker_text: string;
  communication_goal: string;
  viewer_reaction_target: string;
  required_evidence?: string[];
  visual_intent_hint?: string;
}

/** Preferred asset type for asset requests. */
export type PreferredAssetType =
  | 'face_video'
  | 'screen_work'
  | 'reference_image'
  | 'source_screenshot'
  | 'reference_video';

/** VideoExecutionBrief — the single contract document CMO hands to AI Slide Factory.
 *  schema_version is fixed to 'cmo_to_factory_v2'.
 *  Forbidden fields (scene_type, best_medium, duration, timeline, scenes) are absent by design. */
export interface VideoExecutionBrief {
  schema_version: 'cmo_to_factory_v2';
  content_card_id: string;
  content_type: 'key' | 'pulling';
  title: string;
  target_viewer: {
    who: string;
    knowledge_level: string;
    pain: string;
    desired_reaction: string;
  };
  strategy: {
    core_message: string;
    covered_stages: ConsumerStageEn[];
    role_in_content_set: string;
    bridge_to_key_content?: string;
  };
  script: {
    full_script: string;
    intro_30s: string;
    logic_blocks: BriefLogicBlock[];
  };
  source_materials: {
    market_research_pack_id?: string;
    voc_pack_id?: string;
    claim_evidence_report_id?: string;
    script_material_pack_id?: string;
    used_insights: {
      thumbnail?: string[];
      script?: string[];
      founder_voice?: string[];
    };
  };
  asset_requests?: {
    need: string;
    preferred_asset_type: PreferredAssetType;
    reason: string;
  }[];
  constraints: {
    tone: string;
    avoid?: string[];
    format: 'youtube_16_9' | 'shorts_9_16';
  };
}

// ── Content Card status enums (PRD §11 / agent 18 workflow) ───────────────

/** Research phase status for a Content Card. */
export enum ResearchStatus {
  NotStarted = 'not_started',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

/** Strategy brief phase status for a Content Card. */
export enum StrategyBriefStatus {
  NotStarted = 'not_started',
  Drafting = 'drafting',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  NeedsRevision = 'needs_revision',
}

/** Script phase status for a Content Card. */
export enum ScriptStatus {
  NotStarted = 'not_started',
  Writing = 'writing',
  QaPending = 'qa_pending',
  QaPassed = 'qa_passed',
  QaFailed = 'qa_failed',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
}

/** Video generation phase status for a Content Card. */
export enum VideoGenStatus {
  NotStarted = 'not_started',
  BriefReady = 'brief_ready',
  SentToFactory = 'sent_to_factory',
  Rendering = 'rendering',
  Completed = 'completed',
  Failed = 'failed',
}

/** CMO Content Card — tracks one content item through the full v3.1 workflow.
 *  Reuses ConsumerStage (Korean) and ApprovalStatus from existing types. */
export interface CmoContentCard {
  id: string;
  video_project_id: string;
  content_type: 'key' | 'pulling';
  title: string;
  covered_stages: ConsumerStage[];
  primary_stage: ConsumerStage;
  research_status: ResearchStatus;
  strategy_brief_status: StrategyBriefStatus;
  script_status: ScriptStatus;
  video_gen_status: VideoGenStatus;
  approval_status: ApprovalStatus;
  video_execution_brief_id?: string;
  created_at: string;
  updated_at: string;
}

// ── Revision Router (PRD §16.15) ──────────────────────────────────────────

/** Agent targets that the Revision Router can send QA failures back to. */
export enum RevisionTarget {
  MarketResearchAgent = 'market_research_agent',
  VocResearchAgent = 'voc_research_agent',
  ClaimVerificationAgent = 'claim_verification_agent',
  AudienceFitValidator = 'audience_fit_validator',
  ScriptMaterialPackBuilder = 'script_material_pack_builder',
  CmoStrategyAgent = 'cmo_strategy_agent',
  ThumbnailStrategyAgent = 'thumbnail_strategy_agent',
  IntroWriter = 'intro_writer',
  LogicBlockWriterA = 'logic_block_writer_a',
  LogicBlockWriterB = 'logic_block_writer_b',
  LogicBlockWriterC = 'logic_block_writer_c',
  ScriptIntegrator = 'script_integrator',
  FounderVoiceAgent = 'founder_voice_agent',
  CmoScriptQaAgent = 'cmo_script_qa_agent',
  ContentSetValidator = 'content_set_validator',
  VideoExecutionBriefBuilder = 'video_execution_brief_builder',
}
