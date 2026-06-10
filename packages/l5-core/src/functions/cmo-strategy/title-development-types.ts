/**
 * 제목 디벨롭 8단계 워크플로우 타입 (PRD §19, docs/prd/cmo-title-development.md)
 *
 * WO-1: 타입은 PRD §19.1~19.5 정의 그대로 유지한다. 필드 추가/이름 변경 금지.
 */

export type ViewtrapGrade = 'Good' | 'Great';

export type TitleReferenceSimilarity = 'exact' | 'expanded_same_meaning';

export interface TitleDevelopmentReference {
  id: string;
  research_session_id: string;
  source: 'viewtrap' | 'youtube' | 'manual';
  url?: string;

  title: string;
  thumbnail_text: string;
  thumbnail_structure: string;
  topic: string;

  view_count: number;
  performance_grade: ViewtrapGrade;
  contribution_grade: ViewtrapGrade;

  topic_similarity: TitleReferenceSimilarity;
  similarity_reason: string;
  selected_reason: string;
}

export type CombinationType =
  | 'ref1_thumbnail_ref2_title'
  | 'ref1_title_ref2_thumbnail'
  | 'ref1_thumbnail_text_as_title_ref2_thumbnail'
  | 'ref2_thumbnail_text_as_title_ref1_thumbnail';

export interface TitleThumbnailCombination {
  id: string;
  combination_type: CombinationType;

  title_source_ref_id: string;
  thumbnail_source_ref_id: string;

  title_draft: string;
  thumbnail_text_draft: string;
  thumbnail_direction: string;

  awkwardness_score: number;
  awkwardness_reason?: string;

  passed: boolean;
  selected_for_next_step: boolean;
}

export type TitleDevelopmentStepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface TitleDevelopmentStepResult {
  step_number: TitleDevelopmentStepNumber;
  step_name: string;

  input_titles: string[];
  output_titles: string[];

  method_explanation: string;
  cmo_reasoning: string;

  rejected_titles: {
    title: string;
    reason: string;
  }[];

  selected_titles_for_next_step: string[];
}

export interface FinalTitleEvaluation {
  title: string;
  thumbnail_direction: string;

  target_fit: number;
  desire_clarity: number;
  problem_sharpness: number;
  curiosity_gap: number;
  script_match: number;
  thumbnail_fit: number;

  total_score: number;

  recommendation: 'upload_candidate' | 'revise' | 'rerun_reference_search';

  reason: string;
  risks: string[];
  required_script_additions?: string[];
}

export interface TitleDevelopmentWorkflowRun {
  id: string;
  video_project_id: string;
  pulling_content_id: string;

  pulling_topic: string;
  target_audience: string;
  business_goal?: string;

  exact_search_terms: string[];
  expanded_search_terms: string[];
  forbidden_search_terms: string[];

  references: [TitleDevelopmentReference, TitleDevelopmentReference];

  combinations: TitleThumbnailCombination[];

  step_results: TitleDevelopmentStepResult[];

  final_candidates: FinalTitleEvaluation[];

  selected_title: string;
  selected_thumbnail_direction: string;

  approval_status: 'draft' | 'approved' | 'needs_revision';

  second_brain_summary?: string;

  created_at: string;
  updated_at: string;
}
