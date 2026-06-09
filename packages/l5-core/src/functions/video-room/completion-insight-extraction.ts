// CMO v3 R7 — 완료 인사이트 추출 (성과 → 다음 기획 입력).
//
// 비전: 업로드 완료 영상의 성과(PerformanceRecord)를 읽어 다음 기획에 주입할
// 재사용 인사이트 후보를 만든다. 예: '도입 30초 이탈률 높음 → 훅 재검토'.
// 각 인사이트는 usage(hook|intro|pulling|topic)로 다음 어느 기획 단계에 쓸지 표시한다.
//
// 컨벤션: llmComplete 주입 + retry + 결정론적 폴백(임계값 기반 규칙).
// 외부 LLM SDK 직접 호출 없음. id는 인덱스 기반 결정론(Date.now/random 미사용).
// 임계값은 followup로 외부화 — 현재는 보수적 기본값을 코드에 둔다.

import { z } from 'zod';
import type { PerformanceRecord } from './performance-ingestion';

export const INSIGHT_USAGES = ['hook', 'intro', 'pulling', 'topic'] as const;
export type InsightUsage = (typeof INSIGHT_USAGES)[number];

export interface InsightCandidate {
  id: string;
  /** 다음 기획에서 주입할 한 줄 인사이트. */
  insight: string;
  /** 어느 기획 단계에 쓸지. */
  usage: InsightUsage;
}

export const InsightCandidateSchema = z.object({
  id: z.string().min(1),
  insight: z.string().min(1),
  usage: z.enum(INSIGHT_USAGES),
});

export interface ExtractCompletionInsightInput {
  performance: PerformanceRecord;
  /** 어떤 키 콘텐츠 영상이었는지. */
  key_content_title: string;
  /** 함께 올린 풀링 주제 제목들(있으면 풀링 인사이트 컨텍스트). */
  pulling_titles?: string[];
  /** 원고 요약(있으면 훅/도입 인사이트 컨텍스트). */
  script_summary?: string;
}

export interface ExtractCompletionInsightDeps {
  /** 프롬프트 → JSON 배열 문자열. 미주입 시 결정론 폴백. */
  llmComplete?: (prompt: string) => Promise<string>;
  /** 형식오류/검증실패 재시도 횟수 (기본 2 = 총 3회). */
  maxRetries?: number;
}

// 결정론 폴백 임계값 (followup: 외부 설정화). 보수적 기본.
const LOW_COMPLETION = 0.4; // 완료율 40% 미만 → 훅/도입 재검토
const LOW_CTR = 0.04; // CTR 4% 미만 → 썸네일/제목(topic) 재검토
const LOW_VIEWS = 1000; // 조회수 1000 미만 → 풀링 노출 부족

// LLM 출력 스키마 (id 없이 받음 — 코드가 인덱스 id 부여) ───────────────────────
const LlmInsightSchema = InsightCandidateSchema.omit({ id: true });
const LlmInsightArraySchema = z.array(LlmInsightSchema);

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

function buildPrompt(input: ExtractCompletionInsightInput): string {
  const { performance: p, key_content_title, pulling_titles, script_summary } = input;
  const lines: string[] = [
    '당신은 CMO다. 업로드 완료된 영상의 성과를 읽고, 다음 콘텐츠 기획을 개선할',
    '재사용 인사이트를 도출하라. 각 인사이트는 한 줄로 명확한 개선 방향이어야 한다.',
    "usage는 'hook'(도입 훅)|'intro'(도입부)|'pulling'(풀링 주제)|'topic'(주제/썸네일) 중 하나.",
    '',
    `영상(키 콘텐츠): ${key_content_title}`,
    `조회수: ${p.view_count}`,
    `완료율: ${Math.round(p.completion_rate * 100)}%`,
    `CTR: ${Math.round(p.ctr * 100)}%`,
  ];
  if (p.retention_notes) lines.push(`시청 유지 메모: ${p.retention_notes}`);
  if (p.feedback) lines.push(`정성 피드백: ${p.feedback}`);
  if (pulling_titles?.length) lines.push(`풀링 주제: ${pulling_titles.join(', ')}`);
  if (script_summary) lines.push(`원고 요약: ${script_summary}`);
  lines.push(
    '',
    '아래 JSON 배열만 출력하라(id 금지). 각 항목 insight는 비우지 마라:',
    JSON.stringify([{ insight: '', usage: 'hook' }], null, 0),
  );
  return lines.join('\n');
}

function assembleInsights(rawText: string): InsightCandidate[] {
  const parsed = LlmInsightArraySchema.parse(JSON.parse(extractJsonArray(rawText)));
  if (parsed.length === 0) throw new Error('expected at least 1 insight');
  return parsed.map((c, i) => InsightCandidateSchema.parse({ id: `insight-${i}`, ...c }));
}

/** 임계값 규칙 기반 결정론 인사이트. LLM 미사용/실패 시. */
function buildFallbackInsights(input: ExtractCompletionInsightInput): InsightCandidate[] {
  const { performance: p, key_content_title } = input;
  const out: { insight: string; usage: InsightUsage }[] = [];

  if (p.completion_rate < LOW_COMPLETION) {
    out.push({
      insight: `완료율 ${Math.round(p.completion_rate * 100)}%로 낮음 → 도입 30초 훅 재검토 (이탈 구간 점검)`,
      usage: 'hook',
    });
    out.push({
      insight: `초반 이탈이 큼 → 도입부 구조를 문제 공감 중심으로 다시 설계`,
      usage: 'intro',
    });
  }
  if (p.ctr < LOW_CTR) {
    out.push({
      insight: `CTR ${Math.round(p.ctr * 100)}%로 낮음 → 썸네일 약속/제목 각도 재검토`,
      usage: 'topic',
    });
  }
  if (p.view_count < LOW_VIEWS) {
    out.push({
      insight: `조회수 ${p.view_count}로 노출 부족 → 검색 수요 큰 풀링 주제 보강`,
      usage: 'pulling',
    });
  }
  if (out.length === 0) {
    // 모든 지표가 임계값 이상 → 성공 패턴을 다음 기획에 재사용.
    out.push({
      insight: `"${key_content_title}"가 성과 양호 (완료율 ${Math.round(
        p.completion_rate * 100,
      )}%, CTR ${Math.round(p.ctr * 100)}%) → 동일 훅/주제 패턴 재사용`,
      usage: 'topic',
    });
  }
  return out.map((c, i) => InsightCandidateSchema.parse({ id: `insight-${i}`, ...c }));
}

/**
 * 완료 영상의 성과를 다음 기획에 주입할 인사이트 후보로 변환한다.
 *
 * - llmComplete 주입 시: 재시도 포함 LLM 추출. 검증 통과한 결과만 사용. 모두 실패하면
 *   임계값 기반 결정론 폴백.
 * - 미주입 시: 곧장 결정론 폴백.
 *
 * id는 인덱스 기반(insight-0..N-1).
 */
export async function extractCompletionInsight(
  input: ExtractCompletionInsightInput,
  deps: ExtractCompletionInsightDeps = {},
): Promise<InsightCandidate[]> {
  if (deps.llmComplete) {
    const prompt = buildPrompt(input);
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        return assembleInsights(rawText);
      } catch {
        // 형식오류/검증실패 → 재시도
      }
    }
  }
  return buildFallbackInsights(input);
}
