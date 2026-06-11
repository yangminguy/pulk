// CMO Video Room — BusinessPTContextSnapshot builder and validators (PRD §7.0).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() calls inside.
// All id and timestamp values must be injected by the caller.

import type { BusinessPTContextSnapshot, BusinessPTSourceRef } from './types';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

export interface CreateBusinessPTContextSnapshotInput {
  id: string;
  video_project_id: string;
  loaded_at: string;
  source_refs: BusinessPTSourceRef[];
  key_principles?: string[];
  key_content_rules: string[];
  pulling_content_rules: string[];
  thumbnail_intro_rules?: string[];
  script_structure_rules?: string[];
  caution_notes?: string[];
  freshness_status: 'fresh' | 'stale' | 'needs_refresh';
}

export function createBusinessPTContextSnapshot(
  input: CreateBusinessPTContextSnapshotInput,
): BusinessPTContextSnapshot {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.video_project_id, 'video_project_id');
  requireNonEmpty(input.loaded_at, 'loaded_at');

  return {
    id: input.id.trim(),
    video_project_id: input.video_project_id.trim(),
    loaded_at: input.loaded_at.trim(),
    source_refs: input.source_refs,
    key_principles: input.key_principles ?? [],
    key_content_rules: input.key_content_rules,
    pulling_content_rules: input.pulling_content_rules,
    thumbnail_intro_rules: input.thumbnail_intro_rules ?? [],
    script_structure_rules: input.script_structure_rules ?? [],
    caution_notes: input.caution_notes ?? [],
    freshness_status: input.freshness_status,
  };
}

/**
 * PRD §7.0 completion check:
 * - source_refs must have at least 3 entries
 * - key_content_rules must be non-empty
 * - pulling_content_rules must be non-empty
 *
 * Throws an Error with a descriptive message if any condition is not met.
 */
export function assertContextLoadingComplete(snapshot: BusinessPTContextSnapshot): void {
  if (snapshot.source_refs.length < 3) {
    throw new Error(
      `context loading incomplete: at least 3 source_refs required (got ${snapshot.source_refs.length})`,
    );
  }
  if (snapshot.key_content_rules.length === 0) {
    throw new Error('context loading incomplete: key_content_rules must not be empty');
  }
  if (snapshot.pulling_content_rules.length === 0) {
    throw new Error('context loading incomplete: pulling_content_rules must not be empty');
  }
}

export function isContextFresh(snapshot: BusinessPTContextSnapshot): boolean {
  return snapshot.freshness_status === 'fresh';
}

// ── PT 규칙 자동 도출 (rules 미입력 시) ──────────────────────────────────────
// 출처: 비즈니스 PT 강의(1~6주차)·PRD cmo-content-strategy-v3의 고정 원칙.
// LLM이 가용하면 Second Brain 발췌에서 프로젝트 맞춤 규칙을 도출하고,
// 실패/미가용 시 아래 강의 기반 기본 규칙으로 폴백한다(전체 흐름 정지 금지).

export const DEFAULT_KEY_CONTENT_RULES: readonly string[] = [
  '상품 자랑이 아니라 고객 문제 역설계로 판매 논리를 만든다 (기능 → 문제 → 판매 논리 6요소)',
  '문제를 소비자 행동 5단계(현상·욕구·계획·행동·보상)에 배치하고 진입 단계를 정한다',
  '조회수 5만+ · 성과도/기여도 Good 이상 레퍼런스로 검증한다 (채널·인물 가치 배제)',
  '시청자 정체성이 우리 타깃과 같은 콘텐츠만 후보로 삼는다 (댓글이 직접 증거)',
];

export const DEFAULT_PULLING_CONTENT_RULES: readonly string[] = [
  '모든 풀링은 키 콘텐츠로 이어지는 브릿지 문장이 있어야 통과한다',
  '세트 전체가 소비자 행동 5단계를 자연스럽게 덮는다 (개별 고정 배정 금지)',
  '에버그린·데일리 중심으로 깔고 결에 맞는 시즌성·히어로를 얹는다',
  '오래됐는데도 노출 확률이 좋은 주제(노다지)를 발견하면 반드시 쓴다',
];

export interface DerivePTRulesDeps {
  llmComplete?: (prompt: string) => Promise<string>;
}

export interface DerivedPTRules {
  key_content_rules: string[];
  pulling_content_rules: string[];
  source: 'llm' | 'fallback';
  notes: string[];
}

/**
 * Second Brain 발췌(source_refs 라벨 등)에서 이번 프로젝트에 적용할
 * 키/풀링 기획 규칙을 도출한다. LLM 실패 시 강의 기반 기본 규칙 폴백.
 */
export async function derivePTRules(
  sources: string[],
  context: { product?: string; target_audience?: string } = {},
  deps: DerivePTRulesDeps = {},
): Promise<DerivedPTRules> {
  const fallback: DerivedPTRules = {
    key_content_rules: [...DEFAULT_KEY_CONTENT_RULES],
    pulling_content_rules: [...DEFAULT_PULLING_CONTENT_RULES],
    source: 'fallback',
    notes: ['LLM 미가용/실패 — 비즈니스 PT 강의 기반 기본 규칙 적용'],
  };
  if (!deps.llmComplete) return fallback;
  try {
    const prompt = [
      '당신은 비즈니스 PT 방법론 기반 콘텐츠 전략가다. 아래 Second Brain 발췌와 상품 정보를 바탕으로,',
      '이번 영상 프로젝트에 적용할 "키 콘텐츠 기획 규칙"과 "풀링 콘텐츠 기획 규칙"을 각각 3~6개 도출하라.',
      '반드시 JSON만 출력: {"key_content_rules": string[], "pulling_content_rules": string[]}',
      `상품: ${context.product ?? '(미상)'} / 타깃: ${context.target_audience ?? '(미상)'}`,
      '--- Second Brain 발췌 ---',
      ...sources.slice(0, 12).map((s, i) => `${i + 1}. ${s}`),
    ].join('\n');
    const raw = await deps.llmComplete(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    const key = Array.isArray(parsed.key_content_rules)
      ? parsed.key_content_rules.map(String).filter((s: string) => s.trim())
      : [];
    const pulling = Array.isArray(parsed.pulling_content_rules)
      ? parsed.pulling_content_rules.map(String).filter((s: string) => s.trim())
      : [];
    if (key.length === 0 || pulling.length === 0) return fallback;
    return { key_content_rules: key, pulling_content_rules: pulling, source: 'llm', notes: [] };
  } catch {
    return fallback;
  }
}
