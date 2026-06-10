// M3 — Sonnet 의도 분류 엔진.
//
// 크롤링/발굴 결과(영상 제목·채널·조회수·Viewtrap 지표)를 상품·타깃 컨텍스트로
// 분류한다. "타깃이 볼 주제인가 / 판매논리가 녹는가"는 생각이 필요한 판단이라
// 모델은 Claude Sonnet 고정(DISCOVERY_CLASSIFICATION_MODEL).
//
// 패턴 (CMO 원칙):
// - LLMClient 주입 — l5-core는 NocoBase/실모델 없이 테스트 가능.
// - 배치: 영상 N개를 1콜에 분류(JSON 배열 출력, zod 파싱). 기본 10개/콜.
// - 폴백: 실패한 배치(또는 응답 누락 영상)만 verdict='ambiguous' 결정론 폴백.
//   전체 실패 금지 — 한 배치가 죽어도 나머지는 LLM 결과를 유지한다.

import { z } from 'zod';
import type { LLMClient } from '../ceo-orchestration/types';
import type { ProductBrief } from './types';

/** 의도 분류는 Claude Sonnet 고정 (createClaudeCLIClient({ model: 'sonnet' })). */
export const DISCOVERY_CLASSIFICATION_MODEL = 'claude-sonnet-4-6';

/** LLM 폴백 시 reasons에 들어가는 결정론 사유. */
export const CLASSIFICATION_FALLBACK_REASON = '분류 실패 — 수동 확인 필요';

export type DiscoveryMode = 'key' | 'pulling';
export type DiscoveryVerdict = 'fit' | 'ambiguous' | 'unfit';

/** 발굴된 영상 1건 (YouTube API + Viewtrap 크롤링 결과). */
export interface DiscoveredVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  viewCount: number;
  /**
   * Viewtrap 등 추가 지표 (선택). 예: { 기여도: 'Good', 성과도: 'Great', 노출확률: 'Normal' }.
   * 등급 문자열(good/great/wow)은 candidate_basis 판단에 쓰인다.
   */
  metrics?: Record<string, string | number | undefined>;
}

export interface ClassifyDiscoveredVideosInput {
  product: ProductBrief;
  /** 타깃 설명 (product.target_audience보다 구체적인 서술 허용). */
  target: string;
  videos: DiscoveredVideo[];
  mode: DiscoveryMode;
  /** mode='pulling'일 때 키 콘텐츠 요약 — 브릿지 판단 근거. */
  key_content_context?: string;
}

export interface VideoClassification {
  videoId: string;
  verdict: DiscoveryVerdict;
  reasons: string[];
  /** 풀링 모드: 이 영상 주제를 키 콘텐츠로 잇는 브릿지 아이디어. */
  bridge_idea?: string;
  /** 적합(fit) + 성과좋음(조회 5만+ 또는 good/great/wow 등급) = 후보 근거. 결정론 계산. */
  candidate_basis: boolean;
  /** LLM 분류인지 결정론 폴백인지. */
  source: 'llm' | 'fallback';
}

export interface ClassifyDiscoveredVideosResult {
  mode: DiscoveryMode;
  model: typeof DISCOVERY_CLASSIFICATION_MODEL;
  /** 입력 videos와 같은 순서. */
  classifications: VideoClassification[];
  /** candidate_basis=true인 videoId — 키/풀링 후보의 실데이터 근거. */
  candidate_video_ids: string[];
  /** 폴백 처리된 영상 수 (0이면 전부 LLM 분류). */
  fallback_count: number;
}

export interface DiscoveryClassificationDeps {
  /** 미주입 시 전 영상 결정론 폴백(ambiguous). */
  llm?: LLMClient;
  /** 1콜에 분류하는 영상 수 (기본 10). */
  batchSize?: number;
  /** 배치당 형식오류 재시도 횟수 (기본 1 = 총 2회 시도). */
  maxRetries?: number;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_RETRIES = 1;

// ── LLM 출력 스키마 ──────────────────────────────────────────────────────────

const ClassificationItemSchema = z.object({
  videoId: z.string().min(1),
  verdict: z.enum(['fit', 'ambiguous', 'unfit']),
  reasons: z.array(z.string().min(1)).min(1),
  bridge_idea: z.string().optional(),
});

const BatchOutputSchema = z.array(ClassificationItemSchema).min(1);

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

/** key-content-draft.ts extractJson과 동일 컨벤션 — 배열용. */
function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

const GOOD_GRADE_RE = /^(good|great|wow)$/i;

/** 성과좋음 = 조회수 5만+ 또는 지표 등급에 good/great/wow 존재 (발굴 필터 기준). */
function hasGoodPerformance(video: DiscoveredVideo): boolean {
  if (video.viewCount >= 50_000) return true;
  for (const value of Object.values(video.metrics ?? {})) {
    if (typeof value === 'string' && GOOD_GRADE_RE.test(value.trim())) return true;
  }
  return false;
}

function fallbackClassification(video: DiscoveredVideo): VideoClassification {
  return {
    videoId: video.videoId,
    verdict: 'ambiguous',
    reasons: [CLASSIFICATION_FALLBACK_REASON],
    candidate_basis: false,
    source: 'fallback',
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── 프롬프트 ────────────────────────────────────────────────────────────────

function buildSystemPrompt(mode: DiscoveryMode): string {
  const lines: string[] = [
    '당신은 CMO의 콘텐츠 발굴 분석가다. YouTube에서 발굴된 영상 목록을 상품·타깃 컨텍스트로 분류한다.',
    '각 영상에 대해 verdict를 fit(적합) / ambiguous(모호) / unfit(부적합) 중 하나로 판정하고, 판단 근거를 reasons에 적는다.',
    '',
  ];
  if (mode === 'key') {
    lines.push(
      '[키 콘텐츠 판단 기준]',
      '① 타깃이 볼 주제인가 — 이 타깃이 실제로 검색/시청할 주제인지.',
      '② 판매논리가 녹는가 — 문제 제기 → 카테고리의 기능/특징/장점(FBB) → 카테고리 필요성 → 아이템 FBB로 해결 → 아이템 제안으로 이어지는 판매 논리를 이 주제에 자연스럽게 녹일 수 있는지.',
      '두 기준을 모두 충족하면 fit, 둘 다 어긋나면 unfit, 판단이 갈리면 ambiguous.',
    );
  } else {
    lines.push(
      '[풀링 콘텐츠 판단 기준]',
      '① 같은 타깃인가 — 키 콘텐츠와 동일한 타깃이 보는 주제인지.',
      '② 키로 브릿지되는가 — 이 주제에서 키 콘텐츠로 자연스럽게 시청을 잇는 다리(브릿지)를 만들 수 있는지.',
      '③ 꾸준한 수요인가 — 일회성 이슈가 아니라 롱테일로 꾸준히 검색/시청되는 주제인지.',
      'fit이면 bridge_idea에 키 콘텐츠로 잇는 브릿지 아이디어 한 문장을 반드시 포함하라.',
    );
  }
  lines.push(
    '',
    '출력은 반드시 JSON 배열만. 다른 텍스트 금지. 각 원소 형식:',
    '{ "videoId": "<입력의 videoId 그대로>", "verdict": "fit"|"ambiguous"|"unfit", "reasons": ["근거1", ...]' +
      (mode === 'pulling' ? ', "bridge_idea": "키로 잇는 아이디어(fit일 때)"' : '') +
      ' }',
    '입력된 모든 영상을 빠짐없이 배열에 포함하라.',
  );
  return lines.join('\n');
}

function buildUserPrompt(input: ClassifyDiscoveredVideosInput, batch: DiscoveredVideo[]): string {
  const { product, target, mode, key_content_context } = input;
  const lines: string[] = [
    `[상품]`,
    `상품명: ${product.product_name}`,
    `카테고리: ${product.category}`,
    `핵심 제안: ${product.core_offer}`,
    `비즈니스 목표: ${product.business_goal}`,
    '',
    `[타깃] ${target}`,
  ];
  if (mode === 'pulling' && key_content_context?.trim()) {
    lines.push('', `[키 콘텐츠 요약 — 브릿지 목적지] ${key_content_context.trim()}`);
  }
  lines.push(
    '',
    '[분류할 영상 목록]',
    JSON.stringify(
      batch.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
        ...(v.metrics ? { metrics: v.metrics } : {}),
      })),
      null,
      2,
    ),
  );
  return lines.join('\n');
}

// ── 본체 ────────────────────────────────────────────────────────────────────

async function classifyBatch(
  input: ClassifyDiscoveredVideosInput,
  batch: DiscoveredVideo[],
  llm: LLMClient,
  maxRetries: number,
): Promise<Map<string, z.infer<typeof ClassificationItemSchema>>> {
  const system = buildSystemPrompt(input.mode);
  const user = buildUserPrompt(input, batch);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await llm.complete({
        system,
        user,
        trace_name: 'video-room.discovery-classification',
        trace_metadata: { mode: input.mode, batch_size: batch.length, attempt },
      });
      const parsed = BatchOutputSchema.parse(JSON.parse(extractJsonArray(raw)));
      const byId = new Map<string, z.infer<typeof ClassificationItemSchema>>();
      for (const item of parsed) byId.set(item.videoId, item);
      return byId;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('discovery-classification: batch failed');
}

/**
 * 발굴 영상들을 상품·타깃 컨텍스트로 분류한다 (모델 = Claude Sonnet 고정).
 *
 * - deps.llm 주입 시: batchSize개씩 1콜 분류. 실패한 배치/누락 영상만 ambiguous 폴백.
 * - deps.llm 미주입 시: 전 영상 결정론 폴백(ambiguous) — 전체 실패 없음.
 */
export async function classifyDiscoveredVideos(
  input: ClassifyDiscoveredVideosInput,
  deps: DiscoveryClassificationDeps = {},
): Promise<ClassifyDiscoveredVideosResult> {
  const batchSize = Math.max(1, deps.batchSize ?? DEFAULT_BATCH_SIZE);
  const maxRetries = Math.max(0, deps.maxRetries ?? DEFAULT_MAX_RETRIES);

  const classifications: VideoClassification[] = [];

  for (const batch of chunk(input.videos, batchSize)) {
    let byId: Map<string, z.infer<typeof ClassificationItemSchema>> | null = null;
    if (deps.llm) {
      try {
        byId = await classifyBatch(input, batch, deps.llm, maxRetries);
      } catch {
        byId = null; // 이 배치만 폴백.
      }
    }
    for (const video of batch) {
      const item = byId?.get(video.videoId);
      if (!item) {
        classifications.push(fallbackClassification(video));
        continue;
      }
      classifications.push({
        videoId: video.videoId,
        verdict: item.verdict,
        reasons: item.reasons,
        ...(input.mode === 'pulling' && item.bridge_idea?.trim()
          ? { bridge_idea: item.bridge_idea.trim() }
          : {}),
        candidate_basis: item.verdict === 'fit' && hasGoodPerformance(video),
        source: 'llm',
      });
    }
  }

  return {
    mode: input.mode,
    model: DISCOVERY_CLASSIFICATION_MODEL,
    classifications,
    candidate_video_ids: classifications
      .filter((c) => c.candidate_basis)
      .map((c) => c.videoId),
    fallback_count: classifications.filter((c) => c.source === 'fallback').length,
  };
}
