import { ThumbnailPattern, ThumbnailHookType, Intro30sAnalysis, AppliedInsight, Intro30sComposition } from './types';

// ── helpers ────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

// ── ThumbnailPattern ───────────────────────────────────────────────────────

export interface ExtractThumbnailPatternInput {
  id: string;
  reference_video_id: string;
  raw_thumbnail_text: string;
  hook_type: ThumbnailHookType;
  structure: string;
  reusable_formula: string;
  adapted_thumbnail_candidates: string[];
}

export function extractThumbnailPattern(input: ExtractThumbnailPatternInput): ThumbnailPattern {
  if (!input.reference_video_id || input.reference_video_id.trim() === '') {
    throw new Error('레퍼런스 영상 없이 썸네일 구조 분석 금지');
  }

  return {
    id: input.id,
    reference_video_id: input.reference_video_id.trim(),
    raw_thumbnail_text: input.raw_thumbnail_text,
    hook_type: input.hook_type,
    structure: input.structure,
    reusable_formula: input.reusable_formula,
    adapted_thumbnail_candidates: input.adapted_thumbnail_candidates,
  };
}

// ── Intro30sAnalysis ───────────────────────────────────────────────────────

export interface AnalyzeIntro30sInput {
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

export function analyzeIntro30s(input: AnalyzeIntro30sInput): Intro30sAnalysis {
  requireNonEmpty(input.transcript_30s, '초반30초 분석 없이 도입부 작성 금지');

  return {
    id: input.id,
    reference_video_id: input.reference_video_id,
    transcript_30s: input.transcript_30s.trim(),
    first_sentence: input.first_sentence,
    hook_structure: input.hook_structure,
    tension_device: input.tension_device,
    viewer_identity_called: input.viewer_identity_called,
    promise_made: input.promise_made,
    curiosity_gap: input.curiosity_gap,
    reusable_intro_formula: input.reusable_intro_formula,
    adapted_intro_candidates: input.adapted_intro_candidates,
  };
}

// ── Intro30sComposition (세컨브레인 기반 도입부 30초 구성) ────────────────────

export interface ComposeIntro30sInput {
  id: string;
  key_content_title: string;
  intro_script_30s: string;
  first_sentence?: string;
  hook_structure?: string;
  promise?: string;
  curiosity_gap?: string;
  applied_insights: AppliedInsight[];
}

export function composeIntro30s(input: ComposeIntro30sInput): Intro30sComposition {
  requireNonEmpty(input.key_content_title, '키 콘텐츠 없이 도입부 작성 금지');
  requireNonEmpty(input.intro_script_30s, '도입부 원고가 비어 있음');

  if (!input.applied_insights || input.applied_insights.length === 0) {
    throw new Error('세컨브레인 인사이트 적용 없이 도입부 작성 금지');
  }
  for (const item of input.applied_insights) {
    if (!item.insight || item.insight.trim() === '') {
      throw new Error('세컨브레인 인사이트 적용 없이 도입부 작성 금지');
    }
    if (!item.how_applied || item.how_applied.trim() === '') {
      throw new Error('세컨브레인 인사이트 적용 없이 도입부 작성 금지');
    }
  }

  return {
    id: input.id,
    key_content_title: input.key_content_title.trim(),
    intro_script_30s: input.intro_script_30s.trim(),
    first_sentence: input.first_sentence ?? '',
    hook_structure: input.hook_structure ?? '',
    promise: input.promise ?? '',
    curiosity_gap: input.curiosity_gap ?? '',
    applied_insights: input.applied_insights.map((item) => ({
      insight: item.insight.trim(),
      how_applied: item.how_applied.trim(),
    })),
  };
}
