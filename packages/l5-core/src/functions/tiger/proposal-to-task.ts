// proposal-to-task.ts — 승인된 호랑이 개선 카드(WorkflowImprovementProposal) → BatchCard 매핑.
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (CTO repo별 병렬 — 승인→CTO 디스패치).
//
// 흐름: 승인분 proposal의 source_ref(`tiger:<target_id>`)를 decodeTargetRef로 풀어 target_id 복원
//   → getImprovementTarget으로 레지스트리 entry 조회 → resolveRepoAbsPath(entry, pulkRoot)로
//   project_path(절대경로) 산출 → BatchCard(repo별 그룹핑 입력) 생성. 같은 repo 카드는
//   buildBatchPlan이 한 ACRIntent로 묶어 repo별 1 intent의 병렬 phase로 만든다.
//
// 순수 함수(NocoBase/fs 비의존). pulkRoot·phase 빌더는 호출측 주입. never-throw 아님이지만
// 해석 불가(미등록 target/잘못된 source_ref)는 skipped로 분리 반환(디스패치 중단 사유 회수).

import type { CTOPhase } from '../../types/acr-intent';
import type { BatchCard } from '../cto-native/batch-plan';
import { decodeTargetRef } from './analysis';
import { getImprovementTarget, resolveRepoAbsPath } from './tool-registry';

/** 디스패치 입력으로 들어오는 승인 카드(엔티티에서 추린 최소 필드). */
export interface ApprovedProposalInput {
  /** WorkflowImprovementProposal.id. */
  proposal_id: string;
  /** `tiger:<target_id>` 인코딩(없거나 깨지면 skip). */
  source_ref?: string;
  /** UI가 카드별로 같이 보낸 target_repo(절대경로). 있으면 source_ref 해석보다 우선. */
  target_repo?: string;
  business_id?: string;
}

/**
 * 카드별 CTO phase를 빚는 빌더. CTO Brain이 카드 컨텍스트(target_id/repo/proposal_id)로
 * 코딩+검증 phase를 분할한다. 순수성을 위해 호출측이 주입(여기선 매핑만).
 */
export type CardPhaseBuilder = (ctx: {
  proposal_id: string;
  target_id: string;
  project_path: string;
}) => CTOPhase[];

export interface ProposalsToBatchCardsResult {
  cards: BatchCard[];
  /** 해석/빌드 실패로 디스패치에서 제외된 항목(사유 회수 → blocked[]). */
  skipped: Array<{ proposal_id: string; reason: string }>;
}

/**
 * 승인 proposal 묶음 → BatchCard 묶음. target_repo는 (1) 입력 target_repo 우선,
 * (2) 없으면 source_ref→target_id→resolveRepoAbsPath로 산출. 둘 다 실패하면 skipped.
 * phase가 0개인 카드도 skipped(디스패치 불가).
 */
export function proposalsToBatchCards(
  proposals: ApprovedProposalInput[],
  buildPhases: CardPhaseBuilder,
  pulkRoot: string,
): ProposalsToBatchCardsResult {
  const cards: BatchCard[] = [];
  const skipped: Array<{ proposal_id: string; reason: string }> = [];
  const list = Array.isArray(proposals) ? proposals : [];

  for (const p of list) {
    if (!p || typeof p.proposal_id !== 'string' || !p.proposal_id) {
      skipped.push({ proposal_id: String(p?.proposal_id ?? ''), reason: 'missing proposal_id' });
      continue;
    }
    const targetId = decodeTargetRef(p.source_ref);
    let projectPath = typeof p.target_repo === 'string' && p.target_repo ? p.target_repo : '';

    if (!projectPath) {
      if (!targetId) {
        skipped.push({ proposal_id: p.proposal_id, reason: `unresolvable source_ref: ${p.source_ref ?? '∅'}` });
        continue;
      }
      const entry = getImprovementTarget(targetId);
      if (!entry) {
        skipped.push({ proposal_id: p.proposal_id, reason: `unknown target_id: ${targetId}` });
        continue;
      }
      projectPath = resolveRepoAbsPath(entry, pulkRoot);
    }

    let phases: CTOPhase[] = [];
    try {
      phases = buildPhases({ proposal_id: p.proposal_id, target_id: targetId ?? '', project_path: projectPath });
    } catch (err) {
      skipped.push({ proposal_id: p.proposal_id, reason: `phase build failed: ${(err as Error).message}` });
      continue;
    }
    if (!Array.isArray(phases) || phases.length === 0) {
      skipped.push({ proposal_id: p.proposal_id, reason: 'no phases produced' });
      continue;
    }

    cards.push({
      proposal_id: p.proposal_id,
      target_repo: projectPath,
      phases,
      ...(p.business_id ? { business_id: p.business_id } : {}),
    });
  }

  return { cards, skipped };
}
