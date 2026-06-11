// CMO 썸네일 9개 매트릭스 + 심리분석 (PRD §3, §4)
//
// buildThumbnailMatrix9: 이미지전략(3) × 문구전략(3) = 9개 ThumbnailMatrixCandidate 생성.
// analyzeThumbnailPsychology: 각 후보에 대해 3단계 심리분석(문구구조/이미지연상/결합심리).
//
// 컨벤션: key-content-draft.ts와 동일하게 llmComplete 주입 + 결정론적 폴백.
// 외부 LLM SDK 직접 호출 없음. id는 인덱스 기반 결정론.

import { z } from 'zod';
import type { ThumbnailPattern } from './types';

// ── Enums & Constants ────────────────────────────────────────────────────────

export const IMAGE_STRATEGIES = ['zoom', 'evidence', 'empathy'] as const;
export type ImageStrategy = (typeof IMAGE_STRATEGIES)[number];

export const TEXT_STRATEGIES = ['gain', 'loss_avoidance', 'curiosity'] as const;
export type TextStrategy = (typeof TEXT_STRATEGIES)[number];

export const SLOT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
export type SlotLabel = (typeof SLOT_LABELS)[number];

/**
 * 강의 노트(2026-06-11) — 썸네일 구성 요소가 클릭률에 미치는 비중.
 * 이미지 45% / 문구(폰트 내용) 45% / 디자인 10%.
 * 초보자 함정: 디자인에 시간을 쏟고 이미지·문구 선정에 시간을 안 씀.
 */
export const THUMBNAIL_COMPONENT_WEIGHTS = {
  image: 0.45,
  text: 0.45,
  design: 0.10,
} as const;

/** 강의 노트 — 썸네일 문구 권장 최대 글자 수 ("썸네일은 글씨를 줄여야 한다"). */
export const THUMBNAIL_TEXT_RECOMMENDED_MAX = 16;

/**
 * 강의 노트 — 검수(Stage E) 체크리스트: 작은 화면 / 데드존 / 무게중심.
 * 결정론 정본 — UI/검수 보고서가 그대로 표시한다.
 */
export const THUMBNAIL_REVIEW_CHECKLIST: readonly string[] = [
  '작은 화면(모바일 피드 크기)으로 축소해도 주인공과 문구가 읽히는가',
  '우하단 데드존: 시간 표시·재생목록 오버레이에 핵심 요소가 가리지 않는가 (모바일에서 더 커짐)',
  '상단 데드존: 추천 영상 노출 시 윗부분이 가려져도 클릭 이유가 살아있는가',
  '하단 데드존: 카톡 공유 미리보기에서 아랫부분이 잘려도 의미가 통하는가',
  '무게중심이 가운데에 있는가 (시선은 왼쪽 위부터 — 핵심 요소는 좌상~중앙)',
  `문구 글자 수가 ${THUMBNAIL_TEXT_RECOMMENDED_MAX}자 이내로 짧은가`,
  '이미지 자체에서(문구 없이도) 클릭 이유가 느껴지는가 — 공감/증거/궁금증',
  '폰트 출처·라이선스를 확인했는가 (눈누 등 무료 폰트의 영상/웹 사용 범위 확인)',
] as const;

/** B2 — channel_audience_profile 제공 시 체크리스트에 추가되는 시청층 정합 항목. */
export const AUDIENCE_FIT_CHECKLIST_ITEM =
  '내 채널에 모인 사람 기준으로 매력적인가 (주제 매몰 금지 — 같은 주제라도 시청층이 다르면 다른 썸네일)';

/** 후보 1개에 대한 결정론 검수 경고 (통과 여부가 아니라 사람 검수 보조). */
export function reviewThumbnailCandidate(candidate: {
  thumbnail_text: string;
  design_notes?: string;
  /** B2 — 내 채널에 모인 사람 프로필. 제공 시 시청층 정합 체크 항목 추가. */
  channel_audience_profile?: string;
  /** B7 — 폰트 출처. 제공 시 license_checked가 true가 아니면 경고. */
  font_source?: { name?: string; license_checked?: boolean };
}): { warnings: string[]; checklist: readonly string[] } {
  const warnings: string[] = [];
  const textLen = [...candidate.thumbnail_text.trim()].length;
  if (textLen > THUMBNAIL_TEXT_RECOMMENDED_MAX) {
    warnings.push(
      `문구 ${textLen}자 — 권장 ${THUMBNAIL_TEXT_RECOMMENDED_MAX}자 초과. 썸네일은 글씨를 줄여야 한다.`,
    );
  }
  if (candidate.design_notes && [...candidate.design_notes].length > 120) {
    warnings.push(
      '디자인 노트가 과도하게 김 — 클릭률 비중은 이미지 45%·문구 45%·디자인 10%. 디자인에 공들이지 말 것.',
    );
  }
  // B7 — 폰트 라이선스: font_source가 주어졌는데 license_checked가 true가 아니면 경고.
  if (candidate.font_source && candidate.font_source.license_checked !== true) {
    warnings.push(
      `폰트 "${candidate.font_source.name ?? '(이름 미상)'}" 라이선스 미확인 — 출처·사용 범위(영상/웹) 확인 필요 (눈누 등 무료 폰트도 사용 범위가 다름).`,
    );
  }
  // B2 — 시청층 프로필 제공 시 정합 체크 항목 추가.
  const checklist: readonly string[] = candidate.channel_audience_profile?.trim()
    ? [...THUMBNAIL_REVIEW_CHECKLIST, AUDIENCE_FIT_CHECKLIST_ITEM]
    : THUMBNAIL_REVIEW_CHECKLIST;
  return { warnings, checklist };
}

/** PRD §3.1 — 9개 슬롯별 클릭 가설 (결정론 정본). */
const CLICK_HYPOTHESES: Record<SlotLabel, string> = {
  A: '주인공이 명확하면 클릭한다',
  B: '위험을 느끼면 클릭한다',
  C: '뭔지 궁금하면 클릭한다',
  D: '결과가 보이면 클릭한다',
  E: '손실의 증거가 보이면 클릭한다',
  F: '증거 일부만 보이면 확인하려고 클릭한다',
  G: '내 상황의 해결책처럼 보이면 클릭한다',
  H: '내 문제를 건드리면 클릭한다',
  I: '내 상황인데 답이 숨겨져 있으면 클릭한다',
};

/** 슬롯 → (image_strategy, text_strategy) 매핑. */
const SLOT_MATRIX: Record<SlotLabel, { image: ImageStrategy; text: TextStrategy }> = {
  A: { image: 'zoom', text: 'gain' },
  B: { image: 'zoom', text: 'loss_avoidance' },
  C: { image: 'zoom', text: 'curiosity' },
  D: { image: 'evidence', text: 'gain' },
  E: { image: 'evidence', text: 'loss_avoidance' },
  F: { image: 'evidence', text: 'curiosity' },
  G: { image: 'empathy', text: 'gain' },
  H: { image: 'empathy', text: 'loss_avoidance' },
  I: { image: 'empathy', text: 'curiosity' },
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface ThumbnailMatrixInput {
  video_id: string;
  title: string;
  main_click_reason: string;
  target_audience: string;
  target_problem: string;
  target_desire: string;
  target_loss_to_avoid: string;
  reference_patterns: ThumbnailPattern[];
  /** B2 — 내 채널에 모인 사람(채널 시청층) 프로필. 제공 시 매트릭스 프롬프트에 주입. */
  channel_audience_profile?: string;
}

export interface ThumbnailMatrixDeps {
  llmComplete?: (prompt: string) => Promise<string>;
  maxRetries?: number;
}

// ── Output: ThumbnailMatrixCandidate ─────────────────────────────────────────

export const ThumbnailMatrixCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  slot: z.enum(SLOT_LABELS),
  image_strategy: z.enum(IMAGE_STRATEGIES),
  text_strategy: z.enum(TEXT_STRATEGIES),
  click_hypothesis: z.string().min(1),
  thumbnail_text: z.string().min(1),
  image_composition: z.string().min(1),
  design_notes: z.string(),
});

export type ThumbnailMatrixCandidate = z.infer<typeof ThumbnailMatrixCandidateSchema>;

// ── Output: ThumbnailPsychologyAnalysis ──────────────────────────────────────

export const ThumbnailPsychologyAnalysisSchema = z.object({
  candidate_id: z.string().min(1),
  text_structure: z.string().min(1),
  text_psychology: z.string().min(1),
  image_association: z.string().min(1),
  combined_click_psychology: z.string().min(1),
  expected_viewer_question: z.string().min(1),
  expected_viewer_desire: z.string().min(1),
  expected_viewer_fear: z.string().min(1),
  click_reason_clarity_score: z.number().min(0).max(100),
  title_text_image_alignment_score: z.number().min(0).max(100),
});

export type ThumbnailPsychologyAnalysis = z.infer<typeof ThumbnailPsychologyAnalysisSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    // Try array
    const arrStart = body.indexOf('[');
    const arrEnd = body.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      return body.slice(arrStart, arrEnd + 1);
    }
    return body.trim();
  }
  return body.slice(start, end + 1);
}

/** 결정론 폴백: 문구전략별 썸네일 문구 생성. PRD §3.4 — 제목과 같은 말 반복 금지. */
function fallbackThumbnailText(
  slot: SlotLabel,
  input: ThumbnailMatrixInput,
): string {
  const { text } = SLOT_MATRIX[slot];
  switch (text) {
    case 'gain':
      return `${input.target_desire} — 이렇게 하면 됩니다`;
    case 'loss_avoidance':
      return `${input.target_loss_to_avoid} — 이것만 모르면 손해`;
    case 'curiosity':
      return `${input.target_problem} — 이유가 있습니다`;
  }
}

/** 결정론 폴백: 이미지전략별 이미지 구성 설명. */
function fallbackImageComposition(
  slot: SlotLabel,
  input: ThumbnailMatrixInput,
): string {
  const { image } = SLOT_MATRIX[slot];
  switch (image) {
    case 'zoom':
      return `주인공 얼굴 클로즈업, ${input.main_click_reason}을 표정으로 전달`;
    case 'evidence':
      return `${input.target_desire} 달성 증거 화면(결과/숫자/대시보드)`;
    case 'empathy':
      return `${input.target_audience}의 현실 상황 이미지, ${input.target_problem} 공감 장면`;
  }
}

/** 결정론 폴백: 이미지+문구 조합별 디자인 노트. */
function fallbackDesignNotes(slot: SlotLabel): string {
  const { image, text } = SLOT_MATRIX[slot];
  const imageHint: Record<ImageStrategy, string> = {
    zoom: '배경 제거, 피사체 부각',
    evidence: '결과 화면/숫자 강조, 깔끔한 레이아웃',
    empathy: '현실적 분위기, 따뜻한 톤',
  };
  const textHint: Record<TextStrategy, string> = {
    gain: '밝은 색상, 긍정적 톤',
    loss_avoidance: '경고 색상(빨강/노랑), 긴장감',
    curiosity: '일부 가림/블러, 궁금증 유발',
  };
  return `${imageHint[image]}. ${textHint[text]}`;
}

// ── LLM schema for matrix generation ─────────────────────────────────────────

const LlmMatrixItemSchema = z.object({
  slot: z.enum(SLOT_LABELS),
  thumbnail_text: z.string().min(1),
  image_composition: z.string().min(1),
  design_notes: z.string(),
});

const LlmMatrixOutputSchema = z.array(LlmMatrixItemSchema).length(9);

// ── buildThumbnailMatrix9 ────────────────────────────────────────────────────

function buildMatrixPrompt(input: ThumbnailMatrixInput): string {
  const lines = [
    '당신은 CMO다. 아래 영상 정보로 9개 썸네일 매트릭스를 만든다.',
    '이미지전략(zoom/evidence/empathy) × 문구전략(gain/loss_avoidance/curiosity) = 9개.',
    '',
    `영상 제목: ${input.title}`,
    `핵심 클릭 이유: ${input.main_click_reason}`,
    `타깃 고객: ${input.target_audience}`,
    `타깃 문제: ${input.target_problem}`,
    `타깃 욕구: ${input.target_desire}`,
    `타깃 손해: ${input.target_loss_to_avoid}`,
  ];
  if (input.channel_audience_profile?.trim()) {
    lines.push(`내 채널에 모인 사람: ${input.channel_audience_profile.trim()}`);
  }
  if (input.reference_patterns.length > 0) {
    lines.push('', '레퍼런스 패턴 (구조 참고, 직접 복사 금지):');
    for (const p of input.reference_patterns.slice(0, 5)) {
      lines.push(`- [${p.hook_type}] ${p.raw_thumbnail_text} / ${p.structure}`);
    }
  }
  lines.push(
    '',
    '규칙:',
    '1. 9개는 서로 다른 클릭 가설을 가져야 한다.',
    '2. 제목과 썸네일 문구가 같은 말을 반복하면 안 된다.',
    '3. 모든 후보에서 제목·문구·이미지는 같은 클릭 이유를 강화해야 한다.',
    '4. 클릭률 비중: 이미지 45% / 문구 45% / 디자인 10% — 이미지 구성과 문구에 집중하고 design_notes는 최소한으로.',
    '5. 이미지 자체에서(문구 없이도) 클릭 이유가 느껴져야 한다. 공감 = 시청자가 원하면서 피해를 막거나 이득이 되는 방향. 타깃 시청층의 정체성과 무관한 이미지는 금지.',
    '6. 문구는 짧게(권장 16자 이내). 제목 디벨롭 기술(쉬운 일상어/수식어/질문화)을 문구에 재사용하되 제목과 다른 말로.',
    '7. 시선은 왼쪽 위부터 — 핵심 요소는 좌상~중앙, 무게중심은 가운데. 우하단(시간 표시)·상하단 데드존에 핵심 요소를 두지 않는다.',
    '8. 레퍼런스를 쓸 때 그 영상이 클릭된 이유가 이미지 때문인지 제목 때문인지 판단해 그 요소를 디벨롭하고, 불명확하면 둘 다 디벨롭한다.',
    '9. 내 채널에 모인 사람 기준으로 매력을 판단한다 (주제 매몰 금지 — 같은 주제라도 시청층이 다르면 다른 썸네일이어야 한다).',
    '',
    '슬롯 순서: A(zoom×gain), B(zoom×loss_avoidance), C(zoom×curiosity),',
    'D(evidence×gain), E(evidence×loss_avoidance), F(evidence×curiosity),',
    'G(empathy×gain), H(empathy×loss_avoidance), I(empathy×curiosity).',
    '',
    '아래 JSON 배열(9개)만 출력(id 금지):',
    JSON.stringify([{ slot: 'A', thumbnail_text: '', image_composition: '', design_notes: '' }], null, 0),
  );
  return lines.join('\n');
}

function buildFallbackMatrix(input: ThumbnailMatrixInput): ThumbnailMatrixCandidate[] {
  return SLOT_LABELS.map((slot, i) => {
    const { image, text } = SLOT_MATRIX[slot];
    return {
      candidate_id: `tm-${input.video_id}-${slot}`,
      slot,
      image_strategy: image,
      text_strategy: text,
      click_hypothesis: CLICK_HYPOTHESES[slot],
      thumbnail_text: fallbackThumbnailText(slot, input),
      image_composition: fallbackImageComposition(slot, input),
      design_notes: fallbackDesignNotes(slot),
    };
  });
}

/**
 * PRD §3 — 9개 썸네일 매트릭스 생성.
 *
 * 이미지전략(zoom/evidence/empathy) × 문구전략(gain/loss_avoidance/curiosity) = 9개 슬롯(A~I).
 * - LLM 주입 시: 프롬프트 기반 생성, 실패 시 결정론 폴백.
 * - 미주입 시: 곧장 결정론 폴백.
 */
export async function buildThumbnailMatrix9(
  input: ThumbnailMatrixInput,
  deps: ThumbnailMatrixDeps = {},
): Promise<{ candidates: ThumbnailMatrixCandidate[]; source: 'llm' | 'fallback' }> {
  if (!input.video_id?.trim()) throw new Error('video_id must not be empty');
  if (!input.title?.trim()) throw new Error('title must not be empty');
  if (!input.main_click_reason?.trim()) throw new Error('main_click_reason must not be empty');

  if (deps.llmComplete) {
    const prompt = buildMatrixPrompt(input);
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        const parsed = LlmMatrixOutputSchema.parse(JSON.parse(extractJson(rawText)));

        // LLM 출력을 정규화: 슬롯 순서 보장 + 필수 필드 채우기
        const candidates: ThumbnailMatrixCandidate[] = SLOT_LABELS.map((slot) => {
          const llmItem = parsed.find((item) => item.slot === slot);
          const { image, text } = SLOT_MATRIX[slot];
          return {
            candidate_id: `tm-${input.video_id}-${slot}`,
            slot,
            image_strategy: image,
            text_strategy: text,
            click_hypothesis: CLICK_HYPOTHESES[slot],
            thumbnail_text: llmItem?.thumbnail_text ?? fallbackThumbnailText(slot, input),
            image_composition: llmItem?.image_composition ?? fallbackImageComposition(slot, input),
            design_notes: llmItem?.design_notes ?? fallbackDesignNotes(slot),
          };
        });

        // 검증: 9개 전부, 서로 다른 클릭 가설, 제목 중복 금지
        const texts = new Set(candidates.map((c) => c.thumbnail_text));
        if (texts.size < 9) throw new Error('duplicate thumbnail_text');
        if (candidates.some((c) => c.thumbnail_text === input.title)) {
          throw new Error('thumbnail_text must not repeat title');
        }

        // zod 개별 검증
        for (const c of candidates) {
          ThumbnailMatrixCandidateSchema.parse(c);
        }

        return { candidates, source: 'llm' };
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }

  return { candidates: buildFallbackMatrix(input), source: 'fallback' };
}

// ── analyzeThumbnailPsychology ───────────────────────────────────────────────

/** PRD §4.1 문구 구조 유형 매핑 (결정론). */
const TEXT_STRUCTURE_MAP: Record<TextStrategy, string> = {
  gain: '이득 제시',
  loss_avoidance: '손해 회피',
  curiosity: '비밀/은닉',
};

/** PRD §4.1 문구가 자극하는 심리 (결정론). */
const TEXT_PSYCHOLOGY_MAP: Record<TextStrategy, string> = {
  gain: '얻고 싶은 미래를 상상하게 만든다',
  loss_avoidance: '잃고 싶지 않은 두려움을 자극한다',
  curiosity: '알고 싶은 욕구를 자극한다',
};

/** PRD §4.2 이미지 연상 작용 (결정론). */
const IMAGE_ASSOCIATION_MAP: Record<ImageStrategy, string> = {
  zoom: '얼굴/감정 클로즈업 → 감정 전염으로 클릭',
  evidence: '결과 화면/증거 → 진짜 되는지 확인하고 싶어 클릭',
  empathy: '현실 상황 이미지 → 내 상황을 떠올리며 클릭',
};

/** PRD §4.3 결합 심리 (결정론 — image×text 조합). */
const COMBINED_PSYCHOLOGY_MAP: Record<`${ImageStrategy}_${TextStrategy}`, string> = {
  zoom_gain: '주인공의 확신 찬 표정 + 이득 문구 → "나도 저렇게 되고 싶다"',
  zoom_loss_avoidance: '주인공의 걱정 표정 + 손해 문구 → "나도 저 실수를 피해야 한다"',
  zoom_curiosity: '주인공의 의미심장한 표정 + 궁금증 문구 → "뭘 알고 있는 거지?"',
  evidence_gain: '성과 증거 + 이득 문구 → "나도 저 결과를 얻고 싶다"',
  evidence_loss_avoidance: '손실 증거 + 손해 문구 → "나도 저 손실을 막아야 한다"',
  evidence_curiosity: '가려진 증거 + 궁금증 문구 → "정답을 확인하고 싶다"',
  empathy_gain: '공감 상황 + 이득 문구 → "내 상황의 해결책처럼 보인다"',
  empathy_loss_avoidance: '공감 상황 + 손해 문구 → "이거 내 문제를 건드리네"',
  empathy_curiosity: '공감 상황 + 궁금증 문구 → "내 상황인데 답이 숨겨져 있다"',
};

function buildPsychologyPrompt(candidate: ThumbnailMatrixCandidate, title: string): string {
  return [
    '당신은 CMO 심리분석 전문가다. 아래 썸네일 후보의 클릭 심리를 3단계로 분석하라.',
    '',
    `영상 제목: ${title}`,
    `슬롯: ${candidate.slot}`,
    `이미지 전략: ${candidate.image_strategy}`,
    `문구 전략: ${candidate.text_strategy}`,
    `썸네일 문구: ${candidate.thumbnail_text}`,
    `이미지 구성: ${candidate.image_composition}`,
    `클릭 가설: ${candidate.click_hypothesis}`,
    '',
    '분석 항목:',
    '1. text_structure: 문구 구조 유형 (이득제시/손해회피/비밀/반전/증거/비교/금지경고/숫자)',
    '2. text_psychology: 이 문구가 자극하는 심리',
    '3. image_association: 이미지가 연상시키는 것',
    '4. combined_click_psychology: 문구+이미지 결합 최종 심리',
    '5. expected_viewer_question: 시청자가 떠올릴 질문',
    '6. expected_viewer_desire: 시청자 기대 이득',
    '7. expected_viewer_fear: 시청자 기대 손해/두려움',
    '8. click_reason_clarity_score: 클릭 이유 명확도 (0~100)',
    '9. title_text_image_alignment_score: 제목·문구·이미지 정합성 (0~100)',
    '',
    'JSON만 출력:',
    JSON.stringify({
      text_structure: '', text_psychology: '', image_association: '',
      combined_click_psychology: '', expected_viewer_question: '',
      expected_viewer_desire: '', expected_viewer_fear: '',
      click_reason_clarity_score: 0, title_text_image_alignment_score: 0,
    }, null, 0),
  ].join('\n');
}

const LlmPsychologySchema = z.object({
  text_structure: z.string().min(1),
  text_psychology: z.string().min(1),
  image_association: z.string().min(1),
  combined_click_psychology: z.string().min(1),
  expected_viewer_question: z.string().min(1),
  expected_viewer_desire: z.string().min(1),
  expected_viewer_fear: z.string().min(1),
  click_reason_clarity_score: z.number().min(0).max(100),
  title_text_image_alignment_score: z.number().min(0).max(100),
});

function buildFallbackPsychology(candidate: ThumbnailMatrixCandidate): ThumbnailPsychologyAnalysis {
  const { image_strategy, text_strategy } = candidate;
  const key = `${image_strategy}_${text_strategy}` as `${ImageStrategy}_${TextStrategy}`;

  return {
    candidate_id: candidate.candidate_id,
    text_structure: TEXT_STRUCTURE_MAP[text_strategy],
    text_psychology: TEXT_PSYCHOLOGY_MAP[text_strategy],
    image_association: IMAGE_ASSOCIATION_MAP[image_strategy],
    combined_click_psychology: COMBINED_PSYCHOLOGY_MAP[key],
    expected_viewer_question: `이 영상을 보면 ${candidate.click_hypothesis.replace('클릭한다', '')}?`,
    expected_viewer_desire: text_strategy === 'gain'
      ? '결과를 얻고 싶다'
      : text_strategy === 'loss_avoidance'
        ? '손해를 피하고 싶다'
        : '답을 확인하고 싶다',
    expected_viewer_fear: text_strategy === 'loss_avoidance'
      ? '모르면 손해를 본다'
      : text_strategy === 'gain'
        ? '기회를 놓칠 수 있다'
        : '모르고 지나칠 수 있다',
    click_reason_clarity_score: 60,
    title_text_image_alignment_score: 60,
  };
}

/**
 * PRD §4 — 썸네일 심리분석 3단계.
 *
 * 1단계: 문구 구조 분석 (text_structure / text_psychology)
 * 2단계: 이미지 연상 분석 (image_association)
 * 3단계: 결합 심리 분석 (combined_click_psychology + 시청자 예상 반응)
 *
 * - LLM 주입 시: 프롬프트 기반 분석, 실패 시 결정론 폴백.
 * - 미주입 시: 곧장 결정론 폴백.
 */
export async function analyzeThumbnailPsychology(
  candidate: ThumbnailMatrixCandidate,
  deps: ThumbnailMatrixDeps & { title?: string } = {},
): Promise<{ analysis: ThumbnailPsychologyAnalysis; source: 'llm' | 'fallback' }> {
  if (deps.llmComplete) {
    const prompt = buildPsychologyPrompt(candidate, deps.title ?? '');
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        const parsed = LlmPsychologySchema.parse(JSON.parse(extractJson(rawText)));
        const analysis: ThumbnailPsychologyAnalysis = {
          candidate_id: candidate.candidate_id,
          ...parsed,
        };
        ThumbnailPsychologyAnalysisSchema.parse(analysis);
        return { analysis, source: 'llm' };
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }

  return { analysis: buildFallbackPsychology(candidate), source: 'fallback' };
}
