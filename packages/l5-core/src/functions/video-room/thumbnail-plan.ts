import {
  ThumbnailHookType,
  ThumbnailPattern,
  ReferenceCandidate,
  CmoVideoStrategyBrief,
  ApprovalStatus,
} from './types';

// ── Output types ──────────────────────────────────────────────────────────────

export interface ThumbnailCandidate {
  candidate_id: string;
  /** Headline / copy text for the thumbnail. */
  copy: string;
  /** Visual direction describing layout, color, subject. */
  visual_direction: string;
  /** Hook type driving the click logic. */
  click_logic: ThumbnailHookType;
  /** IDs of insights (ThumbnailPattern.id or SecondBrain insight) that informed this candidate. */
  used_insights: string[];
}

/** Output of buildThumbnailPlan. Extends the ThumbnailPlan shape with
 *  why_recommended and risk_notes as required by PRD §16.8. */
export interface BuildThumbnailPlanOutput {
  content_id: string;
  thumbnail_direction: string;
  candidates: ThumbnailCandidate[];
  /** candidate_id of the recommended pick. Always points to one of candidates[]. */
  recommended: string;
  why_recommended: string;
  risk_notes: string[];
  approval_status: ApprovalStatus;
}

// ── Input type ────────────────────────────────────────────────────────────────

export interface BuildThumbnailPlanInput {
  content_id: string;
  /** From CmoVideoStrategyBrief.thumbnail_direction. */
  thumbnail_direction: string;
  /** ThumbnailPatterns extracted from reference videos (from reference-analysis). */
  reference_patterns: ThumbnailPattern[];
  /** ReferenceCandidate items selected for thumbnail_pattern research. */
  reference_candidates: ReferenceCandidate[];
  /** Optional brief — used to pull thumbnail_direction if not provided directly. */
  brief?: Pick<CmoVideoStrategyBrief, 'thumbnail_direction' | 'risk_notes'>;
  /** Additional free-form insight strings (e.g. from SecondBrainInsightMerge). */
  extra_insights?: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must not be empty`);
  }
  return value.trim();
}

/** Pick a hook type from available patterns, falling back to 'curiosity'. */
function pickHookType(patterns: ThumbnailPattern[], index: number): ThumbnailHookType {
  if (patterns.length === 0) return 'curiosity';
  return patterns[index % patterns.length].hook_type;
}

/** Build a copy string from a pattern's adapted candidates, falling back to a default. */
function deriveCopy(
  pattern: ThumbnailPattern | undefined,
  fallback: string,
  index: number,
): string {
  if (
    pattern &&
    pattern.adapted_thumbnail_candidates &&
    pattern.adapted_thumbnail_candidates.length > index
  ) {
    return pattern.adapted_thumbnail_candidates[index];
  }
  return fallback;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * buildThumbnailPlan — PRD §16.8 Thumbnail Strategy Agent.
 *
 * Generates at least 3 thumbnail candidates derived from reference patterns
 * and SecondBrain insights. Returns a recommended candidate with rationale.
 *
 * Rules:
 * - Requires content_id and thumbnail_direction.
 * - Produces minimum 3 candidates regardless of input richness.
 * - recommended must point to one of the generated candidates.
 * - Empty input (no patterns, no candidates) still produces 3 fallback candidates.
 */
export function buildThumbnailPlan(input: BuildThumbnailPlanInput): BuildThumbnailPlanOutput {
  requireNonEmpty(input.content_id, 'content_id');

  const direction =
    input.thumbnail_direction?.trim() ||
    input.brief?.thumbnail_direction?.trim() ||
    '';

  if (!direction) {
    throw new Error('thumbnail_direction must not be empty');
  }

  const patterns = input.reference_patterns ?? [];
  const refs = input.reference_candidates ?? [];
  const extraInsights = input.extra_insights ?? [];

  // Collect all insight source IDs for traceability.
  const allPatternIds = patterns.map((p) => p.id);
  const allRefIds = refs.map((r) => r.id);

  // Derive up to 3 base candidates from patterns. If fewer than 3 patterns,
  // generate synthetic variations using hook type rotation.
  const hookTypes: ThumbnailHookType[] = [
    'loss',
    'gain',
    'curiosity',
    'warning',
    'authority',
    'result',
    'contrast',
  ];

  // Map existing patterns into candidates; pad to minimum 3.
  const baseCount = Math.max(3, patterns.length);
  const candidates: ThumbnailCandidate[] = [];

  for (let i = 0; i < baseCount; i++) {
    const pattern = patterns[i]; // may be undefined when padding

    const hookType: ThumbnailHookType = pattern
      ? pattern.hook_type
      : hookTypes[i % hookTypes.length];

    // Copy: prefer adapted candidate from pattern, else build from direction.
    let copy: string;
    if (pattern && pattern.adapted_thumbnail_candidates.length > 0) {
      copy = deriveCopy(pattern, direction, 0);
    } else {
      // Fallback copies vary by hook type to ensure distinct candidates.
      const suffixes: Record<ThumbnailHookType, string> = {
        loss: '이것만 모르면 손해',
        gain: '이렇게 하면 됩니다',
        curiosity: '이유가 있습니다',
        warning: '주의해야 할 것',
        authority: '전문가가 말하는 법',
        result: '실제 결과입니다',
        contrast: '전과 후의 차이',
      };
      copy = `${direction} — ${suffixes[hookType]}`;
    }

    // Visual direction: from pattern structure or generic hint.
    const visual_direction = pattern
      ? pattern.structure
      : `${direction} 시각화 (${hookType} 훅)`;

    // Collect used insight IDs for this candidate.
    const used_insights: string[] = [];
    if (pattern) {
      used_insights.push(pattern.id);
      if (allRefIds[i]) used_insights.push(allRefIds[i]);
    } else {
      // No pattern — reference extra insights if available.
      const extra = extraInsights[i];
      if (extra) used_insights.push(extra);
    }

    candidates.push({
      candidate_id: `thumb-c-${i + 1}`,
      copy,
      visual_direction,
      click_logic: hookType,
      used_insights,
    });
  }

  // Ensure we always have at least 3 distinct candidates.
  // (Loop above already guarantees baseCount >= 3, but be explicit.)
  if (candidates.length < 3) {
    throw new Error('Internal: failed to generate minimum 3 candidates');
  }

  // Select recommended: prefer the candidate whose hook_type matches a high-value
  // type (loss > warning > curiosity), falling back to index 0.
  const preferred: ThumbnailHookType[] = ['loss', 'warning', 'curiosity'];
  let recommendedIndex = 0;
  for (const hook of preferred) {
    const idx = candidates.findIndex((c) => c.click_logic === hook);
    if (idx !== -1) {
      recommendedIndex = idx;
      break;
    }
  }
  const recommended = candidates[recommendedIndex].candidate_id;

  // why_recommended: explain selection rationale.
  const recommendedCandidate = candidates[recommendedIndex];
  const why_recommended =
    `후보 ${recommended}는 '${recommendedCandidate.click_logic}' 훅 유형으로 ` +
    `클릭 심리를 직접 자극하며, thumbnail_direction("${direction}")과 가장 높은 ` +
    `정합성을 가집니다.` +
    (allPatternIds.length > 0
      ? ` 레퍼런스 패턴 ${allPatternIds.slice(0, 2).join(', ')}에서 검증된 구조를 재사용합니다.`
      : ' 레퍼런스 패턴 없이 방향성 기반 생성.');

  // risk_notes: pass through from brief, add structural notes.
  const risk_notes: string[] = [...(input.brief?.risk_notes ?? [])];
  if (patterns.length === 0) {
    risk_notes.push('레퍼런스 패턴 없이 생성된 후보입니다. 실제 성과 데이터로 검증 필요.');
  }
  if (refs.length === 0) {
    risk_notes.push('ReferenceCandidate가 없습니다. Viewtrap 조사 후 재생성을 권장합니다.');
  }

  return {
    content_id: input.content_id.trim(),
    thumbnail_direction: direction,
    candidates,
    recommended,
    why_recommended,
    risk_notes,
    approval_status: 'draft',
  };
}
