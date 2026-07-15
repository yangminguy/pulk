/**
 * 제목 디벨롭 8단계 — 결정론 함수 일괄 (PRD §13.4, §17, §21)
 *
 * WO-1 범위: 순수(결정론) 로직만. LLM 추론이 필요한 단계 실행/어색함 판정은
 * 후속 WO에서 구현하며, 여기서는 임계 비교·조합 열거·점수 합산만 담당한다.
 * spec: docs/_acr-progress/wo-1-l5-core-타입-결정론-함수-일괄.md
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  CombinationType,
  TitleDevelopmentReference,
  TitleDevelopmentWorkflowRun,
  TitleThumbnailCombination,
} from './title-development-types';

// ---------------------------------------------------------------------------
// 외부 입력 경계 검증 (수동 Viewtrap 레퍼런스 입력)
// ---------------------------------------------------------------------------

export const TitleDevelopmentReferenceSchema = z.object({
  id: z.string().min(1),
  research_session_id: z.string().min(1),
  source: z.enum(['viewtrap', 'youtube', 'manual']),
  url: z.string().optional(),

  title: z.string(),
  thumbnail_text: z.string(),
  thumbnail_structure: z.string(),
  topic: z.string(),

  view_count: z.number().int().nonnegative(),
  performance_grade: z.enum(['Good', 'Great']),
  contribution_grade: z.enum(['Good', 'Great']),

  topic_similarity: z.enum(['exact', 'expanded_same_meaning']),
  similarity_reason: z.string(),
  selected_reason: z.string(),
});

// ---------------------------------------------------------------------------
// §21.1 generateTitleSearchTerms — 결정론 baseline (LLM 보강은 후속 WO)
// ---------------------------------------------------------------------------

export interface TitleSearchTermsInput {
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
}

export interface TitleSearchTermsOutput {
  exact_search_terms: string[];
  expanded_search_terms: string[];
  forbidden_search_terms: string[];
  reasoning: string;
}

export function generateTitleSearchTerms(input: TitleSearchTermsInput): TitleSearchTermsOutput {
  const topic = input.pulling_topic.trim();
  return {
    exact_search_terms: [topic, `${topic} 방법`, `${topic} 하는 법`],
    expanded_search_terms: [
      `${topic} 사례`,
      `${input.target_audience.trim()} ${topic}`,
      `${topic} 도구`,
    ],
    forbidden_search_terms: ['브랜딩 일반론', '동기부여', '마인드셋'],
    reasoning:
      `정확 검색은 풀링 주제 "${topic}" 그대로와 행동형 변형을 사용한다. ` +
      `확장 검색은 같은 의미 범위(타겟 "${input.target_audience.trim()}" 결합 포함)로만 넓힌다. ` +
      `주제에서 벗어나는 일반론성 검색어는 금지한다.`,
  };
}

// ---------------------------------------------------------------------------
// §21.2 validateTitleReferences
// ---------------------------------------------------------------------------

const MIN_VIEW_COUNT = 50000;

export function validateTitleReference(ref: TitleDevelopmentReference): string[] {
  const reasons: string[] = [];

  if (ref.view_count < MIN_VIEW_COUNT) reasons.push('조회수 5만 미만');
  if (!['Good', 'Great'].includes(ref.performance_grade)) reasons.push('성과도 Good/Great 미충족');
  if (!['Good', 'Great'].includes(ref.contribution_grade)) reasons.push('기여도 Good/Great 미충족');
  if (!['exact', 'expanded_same_meaning'].includes(ref.topic_similarity)) {
    reasons.push('주제 유사도 미충족');
  }
  if (!ref.title.trim()) reasons.push('제목 없음');
  if (!ref.thumbnail_text.trim()) reasons.push('썸네일 문구 없음');

  return reasons;
}

export interface ValidateTitleReferencesResult {
  passed: boolean;
  passed_references: TitleDevelopmentReference[];
  failed_references: { reference_id: string; reasons: string[] }[];
  next_action: 'continue' | 'request_more_references';
}

export function validateTitleReferences(
  refs: TitleDevelopmentReference[],
): ValidateTitleReferencesResult {
  const passed_references: TitleDevelopmentReference[] = [];
  const failed_references: { reference_id: string; reasons: string[] }[] = [];

  for (const ref of refs) {
    const reasons = validateTitleReference(ref);
    if (reasons.length === 0) passed_references.push(ref);
    else failed_references.push({ reference_id: ref.id, reasons });
  }

  // AC-01: 통과 레퍼런스가 2개 미만이면 1단계를 진행하지 않는다.
  const passed = passed_references.length >= 2;

  return {
    passed,
    passed_references,
    failed_references,
    next_action: passed ? 'continue' : 'request_more_references',
  };
}

// ---------------------------------------------------------------------------
// §21.3 generateCrossCombinations — 4종 교차 조합 (AC-07)
// ---------------------------------------------------------------------------

export function generateCrossCombinations(
  ref1: TitleDevelopmentReference,
  ref2: TitleDevelopmentReference,
): TitleThumbnailCombination[] {
  const specs: {
    combination_type: CombinationType;
    titleSource: TitleDevelopmentReference;
    thumbnailSource: TitleDevelopmentReference;
    titleDraft: string;
  }[] = [
    // 1. Ref1 썸네일 + Ref2 제목
    {
      combination_type: 'ref1_thumbnail_ref2_title',
      titleSource: ref2,
      thumbnailSource: ref1,
      titleDraft: ref2.title,
    },
    // 2. Ref1 제목 + Ref2 썸네일
    {
      combination_type: 'ref1_title_ref2_thumbnail',
      titleSource: ref1,
      thumbnailSource: ref2,
      titleDraft: ref1.title,
    },
    // 3. Ref1 썸네일 문구 제목화 + Ref2 썸네일 구조
    {
      combination_type: 'ref1_thumbnail_text_as_title_ref2_thumbnail',
      titleSource: ref1,
      thumbnailSource: ref2,
      titleDraft: ref1.thumbnail_text,
    },
    // 4. Ref2 썸네일 문구 제목화 + Ref1 썸네일 구조
    {
      combination_type: 'ref2_thumbnail_text_as_title_ref1_thumbnail',
      titleSource: ref2,
      thumbnailSource: ref1,
      titleDraft: ref2.thumbnail_text,
    },
  ];

  return specs.map((spec) => ({
    id: randomUUID(),
    combination_type: spec.combination_type,
    title_source_ref_id: spec.titleSource.id,
    thumbnail_source_ref_id: spec.thumbnailSource.id,
    title_draft: spec.titleDraft,
    thumbnail_text_draft: spec.thumbnailSource.thumbnail_text,
    thumbnail_direction: spec.thumbnailSource.thumbnail_structure,
    // LLM 어색함 판정 전 초기값 (PRD §9.6)
    awkwardness_score: 0,
    passed: false,
    selected_for_next_step: false,
  }));
}

// ---------------------------------------------------------------------------
// §13.4 제목 길이 (35자 제한) — grapheme 단위
// ---------------------------------------------------------------------------

export const TITLE_MAX_LENGTH = 35;

// tsconfig lib가 ES2020이라 Intl.Segmenter(ES2022) 타입이 없다. 런타임(Node 16+)에는
// 존재하므로 로컬 타입으로만 보강한다. tsconfig 변경은 WO-1 범위 밖.
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
const graphemeSegmenter: GraphemeSegmenter = new (
  Intl as unknown as {
    Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => GraphemeSegmenter;
  }
).Segmenter('ko', { granularity: 'grapheme' });

export function countTitleLength(title: string): number {
  return [...graphemeSegmenter.segment(title)].length;
}

export function isTitleTooLong(title: string, max: number = TITLE_MAX_LENGTH): boolean {
  return countTitleLength(title) > max;
}

/**
 * §13.4 강제 가드: 35자 초과 제목을 단어 경계에서 잘라 35자 이내로 만든다.
 * (2026-07-12 점검: 39자 산출물이 승인 큐까지 도달 — 산출 단계 강제 부재의 수정)
 * LLM 재작성이 아닌 결정론 폴백이므로, 우선순위는 "≤35자 후보 선택 > 이 함수".
 */
export function truncateTitleToMax(title: string, max: number = TITLE_MAX_LENGTH): string {
  const trimmed = title.trim();
  const graphemes = [...graphemeSegmenter.segment(trimmed)].map((g) => g.segment);
  if (graphemes.length <= max) return trimmed;
  const cut = graphemes.slice(0, max).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace >= Math.floor(max * 0.6) ? cut.slice(0, lastSpace) : cut).trim();
}

// ---------------------------------------------------------------------------
// §21.4 어색함 — 임계 비교만 (판정 자체는 LLM, PRD §9.5)
// ---------------------------------------------------------------------------

/** awkwardness_score는 §9.5 감점 항목 누적. 0이면 정상(§9.6 초기값). */
export function isAwkward(awkwardnessScore: number): boolean {
  return awkwardnessScore > 0;
}

// ---------------------------------------------------------------------------
// §17.2~17.3 최종 평가 — 점수 합산·임계 판정 (항목별 점수 산정은 LLM)
// ---------------------------------------------------------------------------

export interface FinalTitleScoreInput {
  target_fit: number;
  desire_clarity: number;
  problem_sharpness: number;
  curiosity_gap: number;
  script_match: number;
  thumbnail_fit: number;
}

const SCORE_CAPS: Record<keyof FinalTitleScoreInput, number> = {
  target_fit: 20,
  desire_clarity: 20,
  problem_sharpness: 20,
  curiosity_gap: 15,
  script_match: 15,
  thumbnail_fit: 10,
};

export function scoreFinalTitle(scores: FinalTitleScoreInput): number {
  return (Object.keys(SCORE_CAPS) as (keyof FinalTitleScoreInput)[]).reduce((total, key) => {
    const clamped = Math.max(0, Math.min(SCORE_CAPS[key], scores[key]));
    return total + clamped;
  }, 0);
}

export function recommendFromScore(
  total: number,
): 'upload_candidate' | 'revise' | 'rerun_reference_search' {
  if (total >= 85) return 'upload_candidate';
  if (total >= 70) return 'revise';
  return 'rerun_reference_search';
}

// ---------------------------------------------------------------------------
// 업로드 후 제목 교체 규칙 (강의 노트 2026-06-11 — "1주일 지났는데 100회 미만이면 교체")
// ---------------------------------------------------------------------------

export interface TitleSwapMonitorConfig {
  /** 평가 시작 시점(업로드 후 일수). 기본 7일. */
  evaluate_after_days?: number;
  /** 통과 기준 조회수. 기본 100회. */
  min_views?: number;
}

export interface TitleSwapSignal {
  action: 'keep' | 'swap_recommended' | 'too_early';
  reason: string;
}

/**
 * 업로드 후 제목 교체 신호 (결정론). 강의 기준: 업로드 1주일 후 100회 미만 → 교체.
 * 임계값은 채널 규모에 따라 조정 가능(설정 주입).
 */
export function shouldSwapTitle(
  input: { days_since_upload: number; views: number },
  config: TitleSwapMonitorConfig = {},
): TitleSwapSignal {
  const afterDays = config.evaluate_after_days ?? 7;
  const minViews = config.min_views ?? 100;

  if (input.days_since_upload < afterDays) {
    return {
      action: 'too_early',
      reason: `업로드 ${input.days_since_upload}일차 — 평가 시점(${afterDays}일) 전`,
    };
  }
  if (input.views < minViews) {
    return {
      action: 'swap_recommended',
      reason: `업로드 ${afterDays}일 경과 조회수 ${input.views}회 < 기준 ${minViews}회 — 제목 교체 권장`,
    };
  }
  return { action: 'keep', reason: `조회수 ${input.views}회 ≥ 기준 ${minViews}회 — 유지` };
}

// ---------------------------------------------------------------------------
// §20 상태머신 접목 — proposal.data 구조 (AC-14)
// ---------------------------------------------------------------------------

/**
 * 제목 디벨롭 결과를 CMO 전략 턴의 proposal 카드로 변환한다.
 * MVP는 새 상태 없이 thumbnail_pattern_extraction 단계 안에서 수행한다 (PRD §20.1).
 */
export interface TitleDevelopmentProposal {
  stage: 'thumbnail_pattern_extraction';
  summary: string;
  data: {
    title_development_workflow: TitleDevelopmentWorkflowRun;
  };
}

export function buildTitleDevelopmentProposal(
  run: TitleDevelopmentWorkflowRun,
): TitleDevelopmentProposal {
  return {
    stage: 'thumbnail_pattern_extraction',
    summary: '풀링 콘텐츠 제목 디벨롭 8단계 결과',
    data: {
      title_development_workflow: run,
    },
  };
}

// ---------------------------------------------------------------------------
// FR-7 버전 로그 — 시드(교차 치환)부터 최종 선정까지 "이전→변경→왜"를 타임라인화.
// run에 이미 있는 재료(combinations/step_results/final_candidates)의 파생 뷰 —
// §19 타입은 수정 금지이므로 별도 구조로 파생한다(순수).
// ---------------------------------------------------------------------------

export interface TitleVersionLogEntry {
  /** 0 = 시드(교차 치환), 1~8 = 디벨롭 단계, 9 = 최종 선정. */
  version: number;
  label: string;
  titles_before: string[];
  titles_after: string[];
  /** 적용 기법(무엇을 했는지). */
  technique: string;
  /** 왜 바꿨는지(근거 서술). */
  reason: string;
  rejected: { title: string; reason: string }[];
}

export function buildTitleVersionLog(run: TitleDevelopmentWorkflowRun): TitleVersionLogEntry[] {
  const [ref1, ref2] = run.references;
  const log: TitleVersionLogEntry[] = [];

  // v0 — 시드: 레퍼런스 2개의 제목↔썸네일 문구 교차 치환 (KB 07 §시드 생성).
  const seedCombos = run.combinations.filter((c) => c.selected_for_next_step || c.passed);
  const seedPool = seedCombos.length > 0 ? seedCombos : run.combinations;
  log.push({
    version: 0,
    label: '시드 생성 — 교차 치환',
    titles_before: [ref1.title, ref2.title, ref1.thumbnail_text, ref2.thumbnail_text].filter(Boolean),
    titles_after: seedPool.map((c) => c.title_draft),
    technique: '같은 주제 레퍼런스 2개의 썸네일 문구↔제목 교차 치환 (KB 07)',
    reason: seedPool
      .map((c) => c.awkwardness_reason)
      .filter((r): r is string => Boolean(r && r.trim()))
      .join(' / ') || '어색함 판정 통과 조합을 디벨롭 출발점으로 선택',
    rejected: run.combinations
      .filter((c) => !c.passed)
      .map((c) => ({ title: c.title_draft, reason: c.awkwardness_reason ?? '어색함 판정 탈락' })),
  });

  // v1..n — 디벨롭 단계별.
  for (const step of run.step_results) {
    log.push({
      version: step.step_number,
      label: `${step.step_number}단계 — ${step.step_name}`,
      titles_before: step.input_titles,
      titles_after: step.selected_titles_for_next_step,
      technique: step.method_explanation,
      reason: step.cmo_reasoning,
      rejected: step.rejected_titles,
    });
  }

  // v9 — 최종 선정.
  const selected = run.final_candidates.find((c) => c.title === run.selected_title);
  log.push({
    version: 9,
    label: '최종 선정',
    titles_before: run.final_candidates.map((c) => c.title),
    titles_after: [run.selected_title],
    technique: '최종 평가(타깃 적합·욕구 선명도·문제 예리함·호기심 갭·원고 일치·썸네일 궁합) 합산',
    reason: selected?.reason ?? '최고 총점 후보 선택',
    rejected: run.final_candidates
      .filter((c) => c.title !== run.selected_title)
      .map((c) => ({ title: c.title, reason: `총점 ${c.total_score}점 — ${c.reason}` })),
  });

  return log;
}

// ---------------------------------------------------------------------------
// §21.7 buildSecondBrainSummary — 순수 템플릿
// ---------------------------------------------------------------------------

export function buildSecondBrainSummary(run: TitleDevelopmentWorkflowRun): string {
  const selected = run.final_candidates.find((c) => c.title === run.selected_title);
  const [ref1, ref2] = run.references;

  const lines = [
    `# 제목 디벨롭 인사이트: ${run.pulling_topic}`,
    '',
    `- 타겟: ${run.target_audience}`,
    `- 최종 제목: ${run.selected_title}`,
    `- 최종 점수: ${selected ? `${selected.total_score}점` : '미평가'}`,
    `- 썸네일 방향: ${run.selected_thumbnail_direction}`,
    '',
    '## 레퍼런스',
    `1. ${ref1.title} (조회수 ${ref1.view_count}, 성과 ${ref1.performance_grade}/기여 ${ref1.contribution_grade}, 유사도 ${ref1.topic_similarity})`,
    `2. ${ref2.title} (조회수 ${ref2.view_count}, 성과 ${ref2.performance_grade}/기여 ${ref2.contribution_grade}, 유사도 ${ref2.topic_similarity})`,
  ];

  if (selected) {
    lines.push('', '## 선택 이유', selected.reason);
  }

  return lines.join('\n');
}
