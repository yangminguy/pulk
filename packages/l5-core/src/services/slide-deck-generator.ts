import { SlideDeckSpec, SlideDeckSpecType } from '../schemas/slide-deck';
import { generatePptx } from '../converters/pptx-converter';
import { SLIDE_DECK_SYSTEM_PROMPT } from '../prompts/slide-deck-prompt';

/**
 * 슬라이드 덱 생성 파이프라인의 입력 컨텍스트.
 * 기획/비즈니스 컨텍스트를 받아 LLM(또는 결정론적 폴백)으로 SlideDeckSpec을 만든다.
 *
 * 하위호환: 첫 인자로 문자열(이미 생성된 LLM JSON 응답)을 그대로 넘기면
 * 기존 동작(파싱 → 검증 → 변환)을 유지한다.
 */
export interface SlideDeckGenerationInput {
  /** 프레젠테이션 주제 (필수). */
  topic: string;
  /** 발표 대상/오디언스. */
  audience?: string;
  /** 핵심 메시지 또는 본문에 넣을 요점들. */
  keyPoints?: string[];
  /** 작성자. */
  author?: string;
  /** 추가 자유 서술 컨텍스트(원고/브리프 등). */
  context?: string;
}

/**
 * LLM 호출을 외부에서 주입하기 위한 의존성.
 * SDK 직접 호출 금지(repo 컨벤션) — 함수 주입 + 결정론적 폴백.
 */
export interface SlideDeckGenerationDeps {
  /** 프롬프트를 받아 SlideDeckSpec JSON 문자열을 반환. 미주입 시 결정론적 폴백. */
  llmComplete?: (prompt: string) => Promise<string>;
  /**
   * LLM이 형식오류/환각을 낼 때 재시도할 최대 횟수 (SPEC §2.5).
   * 기본 2 (총 최대 3회 시도). 0이면 1회만 시도.
   */
  maxRetries?: number;
}

export type SlideDeckPipelineResult =
  | { status: 'success'; buffer: Buffer; spec: SlideDeckSpecType; source: 'llm' | 'fallback' | 'raw' }
  | { status: 'error'; message: string; error?: unknown };

/** LLM 응답 텍스트에서 JSON 본문만 추출 (코드펜스/잡설 제거). */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

/** 입력 컨텍스트를 LLM 프롬프트(user 메시지)로 직렬화. */
function buildPrompt(input: SlideDeckGenerationInput): string {
  const lines: string[] = [SLIDE_DECK_SYSTEM_PROMPT, '', '---', '입력 컨텍스트:'];
  lines.push(`주제: ${input.topic}`);
  if (input.audience) lines.push(`대상: ${input.audience}`);
  if (input.author) lines.push(`작성자: ${input.author}`);
  if (input.keyPoints?.length) {
    lines.push('핵심 요점:');
    for (const p of input.keyPoints) lines.push(`- ${p}`);
  }
  if (input.context) lines.push(`추가 컨텍스트:\n${input.context}`);
  lines.push('', '위 컨텍스트로 SlideDeckSpec JSON만 출력하라.');
  return lines.join('\n');
}

/**
 * LLM 없이도 최소 유효한 SlideDeckSpec을 만든다(결정론적 폴백).
 * 입력 컨텍스트만으로 제목 슬라이드 + 요점 슬라이드(있으면)를 구성한다.
 */
function buildFallbackSpec(input: SlideDeckGenerationInput): SlideDeckSpecType {
  const slides: SlideDeckSpecType['slides'] = [
    {
      title: input.topic,
      content: input.audience ? `대상: ${input.audience}` : undefined,
      layout: 'TITLE_SLIDE',
    },
  ];

  if (input.keyPoints?.length) {
    slides.push({
      title: '핵심 요점',
      content: input.keyPoints.map((p) => `• ${p}`).join('\n'),
      layout: 'CONTENT_SLIDE',
    });
  }

  if (input.context) {
    slides.push({
      title: '상세',
      content: input.context,
      layout: 'CONTENT_SLIDE',
    });
  }

  return {
    title: input.topic,
    author: input.author,
    slides,
  };
}

/**
 * LLM을 (재시도 포함) 호출해 검증된 SlideDeckSpec을 얻는다.
 * 모든 시도가 실패하면 null 반환 → 호출부가 결정론적 폴백으로 전환.
 */
async function generateSpecViaLlm(
  input: SlideDeckGenerationInput,
  llmComplete: (prompt: string) => Promise<string>,
  maxRetries: number,
): Promise<SlideDeckSpecType | null> {
  const prompt = buildPrompt(input);
  const attempts = Math.max(0, maxRetries) + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await llmComplete(prompt);
      const parsed = JSON.parse(extractJson(raw));
      return SlideDeckSpec.parse(parsed); // zod 검증 실패 시 throw → 재시도
    } catch {
      // 형식오류/환각/zod 실패 → 다음 시도
    }
  }
  return null;
}

/**
 * 슬라이드 덱 생성 파이프라인.
 *
 * - input이 문자열이면: 기존 동작(이미 생성된 LLM JSON 응답을 파싱/검증/변환). source='raw'.
 * - input이 컨텍스트 객체면:
 *   - deps.llmComplete 주입 시: 재시도 포함 LLM 생성(source='llm'), 모두 실패하면 결정론적 폴백(source='fallback').
 *   - 미주입 시: 곧장 결정론적 폴백(source='fallback').
 */
export async function generateSlideDeckPipeline(
  input: string | SlideDeckGenerationInput,
  deps: SlideDeckGenerationDeps = {},
): Promise<SlideDeckPipelineResult> {
  try {
    // 하위호환: 문자열 = 이미 생성된 LLM JSON 응답.
    if (typeof input === 'string') {
      const spec = SlideDeckSpec.parse(JSON.parse(input));
      const buffer = await generatePptx(spec);
      return { status: 'success', buffer, spec, source: 'raw' };
    }

    if (!input.topic || !input.topic.trim()) {
      return { status: 'error', message: 'topic is required' };
    }

    let spec: SlideDeckSpecType | null = null;
    let source: 'llm' | 'fallback' = 'fallback';

    if (deps.llmComplete) {
      spec = await generateSpecViaLlm(input, deps.llmComplete, deps.maxRetries ?? 2);
      if (spec) source = 'llm';
    }

    if (!spec) {
      spec = buildFallbackSpec(input);
      source = 'fallback';
    }

    const buffer = await generatePptx(spec);
    return { status: 'success', buffer, spec, source };
  } catch (error: any) {
    return { status: 'error', message: error?.message || 'Unknown error', error };
  }
}
