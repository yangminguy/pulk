// 호랑이(Tiger) 자가개선 루프 — 분석 엔진 (순수 도메인 로직, M2).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§3 호랑이 두뇌 / night-bpr-loop 본체).
//
// 책임: 수집기가 만든 BottleneckCandidate[](collector.ts)를 입력으로
//   - 난이도 휴리스틱으로 적응형 모델 선택(어려우면 opus, 쉬우면 sonnet)
//   - 새/재발 후보만 추려 상위 K개로 슬라이스(토큰 상한)
//   - Claude 단일 프롬프트(JSON-only) 빌드
//   - Claude stdout(JSON) 파싱 → ImprovementCard[] (스키마 검증, repo_path/target_id override)
//   - 카드 → BPRLog / WorkflowImprovementProposal / MemoryEntry 매핑
//   까지만. Claude 실행/NocoBase 저장/텔레그램은 hermes night-bpr-loop의 몫.
//
// 설계 원칙(CLAUDE.md): NocoBase/fs/fetch/spawn 비의존, 입력=배열·출력=배열,
//   모든 판단 룰은 단위테스트. Claude 호출은 hermes에서 주입(여기선 입출력 가공만).

import type { BPRLog, MemoryEntry, WorkflowImprovementProposal, CommonFields } from '../../types/entities';
import type { BottleneckCandidate, TigerExecutiveRole } from './collector';

/** 분석 모델 — 확정: Claude 전담(OpenAI 미사용), 적응형. cto-native ClaudeModel과 정합. */
export type TigerModel = 'claude-opus-4-8' | 'claude-sonnet-4-6';

/**
 * Claude가 분석해 만든 개선 카드 (이 영역의 산출물).
 * candidate_id는 출처 후보의 fingerprint와 1:1(dedup·역추적). repo_path/target_id는
 * Claude 환각 방지를 위해 항상 입력 후보값으로 override한다.
 */
export interface ImprovementCard {
  /** 출처 후보 fingerprint와 1:1. */
  candidate_id: string;
  executive: TigerExecutiveRole;
  /** 레지스트리 target id(=후보 tool_id). 승인→CTO 디스패치가 repo_path를 재해석하는 키. */
  target_id: string;
  /** 대상 repo(절대경로 또는 'pulk'). 후보값을 신뢰. */
  repo_path: string;
  /** 문제(현상). */
  problem: string;
  /** 근본원인. */
  root_cause: string;
  /** 해결예정. */
  planned_fix: string;
  /** 예상공수(예: "S"|"M"|"L" 또는 "~2h"). */
  effort_estimate: string;
  impact: 'high' | 'medium' | 'low';
  /** 자가개선은 D1~D2 고정(확정 결정사항). */
  risk_level: 'D1' | 'D2';
  /** 0..1, Claude 자가평가. */
  confidence: number;
}

export interface PrepareOptions {
  /** Claude에 투입할 최대 후보 수(토큰 상한). 기본 8. */
  maxCards?: number;
  /** evidence(sample_detail) 최대 줄 수. 기본 12. */
  maxEvidenceLines?: number;
}

const DEFAULT_MAX_CARDS = 8;
const DEFAULT_MAX_EVIDENCE_LINES = 12;

/**
 * 정규화 + 중복 억제 + 슬라이스. 이미 카드화된 fingerprint(knownCardIds)는 제외하고,
 * priority_score desc(동점은 occurrences desc, fingerprint asc)로 상위 maxCards개만 통과.
 * sample_detail은 maxEvidenceLines 줄로 truncate(토큰 절약).
 * never-throw: 입력이 비거나 깨져도 빈 배열 반환.
 */
export function prepareCandidates(
  candidates: BottleneckCandidate[] | undefined | null,
  knownCardIds: Set<string>,
  opts?: PrepareOptions,
): BottleneckCandidate[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const maxCards = Math.max(1, opts?.maxCards ?? DEFAULT_MAX_CARDS);
  const maxEvidenceLines = Math.max(1, opts?.maxEvidenceLines ?? DEFAULT_MAX_EVIDENCE_LINES);
  const known = knownCardIds instanceof Set ? knownCardIds : new Set<string>();

  const fresh = candidates
    .filter((c) => c && typeof c.fingerprint === 'string' && !known.has(c.fingerprint))
    .slice()
    .sort(
      (a, b) =>
        (b.priority_score ?? 0) - (a.priority_score ?? 0) ||
        (b.occurrences ?? 0) - (a.occurrences ?? 0) ||
        a.fingerprint.localeCompare(b.fingerprint),
    )
    .slice(0, maxCards);

  return fresh.map((c) => {
    if (!c.sample_detail) return c;
    const lines = c.sample_detail.split('\n');
    if (lines.length <= maxEvidenceLines) return c;
    return { ...c, sample_detail: lines.slice(0, maxEvidenceLines).join('\n') };
  });
}

/**
 * 난이도 휴리스틱 → 적응형 모델. 어려우면 opus, 쉬우면 sonnet.
 * 어려움 신호: error/stall 비중↑, high-PII 존재, 고빈도(occurrences 합)↑, 후보 수↑, repo 다양성↑.
 * 결정론적(점수 임계). 후보가 없으면 비용↓로 sonnet.
 */
export function selectModel(candidates: BottleneckCandidate[]): TigerModel {
  if (!Array.isArray(candidates) || candidates.length === 0) return 'claude-sonnet-4-6';

  let score = 0;
  const repos = new Set<string>();
  let totalOcc = 0;
  for (const c of candidates) {
    if (c.kind === 'error' || c.kind === 'stall') score += 2;
    if (c.max_pii_level === 'high' || c.max_pii_level === 'medium') score += 1;
    totalOcc += c.occurrences ?? 1;
    if (c.repo) repos.add(c.repo);
  }
  // 후보 다수 = 한 프롬프트에서 동시 추론 부담↑.
  if (candidates.length >= 5) score += 2;
  // cross-repo 다양성 = 컨텍스트 전환 부담↑.
  if (repos.size >= 3) score += 2;
  // 고빈도 누적 = 시스템적 문제 가능성↑.
  if (totalOcc >= 20) score += 2;

  // 임계 5 이상이면 opus(어려움), 아니면 sonnet(저렴).
  return score >= 5 ? 'claude-opus-4-8' : 'claude-sonnet-4-6';
}

/** 후보 1건을 프롬프트에 실을 직렬화 친화 형태로(토큰 절약: 필수 필드만). */
interface PromptCandidate {
  candidate_id: string;
  executive: TigerExecutiveRole;
  target_id: string;
  repo_path: string;
  kind: BottleneckCandidate['kind'];
  signal: string;
  occurrences: number;
  evidence: string[];
}

function toPromptCandidate(c: BottleneckCandidate): PromptCandidate {
  return {
    candidate_id: c.fingerprint,
    executive: c.executive,
    target_id: c.tool_id,
    repo_path: c.repo,
    kind: c.kind,
    signal: c.title,
    occurrences: c.occurrences,
    evidence: c.sample_detail ? c.sample_detail.split('\n').filter((l) => l.trim()) : [],
  };
}

/**
 * 후보 묶음 → Claude 단일 프롬프트(JSON-only 출력 강제). 산문/코드펜스 금지 지시.
 * candidate_id/target_id/repo_path는 입력값 그대로 쓰라고 명시(환각 방지).
 */
export function buildTigerPrompt(
  candidates: BottleneckCandidate[],
  pastLessons?: string[],
): string {
  const promptCandidates = candidates.map(toPromptCandidate);
  const lessons =
    Array.isArray(pastLessons) && pastLessons.length > 0
      ? `\n\n[과거 학습 — 같은 류 문제의 해결/실패 기록]\n${pastLessons
          .slice(0, 10)
          .map((l) => `- ${l}`)
          .join('\n')}`
      : '';

  return [
    '당신은 L5 Business OS의 "호랑이" 자가개선 분석가다.',
    '아래 병목 후보들을 분석해, 각 후보별로 개선 카드를 JSON 배열로만 출력하라.',
    '산문·설명·마크다운 코드펜스 금지. 오직 JSON 배열 하나만 출력한다.',
    '',
    '각 카드 객체 스키마:',
    '{',
    '  "candidate_id": string,   // 입력값 그대로(역추적 키, 절대 변경 금지)',
    '  "problem": string,        // 문제(현상)을 한국어 한두 문장으로',
    '  "root_cause": string,     // evidence에 근거한 근본원인. 추측이면 confidence를 낮춰라',
    '  "planned_fix": string,    // 해결예정(무엇을 어떻게 고칠지)',
    '  "effort_estimate": string,// 예상공수 "S"|"M"|"L" 또는 "~2h"',
    '  "impact": "high"|"medium"|"low",',
    '  "risk_level": "D1"|"D2",  // 자가개선은 D1~D2만. 코드/설정 소규모 수정=D1, 외부영향=D2',
    '  "confidence": number      // 0~1, 근본원인 확신도',
    '}',
    '',
    '규칙:',
    '- candidate_id는 입력 후보의 값을 그대로 복사한다(변경/창작 금지).',
    '- 근본원인은 반드시 evidence에 근거한다. 정보 부족이면 confidence를 0.3 이하로.',
    '- 모든 후보에 대해 정확히 하나의 카드를 만든다(누락 금지).',
    lessons,
    '',
    '[병목 후보들]',
    JSON.stringify(promptCandidates, null, 2),
  ].join('\n');
}

/** 코드펜스/잡텍스트에서 첫 JSON 배열을 추출한다. 실패 시 null. */
function extractJsonArray(raw: string): unknown[] | null {
  if (typeof raw !== 'string') return null;
  // 코드펜스 제거.
  let text = raw.replace(/```(?:json)?/gi, '').trim();
  // 첫 '[' 부터 마지막 ']' 까지를 후보로.
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function validImpact(v: unknown): ImprovementCard['impact'] {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';
}

function validRisk(v: unknown): ImprovementCard['risk_level'] {
  return v === 'D2' ? 'D2' : 'D1';
}

/**
 * Claude stdout(JSON) → ImprovementCard[].
 * - 코드펜스/잡텍스트 제거 후 JSON 배열 추출, 스키마 검증, 잘못된 항목 drop.
 * - candidate_id가 입력 후보에 없으면 drop(환각 방지).
 * - executive/target_id/repo_path는 입력 후보값으로 override(Claude 값 무시).
 * never-throw.
 */
export function parseTigerOutput(
  raw: string,
  candidates: BottleneckCandidate[],
): { cards: ImprovementCard[]; dropped: number } {
  const byId = new Map<string, BottleneckCandidate>();
  for (const c of candidates ?? []) {
    if (c && typeof c.fingerprint === 'string') byId.set(c.fingerprint, c);
  }

  const arr = extractJsonArray(raw);
  if (!arr) return { cards: [], dropped: candidates?.length ?? 0 };

  const cards: ImprovementCard[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const item of arr) {
    if (!item || typeof item !== 'object') {
      dropped += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const cid = typeof o.candidate_id === 'string' ? o.candidate_id : '';
    const src = byId.get(cid);
    if (!src || seen.has(cid)) {
      dropped += 1;
      continue;
    }
    const problem = typeof o.problem === 'string' ? o.problem.trim() : '';
    const plannedFix = typeof o.planned_fix === 'string' ? o.planned_fix.trim() : '';
    if (!problem || !plannedFix) {
      dropped += 1;
      continue;
    }
    seen.add(cid);
    cards.push({
      candidate_id: cid,
      // 입력 후보값으로 override(환각 방지) — 출처가 진실원.
      executive: src.executive,
      target_id: src.tool_id,
      repo_path: src.repo,
      problem,
      root_cause: typeof o.root_cause === 'string' ? o.root_cause.trim() : '',
      planned_fix: plannedFix,
      effort_estimate: typeof o.effort_estimate === 'string' && o.effort_estimate.trim()
        ? o.effort_estimate.trim()
        : 'M',
      impact: validImpact(o.impact),
      risk_level: validRisk(o.risk_level),
      confidence: clamp01(o.confidence),
    });
  }

  return { cards, dropped };
}

// ── 카드 → 저장 엔티티 매핑 ──────────────────────────────────────────────────

/** 호랑이가 카드를 발행하는 에이전트 식별자(WIP.suggested_by_agent_id 등). */
export const TIGER_AGENT_ID = 'Tiger';

/**
 * 카드 → BPRLog(status='identified'). repo_path/target_id는 스키마에 없으므로 source_ref에
 * 인코딩해 승인 흐름이 역해석할 수 있게 한다(1차 — 스키마 변경 회피). 형식: `tiger:<target_id>`.
 */
export function cardToBPRLog(card: ImprovementCard): Omit<BPRLog, keyof CommonFields> {
  return {
    bottleneck_description: card.problem,
    impact: card.impact,
    root_cause: card.root_cause || undefined,
    proposed_solution: card.planned_fix,
    owner_agent_id: card.executive,
    status: 'identified',
  };
}

/**
 * 카드 → WorkflowImprovementProposal(status='proposed'). repo_path/target_id/candidate_id를
 * source_ref(CommonFields, 호출측이 채움 가능)에 싣지 않고, current_process에 컨텍스트로 보관.
 * 디스패치 단계가 target_id로 resolveRepoAbsPath를 재실행한다.
 */
export function cardToProposal(
  card: ImprovementCard,
): Omit<WorkflowImprovementProposal, keyof CommonFields> {
  return {
    current_process:
      `[호랑이 자가개선] ${card.executive} / ${card.target_id} (${card.repo_path}). ` +
      `근본원인: ${card.root_cause || '미상'}. 위험도 ${card.risk_level}, 확신도 ${card.confidence}.`,
    identified_bottleneck: card.problem,
    proposed_improvement: card.planned_fix,
    effort_to_implement: card.effort_estimate,
    suggested_by_agent_id: TIGER_AGENT_ID,
    status: 'proposed',
  };
}

/**
 * 카드 발행 사실을 MemoryEntry(category 'bpr')로 적재 → 학습 폐회로.
 * 실제 성공/실패 결과는 CTO 실행 후 별도 영역에서 갱신. 여기선 "발행" 사실만.
 * source_ref에 target_id를 인코딩(repo_path 역추적). pii_level='none'(카드는 마스킹된 신호 기반).
 */
export function cardToMemoryEntry(card: ImprovementCard): Omit<MemoryEntry, keyof CommonFields> {
  return {
    category: 'bpr',
    content:
      `호랑이 개선 카드 발행: [${card.executive}/${card.target_id}] ${card.problem} ` +
      `→ ${card.planned_fix} (근본원인: ${card.root_cause || '미상'})`,
    pii_level: 'none',
    searchable_tags: ['tiger', 'bpr', card.executive, card.target_id],
    suggested_tags: [card.impact, card.risk_level],
    reusability_score: Math.round(card.confidence * 100),
    approval_status: 'pending',
    contains_pii: false,
    reusable_context: card.root_cause || undefined,
  };
}

/** source_ref 인코딩/디코딩 — target_id를 BPRLog/WIP source_ref에 싣는 1차 규약. */
export function encodeTargetRef(targetId: string): string {
  return `tiger:${targetId}`;
}
export function decodeTargetRef(sourceRef: string | undefined): string | null {
  if (typeof sourceRef !== 'string') return null;
  const m = sourceRef.match(/^tiger:(.+)$/);
  return m ? m[1] : null;
}
