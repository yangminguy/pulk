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
