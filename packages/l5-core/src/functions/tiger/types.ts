// 호랑이(Tiger) 자가개선 루프 — 개선 대상 레지스트리 타입.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§1 레지스트리).
//
// owner는 기존 AgentRole을 재사용한다. 엔티티(entities.ts)가 아니라 tiger 디렉토리에
// 두는 이유: orchestration.ts가 이미 entities.ts를 import하므로, entities에 AgentRole을
// 끌어오면 순환 참조가 된다. tiger → orchestration 단방향으로 회피한다.

import type { AgentRole } from '../../types/orchestration';

/** repo_path 해석 규칙. 'pulk-relative'=pulk 레포 루트 기준 상대, 'absolute'=호스트 절대경로(외부 repo). */
export type RepoPathKind = 'pulk-relative' | 'absolute';

/**
 * 호랑이 개선 대상 1건 = "어느 임원의 어떤 도구가, 어느 repo에 살고, 어느 로그를 긁어야 하는지".
 * DB 행이 아니라 코드와 함께 배포되는 정적 카탈로그(단위테스트로 무결성 검증). 위험도는
 * 여기 두지 않고 카드 생성 단계(WorkflowImprovementProposal/AgentTask)에서 부여한다.
 */
export interface ImprovementTargetEntry {
  /** 안정적 식별자(스네이크). 카드의 target_id, MemoryEntry 태그에 사용. */
  id: string;
  /** 담당 임원 role. */
  owner: AgentRole;
  /** 사람이 읽는 도구명. founder-ui 카드 라벨로 노출. */
  tool: string;
  /** repo_path 해석 규칙. */
  repo_path_kind: RepoPathKind;
  /** kind에 따라 pulk 루트 상대경로 또는 호스트 절대경로. */
  repo_path: string;
  /** 수집기가 긁을 로그/실행기록 경로 패턴(repo_path 기준 상대 glob). manual_intake 전용이면 비어도 됨. */
  error_sources: string[];
  /** 자동 로그 어댑터가 없어 사장님 수동 제보로만 후보가 들어오는 도구인지. */
  manual_intake: boolean;
}
