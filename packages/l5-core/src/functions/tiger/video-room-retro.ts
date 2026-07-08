// 호랑이(Tiger) — 영상룸 파이프라인 회고(retro) 분석 (순수 도메인 로직).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md 확장 — "파이프라인 완료 시 사후 리뷰" 루프.
//
// 책임: 완료된 영상룸 파이프라인 1회분의 실행 흔적(게이트/메시지/카드/QA)을 입력으로
//   - 결정론적 휴리스틱으로 오류·재작업·병목 신호를 추출
//   - ImprovementCard[](기존 자가개선 카드 스키마)로 환원
//   까지만. DB 조회/proposal 영속화는 호출측(plugin-orchestration)의 몫.
//
// 카드는 기존 night-bpr 경로와 동일하게 cardToProposal → workflow_improvement_proposals
// (status='proposed', 승인 후에만 tiger-dispatch-loop가 CTO 실행)로 흘러간다.
// 설계 원칙(CLAUDE.md): NocoBase/fs/fetch 비의존, 입력=객체·출력=배열, 모든 룰 단위테스트.

import type { ImprovementCard } from './analysis';

/** 영상룸 회고 입력 — plugin이 video_room_* 테이블에서 모아 주입한다. */
export interface VideoRoomRetroInput {
  project: {
    id: string;
    title?: string | null;
    status?: string | null;
  };
  /** video_room_gates rows (해당 프로젝트 전체). */
  gates: Array<{
    gate_type?: string | null;
    status?: string | null;
    createdAt?: string | Date | null;
    decided_at?: string | Date | null;
  }>;
  /** cmo_planning_messages rows (thread = 프로젝트). role/text만 사용. */
  messages: Array<{ role?: string | null; text?: string | null }>;
  /** video_room_cards rows. QA 카드(stage='qa')의 checks 추출용. */
  cards: Array<{ stage?: string | null; summary?: string | null; data?: unknown }>;
}

export interface VideoRoomRetroOptions {
  /** 게이트 결정까지 이 시간(시간 단위)을 넘기면 병목으로 본다. 기본 24h. */
  stallHours?: number;
  /** 최대 카드 수(노이즈 상한). 기본 5. */
  maxCards?: number;
  /** 결정론 테스트용 현재시각(ISO). 기본 now. */
  now?: string;
}

const DEFAULT_STALL_HOURS = 24;
const DEFAULT_MAX_CARDS = 5;

/** 영상룸 회고 카드의 고정 타깃 — 레지스트리 cmo_video_room(apps/founder-ui). */
export const VIDEO_ROOM_RETRO_TARGET_ID = 'cmo_video_room';
export const VIDEO_ROOM_RETRO_REPO_PATH = 'apps/founder-ui';

/** 오류 신호로 보는 키워드(메시지/카드 summary). 소문자 비교. */
const ERROR_KEYWORDS = ['error', 'failed', 'exception', 'timeout', '오류', '실패', '에러', '재시도'];

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

function hasErrorKeyword(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const kw of ERROR_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function card(
  projectId: string,
  kind: string,
  key: string,
  fields: Pick<ImprovementCard, 'problem' | 'root_cause' | 'planned_fix' | 'impact' | 'confidence' | 'effort_estimate'>,
): ImprovementCard {
  return {
    candidate_id: `videoroom-retro:${projectId}:${kind}:${key}`,
    executive: 'CTO',
    target_id: VIDEO_ROOM_RETRO_TARGET_ID,
    repo_path: VIDEO_ROOM_RETRO_REPO_PATH,
    risk_level: 'D1',
    ...fields,
  };
}

/**
 * 영상룸 파이프라인 1회분 회고 → 개선 카드.
 * 결정론적·never-throw: 입력이 비거나 깨져도 빈 배열.
 *
 * 추출 룰:
 *  1. 게이트 재작업 — status가 rejected/needs_revision인 게이트는 원고·산출물 품질 신호.
 *  2. 게이트 병목 — pending→decided까지 stallHours 초과(또는 미결정 pending 장기화).
 *  3. QA 실패 — qa 카드 data.checks 중 'pass'가 아닌 항목.
 *  4. 오류 메시지 — cmo 역할 메시지에 오류 키워드.
 */
export function buildVideoRoomRetroCards(
  input: VideoRoomRetroInput | null | undefined,
  opts?: VideoRoomRetroOptions,
): ImprovementCard[] {
  if (!input || !input.project || !input.project.id) return [];
  const projectId = String(input.project.id);
  const stallMs = Math.max(1, opts?.stallHours ?? DEFAULT_STALL_HOURS) * 3600_000;
  const maxCards = Math.max(1, opts?.maxCards ?? DEFAULT_MAX_CARDS);
  const nowMs = toMs(opts?.now ?? null) ?? Date.now();

  const cards: ImprovementCard[] = [];
  const seen = new Set<string>();
  const push = (c: ImprovementCard) => {
    if (!seen.has(c.candidate_id)) {
      seen.add(c.candidate_id);
      cards.push(c);
    }
  };

  const gates = Array.isArray(input.gates) ? input.gates : [];
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const cardRows = Array.isArray(input.cards) ? input.cards : [];

  // 1. 게이트 재작업(rejected / needs_revision) — gate_type별 1장.
  const reworkByGate = new Map<string, number>();
  for (const g of gates) {
    const st = String(g.status ?? '');
    if (st === 'rejected' || st === 'needs_revision') {
      const gt = String(g.gate_type ?? 'unknown');
      reworkByGate.set(gt, (reworkByGate.get(gt) ?? 0) + 1);
    }
  }
  for (const [gateType, count] of reworkByGate) {
    push(card(projectId, 'gate-rework', gateType, {
      problem: `게이트 '${gateType}'에서 재작업 ${count}회 발생 — 초안 품질이 승인 기준에 못 미침.`,
      root_cause: '해당 단계 생성 프롬프트/검증 규칙이 승인 기준을 충분히 반영하지 못함',
      planned_fix: `'${gateType}' 단계의 생성 로직·프리체크를 보강해 첫 제출 승인율을 높인다.`,
      impact: count >= 2 ? 'high' : 'medium',
      confidence: 0.7,
      effort_estimate: 'M',
    }));
  }

  // 2. 게이트 병목 — 결정까지 stallHours 초과, 또는 pending인 채 장기 방치.
  for (const g of gates) {
    const created = toMs(g.createdAt);
    if (created == null) continue;
    const decided = toMs(g.decided_at);
    const elapsed = (decided ?? nowMs) - created;
    if (elapsed >= stallMs) {
      const gt = String(g.gate_type ?? 'unknown');
      push(card(projectId, 'gate-stall', gt, {
        problem: `게이트 '${gt}' 처리에 ${Math.round(elapsed / 3600_000)}시간 소요 — 파이프라인 병목.`,
        root_cause: '승인 대기 알림 부재 또는 해당 단계 산출물 생성 지연',
        planned_fix: `'${gt}' 단계의 대기 알림/자동 준비를 점검해 사이클 타임을 줄인다.`,
        impact: 'medium',
        confidence: 0.6,
        effort_estimate: 'S',
      }));
    }
  }

  // 3. QA 실패 — stage='qa' 카드 data.checks에서 pass가 아닌 체크.
  for (const c of cardRows) {
    if (String(c.stage ?? '') !== 'qa') continue;
    const data = (typeof c.data === 'string' ? safeParse(c.data) : c.data) as Record<string, unknown> | null;
    const checks = (data?.checks ?? null) as Record<string, unknown> | null;
    if (!checks || typeof checks !== 'object') continue;
    for (const [check, verdict] of Object.entries(checks)) {
      if (String(verdict) !== 'pass') {
        push(card(projectId, 'qa-fail', check, {
          problem: `QA 체크 '${check}' 실패(${String(verdict)}).`,
          root_cause: '해당 품질 항목을 만드는 제작 단계 로직 결함',
          planned_fix: `'${check}' 실패 재현 경로를 좁혀 제작 단계에서 원천 수정한다.`,
          impact: 'high',
          confidence: 0.75,
          effort_estimate: 'M',
        }));
      }
    }
  }

  // 4. 오류 메시지 — cmo(에이전트) 발화에 오류 키워드. 키워드별 1장.
  const seenKw = new Set<string>();
  for (const m of messages) {
    if (String(m.role ?? '') !== 'cmo') continue;
    const kw = hasErrorKeyword(m.text);
    if (kw && !seenKw.has(kw)) {
      seenKw.add(kw);
      push(card(projectId, 'message-error', kw, {
        problem: `파이프라인 진행 중 CMO 메시지에 오류 신호('${kw}') 감지.`,
        root_cause: '단계 실행 중 예외/실패가 대화로만 노출되고 구조화 로그가 없음',
        planned_fix: '해당 실패 지점을 재현해 수정하고, 구조화 오류 로그를 남기도록 보강한다.',
        impact: 'medium',
        confidence: 0.55,
        effort_estimate: 'M',
      }));
    }
  }

  // 우선순위: impact(high>medium>low) desc → confidence desc → candidate_id asc. 상한 maxCards.
  const rank = { high: 2, medium: 1, low: 0 } as const;
  return cards
    .sort(
      (a, b) =>
        (rank[b.impact] ?? 0) - (rank[a.impact] ?? 0) ||
        b.confidence - a.confidence ||
        a.candidate_id.localeCompare(b.candidate_id),
    )
    .slice(0, maxCards);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
