// 6주차 썸네일 강의·컨설팅 방법론 보강 (B1~B6)
//
// B1: 이미지 디벨롭 6기술 + 후보별 개선 제안 + 뷰트랩 성과 썸네일 구성 학습
// B2: "내 채널에 모인 사람" 시청층 정합 판정 (judgeThumbnailAudienceFit)
// B3: 썸네일 문구에 제목 디벨롭 기술(2·5·6단계) 재적용
// B4: 썸네일↔도입부 강도 연동 ("썸네일이 9점이면 도입부도 9점")
// B5: 디벨롭 자가 재귀 점검 ("더 후킹되게 됐나? 왜 후킹 된 거지?")
// B6: 타깃 채널 우선 발굴 — "대표님들이 볼만한 채널인지가 제일 중요하다"
//
// 컨벤션: thumbnail-matrix.ts와 동일 — llmComplete 주입 + 결정론 폴백.
// 외부 LLM SDK 직접 호출 없음. NocoBase 비의존 순수 로직.

import { z } from 'zod';
import type { ThumbnailHookType, ThumbnailPattern } from './types';
import {
  THUMBNAIL_TEXT_RECOMMENDED_MAX,
  type ThumbnailMatrixDeps,
  type ThumbnailMatrixInput,
} from './thumbnail-matrix';

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const objStart = body.indexOf('{');
  const objEnd = body.lastIndexOf('}');
  const arrStart = body.indexOf('[');
  const arrEnd = body.lastIndexOf(']');
  // 배열이 객체보다 바깥에 있으면 배열 우선
  if (arrStart !== -1 && arrEnd > arrStart && (objStart === -1 || arrStart < objStart)) {
    return body.slice(arrStart, arrEnd + 1);
  }
  if (objStart !== -1 && objEnd > objStart) {
    return body.slice(objStart, objEnd + 1);
  }
  return body.trim();
}

/** LLM 1콜 + 재시도 + zod 파싱. 소진 시 null (호출부가 결정론 폴백). */
async function completeJson<S extends z.ZodTypeAny>(
  schema: S,
  prompt: string,
  deps: ThumbnailMatrixDeps | undefined,
): Promise<z.infer<S> | null> {
  const llm = deps?.llmComplete;
  if (!llm) return null;
  const attempts = Math.max(0, deps?.maxRetries ?? 2) + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await llm(prompt);
      const parsed = schema.safeParse(JSON.parse(extractJson(raw)));
      if (parsed.success) return parsed.data;
    } catch {
      // 호출 실패/형식 오류 → 재시도
    }
  }
  return null;
}

/** 유니코드 코드포인트 기준 글자 수 (이모지 안전). */
function charCount(text: string): number {
  return [...text.trim()].length;
}

// ═════════════════════════════════════════════════════════════════════════════
// B1. 이미지 디벨롭 6기술
// ═════════════════════════════════════════════════════════════════════════════

export const IMAGE_DEVELOP_TECHNIQUE_IDS = [
  'zoom',
  'evidence',
  'curiosity',
  'empathy',
  'audience_preferred',
  'reference_learning',
] as const;

export type ImageDevelopTechniqueId = (typeof IMAGE_DEVELOP_TECHNIQUE_IDS)[number];

export interface ImageDevelopTechnique {
  id: ImageDevelopTechniqueId;
  name: string;
  principle: string;
}

/**
 * 강의 정본(6주차) — 이미지 디벨롭 6기술.
 * 1~5는 후보 1개에 직접 적용(developThumbnailImage),
 * 6(reference_learning)은 뷰트랩 성과 썸네일 구성 학습(learnThumbnailPatternsFromReferences).
 */
export const IMAGE_DEVELOP_TECHNIQUES: readonly ImageDevelopTechnique[] = [
  {
    id: 'zoom',
    name: '확대',
    principle:
      '클릭 포인트 외 요소를 과감히 제거하고 확대한다. 주인공이 썸네일만 보고도 보여야 한다.',
  },
  {
    id: 'evidence',
    name: '증거',
    principle: '이득은 문구로, 증거는 이미지로 보여준다. 결과 화면/숫자/실물이 증거다.',
  },
  {
    id: 'curiosity',
    name: '궁금증',
    principle: '정답이 다 안 보이게 만든다. 일부 가림/블러로 확인하고 싶게 한다.',
  },
  {
    id: 'empathy',
    name: '공감',
    principle:
      '시청자 상황에 공감하는 이미지를 쓴다. 시선은 왼쪽 위부터 — 공감 요소를 좌상~중앙에 둔다.',
  },
  {
    id: 'audience_preferred',
    name: '시청층 선호',
    principle:
      '타깃과 무관한 이미지면 그들이 좋아하는 이미지로 교체한다. 주제 적합보다 시청층 적합이 우선.',
  },
  {
    id: 'reference_learning',
    name: '뷰트랩 성과 썸네일 구성 학습',
    principle:
      '분야마다 매력 요소가 다르므로 성과도·기여도 높은 썸네일 구성을 반복 학습한다. 같은 카테고리면 된다.',
  },
] as const;

/** 후보 1개에 직접 적용되는 기술(1~5). 6번은 학습 함수가 담당. */
export const DIRECT_DEVELOP_TECHNIQUE_IDS: readonly ImageDevelopTechniqueId[] = [
  'zoom',
  'evidence',
  'curiosity',
  'empathy',
  'audience_preferred',
] as const;

// ── developThumbnailImage ────────────────────────────────────────────────────

export interface ThumbnailImageDevelopCandidate {
  candidate_id?: string;
  thumbnail_text: string;
  image_composition: string;
}

export interface ImageDevelopSuggestion {
  technique: ImageDevelopTechniqueId;
  applicable: boolean;
  suggestion: string;
}

export interface DevelopThumbnailImageResult {
  candidate_id?: string;
  suggestions: ImageDevelopSuggestion[];
  notes: string[];
  source: 'llm' | 'fallback';
}

const LlmImageDevelopSchema = z.array(
  z.object({
    technique: z.enum([
      'zoom',
      'evidence',
      'curiosity',
      'empathy',
      'audience_preferred',
    ] as const),
    applicable: z.boolean(),
    suggestion: z.string().min(1),
  }),
);

function buildImageDevelopPrompt(
  candidate: ThumbnailImageDevelopCandidate,
  input: Pick<
    ThumbnailMatrixInput,
    'title' | 'target_audience' | 'target_problem' | 'target_desire' | 'main_click_reason'
  > & { channel_audience_profile?: string },
): string {
  const techniqueLines = IMAGE_DEVELOP_TECHNIQUES.filter((t) =>
    DIRECT_DEVELOP_TECHNIQUE_IDS.includes(t.id),
  ).map((t) => `- ${t.id}(${t.name}): ${t.principle}`);
  return [
    '당신은 CMO다. 아래 썸네일 후보 1개에 이미지 디벨롭 기술 1~5를 적용한 개선 제안을 만든다.',
    '',
    `영상 제목: ${input.title}`,
    `핵심 클릭 이유: ${input.main_click_reason}`,
    `타깃: ${input.target_audience}`,
    `타깃 문제: ${input.target_problem}`,
    `타깃 욕구: ${input.target_desire}`,
    input.channel_audience_profile ? `내 채널에 모인 사람: ${input.channel_audience_profile}` : '',
    '',
    `썸네일 문구: ${candidate.thumbnail_text}`,
    `이미지 구성: ${candidate.image_composition}`,
    '',
    '기술 정의:',
    ...techniqueLines,
    '',
    '각 기술에 대해 적용 가능 여부(applicable)와 구체적 개선 제안(suggestion)을 낸다.',
    '적용이 무의미하면 applicable=false + 이유를 suggestion에 쓴다.',
    '',
    'JSON 배열(5개)만 출력:',
    '[{"technique":"zoom","applicable":true,"suggestion":""}]',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 결정론 폴백: 기술별 적용 제안 템플릿. */
function fallbackImageDevelopSuggestions(
  candidate: ThumbnailImageDevelopCandidate,
  input: Pick<
    ThumbnailMatrixInput,
    'target_audience' | 'target_problem' | 'target_desire' | 'main_click_reason'
  >,
): ImageDevelopSuggestion[] {
  return [
    {
      technique: 'zoom',
      applicable: true,
      suggestion: `클릭 포인트(${input.main_click_reason}) 외 요소를 과감히 제거하고 주인공을 확대 — 썸네일만 보고도 주인공이 보여야 한다.`,
    },
    {
      technique: 'evidence',
      applicable: true,
      suggestion: `이득(${input.target_desire})은 문구로 두고, 증거(결과 화면/숫자/실물)를 이미지로 추가.`,
    },
    {
      technique: 'curiosity',
      applicable: true,
      suggestion: '정답이 다 보이지 않게 핵심 일부를 가림/블러 처리 — 확인하고 싶게 만든다.',
    },
    {
      technique: 'empathy',
      applicable: true,
      suggestion: `${input.target_audience}의 상황(${input.target_problem})에 공감하는 장면을 좌상~중앙에 배치 — 시선은 왼쪽 위부터.`,
    },
    {
      technique: 'audience_preferred',
      applicable: true,
      suggestion: `현재 이미지(${candidate.image_composition})가 ${input.target_audience}와 무관하면 그들이 좋아하는 이미지로 교체.`,
    },
  ];
}

/**
 * B1 — 후보 1개에 이미지 디벨롭 기술 1~5를 적용한 개선 제안 생성.
 * LLM 주입 시 LLM, 실패/미주입 시 결정론 템플릿 폴백.
 */
export async function developThumbnailImage(
  candidate: ThumbnailImageDevelopCandidate,
  input: Pick<
    ThumbnailMatrixInput,
    'title' | 'target_audience' | 'target_problem' | 'target_desire' | 'main_click_reason'
  > & { channel_audience_profile?: string },
  deps: ThumbnailMatrixDeps = {},
): Promise<DevelopThumbnailImageResult> {
  if (!candidate.thumbnail_text?.trim()) throw new Error('thumbnail_text must not be empty');

  const parsed = await completeJson(
    LlmImageDevelopSchema,
    buildImageDevelopPrompt(candidate, input),
    deps,
  );
  if (parsed) {
    const byTechnique = new Map(parsed.map((s) => [s.technique, s]));
    if (DIRECT_DEVELOP_TECHNIQUE_IDS.every((t) => byTechnique.has(t as never))) {
      return {
        candidate_id: candidate.candidate_id,
        suggestions: DIRECT_DEVELOP_TECHNIQUE_IDS.map((t) => byTechnique.get(t as never)!),
        notes: [],
        source: 'llm',
      };
    }
  }

  return {
    candidate_id: candidate.candidate_id,
    suggestions: fallbackImageDevelopSuggestions(candidate, input),
    notes: deps.llmComplete
      ? ['LLM 제안 실패 — 결정론 템플릿 폴백. 수동 검토 권장.']
      : ['LLM 미주입 — 결정론 템플릿 제안.'],
    source: 'fallback',
  };
}

// ── learnThumbnailPatternsFromReferences ─────────────────────────────────────

export interface ThumbnailReferenceInput {
  video_id: string;
  title: string;
  thumbnail_url?: string;
  thumbnail_text?: string;
  view_count: number;
  performance_grade?: string;
  contribution_grade?: string;
}

export interface LearnedThumbnailPattern extends ThumbnailPattern {
  /** 성과도/기여도 실측 여부 — 미실측이면 false로 투명 표기(조작 금지). */
  measured: boolean;
  source_note: string;
}

export interface LearnThumbnailPatternsResult {
  patterns: LearnedThumbnailPattern[];
  eligible_count: number;
  unmeasured_count: number;
  notes: string[];
  source: 'llm' | 'fallback';
}

/** 성과도/기여도 등급이 Good·Great(또는 한국어 동급)인지. */
function isGoodGrade(grade: string | undefined): boolean {
  if (!grade) return false;
  return /good|great|좋음|아주\s*좋음|높음/i.test(grade);
}

/** 결정론 hook_type 추정 (텍스트 키워드 기반). */
export function estimateHookType(text: string): ThumbnailHookType {
  if (/손해|망했|망함|실수|잃|날리|후회/.test(text)) return 'loss';
  if (/하지\s*마|금지|위험|경고|조심|절대/.test(text)) return 'warning';
  if (/vs|차이|비교/i.test(text)) return 'contrast';
  if (/결과|후기|증명|인증|달성/.test(text)) return 'result';
  if (/전문가|박사|년\s*차|원장|대표가\s*말/.test(text)) return 'authority';
  if (/벌었|버는|수익|매출|얻는|되는\s*법|방법/.test(text)) return 'gain';
  return 'curiosity';
}

const LlmPatternSchema = z.array(
  z.object({
    video_id: z.string().min(1),
    hook_type: z.enum(['loss', 'gain', 'curiosity', 'warning', 'authority', 'result', 'contrast']),
    structure: z.string().min(1),
    reusable_formula: z.string().min(1),
    adapted_thumbnail_candidates: z.array(z.string()).default([]),
  }),
);

function buildPatternLearningPrompt(refs: ThumbnailReferenceInput[]): string {
  const lines = refs.map((r, i) => {
    const meta = [
      `조회수 ${r.view_count.toLocaleString()}`,
      r.performance_grade ? `성과 ${r.performance_grade}` : '성과 미실측',
      r.contribution_grade ? `기여 ${r.contribution_grade}` : '기여 미실측',
    ].join(', ');
    return `${i + 1}. video_id=${r.video_id} / 제목: ${r.title} / 썸네일 문구: ${r.thumbnail_text ?? '(미확보)'} (${meta})`;
  });
  return [
    '당신은 CMO다. 같은 카테고리의 성과 썸네일 구성을 학습한다.',
    '분야마다 매력 요소가 다르므로 성과도·기여도 높은 썸네일 구성을 반복 학습한다.',
    '',
    '레퍼런스:',
    ...lines,
    '',
    '각 레퍼런스의 썸네일 구성을 분석해 다음을 출력:',
    '- hook_type: loss|gain|curiosity|warning|authority|result|contrast 중 하나',
    '- structure: 문구/이미지 구조 (예: "손실 숫자 + 경고 표정")',
    '- reusable_formula: 우리 주제에 재사용할 공식',
    '- adapted_thumbnail_candidates: 우리가 쓸 수 있는 변형 문구 1~3개',
    '',
    'JSON 배열만 출력:',
    '[{"video_id":"","hook_type":"curiosity","structure":"","reusable_formula":"","adapted_thumbnail_candidates":[]}]',
  ].join('\n');
}

/**
 * B1-6 — 뷰트랩 발굴 결과(같은 카테고리)에서 성과 썸네일 구성을 학습한다.
 *
 * 자격 필터: 성과도/기여도 Good·Great 실측 우선. 미실측은 제외하지 않되
 * measured=false로 투명 표기한다(조작 금지). 결과는 ThumbnailPattern 호환 —
 * buildThumbnailMatrix9의 reference_patterns 자동 주입 소스가 된다.
 */
export async function learnThumbnailPatternsFromReferences(
  refs: ThumbnailReferenceInput[],
  deps: ThumbnailMatrixDeps = {},
): Promise<LearnThumbnailPatternsResult> {
  const notes: string[] = [];
  if (refs.length === 0) {
    return { patterns: [], eligible_count: 0, unmeasured_count: 0, notes: ['레퍼런스 없음'], source: 'fallback' };
  }

  const measured = refs.filter(
    (r) => isGoodGrade(r.performance_grade) || isGoodGrade(r.contribution_grade),
  );
  const unmeasured = refs.filter(
    (r) => r.performance_grade == null && r.contribution_grade == null,
  );
  // 우선순위: 실측 Good/Great → 미실측(투명 표기) → 나머지(낮은 등급)는 제외
  const eligible = [
    ...measured.sort((a, b) => b.view_count - a.view_count),
    ...unmeasured.sort((a, b) => b.view_count - a.view_count),
  ].slice(0, 10);

  if (eligible.length === 0) {
    notes.push('자격 충족 레퍼런스 없음 — 성과도/기여도 Good·Great 또는 미실측(투명 표기)만 학습 대상.');
    return { patterns: [], eligible_count: 0, unmeasured_count: unmeasured.length, notes, source: 'fallback' };
  }
  if (unmeasured.length > 0) {
    notes.push(`성과도/기여도 미실측 ${unmeasured.length}건 포함 — measured=false로 투명 표기(실측처럼 조작 금지).`);
  }

  const measuredIds = new Set(measured.map((r) => r.video_id));
  const toPattern = (
    r: ThumbnailReferenceInput,
    analysis: { hook_type: ThumbnailHookType; structure: string; reusable_formula: string; adapted_thumbnail_candidates: string[] },
  ): LearnedThumbnailPattern => ({
    id: `tp-${r.video_id}`,
    reference_video_id: r.video_id,
    raw_thumbnail_text: r.thumbnail_text?.trim() || r.title,
    hook_type: analysis.hook_type,
    structure: analysis.structure,
    reusable_formula: analysis.reusable_formula,
    adapted_thumbnail_candidates: analysis.adapted_thumbnail_candidates,
    measured: measuredIds.has(r.video_id),
    source_note: measuredIds.has(r.video_id)
      ? `성과 ${r.performance_grade ?? '-'} / 기여 ${r.contribution_grade ?? '-'} 실측`
      : '성과도/기여도 미실측 — 조회수만 확인됨',
  });

  const parsed = await completeJson(LlmPatternSchema, buildPatternLearningPrompt(eligible), deps);
  if (parsed) {
    const byId = new Map(parsed.map((p) => [p.video_id, p]));
    if (eligible.every((r) => byId.has(r.video_id))) {
      return {
        patterns: eligible.map((r) => toPattern(r, byId.get(r.video_id)!)),
        eligible_count: eligible.length,
        unmeasured_count: unmeasured.length,
        notes,
        source: 'llm',
      };
    }
  }

  // 결정론 폴백: 텍스트 기반 hook_type 추정 + 'unanalyzed' 노트
  notes.push(deps.llmComplete ? 'LLM 구성 분석 실패 — 결정론 추정(unanalyzed).' : 'LLM 미주입 — 결정론 추정(unanalyzed).');
  return {
    patterns: eligible.map((r) => {
      const text = r.thumbnail_text?.trim() || r.title;
      return toPattern(r, {
        hook_type: estimateHookType(text),
        structure: `문구 "${text}" — 구조 미분석(unanalyzed)`,
        reusable_formula: `unanalyzed — "${text}"의 hook_type(${estimateHookType(text)})만 텍스트로 추정`,
        adapted_thumbnail_candidates: [],
      });
    }),
    eligible_count: eligible.length,
    unmeasured_count: unmeasured.length,
    notes,
    source: 'fallback',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B2. "내 채널에 모인 사람" 시청층 정합 판정
// ═════════════════════════════════════════════════════════════════════════════

export type ThumbnailAudienceFit = 'match' | 'partial' | 'mismatch' | 'unknown';

export interface ThumbnailAudienceFitResult {
  fit: ThumbnailAudienceFit;
  reason: string;
  source: 'llm' | 'fallback';
}

const LlmAudienceFitSchema = z.object({
  fit: z.enum(['match', 'partial', 'mismatch']),
  reason: z.string().min(1),
});

/**
 * B2 — 썸네일 후보가 "내 채널에 모인 사람"에게 매력적인지 LLM 정합 판정.
 * 주제 매몰 금지 — 같은 주제라도 시청층이 다르면 다른 썸네일이어야 한다.
 * LLM 실패/미주입 시 'unknown' graceful.
 */
export async function judgeThumbnailAudienceFit(
  candidate: { thumbnail_text: string; image_composition?: string },
  profile: string,
  deps: ThumbnailMatrixDeps = {},
): Promise<ThumbnailAudienceFitResult> {
  if (!profile?.trim()) {
    return { fit: 'unknown', reason: 'channel_audience_profile 미제공 — 판정 불가', source: 'fallback' };
  }

  const prompt = [
    '당신은 CMO다. 썸네일 후보가 "내 채널에 모인 사람"에게 매력적인지 판정한다.',
    '주제 매몰 금지 — 같은 주제라도 시청층이 다르면 다른 썸네일이어야 한다.',
    '',
    `내 채널에 모인 사람: ${profile}`,
    `썸네일 문구: ${candidate.thumbnail_text}`,
    candidate.image_composition ? `이미지 구성: ${candidate.image_composition}` : '',
    '',
    '판정: match(이 시청층이 클릭한다) | partial(일부만) | mismatch(이 시청층은 자기 일로 안 본다)',
    'JSON만 출력: {"fit":"match","reason":""}',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await completeJson(LlmAudienceFitSchema, prompt, deps);
  if (parsed) {
    return { fit: parsed.fit, reason: parsed.reason, source: 'llm' };
  }
  return {
    fit: 'unknown',
    reason: deps.llmComplete
      ? 'LLM 판정 실패 — 시청층 정합 수동 확인 필요'
      : 'LLM 미주입 — 시청층 정합 수동 확인 필요',
    source: 'fallback',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B3. 썸네일 문구에 제목 디벨롭 기술 재적용 (2·5·6단계)
// ═════════════════════════════════════════════════════════════════════════════

export const THUMBNAIL_TEXT_TITLE_TECHNIQUES = ['easy_words', 'modifier', 'question'] as const;
export type ThumbnailTextTitleTechnique = (typeof THUMBNAIL_TEXT_TITLE_TECHNIQUES)[number];

/**
 * 출처: cmo-strategy/title-development-llm.ts STEP_GUIDANCE 2·5·6단계 (PRD §10/§13/§14).
 * cmo-strategy → video-room 의존 방향이 이미 존재해(stage-script/plan-turn) 역방향 import는
 * 순환이 된다 → 가이던스 문자열을 썸네일 문구용으로 복제·번안한다.
 */
export const THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE: Record<ThumbnailTextTitleTechnique, string> = {
  easy_words:
    '(제목 2단계) 문구 안의 전문어/한자어를 타깃이 실제로 쓰는 일상어로 바꾼다(예: 노화가 가속한다→빨리 늙는다). 중학생에게 말한다고 생각한다. 의미가 달라지면 버린다.',
  modifier:
    '(제목 5단계) 클릭 이유를 선명하게 만드는 수식어를 추가한다. 내 주제가 흐려지면 안 된다. 썸네일 문구는 짧아야 하므로 수식어를 넣고도 16자 이내를 유지한다.',
  question:
    '(제목 6단계) 정답이 다 보이는 문구에서 정보 일부를 빼 질문이 생기게 만든다. 시청자 머리에 물음표(호기심/문제지적/의혹)가 떠야 한다.',
};

export interface ThumbnailTextDevelopCandidate {
  technique: ThumbnailTextTitleTechnique;
  text: string;
  char_count: number;
  over_limit: boolean;
  warning?: string;
  /** over_limit일 때만 — 16자 이내 결정론 축약 후보. */
  shortened_candidate?: string;
}

export interface DevelopThumbnailTextResult {
  candidates: ThumbnailTextDevelopCandidate[];
  notes: string[];
  source: 'llm' | 'fallback';
}

const LlmTextDevelopSchema = z.array(
  z.object({
    technique: z.enum(['easy_words', 'modifier', 'question']),
    text: z.string().min(1),
  }),
);

/** 결정론 축약: 코드포인트 기준 권장 길이로 자른다. */
function shortenText(text: string, max: number = THUMBNAIL_TEXT_RECOMMENDED_MAX): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return text.trim();
  return chars.slice(0, max).join('').trim();
}

function inspectTextCandidate(
  technique: ThumbnailTextTitleTechnique,
  text: string,
): ThumbnailTextDevelopCandidate {
  const count = charCount(text);
  const over = count > THUMBNAIL_TEXT_RECOMMENDED_MAX;
  return {
    technique,
    text: text.trim(),
    char_count: count,
    over_limit: over,
    ...(over
      ? {
          warning: `문구 ${count}자 — 권장 ${THUMBNAIL_TEXT_RECOMMENDED_MAX}자 초과. 썸네일은 글씨를 줄여야 한다.`,
          shortened_candidate: shortenText(text),
        }
      : {}),
  };
}

/**
 * B3 — 제목 디벨롭 2단계(쉬운 단어)·5단계(수식어)·6단계(질문 생기게)를
 * 썸네일 문구에 재적용한 후보 3개 생성. LLM 1콜, 폴백=원문 유지+노트.
 * 각 후보는 16자(THUMBNAIL_TEXT_RECOMMENDED_MAX) 검수 — 초과 시 경고+축약 후보.
 */
export async function developThumbnailTextWithTitleTechniques(
  input: { text: string; topic: string; target_audience: string },
  deps: ThumbnailMatrixDeps = {},
): Promise<DevelopThumbnailTextResult> {
  if (!input.text?.trim()) throw new Error('text must not be empty');

  const prompt = [
    '당신은 CMO다. 제목 디벨롭 기술을 썸네일 문구에 재적용해 후보 3개를 만든다.',
    `주제: ${input.topic}`,
    `타깃: ${input.target_audience}`,
    `원본 썸네일 문구: ${input.text}`,
    '',
    '기술 (각 1개씩):',
    `- easy_words: ${THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.easy_words}`,
    `- modifier: ${THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.modifier}`,
    `- question: ${THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE.question}`,
    '',
    `규칙: 문구는 ${THUMBNAIL_TEXT_RECOMMENDED_MAX}자 이내. 제목과 같은 말 반복 금지.`,
    'JSON 배열(3개)만 출력:',
    '[{"technique":"easy_words","text":""},{"technique":"modifier","text":""},{"technique":"question","text":""}]',
  ].join('\n');

  const parsed = await completeJson(LlmTextDevelopSchema, prompt, deps);
  if (parsed) {
    const byTechnique = new Map(parsed.map((c) => [c.technique, c]));
    if (THUMBNAIL_TEXT_TITLE_TECHNIQUES.every((t) => byTechnique.has(t))) {
      return {
        candidates: THUMBNAIL_TEXT_TITLE_TECHNIQUES.map((t) =>
          inspectTextCandidate(t, byTechnique.get(t)!.text),
        ),
        notes: [],
        source: 'llm',
      };
    }
  }

  return {
    candidates: THUMBNAIL_TEXT_TITLE_TECHNIQUES.map((t) => inspectTextCandidate(t, input.text)),
    notes: [
      deps.llmComplete
        ? 'LLM 디벨롭 실패 — 원문 유지. 수동 디벨롭 필요.'
        : 'LLM 미주입 — 원문 유지. 수동 디벨롭 필요.',
    ],
    source: 'fallback',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B4. 썸네일↔도입부 강도 연동 ("썸네일이 9점이면 도입부도 9점")
// ═════════════════════════════════════════════════════════════════════════════

export interface IntroHookStrengthResult {
  /** 0~10. LLM 실패/미주입 시 null. */
  score: number | null;
  reason: string;
  source: 'llm' | 'fallback';
}

const LlmIntroHookSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string().min(1),
});

/** B4 — 도입부 후킹 강도 0~10 점수 (LLM, 폴백 null+노트). */
export async function scoreIntroHookStrength(
  input: { intro_text: string },
  deps: ThumbnailMatrixDeps = {},
): Promise<IntroHookStrengthResult> {
  if (!input.intro_text?.trim()) {
    return { score: null, reason: 'intro_text 비어 있음 — 점수 산정 불가', source: 'fallback' };
  }

  const prompt = [
    '당신은 CMO다. 영상 도입부의 후킹 강도를 0~10으로 채점한다.',
    '기준: 첫 문장이 시청자를 붙잡는가, 약속이 선명한가, 이탈 이유를 차단하는가.',
    '',
    `도입부: ${input.intro_text}`,
    '',
    'JSON만 출력: {"score":0,"reason":""}',
  ].join('\n');

  const parsed = await completeJson(LlmIntroHookSchema, prompt, deps);
  if (parsed) {
    return {
      score: Math.max(0, Math.min(10, parsed.score)),
      reason: parsed.reason,
      source: 'llm',
    };
  }
  return {
    score: null,
    reason: deps.llmComplete
      ? 'LLM 채점 실패 — 도입부 강도 수동 평가 필요'
      : 'LLM 미주입 — 도입부 강도 수동 평가 필요',
    source: 'fallback',
  };
}

export type HookIntensityAlignmentStatus = 'aligned' | 'intro_weaker' | 'insufficient_data';

export interface HookIntensityAlignment {
  status: HookIntensityAlignmentStatus;
  /** thumbnail_score - intro_score. 데이터 부족 시 null. */
  gap: number | null;
  warning?: string;
  recommended_action?: string;
}

/**
 * B4 — 순수 결정론: "썸네일이 9점이면 도입부도 9점" 강도 정합 판정.
 * intro_score >= thumbnail_score - 1 이면 aligned, 아니면 intro_weaker 경고.
 * null/undefined 입력은 insufficient_data graceful.
 */
export function evaluateHookIntensityAlignment(input: {
  thumbnail_score: number | null | undefined;
  intro_score: number | null | undefined;
}): HookIntensityAlignment {
  const { thumbnail_score, intro_score } = input;
  if (thumbnail_score == null || intro_score == null) {
    return {
      status: 'insufficient_data',
      gap: null,
      warning: '썸네일/도입부 점수 중 하나 이상 없음 — 강도 정합 판단 불가',
    };
  }
  const gap = thumbnail_score - intro_score;
  if (intro_score >= thumbnail_score - 1) {
    return { status: 'aligned', gap };
  }
  return {
    status: 'intro_weaker',
    gap,
    warning: `도입부 강도(${intro_score})가 썸네일 강도(${thumbnail_score})보다 ${gap}점 약함 — 썸네일이 9점이면 도입부도 9점이어야 한다.`,
    recommended_action: '도입부를 썸네일 기대 수준으로 보강',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B5. 디벨롭 자가 재귀 점검 ("더 후킹되게 됐나? 왜 후킹 된 거지?")
// ═════════════════════════════════════════════════════════════════════════════

export interface DevelopImprovementInput {
  /** 원본 레퍼런스 또는 이전 단계 산출물. */
  original: string;
  /** 디벨롭 결과물. */
  developed: string;
  /** 주제/타깃 등 보조 컨텍스트(옵션). */
  context?: string;
}

export interface DevelopImprovementResult {
  /** true=개선됨, false=후퇴, null=판단 불가. */
  improved: boolean | null;
  hook_reason_original: string;
  hook_reason_developed: string;
  recommendation: 'keep' | 'redo' | 'unknown';
  reason: string;
  source: 'llm' | 'fallback';
}

const LlmImprovementSchema = z.object({
  improved: z.boolean(),
  hook_reason_original: z.string().min(1),
  hook_reason_developed: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * B5 — 디벨롭 결과의 자가 재귀 점검 (제목·썸네일 공용).
 * "더 후킹되게 됐나? 왜 후킹 된 거지?"를 원본 대비 판정.
 * improved=true → keep, false → redo. LLM 실패/미주입 시 unknown(+keep 권장 노트).
 */
export async function evaluateDevelopImprovement(
  input: DevelopImprovementInput,
  deps: ThumbnailMatrixDeps = {},
): Promise<DevelopImprovementResult> {
  if (!input.original?.trim() || !input.developed?.trim()) {
    throw new Error('original and developed must not be empty');
  }

  const prompt = [
    '당신은 CMO다. 디벨롭 결과가 원본보다 더 후킹되게 됐는지 자가 점검한다.',
    '핵심 질문: ① 더 후킹되게 됐나? ② (원본/디벨롭 각각) 왜 후킹 된 거지?',
    input.context ? `컨텍스트: ${input.context}` : '',
    '',
    `원본: ${input.original}`,
    `디벨롭 결과: ${input.developed}`,
    '',
    '후킹 이유를 설명할 수 없으면 개선이 아니다. 강해 보여도 클릭 이유가 흐려졌으면 후퇴다.',
    'JSON만 출력: {"improved":true,"hook_reason_original":"","hook_reason_developed":"","reason":""}',
  ]
    .filter(Boolean)
    .join('\n');

  const parsed = await completeJson(LlmImprovementSchema, prompt, deps);
  if (parsed) {
    return {
      improved: parsed.improved,
      hook_reason_original: parsed.hook_reason_original,
      hook_reason_developed: parsed.hook_reason_developed,
      recommendation: parsed.improved ? 'keep' : 'redo',
      reason: parsed.reason,
      source: 'llm',
    };
  }

  return {
    improved: null,
    hook_reason_original: '판단 불가',
    hook_reason_developed: '판단 불가',
    recommendation: 'unknown',
    reason: deps.llmComplete
      ? 'LLM 판정 실패 — 수동 점검 필요. 점검 전까지는 디벨롭 결과 유지(keep) 권장.'
      : 'LLM 미주입 — 수동 점검 필요. 점검 전까지는 디벨롭 결과 유지(keep) 권장.',
    source: 'fallback',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// B6. 타깃 채널 우선 발굴 (도메인 부분)
// ═════════════════════════════════════════════════════════════════════════════

/** 컨설팅 정본 — 채널 선별의 제1 기준. */
export const AUDIENCE_CHANNEL_CRITERIA =
  '대표님(타깃)들이 볼만한 채널인지가 제일 중요하다 — 주제 적합보다 시청층 적합 우선.';

export interface ChannelFirstDiscoveryInput {
  product: string;
  target_audience: string;
  /** 내(우리 상품) 용어 목록 — 발견 주제를 이 용어로 변환해 재검색한다. */
  my_terms: string[];
}

export interface TermMapping {
  /** 타깃 채널에서 발견된(또는 발견 예상) 주제 용어. */
  discovered_term: string;
  /** 내 용어로 변환한 결과. */
  my_term: string;
}

export interface ChannelFirstDiscoveryPlan {
  /** ① 타깃이 볼만한 채널을 찾는 유튜브 검색 쿼리. */
  channel_queries: string[];
  /** ② 발견 주제 → 내 용어 변환 매핑. */
  term_mappings: TermMapping[];
  /** ③ 변환된 용어로 다시 돌리는 재검색 쿼리. */
  requery_terms: string[];
  notes: string[];
  source: 'llm' | 'fallback';
}

const LlmDiscoveryPlanSchema = z.object({
  channel_queries: z.array(z.string().min(1)).min(1),
  term_mappings: z
    .array(z.object({ discovered_term: z.string().min(1), my_term: z.string().min(1) }))
    .default([]),
  requery_terms: z.array(z.string().min(1)).min(1),
});

/**
 * B6 — 컨설팅 절차 코드화: 타깃 채널 우선 발굴 계획.
 * ① 타깃이 볼만한 채널 검색 쿼리(네이버/메타 발상 포함하되 출력은 유튜브 검색용)
 * ② 발견 주제 → 내 용어 매핑 ③ 재검색 쿼리.
 * LLM 1콜, 폴백=결정론 쿼리 조합.
 */
export async function buildChannelFirstDiscoveryPlan(
  input: ChannelFirstDiscoveryInput,
  deps: ThumbnailMatrixDeps = {},
): Promise<ChannelFirstDiscoveryPlan> {
  if (!input.target_audience?.trim()) throw new Error('target_audience must not be empty');

  const prompt = [
    '당신은 CMO 컨설턴트다. 타깃 채널 우선 발굴 계획을 만든다.',
    `상품: ${input.product}`,
    `타깃: ${input.target_audience}`,
    `내 용어: ${input.my_terms.join(', ') || '(없음)'}`,
    '',
    '절차:',
    '① 타깃이 볼만한 채널을 찾는 유튜브 검색 쿼리를 만든다. 발상은 네이버 카페/메타 광고 타깃팅처럼',
    '   "이 사람들이 평소 뭘 보는가"에서 출발하되, 출력은 전부 유튜브 검색용 쿼리여야 한다.',
    `   ${AUDIENCE_CHANNEL_CRITERIA}`,
    '② 그 채널들에서 발견될 주제 용어를 내 용어로 변환하는 매핑을 만든다.',
    '③ 변환된 내 용어로 다시 검색할 재검색 쿼리를 만든다.',
    '',
    'JSON만 출력: {"channel_queries":[],"term_mappings":[{"discovered_term":"","my_term":""}],"requery_terms":[]}',
  ].join('\n');

  const parsed = await completeJson(LlmDiscoveryPlanSchema, prompt, deps);
  if (parsed) {
    return {
      channel_queries: parsed.channel_queries,
      term_mappings: parsed.term_mappings,
      requery_terms: parsed.requery_terms,
      notes: [AUDIENCE_CHANNEL_CRITERIA],
      source: 'llm',
    };
  }

  // 결정론 폴백: 타깃 키워드 조합 쿼리
  const audience = input.target_audience.trim();
  const channelQueries = [
    audience,
    `${audience} 브이로그`,
    `${audience} 인터뷰`,
    `${audience} 고민`,
    `${audience} 일상`,
    ...(input.product.trim() ? [`${audience} ${input.product.trim()}`] : []),
  ];
  const termMappings: TermMapping[] = input.my_terms
    .filter((t) => t.trim())
    .map((t) => ({ discovered_term: t.trim(), my_term: t.trim() }));
  const requeryTerms = [
    ...input.my_terms.filter((t) => t.trim()).map((t) => t.trim()),
    ...input.my_terms.filter((t) => t.trim()).map((t) => `${audience} ${t.trim()}`),
  ];
  return {
    channel_queries: channelQueries,
    term_mappings: termMappings,
    requery_terms: requeryTerms.length > 0 ? requeryTerms : [audience],
    notes: [
      AUDIENCE_CHANNEL_CRITERIA,
      deps.llmComplete
        ? 'LLM 계획 실패 — 결정론 쿼리 조합. 발견 주제→내 용어 변환은 발굴 후 수동/재호출 필요.'
        : 'LLM 미주입 — 결정론 쿼리 조합. 발견 주제→내 용어 변환은 발굴 후 수동/재호출 필요.',
    ],
    source: 'fallback',
  };
}

// ── selectAudienceChannels ───────────────────────────────────────────────────

export interface AudienceChannelCandidate {
  channel_id: string;
  name: string;
  subscribers?: number;
  description?: string;
}

export interface AudienceChannelJudgement extends AudienceChannelCandidate {
  would_watch: boolean;
  reason: string;
}

export interface SelectAudienceChannelsResult {
  selected: AudienceChannelJudgement[];
  rejected: AudienceChannelJudgement[];
  criteria: string;
  source: 'llm' | 'fallback';
}

const LlmChannelJudgementSchema = z.array(
  z.object({
    channel_id: z.string().min(1),
    would_watch: z.boolean(),
    reason: z.string().min(1),
  }),
);

/**
 * B6 — 채널 후보 중 "대표님(타깃)이 볼만한 채널" 필터.
 * 기준은 AUDIENCE_CHANNEL_CRITERIA 정본. LLM 판정 + 결정론 키워드 폴백.
 */
export async function selectAudienceChannels(
  channels: AudienceChannelCandidate[],
  opts: { target_audience: string },
  deps: ThumbnailMatrixDeps = {},
): Promise<SelectAudienceChannelsResult> {
  if (!opts.target_audience?.trim()) throw new Error('target_audience must not be empty');
  if (channels.length === 0) {
    return { selected: [], rejected: [], criteria: AUDIENCE_CHANNEL_CRITERIA, source: 'fallback' };
  }

  const prompt = [
    '당신은 CMO 컨설턴트다. 아래 채널 후보 중 타깃이 실제로 볼만한 채널을 고른다.',
    AUDIENCE_CHANNEL_CRITERIA,
    `타깃: ${opts.target_audience}`,
    '',
    '채널 후보:',
    ...channels.map(
      (c) =>
        `- channel_id=${c.channel_id} / ${c.name}${c.subscribers != null ? ` (구독자 ${c.subscribers.toLocaleString()})` : ''}${c.description ? ` — ${c.description}` : ''}`,
    ),
    '',
    '각 채널에 대해 would_watch(타깃이 볼만한가)와 reason을 판정한다.',
    'JSON 배열만 출력: [{"channel_id":"","would_watch":true,"reason":""}]',
  ].join('\n');

  const parsed = await completeJson(LlmChannelJudgementSchema, prompt, deps);
  if (parsed) {
    const byId = new Map(parsed.map((j) => [j.channel_id, j]));
    if (channels.every((c) => byId.has(c.channel_id))) {
      const judged: AudienceChannelJudgement[] = channels.map((c) => {
        const j = byId.get(c.channel_id)!;
        return { ...c, would_watch: j.would_watch, reason: j.reason };
      });
      return {
        selected: judged.filter((j) => j.would_watch),
        rejected: judged.filter((j) => !j.would_watch),
        criteria: AUDIENCE_CHANNEL_CRITERIA,
        source: 'llm',
      };
    }
  }

  // 결정론 폴백: 타깃 키워드 매칭 (이름+설명)
  const tokens = opts.target_audience
    .split(/[\s,/·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const judged: AudienceChannelJudgement[] = channels.map((c) => {
    const haystack = `${c.name} ${c.description ?? ''}`;
    const hit = tokens.find((t) => haystack.includes(t));
    return hit
      ? { ...c, would_watch: true, reason: `결정론 폴백 — 타깃 키워드 "${hit}" 매칭. LLM 재판정 권장.` }
      : { ...c, would_watch: false, reason: '결정론 폴백 — 타깃 키워드 미매칭. LLM 재판정 권장.' };
  });
  return {
    selected: judged.filter((j) => j.would_watch),
    rejected: judged.filter((j) => !j.would_watch),
    criteria: AUDIENCE_CHANNEL_CRITERIA,
    source: 'fallback',
  };
}
