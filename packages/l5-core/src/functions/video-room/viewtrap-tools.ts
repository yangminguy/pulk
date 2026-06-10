// CMO v3 Viewtrap Tools — Viewtrap을 키/풀링 콘텐츠 기획 안에서 호출하는
// 재사용 검증 도구. (PRD §0 "Viewtrap은 독립 단계가 아니라 스킬이다")
//
// P3: 키 콘텐츠 검증 (Step 8) — 기존 buildViewtrapValidation 로직을 재사용 가능 형태로 재노출.
// P5: 풀링 콘텐츠 검증 3종 (Step 5~8) — 핫 비디오 문맥 구조 / 노출 확률 / 오래된 노출 노다지.
//
// 규칙: 순수함수. Date.now()/randomUUID() 금지. PRD 금지규칙은 throw로 강제.

import { z } from 'zod';
import type {
  HotVideoStructureTemplate,
  ExposureProbabilityCandidate,
  LongtailEvergreenCandidate,
} from './types';
import {
  buildViewtrapValidation,
  filterSalesViableCandidates,
} from './key-content-planning';

// ── P3: 키 콘텐츠 Viewtrap 검증 (Step 8 재사용) ─────────────────────────────
//
// 기존 key-content-planning.ts의 buildViewtrapValidation은 그대로 두고,
// 여기서 동일 시그니처로 재노출한다. 키/풀링 양쪽에서 같은 도구를 import할 수 있게.

export { buildViewtrapValidation, filterSalesViableCandidates };

/**
 * P3: 키 콘텐츠 후보를 Viewtrap으로 검증한다 (PRD §3 Step 8).
 * 의미를 드러내는 별칭. verdict는 buildViewtrapValidation이 결정한다.
 */
export const validateKeyContentWithViewtrap = buildViewtrapValidation;

// ── P5 helpers ──────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

// ── P5 Step 6: buildHotVideoStructureTemplate ───────────────────────────────
// PRD §4 Step 6: 핫 비디오 제목 → 문맥 구조 → 내 판매 논리로 디벨롭한 적용 제목.

const emotionalTriggerEnum = z.enum([
  'worry',
  'loss',
  'desire',
  'comparison',
  'mistake',
  'prohibition',
  'checklist',
  'twist',
]);

const HotVideoStructureTemplateSchema = z.object({
  original_title: z.string().min(1),
  original_thumbnail_copy: z.string().min(1).optional(),
  structure_pattern: z.string().min(1),
  emotional_trigger: emotionalTriggerEnum,
  adapted_title: z.string().min(1),
  adapted_thumbnail_promise: z.string().min(1),
  connected_sales_logic: z.string().min(1),
});

export { HotVideoStructureTemplateSchema };

export function buildHotVideoStructureTemplate(input: {
  original_title: string;
  original_thumbnail_copy?: string;
  structure_pattern: string;
  emotional_trigger: HotVideoStructureTemplate['emotional_trigger'];
  adapted_title: string;
  adapted_thumbnail_promise: string;
  connected_sales_logic: string;
}): HotVideoStructureTemplate {
  // PRD: 핫 비디오는 "내 판매 논리/고객 설득 기준"과 연결될 때만 주제로 디벨롭한다.
  requireNonEmpty(input.connected_sales_logic, 'connected_sales_logic');
  // PRD: "영상들의 제목을 추출해 디벨롭하여 주제를 정한다" — 원본을 그대로 베끼면 안 된다.
  if (input.adapted_title.trim() === input.original_title.trim()) {
    throw new Error('adapted_title must develop, not copy, the original_title');
  }

  const result: HotVideoStructureTemplate = {
    original_title: input.original_title.trim(),
    structure_pattern: input.structure_pattern.trim(),
    emotional_trigger: input.emotional_trigger,
    adapted_title: input.adapted_title.trim(),
    adapted_thumbnail_promise: input.adapted_thumbnail_promise.trim(),
    connected_sales_logic: input.connected_sales_logic.trim(),
  };
  if (input.original_thumbnail_copy !== undefined) {
    result.original_thumbnail_copy = input.original_thumbnail_copy.trim();
  }
  return HotVideoStructureTemplateSchema.parse(result);
}

// ── P5 Step 7: assessExposureProbability ────────────────────────────────────
// PRD §4 Step 7: 노출 확률 normal/good/great 후보 → 적용 주제 + 추천 콘텐츠 유형.

const exposureProbabilityEnum = z.enum(['normal', 'good', 'great']);
const contentTypeEnum = z.enum(['daily', 'seasonal', 'evergreen', 'hero']);

const ExposureProbabilityCandidateSchema = z.object({
  source_title: z.string().min(1),
  exposure_probability: exposureProbabilityEnum,
  adapted_topic: z.string().min(1),
  recommended_content_type: contentTypeEnum,
  reason: z.string().min(1),
});

export { ExposureProbabilityCandidateSchema };

export function assessExposureProbability(input: {
  source_title: string;
  exposure_probability: ExposureProbabilityCandidate['exposure_probability'];
  adapted_topic: string;
  recommended_content_type?: ExposureProbabilityCandidate['recommended_content_type'];
  reason: string;
}): ExposureProbabilityCandidate {
  // PRD Step 7: 분석 후 normal/good/great만 설정해 결과를 본다. 그 외 값은 무효.
  exposureProbabilityEnum.parse(input.exposure_probability);

  // 추천 유형 미지정 시: 노출 확률이 지금 알고리즘을 타고 있는 신호 → daily/seasonal,
  // normal은 꾸준한 트래픽(evergreen)으로 깔아두는 후보로 본다 (PRD §4 Step 7 활용).
  const recommended_content_type =
    input.recommended_content_type ??
    (input.exposure_probability === 'great'
      ? 'seasonal'
      : input.exposure_probability === 'good'
        ? 'daily'
        : 'evergreen');

  const result: ExposureProbabilityCandidate = {
    source_title: input.source_title.trim(),
    exposure_probability: input.exposure_probability,
    adapted_topic: input.adapted_topic.trim(),
    recommended_content_type,
    reason: input.reason.trim(),
  };
  return ExposureProbabilityCandidateSchema.parse(result);
}

// ── P5 Step 8: findLongtailEvergreen ────────────────────────────────────────
// PRD §4 Step 8: 게시일 오래된 순 정렬 → 오래됐는데도 노출 확률 good/great → 노다지.
// 강한 규칙: 발견하면 must_use=true. (못 찾으면 빈 배열 반환 = 넘겨도 됨)

export const LongtailEvergreenCandidateSchema = z.object({
  source_title: z.string().min(1),
  published_age: z.literal('old'),
  exposure_probability: z.enum(['good', 'great']),
  evergreen_reason: z.string().min(1),
  adapted_topic: z.string().min(1),
  must_use: z.literal(true),
});

export interface LongtailCandidateInput {
  source_title: string;
  published_age: 'old' | 'recent';
  exposure_probability: 'normal' | 'good' | 'great';
  evergreen_reason: string;
  adapted_topic: string;
}

/**
 * 오래된 영상 후보 목록에서 "오래됐는데도 노출 확률 good/great"인 노다지만 골라낸다.
 * 조건에 맞는 후보는 반드시 must_use:true로 표시된다 (PRD 강한 규칙).
 * 조건을 만족하는 후보가 없으면 빈 배열 (이 단계는 넘겨도 됨).
 */
export function findLongtailEvergreen(
  candidates: LongtailCandidateInput[],
): LongtailEvergreenCandidate[] {
  return candidates
    .filter(
      (c) =>
        c.published_age === 'old' &&
        (c.exposure_probability === 'good' || c.exposure_probability === 'great'),
    )
    .map((c) => {
      const result: LongtailEvergreenCandidate = {
        source_title: requireNonEmpty(c.source_title, 'source_title'),
        published_age: 'old',
        exposure_probability: c.exposure_probability as 'good' | 'great',
        evergreen_reason: requireNonEmpty(c.evergreen_reason, 'evergreen_reason'),
        adapted_topic: requireNonEmpty(c.adapted_topic, 'adapted_topic'),
        must_use: true,
      };
      return LongtailEvergreenCandidateSchema.parse(result);
    });
}

/**
 * 단건 롱테일 에버그린 후보 빌더 (PRD §4 Step 8 강한 규칙).
 * 게시일 오래됐는데도 노출 확률 good/great면 must_use=true.
 */
export function buildLongtailEvergreenCandidate(input: {
  source_title: string;
  exposure_probability: 'good' | 'great';
  evergreen_reason: string;
  adapted_topic: string;
}): LongtailEvergreenCandidate {
  const candidate: LongtailEvergreenCandidate = {
    source_title: input.source_title,
    published_age: 'old',
    exposure_probability: input.exposure_probability,
    evergreen_reason: input.evergreen_reason,
    adapted_topic: input.adapted_topic,
    must_use: true,
  };
  return LongtailEvergreenCandidateSchema.parse(candidate);
}
