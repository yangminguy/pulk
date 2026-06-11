/**
 * 제목 디벨롭 8단계 — LLM 실행기 (PRD §8~§17, §21.4~21.6)
 *
 * WO-2 범위: LLM 추론이 필요한 실행기만. 임계 비교·조합 열거·점수 합산은
 * WO-1 결정론 함수(title-development.ts)를 재사용한다.
 * spec: docs/_acr-progress/wo-2-l5-core-8단계-llm-실행기.md
 *
 * 패턴 (CMO 원칙, video-room/discovery-classification.ts 컨벤션):
 * - LLMClient 주입 — l5-core는 NocoBase/실모델 없이 테스트 가능.
 * - 출력은 JSON(zod 파싱). 형식 오류는 재시도(maxRetries), 소진 시 결정론 폴백.
 * - 전체 실패 금지 — 한 단계가 죽어도 나머지 단계는 진행한다.
 *
 * LLM 출력 JSON 계약(테스트가 정본):
 * - awkwardness: [{ index, awkwardness_score, awkwardness_reason, selected_for_next_step }]
 * - step:        { output_titles, method_explanation, cmo_reasoning,
 *                  rejected_titles:[{title,reason}], selected_titles_for_next_step }
 * - final-eval:  [{ index, target_fit, desire_clarity, problem_sharpness, curiosity_gap,
 *                   script_match, thumbnail_fit, reason, risks, required_script_additions? }]
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LLMClient } from '../ceo-orchestration/types';
import type {
  FinalTitleEvaluation,
  TitleDevelopmentReference,
  TitleDevelopmentStepNumber,
  TitleDevelopmentStepResult,
  TitleDevelopmentWorkflowRun,
  TitleThumbnailCombination,
} from './title-development-types';
import {
  buildSecondBrainSummary,
  generateCrossCombinations,
  generateTitleSearchTerms,
  isAwkward,
  isTitleTooLong,
  recommendFromScore,
  scoreFinalTitle,
  validateTitleReferences,
} from './title-development';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 단계별 디벨롭은 사고가 필요한 판단 — Claude Sonnet 고정. */
export const TITLE_DEVELOPMENT_MODEL = 'claude-sonnet-4-6';

export type DevelopStepNumber = Exclude<TitleDevelopmentStepNumber, 1>;

/** PRD §8 순서 그대로의 2~8단계 이름. */
export const STEP_NAMES: Record<DevelopStepNumber, string> = {
  2: '쉬운 단어로 전환',
  3: '상위어로 전환',
  4: '부정어/반대 구조로 전환',
  5: '수식어 추가',
  6: '답이 보이는 제목을 질문이 생기게 전환',
  7: '핫비디오 구조로 갈아끼우기',
  8: '강한 단어로 변경',
};

const DEVELOP_STEPS: DevelopStepNumber[] = [2, 3, 4, 5, 6, 7, 8];

/** 폴백 시 결과에 남기는 한국어 사유. */
export const AWKWARDNESS_FALLBACK_REASON = '어색함 판단 실패 — 수동 확인 필요';
export const STEP_FALLBACK_REASON = 'LLM 단계 실행 실패 — 입력 제목 유지, 수동 확인 필요';
export const EVAL_FALLBACK_REASON = '최종 평가 실패 — 보수적 기본 점수(수정 후 후보), 수동 확인 필요';

const TITLE_LENGTH_REJECT_REASON = '35자 초과';
const DEFAULT_MAX_RETRIES = 1;

/** PRD §17.2 배점 상한 (개별 항목 클램프용 — 합산 클램프는 WO-1 scoreFinalTitle). */
const SCORE_CAPS = {
  target_fit: 20,
  desire_clarity: 20,
  problem_sharpness: 20,
  curiosity_gap: 15,
  script_match: 15,
  thumbnail_fit: 10,
} as const;

/** 폴백 평가 점수 비율 — 총점이 revise 구간(70~84)에 들어가도록 70%. */
const FALLBACK_SCORE_RATIO = 0.7;

/** 폴백 시 우선 선택하는 기본 2종 조합 (PRD §3.1 "최소 2개"). */
const DEFAULT_SELECTED_COMBINATIONS: TitleThumbnailCombination['combination_type'][] = [
  'ref1_thumbnail_ref2_title',
  'ref1_title_ref2_thumbnail',
];

// ---------------------------------------------------------------------------
// 공통 타입·유틸
// ---------------------------------------------------------------------------

export interface TitleDevelopmentLLMDeps {
  /** 미주입 시 전부 결정론 폴백 (LLM 0콜). */
  llm?: LLMClient;
  /** 콜당 형식오류 재시도 횟수 (기본 1 = 총 2회 시도). */
  maxRetries?: number;
}

/**
 * 뷰트랩 실측 핫비디오 (강의 노트 2026-06-11).
 * 5단계(수식어)·7단계(핫비디오 구조 치환)는 LLM 일반 지식이 아니라
 * 실제 뷰트랩에서 확인한 핫비디오 제목을 재료로 써야 한다.
 * 수집 기준(강의): 성과도/기여도 Good·Great + 조회수 10만+ + 구독자 적은 순 정렬.
 */
export interface HotVideoReference {
  title: string;
  view_count?: number;
  channel_subscribers?: number;
  performance_grade?: string;
  contribution_grade?: string;
  url?: string;
}

export interface TitleDevelopmentTopicContext {
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
  /**
   * 뷰트랩 실측 핫비디오 목록 (옵션). 주입 시 5·7단계 프롬프트에 실데이터로 첨부.
   * 미주입 시 7단계는 폴백 주의 문구를 남기고 일반 구조 지식으로 수행한다.
   */
  hot_videos?: HotVideoReference[];
}

/** 핫비디오 미주입 시 7단계 결과에 남기는 주의 문구. */
export const HOT_VIDEO_MISSING_NOTE =
  '핫비디오 실데이터 미제공 — 뷰트랩 실측 없이 일반 구조 지식으로 수행함. 뷰트랩 확인 권장.';

/** 응답 본문에서 JSON을 추출한다(코드펜스/설명문 허용). */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const start = Math.min(
    ...['[', '{'].map((ch) => {
      const i = trimmed.indexOf(ch);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    }),
  );
  const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
  if (!Number.isFinite(start) || end <= start) {
    throw new Error('응답에서 JSON을 찾지 못했다');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

/**
 * LLM 1콜 + 재시도 + zod 파싱. 실패가 소진되면 null을 반환한다(호출부가 폴백).
 */
async function completeJson<S extends z.ZodTypeAny>(
  schema: S,
  args: {
    deps: TitleDevelopmentLLMDeps | undefined;
    system: string;
    user: string;
    trace_name: string;
    context: TitleDevelopmentTopicContext;
  },
): Promise<z.infer<S> | null> {
  const llm = args.deps?.llm;
  if (!llm) return null;

  const maxRetries = args.deps?.maxRetries ?? DEFAULT_MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await llm.complete({
        system: args.system,
        user: args.user,
        trace_name: args.trace_name,
        trace_metadata: {
          pulling_topic: args.context.pulling_topic,
          model: TITLE_DEVELOPMENT_MODEL,
        },
      });
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // 호출 실패도 형식 오류와 동일하게 재시도
    }
  }
  return null;
}

function baseSystemPrompt(context: TitleDevelopmentTopicContext): string {
  return [
    '너는 CMO다. 풀링 콘텐츠의 제목 디벨롭 8단계 워크플로우를 수행한다.',
    `풀링 주제: ${context.pulling_topic}`,
    `타겟: ${context.target_audience}`,
    context.business_goal ? `비즈니스 목표: ${context.business_goal}` : '',
    '반드시 요구된 JSON만 출력한다. 설명문/코드펜스 금지.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// §21.4 judgeCombinationAwkwardness — 조합 어색함 판단 (1콜 배치)
// ---------------------------------------------------------------------------

const AwkwardnessJudgementSchema = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    awkwardness_score: z.number().nonnegative(),
    awkwardness_reason: z.string().default(''),
    selected_for_next_step: z.boolean(),
  }),
);

export interface JudgeCombinationAwkwardnessResult {
  combinations: TitleThumbnailCombination[];
  fallback_count: number;
}

export async function judgeCombinationAwkwardness(
  combinations: TitleThumbnailCombination[],
  context: TitleDevelopmentTopicContext,
  deps?: TitleDevelopmentLLMDeps,
): Promise<JudgeCombinationAwkwardnessResult> {
  const system = [
    baseSystemPrompt(context),
    '',
    '1단계 교차 조합의 어색함을 판단한다 (PRD §9.5 기준):',
    '- 제목-썸네일 중복: 같은 말을 반복함',
    '- 주제 불일치: 주제 범위가 달라짐',
    '- 타겟 불일치: 타겟이 볼 문장이 아님',
    '- 원고 불일치: 제목 약속과 내용이 다름',
    '- 의미 과장: 원본보다 훨씬 강한 약속',
    '- 클릭 이유 부족: 왜 봐야 하는지 모름',
    'awkwardness_score는 감점 누적(0=정상). 어색하지 않고 디벨롭 가치가 있는 조합만 selected_for_next_step=true.',
    '출력: [{ "index": number, "awkwardness_score": number, "awkwardness_reason": string, "selected_for_next_step": boolean }] — index는 입력 배열 순서.',
  ].join('\n');

  const user = JSON.stringify(
    combinations.map((c, index) => ({
      index,
      combination_type: c.combination_type,
      title_draft: c.title_draft,
      thumbnail_text_draft: c.thumbnail_text_draft,
      thumbnail_direction: c.thumbnail_direction,
    })),
  );

  const judged = await completeJson(AwkwardnessJudgementSchema, {
    deps,
    system,
    user,
    trace_name: 'title-dev-awkwardness',
    context,
  });

  if (judged) {
    const byIndex = new Map(judged.map((j) => [j.index, j]));
    if (combinations.every((_, i) => byIndex.has(i))) {
      return {
        combinations: combinations.map((c, i) => {
          const j = byIndex.get(i)!;
          const passed = !isAwkward(j.awkwardness_score);
          return {
            ...c,
            awkwardness_score: j.awkwardness_score,
            awkwardness_reason: j.awkwardness_reason,
            passed,
            selected_for_next_step: passed && j.selected_for_next_step,
          };
        }),
        fallback_count: 0,
      };
    }
  }

  // 결정론 폴백: 전부 통과 처리 + 기본 2종 조합만 선택 (PRD §3.1)
  return {
    combinations: combinations.map((c) => ({
      ...c,
      awkwardness_score: 0,
      awkwardness_reason: AWKWARDNESS_FALLBACK_REASON,
      passed: true,
      selected_for_next_step: DEFAULT_SELECTED_COMBINATIONS.includes(c.combination_type),
    })),
    fallback_count: 1,
  };
}

// ---------------------------------------------------------------------------
// §21.5 runTitleDevelopmentSteps — 2~8단계 순차 디벨롭 (단계당 1콜)
// ---------------------------------------------------------------------------

const StepResultLLMSchema = z.object({
  output_titles: z.array(z.string()).min(1),
  method_explanation: z.string().min(1),
  cmo_reasoning: z.string().min(1),
  rejected_titles: z.array(z.object({ title: z.string(), reason: z.string() })).default([]),
  selected_titles_for_next_step: z.array(z.string()).default([]),
});

/** PRD §10~§16 실행 방법 요약 + 강의 노트 보강(2026-06-11) — 단계별 프롬프트 주입(P0-8). */
const STEP_GUIDANCE: Record<DevelopStepNumber, string> = {
  2: '제목 안의 전문어/한자어를 타겟이 실제로 쓰는 일상어로 바꾼다(예: 노화가 가속한다→빨리 늙는다, 카페 창업→카페 차리기). 중학생에게 말한다고 생각한다. 자가 점검 3가지: ① 의미가 달라지지 않았는가 ② 바꾼 표현의 검색 수요(조회수 합계)가 더 크다고 볼 근거가 있는가 ③ 사람들이 실제로 많이 쓰는 표현인가. 하나라도 어기면 버린다 (§10).',
  3: '좁은 단어를 더 큰 욕망의 상위어로 넓힌다(예: 창업→돈 버는 법). 전제: 상위어 시장이 실제로 더 커야 한다(조회수 합계 기준) — 근거가 없으면 원래 단어로 되돌린다. 전달하려는 포인트가 달라지면 무효. 상위어 전환 후 일상어 전환 조합도 허용 (§11).',
  4: '긍정형에 부정의 부정을 건다(예: 이렇게 하면 부자된다→이렇게 안 하면 가난해진다). 어감 차이 주의 — 원고에서 그 부정의 근거를 실제로 다루고 있어야 하며, 근거가 없으면 부정형을 쓰지 않는다. 내 평가가 아니라 실제 사람들이 흔들릴 제목인가를 본다 (§12).',
  5: '클릭 이유를 선명하게 만드는 수식어를 추가한다. 수식어는 아래 핫비디오 실데이터(있다면)에서 가져온다 — 같은 분야가 아니어도 같은 강조 구조면 참고 가능. 내 주제가 흐려지면 안 되고, 콘텐츠 내용이 강화되는가가 기준이다. 35자를 넘기면 조사를 먼저 빼고, 그다음 수식어를 뺀다 (§13).',
  6: '결론이 다 보이는 제목에서 정보 일부를 빼 질문이 생기게 만든다. 정보의 누락은 시청자의 욕구 기반 — 누가/언제/어디서/무엇을/어떻게/왜 중 시청자가 혜택(또는 피해)을 얻게 하는 정보를 하나씩 빼본다. 시청자 머리에 물음표(호기심/문제지적/의혹)가 떠야 한다. 제목이 곧 내용이면 안 된다 (§14).',
  7: '아래 핫비디오 실데이터(뷰트랩 실측)의 제목을 구조 단위로 분해해 우리 주제에 치환한다. 베끼지 않는다. 실데이터가 없으면 일반 구조 지식으로 수행하되 결과 method_explanation에 그 사실을 명시한다 (§15).',
  8: '약한 단어를 같은 의미의 강한 단어로 바꾼다. 단, 이 기법은 구독자가 이미 많은 채널용 — 신규/소형 채널이면 강도를 한 단계 낮추고, 최종 후보와 안전 후보를 함께 남긴다. 원고 근거가 부족해도 동일하게 낮춘다 (§16).',
};

/** 핫비디오 실데이터를 쓰는 단계 (강의 노트: 5단계 수식어 + 7단계 구조 치환). */
const HOT_VIDEO_STEPS: ReadonlySet<DevelopStepNumber> = new Set([5, 7]);

/** 핫비디오 목록을 프롬프트 블록으로 직렬화한다 (상위 10개). */
function buildHotVideoBlock(hotVideos: HotVideoReference[]): string {
  const lines = hotVideos.slice(0, 10).map((v, i) => {
    const meta = [
      v.view_count != null ? `조회수 ${v.view_count.toLocaleString()}` : null,
      v.channel_subscribers != null ? `구독자 ${v.channel_subscribers.toLocaleString()}` : null,
      v.performance_grade ? `성과 ${v.performance_grade}` : null,
      v.contribution_grade ? `기여 ${v.contribution_grade}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return `${i + 1}. ${v.title}${meta ? ` (${meta})` : ''}`;
  });
  return ['핫비디오 실데이터 (뷰트랩 실측 — 수식어/구조의 재료):', ...lines].join('\n');
}

export interface RunTitleDevelopmentStepsResult {
  step_results: TitleDevelopmentStepResult[];
  fallback_count: number;
}

function fallbackStepResult(
  step: DevelopStepNumber,
  inputTitles: string[],
): TitleDevelopmentStepResult {
  return {
    step_number: step,
    step_name: STEP_NAMES[step],
    input_titles: inputTitles,
    output_titles: inputTitles,
    method_explanation: STEP_FALLBACK_REASON,
    cmo_reasoning: '결정론 폴백 — 직전 제목을 그대로 다음 단계로 넘긴다.',
    rejected_titles: [],
    selected_titles_for_next_step: inputTitles,
  };
}

export async function runTitleDevelopmentSteps(
  initialTitles: string[],
  context: TitleDevelopmentTopicContext,
  deps?: TitleDevelopmentLLMDeps,
): Promise<RunTitleDevelopmentStepsResult> {
  const step_results: TitleDevelopmentStepResult[] = [];
  let fallback_count = 0;
  let currentTitles = [...initialTitles];

  for (const step of DEVELOP_STEPS) {
    const hotVideos = context.hot_videos ?? [];
    const hotVideoSection = HOT_VIDEO_STEPS.has(step)
      ? hotVideos.length > 0
        ? buildHotVideoBlock(hotVideos)
        : `주의: ${HOT_VIDEO_MISSING_NOTE}`
      : '';
    const system = [
      baseSystemPrompt(context),
      '',
      `제목 디벨롭 ${step}단계: ${STEP_NAMES[step]}`,
      STEP_GUIDANCE[step],
      hotVideoSection,
      '입력 제목 각각을 디벨롭하고, 버린 후보는 이유와 함께 남긴다 (PRD §8).',
      '출력: { "output_titles": string[], "method_explanation": string, "cmo_reasoning": string, "rejected_titles": [{ "title": string, "reason": string }], "selected_titles_for_next_step": string[] }',
    ]
      .filter(Boolean)
      .join('\n');

    const parsed = await completeJson(StepResultLLMSchema, {
      deps,
      system,
      user: JSON.stringify({ input_titles: currentTitles }),
      trace_name: `title-dev-step-${step}`,
      context,
    });

    let result: TitleDevelopmentStepResult;
    if (parsed) {
      result = {
        step_number: step,
        step_name: STEP_NAMES[step],
        input_titles: currentTitles,
        output_titles: parsed.output_titles,
        method_explanation: parsed.method_explanation,
        cmo_reasoning: parsed.cmo_reasoning,
        rejected_titles: parsed.rejected_titles,
        selected_titles_for_next_step:
          parsed.selected_titles_for_next_step.length > 0
            ? parsed.selected_titles_for_next_step
            : parsed.output_titles,
      };
      // §13.4: 5단계(수식어 추가) 출력은 35자 초과 시 탈락 처리
      if (step === 5) {
        const tooLong = result.output_titles.filter((t) => isTitleTooLong(t));
        if (tooLong.length > 0) {
          result.output_titles = result.output_titles.filter((t) => !isTitleTooLong(t));
          result.selected_titles_for_next_step = result.selected_titles_for_next_step.filter(
            (t) => !isTitleTooLong(t),
          );
          result.rejected_titles = [
            ...result.rejected_titles,
            ...tooLong.map((title) => ({ title, reason: TITLE_LENGTH_REJECT_REASON })),
          ];
        }
      }
      // 빈 체인 방지: 후처리로 전부 탈락하면 입력을 유지한다
      if (result.selected_titles_for_next_step.length === 0) {
        result.selected_titles_for_next_step =
          result.output_titles.length > 0 ? result.output_titles : currentTitles;
      }
    } else {
      result = fallbackStepResult(step, currentTitles);
      fallback_count += 1;
    }

    step_results.push(result);
    currentTitles = result.selected_titles_for_next_step;
  }

  return { step_results, fallback_count };
}

// ---------------------------------------------------------------------------
// §21.6 evaluateFinalTitles — 최종 평가 (1콜 배치) + WO-1 점수 합산·임계
// ---------------------------------------------------------------------------

const FinalEvaluationLLMSchema = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    target_fit: z.number(),
    desire_clarity: z.number(),
    problem_sharpness: z.number(),
    curiosity_gap: z.number(),
    script_match: z.number(),
    thumbnail_fit: z.number(),
    reason: z.string(),
    risks: z.array(z.string()).default([]),
    required_script_additions: z.array(z.string()).optional(),
  }),
);

export interface FinalTitleCandidate {
  title: string;
  thumbnail_direction: string;
}

export interface EvaluateFinalTitlesResult {
  evaluations: FinalTitleEvaluation[];
  fallback_count: number;
}

type ScoreKey = keyof typeof SCORE_CAPS;

function clampScores(scores: Record<ScoreKey, number>): Record<ScoreKey, number> {
  const clamped = {} as Record<ScoreKey, number>;
  for (const key of Object.keys(SCORE_CAPS) as ScoreKey[]) {
    clamped[key] = Math.max(0, Math.min(SCORE_CAPS[key], scores[key]));
  }
  return clamped;
}

function buildEvaluation(
  candidate: FinalTitleCandidate,
  scores: Record<ScoreKey, number>,
  reason: string,
  risks: string[],
  required_script_additions?: string[],
): FinalTitleEvaluation {
  const clamped = clampScores(scores);
  const total = scoreFinalTitle(clamped);
  return {
    title: candidate.title,
    thumbnail_direction: candidate.thumbnail_direction,
    ...clamped,
    total_score: total,
    recommendation: recommendFromScore(total),
    reason,
    risks,
    ...(required_script_additions ? { required_script_additions } : {}),
  };
}

export async function evaluateFinalTitles(
  candidates: FinalTitleCandidate[],
  context: TitleDevelopmentTopicContext & { script_summary?: string },
  deps?: TitleDevelopmentLLMDeps,
): Promise<EvaluateFinalTitlesResult> {
  const system = [
    baseSystemPrompt(context),
    '',
    '8단계를 모두 거친 최종 제목 후보를 평가표로 점수화한다 (PRD §17.2):',
    `- target_fit(타겟 적합도, 0~${SCORE_CAPS.target_fit}) / desire_clarity(욕망 선명도, 0~${SCORE_CAPS.desire_clarity}) / problem_sharpness(문제 지적, 0~${SCORE_CAPS.problem_sharpness})`,
    `- curiosity_gap(호기심, 0~${SCORE_CAPS.curiosity_gap}) / script_match(원고 일치도, 0~${SCORE_CAPS.script_match}) / thumbnail_fit(썸네일 결합도, 0~${SCORE_CAPS.thumbnail_fit})`,
    context.script_summary ? `원고 요약: ${context.script_summary}` : '',
    '출력: [{ "index": number, "target_fit": number, "desire_clarity": number, "problem_sharpness": number, "curiosity_gap": number, "script_match": number, "thumbnail_fit": number, "reason": string, "risks": string[], "required_script_additions": string[]? }] — index는 입력 배열 순서.',
  ]
    .filter(Boolean)
    .join('\n');

  const user = JSON.stringify(candidates.map((c, index) => ({ index, ...c })));

  const judged = await completeJson(FinalEvaluationLLMSchema, {
    deps,
    system,
    user,
    trace_name: 'title-dev-final-eval',
    context,
  });

  if (judged) {
    const byIndex = new Map(judged.map((j) => [j.index, j]));
    if (candidates.every((_, i) => byIndex.has(i))) {
      return {
        evaluations: candidates.map((candidate, i) => {
          const j = byIndex.get(i)!;
          return buildEvaluation(candidate, j, j.reason, j.risks, j.required_script_additions);
        }),
        fallback_count: 0,
      };
    }
  }

  // 결정론 폴백: 배점 70% 고정 → revise 구간. 폴백이 자동 업로드 후보가 되지 않게 보수적으로.
  const fallbackScores = {} as Record<ScoreKey, number>;
  for (const key of Object.keys(SCORE_CAPS) as ScoreKey[]) {
    fallbackScores[key] = SCORE_CAPS[key] * FALLBACK_SCORE_RATIO;
  }
  return {
    evaluations: candidates.map((candidate) =>
      buildEvaluation(candidate, fallbackScores, EVAL_FALLBACK_REASON, []),
    ),
    fallback_count: 1,
  };
}

// ---------------------------------------------------------------------------
// 합성 파이프라인 — 검증→조합→어색함→2~8단계→평가→베스트 선택
// ---------------------------------------------------------------------------

export interface TitleDevelopmentWorkflowInput {
  video_project_id: string;
  pulling_content_id: string;
  pulling_topic: string;
  target_audience: string;
  business_goal?: string;
  references: [TitleDevelopmentReference, TitleDevelopmentReference];
  script_summary?: string;
  /** 뷰트랩 실측 핫비디오 (5·7단계 재료). 미주입 시 폴백 주의 문구로 수행. */
  hot_videos?: HotVideoReference[];
}

export type TitleDevelopmentWorkflowResult =
  | { ok: true; run: TitleDevelopmentWorkflowRun; fallback_count: number }
  | {
      ok: false;
      next_action: 'request_more_references';
      failed_references: { reference_id: string; reasons: string[] }[];
    };

export async function runTitleDevelopmentWorkflow(
  input: TitleDevelopmentWorkflowInput,
  deps?: TitleDevelopmentLLMDeps,
): Promise<TitleDevelopmentWorkflowResult> {
  // 레퍼런스 검증 (AC-01~04) — 실패 시 LLM 0콜 조기 반환
  const validation = validateTitleReferences(input.references);
  if (!validation.passed) {
    return {
      ok: false,
      next_action: 'request_more_references',
      failed_references: validation.failed_references,
    };
  }

  const context: TitleDevelopmentTopicContext = {
    pulling_topic: input.pulling_topic,
    target_audience: input.target_audience,
    business_goal: input.business_goal,
    hot_videos: input.hot_videos,
  };

  const searchTerms = generateTitleSearchTerms(context);
  const [ref1, ref2] = input.references;

  // 1단계: 교차 조합(WO-1) + 어색함 판단(LLM)
  const judged = await judgeCombinationAwkwardness(
    generateCrossCombinations(ref1, ref2),
    context,
    deps,
  );

  const selectedCombos = judged.combinations.filter((c) => c.selected_for_next_step);
  const seedCombos =
    selectedCombos.length > 0 ? selectedCombos : judged.combinations.filter((c) => c.passed);
  const initialTitles = (seedCombos.length > 0 ? seedCombos : judged.combinations).map(
    (c) => c.title_draft,
  );

  // 2~8단계 디벨롭 (LLM)
  const steps = await runTitleDevelopmentSteps(initialTitles, context, deps);

  // 최종 평가 (LLM 항목점수 + WO-1 합산·임계)
  const lastStep = steps.step_results[steps.step_results.length - 1];
  const thumbnailDirection =
    seedCombos[0]?.thumbnail_direction ?? judged.combinations[0]?.thumbnail_direction ?? '';
  const candidates: FinalTitleCandidate[] = lastStep.selected_titles_for_next_step.map(
    (title) => ({ title, thumbnail_direction: thumbnailDirection }),
  );
  const evals = await evaluateFinalTitles(
    candidates,
    { ...context, script_summary: input.script_summary },
    deps,
  );

  // 베스트 = 최고 total_score (동점이면 앞 순서)
  const best = evals.evaluations.reduce((acc, e) => (e.total_score > acc.total_score ? e : acc));

  const now = new Date().toISOString();
  const run: TitleDevelopmentWorkflowRun = {
    id: randomUUID(),
    video_project_id: input.video_project_id,
    pulling_content_id: input.pulling_content_id,
    pulling_topic: input.pulling_topic,
    target_audience: input.target_audience,
    business_goal: input.business_goal,
    exact_search_terms: searchTerms.exact_search_terms,
    expanded_search_terms: searchTerms.expanded_search_terms,
    forbidden_search_terms: searchTerms.forbidden_search_terms,
    references: input.references,
    combinations: judged.combinations,
    step_results: steps.step_results,
    final_candidates: evals.evaluations,
    selected_title: best.title,
    selected_thumbnail_direction: best.thumbnail_direction,
    approval_status: 'draft', // AC-13: Founder 승인 전 외부 게시 금지
    created_at: now,
    updated_at: now,
  };
  run.second_brain_summary = buildSecondBrainSummary(run); // AC-15

  return {
    ok: true,
    run,
    fallback_count: judged.fallback_count + steps.fallback_count + evals.fallback_count,
  };
}
