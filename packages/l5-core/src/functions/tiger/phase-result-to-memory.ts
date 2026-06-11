// phase-result-to-memory.ts — CTO 배치 실행 결과(카드별 merged/held/failed/waited) →
// 학습축적 MemoryEntry(category 'bpr'|'failure') + proposal status 결정. 순수 함수.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (CTO repo별 병렬 §5 실패분 보류 + 학습 폐회로).
//
// 학습 폐회로: 성공 카드 → MemoryEntry('bpr', 다음 분석에 "해결됨" 신호) + proposal 'implemented'.
//   실패/보류 카드 → MemoryEntry('failure', 사유 축적 → 다음날 호랑이 분석 품질↑) + proposal 'proposed' 잔류.
// pastLessons는 buildTigerPrompt가 소비 → 같은 류 문제 반복 회피.
//
// I/O·Date.now 금지. 입력=배열, 출력=배열. 실제 NocoBase 패치/Memory 적재는 회수부(hermes)가 소비.

import type { CommonFields, MemoryEntry, WorkflowImprovementProposal } from '../../types/entities';
import type { TigerExecutiveRole } from './collector';
import { TIGER_AGENT_ID, encodeTargetRef } from './analysis';

/** native-orchestrator finalizePhase 종착 상태(카드 단위로 집계된 값). */
export type CardPhaseOutcome = 'merged' | 'held' | 'failed' | 'waited';

/** 한 카드의 CTO 실행 결과(batch-runner가 카드별로 집계해 넘김). */
export interface CardRunResult {
  proposal_id: string;
  target_id: string;
  executive: TigerExecutiveRole;
  /** 카드 phase들의 집계 종착. 하나라도 merge면 success, 아니면 보류/실패. */
  outcome: CardPhaseOutcome;
  /** 보류/실패 사유(verdict tail / git 충돌 메시지). 성공이면 생략. */
  reason?: string;
}

/** proposal status 결정 — 성공만 implemented, 나머지는 proposed 잔류(재시도 대상). */
export interface ProposalStatusPatch {
  proposal_id: string;
  status: WorkflowImprovementProposal['status'];
  /** 재시도 후보(waited/held)인지 — 다음 야간 루프가 재디스패치. */
  retryable: boolean;
}

type MemoryPayload = Omit<MemoryEntry, keyof CommonFields> & { source_ref?: string };

/** 종착 → 성공 여부. merged만 성공. */
function isSuccess(outcome: CardPhaseOutcome): boolean {
  return outcome === 'merged';
}

/** 종착 → 재시도 가능 여부. 토큰 소진(waited)/merge 보류(held)는 다음날 재시도. failed는 비재시도. */
function isRetryable(outcome: CardPhaseOutcome): boolean {
  return outcome === 'waited' || outcome === 'held';
}

/**
 * 카드 1건 결과 → MemoryEntry payload. 성공='bpr'(해결 기록), 실패/보류='failure'(사유 축적).
 * source_ref에 target_id 인코딩(다음 분석이 repo·도구 역추적). pii_level='none'(마스킹 신호 기반).
 */
export function cardResultToMemoryEntry(result: CardRunResult): MemoryPayload {
  const success = isSuccess(result.outcome);
  const category: MemoryEntry['category'] = success ? 'bpr' : 'failure';
  const content = success
    ? `호랑이 자가개선 적용 완료: [${result.executive}/${result.target_id}] 개선안 merge 성공.`
    : `호랑이 자가개선 ${result.outcome}: [${result.executive}/${result.target_id}] ` +
      `사유: ${result.reason || '미상'}. (다음 분석 입력)`;
  return {
    category,
    content,
    pii_level: 'none',
    contains_pii: false,
    searchable_tags: ['tiger', category, result.executive, result.target_id],
    suggested_tags: [result.outcome],
    approval_status: 'pending',
    source_task_id: result.proposal_id,
    reusable_context: success ? undefined : result.reason || undefined,
    source_ref: encodeTargetRef(result.target_id),
  };
}

/** 카드 1건 결과 → proposal status 패치. */
export function cardResultToProposalPatch(result: CardRunResult): ProposalStatusPatch {
  const success = isSuccess(result.outcome);
  return {
    proposal_id: result.proposal_id,
    status: success ? 'implemented' : 'proposed',
    retryable: !success && isRetryable(result.outcome),
  };
}

export interface BatchLearningOutput {
  memories: MemoryPayload[];
  patches: ProposalStatusPatch[];
  /** 다음 분석 프롬프트에 실을 실패 교훈(buildTigerPrompt pastLessons). */
  lessons: string[];
  summary: { merged: number; held: number; failed: number; waited: number };
}

/**
 * 배치 결과 묶음 → 학습축적 산출(memory 적재분 + proposal 패치분 + 교훈 문자열 + 카운트).
 * 회수부(hermes)가 memories→createMemoryEntry, patches→updateProposal로 소비. never-throw(빈/깨짐 graceful).
 */
export function buildBatchLearning(results: CardRunResult[]): BatchLearningOutput {
  const list = Array.isArray(results) ? results.filter((r) => r && typeof r.proposal_id === 'string') : [];
  const memories: MemoryPayload[] = [];
  const patches: ProposalStatusPatch[] = [];
  const lessons: string[] = [];
  const summary = { merged: 0, held: 0, failed: 0, waited: 0 };

  for (const r of list) {
    summary[r.outcome] += 1;
    memories.push(cardResultToMemoryEntry(r));
    patches.push(cardResultToProposalPatch(r));
    if (!isSuccess(r.outcome)) {
      lessons.push(
        `[${r.executive}/${r.target_id}] 이전 시도 ${r.outcome}: ${r.reason || '사유 미상'}`,
      );
    }
  }

  void TIGER_AGENT_ID; // suggested_by 일관성 참조(매핑 표면 유지).
  return { memories, patches, lessons, summary };
}
