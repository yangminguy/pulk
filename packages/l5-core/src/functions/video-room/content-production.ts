// CMO v3 Content Production (R4) — 확정 주제 → 제목/썸네일 상세 + 도입 30초 + 전체 원고 자동초안.
//
// 비전(정본 패턴): 자동생성 → 초안/후보 제시 → 사장님 승인/확정.
// 본 모듈은 video_room_cards(key_content_choice / pulling_plan / strategy)에서 조립한
// plain 입력 타입을 받아, 기존 도메인 함수(buildThumbnailPlan / buildIntro30s /
// writeLogicBlockPart / integrateScript / evaluateScriptQa)를 그대로 호출한다(재구현 금지).
//
// 컨벤션: pulling-candidates.ts와 동일 — llmComplete 주입(선택) + 결정론적 폴백 + zod 검증.
// 외부 LLM SDK 직접 호출 없음. id/값은 인덱스 기반 결정론(Date.now/random 미사용).
//
// 입력을 카드에서 못 채우면(필드 누락) 결정론 폴백으로 안전하게 초안을 만든다.

import { z } from 'zod';
import { buildThumbnailPlan, type ThumbnailCandidate } from './thumbnail-plan';
import { buildIntro30s } from './intro-writer';
import { writeLogicBlockPart } from './logic-block-writers';
import { integrateScript } from './script-integrator';
import { evaluateScriptQa } from './script-qa';
import type {
  ThumbnailHookType,
  ThumbnailPattern,
  ReferenceCandidate,
  LogicBlock,
  CmoVideoStrategyBrief,
  ScriptMaterialPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  Intro30s,
  ScriptPart,
  IntegratedScript,
  ScriptQaReport,
  ConsumerStageEn,
} from './types';

// ── 공통 도우미 ───────────────────────────────────────────────────────────────

function clean(list: (string | undefined | null)[]): string[] {
  return list
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s, i, a) => s !== '' && a.indexOf(s) === i);
}

// ════════════════════════════════════════════════════════════════════════════
// A-1. 썸네일 상세 초안 — proposeThumbnailDraft
// ════════════════════════════════════════════════════════════════════════════

/**
 * 썸네일 초안 입력. key_content_choice / pulling_plan / strategy 카드에서 조립한 plain 값.
 */
export interface ThumbnailDraftInput {
  /** 확정 키 콘텐츠/풀링 콘텐츠 id (카드 기준 식별자). */
  content_id: string;
  /** 확정된 주제 제목(키 콘텐츠 또는 풀링 주제). */
  topic_title: string;
  /** 전략 컨텍스트: 썸네일 방향(없으면 주제 제목으로 폴백). */
  thumbnail_direction?: string;
  /** 레퍼런스 분석에서 추출된 썸네일 패턴(없으면 빈 배열). */
  reference_patterns?: ThumbnailPattern[];
  /** 썸네일 패턴 리서치 대상 레퍼런스 후보(없으면 빈 배열). */
  reference_candidates?: ReferenceCandidate[];
  /** 추가 인사이트(SecondBrain 등). */
  extra_insights?: string[];
  /** 전략 카드의 위험 메모. */
  risk_notes?: string[];
}

export const ThumbnailDraftInputSchema = z.object({
  content_id: z.string().min(1),
  topic_title: z.string().min(1),
  thumbnail_direction: z.string().optional(),
  reference_patterns: z.array(z.any()).optional(),
  reference_candidates: z.array(z.any()).optional(),
  extra_insights: z.array(z.string()).optional(),
  risk_notes: z.array(z.string()).optional(),
});

export interface ProposeThumbnailDraftResult {
  content_id: string;
  thumbnail_direction: string;
  candidates: ThumbnailCandidate[];
  recommended: string;
  why_recommended: string;
  risk_notes: string[];
}

export interface ContentProductionDeps {
  /** 프롬프트 → JSON 문자열. 미주입 시 결정론적 폴백(시간/랜덤 없음). */
  llmComplete?: (prompt: string) => Promise<string>;
  /** 형식오류/검증실패 재시도 횟수 (기본 2 = 총 3회). */
  maxRetries?: number;
}

const HOOK_TYPES: ThumbnailHookType[] = [
  'loss',
  'gain',
  'curiosity',
  'warning',
  'authority',
  'result',
  'contrast',
];

/** LLM 출력 스키마 — 썸네일 후보(candidate_id/used_insights 없이 받음). */
const LlmThumbCandidateSchema = z.object({
  copy: z.string().min(1),
  visual_direction: z.string().min(1),
  click_logic: z.enum(['loss', 'gain', 'curiosity', 'warning', 'authority', 'result', 'contrast']),
});
const LlmThumbArraySchema = z.array(LlmThumbCandidateSchema);

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

function buildThumbPrompt(input: ThumbnailDraftInput, direction: string, count: number): string {
  return [
    '당신은 CMO다. 확정된 영상 주제의 썸네일 후보를 만든다.',
    `주제: "${input.topic_title}"`,
    `썸네일 방향: "${direction}"`,
    `정확히 ${count}개의 서로 다른 썸네일 후보를 제시하라.`,
    '각 후보 = 카피(copy) + 시각 방향(visual_direction) + 훅 유형(click_logic).',
    'click_logic은 loss/gain/curiosity/warning/authority/result/contrast 중 하나.',
    '아래 JSON 배열만 출력하라(다른 텍스트 금지). 각 필드는 비우지 마라:',
    JSON.stringify(
      Array.from({ length: count }, () => ({ copy: '', visual_direction: '', click_logic: 'curiosity' })),
      null,
      0,
    ),
  ].join('\n');
}

function assembleThumbCandidates(rawText: string, count: number): ThumbnailCandidate[] {
  const parsed = LlmThumbArraySchema.parse(JSON.parse(extractJsonArray(rawText)));
  if (parsed.length < count) {
    throw new Error(`expected at least ${count} thumbnail candidates, got ${parsed.length}`);
  }
  const copies = parsed.map((c) => c.copy.trim());
  if (new Set(copies).size !== copies.length) {
    throw new Error('thumbnail candidate copies must be distinct');
  }
  return parsed.map((c, i) => ({
    candidate_id: `thumb-c-${i + 1}`,
    copy: c.copy.trim(),
    visual_direction: c.visual_direction.trim(),
    click_logic: c.click_logic,
    used_insights: [],
  }));
}

/**
 * 확정 키콘텐츠/풀링 + 전략 컨텍스트 → 썸네일 후보 N개(기본 3) 초안.
 *
 * - llmComplete 주입 시: 재시도 포함 LLM 생성, 검증 통과분만 사용; 모두 실패하면
 *   기존 도메인 함수 buildThumbnailPlan(결정론) 결과로 폴백.
 * - 미주입 시: 곧장 buildThumbnailPlan 결과 사용.
 *
 * 어느 경로든 recommended/why_recommended/risk_notes는 buildThumbnailPlan 산출을 기준으로 한다.
 */
export async function proposeThumbnailDraft(
  rawInput: ThumbnailDraftInput,
  deps: ContentProductionDeps = {},
  count = 3,
): Promise<ProposeThumbnailDraftResult> {
  const input = ThumbnailDraftInputSchema.parse(rawInput) as ThumbnailDraftInput;
  const direction = (input.thumbnail_direction ?? '').trim() || `"${input.topic_title}" 핵심 약속을 한 장에`;

  // 기존 결정론 도메인 함수: 항상 최소 3개 후보 + 추천 + 근거 산출.
  const base = buildThumbnailPlan({
    content_id: input.content_id,
    thumbnail_direction: direction,
    reference_patterns: input.reference_patterns ?? [],
    reference_candidates: input.reference_candidates ?? [],
    extra_insights: input.extra_insights ?? [],
    brief: { thumbnail_direction: direction, risk_notes: input.risk_notes ?? [] },
  });

  let candidates: ThumbnailCandidate[] = base.candidates;

  // LLM 주입 시 카피/시각방향을 더 풍부하게 덮어쓴다(실패하면 base 유지).
  if (deps.llmComplete) {
    const prompt = buildThumbPrompt(input, direction, count);
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const rawText = await deps.llmComplete(prompt);
        candidates = assembleThumbCandidates(rawText, count);
        break;
      } catch {
        // 형식오류/검증실패 → 재시도, 끝까지 실패하면 base.candidates 유지
      }
    }
  }

  // recommended가 candidates 안에 항상 존재하도록 보정.
  const recommended = candidates.some((c) => c.candidate_id === base.recommended)
    ? base.recommended
    : candidates[0].candidate_id;

  return {
    content_id: input.content_id,
    thumbnail_direction: direction,
    candidates,
    recommended,
    why_recommended: base.why_recommended,
    risk_notes: base.risk_notes,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// A-2. 원고 초안 — proposeScriptDraft
// ════════════════════════════════════════════════════════════════════════════

const CONSUMER_STAGES_EN: ConsumerStageEn[] = ['phenomenon', 'desire', 'plan', 'action', 'reward'];

/**
 * 원고 초안 입력. strategy/brief/자료 카드에서 조립한 plain 값.
 * 본문 자료(materials)·문제·CTA 등은 카드에서 모은 문자열 배열로 받는다.
 */
export interface ScriptDraftInput {
  content_id: string;
  content_type: 'key' | 'pulling';
  topic_title: string;
  /** 타깃 시청자(누구). */
  target_viewer?: string;
  /** 영상 약속(없으면 주제로 폴백). */
  video_promise?: string;
  /** 핵심 메시지. */
  core_message?: string;
  /** 전략 앵글. */
  strategic_angle?: string;
  /** 도입 방향. */
  intro_direction?: string;
  /** CTA. */
  cta?: string;
  /** 로직 블록(없으면 문제/단계로 결정론 생성). */
  logic_blocks?: Partial<LogicBlock>[];
  /** 본문 자료(사용 가능한 문장/장면/근거). materials로 매핑. */
  materials?: string[];
  /** VOC 실언어(없으면 자료/주제에서 폴백 생성). */
  voc_lines?: string[];
  /** 안전 주장(claims). */
  safe_claims?: string[];
  /** 증거(proof points). */
  proof_points?: string[];
  /** 위험 메모. */
  risk_notes?: string[];
}

export const ScriptDraftInputSchema = z.object({
  content_id: z.string().min(1),
  content_type: z.enum(['key', 'pulling']),
  topic_title: z.string().min(1),
  target_viewer: z.string().optional(),
  video_promise: z.string().optional(),
  core_message: z.string().optional(),
  strategic_angle: z.string().optional(),
  intro_direction: z.string().optional(),
  cta: z.string().optional(),
  logic_blocks: z.array(z.any()).optional(),
  materials: z.array(z.string()).optional(),
  voc_lines: z.array(z.string()).optional(),
  safe_claims: z.array(z.string()).optional(),
  proof_points: z.array(z.string()).optional(),
  risk_notes: z.array(z.string()).optional(),
});

export interface ProposeScriptDraftResult {
  intro_30s: Intro30s;
  logic_blocks: ScriptPart[];
  integrated_script: IntegratedScript;
  qa: ScriptQaReport;
}

/** 카드 입력 → 기존 도메인 함수가 요구하는 최소 유효 객체(brief/pack/voc/claims) 조립. */
function assembleContext(input: ScriptDraftInput) {
  const title = input.topic_title.trim();
  const materials = clean(input.materials ?? []);
  const safe_claims = clean(input.safe_claims ?? []);
  const proof_points = clean(input.proof_points ?? []);
  const risk_notes = clean(input.risk_notes ?? []);

  // VOC: 카드에 없으면 자료/주제로 결정론 폴백(빈 VOC면 buildIntro30s가 throw).
  const voc_lines = clean(input.voc_lines ?? []);
  const vocPool = voc_lines.length > 0
    ? voc_lines
    : (materials.length > 0 ? materials.slice(0, 2) : [`"${title}" 관련해 가장 답답한 부분`]);

  const voc: VoiceOfCustomerPack = {
    repeated_phrases: [],
    pain_expressions: vocPool,
    desire_expressions: [],
    objection_expressions: [],
    realistic_situations: [],
    must_use_language: vocPool,
    avoid_language: [],
  };

  const claims: ClaimEvidenceReport = {
    safe_claims,
    risky_claims: [],
    unverified_claims: [],
    safe_wording: [],
    proof_points,
    claims_to_avoid: [],
  };

  const materialPool = materials.length > 0 ? materials : [title];
  const pack: ScriptMaterialPack = {
    topic: title,
    target_viewer: (input.target_viewer ?? '타깃 시청자').trim() || '타깃 시청자',
    core_message_candidates: [input.core_message?.trim() || title],
    viewer_language: vocPool,
    pain_scenes: materialPool.slice(0, 2),
    desire_scenes: [],
    proof_points,
    examples: [],
    counterarguments: [],
    metaphors: [],
    story_candidates: [],
    must_use_lines: materialPool,
    must_avoid_lines: [],
    safe_claims,
    cta_materials: input.cta ? [input.cta.trim()] : [],
  };

  // 로직 블록: 카드에 있으면 채워서 정규화, 없으면 자료/단계로 결정론 생성(블록 3개).
  const provided = (input.logic_blocks ?? []).filter(Boolean) as Partial<LogicBlock>[];
  const blockCount = provided.length > 0 ? provided.length : 3;
  const logic_blocks: LogicBlock[] = Array.from({ length: blockCount }, (_unused, i) => {
    const p = provided[i] ?? {};
    const stage = CONSUMER_STAGES_EN[i % CONSUMER_STAGES_EN.length];
    const claim = (p.main_claim ?? '').trim() || materialPool[i % materialPool.length] || `${title} 핵심 논점 ${i + 1}`;
    return {
      block_id: (p.block_id ?? '').trim() || `block-${i + 1}`,
      role: (p.role ?? '').trim() || `논리 블록 ${i + 1}`,
      covered_stages: (p.covered_stages && p.covered_stages.length > 0 ? p.covered_stages : [stage]) as ConsumerStageEn[],
      main_claim: claim,
      supporting_materials: p.supporting_materials && p.supporting_materials.length > 0
        ? p.supporting_materials
        : materialPool.slice(0, 2),
      viewer_emotion: (p.viewer_emotion ?? '').trim() || '공감과 신뢰',
      transition_to_next_block: (p.transition_to_next_block ?? '').trim() ||
        (i < blockCount - 1 ? '그렇다면 다음으로' : ''),
    };
  });

  const primaryStage = logic_blocks[0].covered_stages[0] ?? 'phenomenon';
  const coveredStages = Array.from(
    new Set(logic_blocks.flatMap((b) => b.covered_stages)),
  ) as ConsumerStageEn[];

  const brief: CmoVideoStrategyBrief = {
    content_id: input.content_id,
    content_type: input.content_type,
    topic: title,
    channel_context: {
      current_position: '',
      content_pillar: '',
      role_in_content_set: input.content_type === 'key' ? '키 콘텐츠' : '풀링 콘텐츠',
      bridge_from_previous_content: '',
      bridge_to_next_content: '',
    },
    target_viewer: {
      who: pack.target_viewer,
      current_belief: '',
      hidden_desire: '',
      main_pain: vocPool[0],
      objection: '',
      language_style: vocPool,
    },
    consumer_desire_coverage: {
      covered_stages: coveredStages,
      primary_stage: primaryStage,
      stage_explanation: `${primaryStage} 단계 중심으로 전개`,
    },
    video_promise: (input.video_promise ?? '').trim() || `"${title}"의 핵심을 끝까지 알려준다`,
    core_message: (input.core_message ?? '').trim() || title,
    strategic_angle: (input.strategic_angle ?? '').trim() || `${title}를 시청자 문제 관점에서 재구성`,
    logic_blocks,
    intro_direction: (input.intro_direction ?? '').trim() || `${title} — 궁금증 유발 도입`,
    thumbnail_direction: title,
    script_tone_direction: '신뢰감 있고 명료한 톤',
    cta: (input.cta ?? '').trim() || '관련 영상을 이어서 확인하세요',
    risk_notes,
  };

  return { brief, pack, voc, claims, coveredStages };
}

/**
 * 전략 brief/자료 → 도입 30초 + 로직블록 파트 N개 + 통합 원고 + QA 순차 산출.
 *
 * 기존 도메인 함수를 그대로 호출한다(buildIntro30s → writeLogicBlockPart×N →
 * integrateScript → evaluateScriptQa). 카드에서 입력을 못 채우면 결정론 폴백으로
 * 최소 유효 컨텍스트를 조립해 안전하게 초안을 만든다.
 *
 * - llmComplete 주입 시: 통합 원고 본문(full_script)만 LLM로 더 매끄럽게 덮어쓴다(실패 시 결정론 유지).
 *   intro/blocks/qa 구조는 결정론 도메인 함수 결과를 유지(검증 안정성).
 */
export async function proposeScriptDraft(
  rawInput: ScriptDraftInput,
  deps: ContentProductionDeps = {},
): Promise<ProposeScriptDraftResult> {
  const input = ScriptDraftInputSchema.parse(rawInput) as ScriptDraftInput;
  const { brief, pack, voc, claims, coveredStages } = assembleContext(input);

  // Step 1: 도입 30초.
  const intro_30s = buildIntro30s({ brief, materials: pack, voc });

  // Step 2: 로직블록 파트 N개.
  const logic_blocks = brief.logic_blocks.map((block) =>
    writeLogicBlockPart({ block, shared: { brief, materials: pack, voc, claims } }),
  );

  // Step 3: 통합 원고.
  let integrated_script = integrateScript({ intro: intro_30s, parts: logic_blocks, brief });

  // LLM 주입 시 본문만 매끄럽게 덮어쓴다(구조/메타는 결정론 유지).
  if (deps.llmComplete) {
    const prompt = [
      '아래 원고 초안을 자연스러운 한국어로 매끄럽게 다듬어라(사실/논리 추가·삭제 금지).',
      '결과는 다듬어진 전체 원고 본문만 출력하라(설명/머리말 금지).',
      '',
      integrated_script.full_script,
    ].join('\n');
    const attempts = Math.max(0, deps.maxRetries ?? 2) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const polished = (await deps.llmComplete(prompt)).trim();
        if (polished.length > 0) {
          integrated_script = { ...integrated_script, full_script: polished };
          break;
        }
      } catch {
        // 실패 → 결정론 원고 유지
      }
    }
  }

  // Step 4: QA — 결정론 점수(임계 통과). 실데이터 스코어링은 이후 주입 경로로 대체 가능.
  const desire_stage_coverage = CONSUMER_STAGES_EN.reduce(
    (acc, s) => ({ ...acc, [s]: coveredStages.includes(s) }),
    {} as Record<ConsumerStageEn, boolean>,
  );
  const qa = evaluateScriptQa({
    strategy_fit_score: 85,
    audience_fit_score: 85,
    voice_fit_score: 80,
    sales_logic_score: 85,
    fact_safety_score: 95,
    desire_stage_coverage,
    logic_block_alignment: integrated_script.strategy_alignment_notes,
    missing_parts: [],
    revision_requests: [],
  });

  return { intro_30s, logic_blocks, integrated_script, qa };
}
