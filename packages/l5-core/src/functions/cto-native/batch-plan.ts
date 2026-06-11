// batch-plan.ts — 호랑이 일괄 승인분(여러 repo가 섞인 카드 묶음) → repo별 단일 ACRIntent로
// 그룹핑하는 순수 함수. 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (CTO repo별 병렬 §1).
//
// 핵심 제약(SPEC): dispatchToNativeOrchestrator는 intent 1개 = project_path 1개만 처리한다.
// 따라서 "여러 repo가 섞인 카드 묶음"은 하나의 큰 intent로 합치면 안 되고, repo별 ACRIntent로
// 쪼개야 한다. 한 repo 안의 여러 카드는 phase name을 카드 prefix로 유니크화해 합치되,
// 서로 다른 카드는 기본적으로 독립 레벨(병렬)이 되도록 한다(planPhaseLevels 입력 정합).
//
// I/O·Date.now 금지. nowIso 주입. never-throw 아님(입력은 호출측이 정제) — 단, 빈/중복은 graceful.

import type { ACRIntent, CTOPhase } from '../../types/acr-intent';

/** 일괄 승인된 개선 카드 1건의 디스패치 입력(승인→CTO 영역이 채움). */
export interface BatchCard {
  /** WorkflowImprovementProposal.id. 카드 식별·결과 회수 키. */
  proposal_id: string;
  /** 대상 repo 절대경로(resolveRepoAbsPath 산출). 예 /Users/.../ai-slide-video-factory. */
  target_repo: string;
  /** 이 작업이 속한 사업 id(선택). */
  business_id?: string;
  /** CTO Brain이 카드별로 분할한 phase들(verify_command 포함). */
  phases: CTOPhase[];
  /** 드묾: 이 카드가 선행 완료를 요구하는 다른 repo 절대경로들. */
  depends_on_repos?: string[];
}

/** repo 1개 = 카드 묶음 1개 = 단일 ACRIntent. */
export interface RepoGroup {
  project_path: string;
  card_ids: string[];
  intent: ACRIntent;
  /** 위상정렬용 — 이 그룹이 선행 완료를 요구하는 다른 project_path들. */
  depends_on_repos: string[];
}

export interface BatchPlan {
  /** repo 간 위상 순서대로 정렬됨(선행 그룹 먼저). */
  groups: RepoGroup[];
  /** 호출부가 주입한 동시성 상한(그룹 간). */
  concurrency: number;
}

export interface BuildBatchPlanOptions {
  concurrency: number;
  nowIso: string;
  /** intent l5_task_id prefix용 배치 식별자. 기본 'tiger'. */
  batchId?: string;
}

/** 절대경로 끝의 디렉터리명만 추출(slug용). 'path' 비의존 — 단순 문자열. */
function repoName(absPath: string): string {
  const trimmed = absPath.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base || 'repo';
}

/** 카드 phase name을 proposal_id prefix로 유니크화하고, 카드 내부 depends_on도 동일 prefix로 재배선. */
function prefixCardPhases(card: BatchCard): CTOPhase[] {
  const prefix = card.proposal_id;
  // 이 카드 안에서 정의된 phase name 집합(내부 depends_on만 재배선, 외부 참조는 무시).
  const localNames = new Set(card.phases.map((p) => p.name));
  return card.phases.map((p) => {
    const remapped: CTOPhase = { ...p, name: `${prefix}:${p.name}` };
    if (p.depends_on !== undefined) {
      // 명시적 depends_on(빈 배열 포함)은 보존하되, 같은 카드 내부 참조만 prefix.
      remapped.depends_on = p.depends_on.map((dep) =>
        localNames.has(dep) ? `${prefix}:${dep}` : dep,
      );
    } else {
      // depends_on 미지정 → 직전 phase 암묵 의존(planPhaseLevels 규약). 카드 간 병렬을 보장하려면
      // 카드 내 "첫" phase는 명시적 빈 배열(root)로 끊어, 다른 카드의 마지막 phase에 암묵 의존하지
      // 않게 한다. 나머지 phase는 카드 내 직전 phase에 명시 의존시켜 순차를 보존한다.
      const idx = card.phases.indexOf(p);
      remapped.depends_on =
        idx === 0 ? [] : [`${prefix}:${card.phases[idx - 1].name}`];
    }
    return remapped;
  });
}

/** depends_on_repos 위상정렬(Kahn). 순환/미존재는 graceful(무시). 안정 정렬(선언 순서 보존). */
function topoSortGroups(groups: RepoGroup[]): RepoGroup[] {
  const byPath = new Map<string, RepoGroup>();
  for (const g of groups) byPath.set(g.project_path, g);

  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const g of groups) {
    indeg.set(g.project_path, 0);
    adj.set(g.project_path, []);
  }
  for (const g of groups) {
    for (const dep of g.depends_on_repos) {
      if (!byPath.has(dep) || dep === g.project_path) continue; // 미존재/자기참조 무시.
      adj.get(dep)!.push(g.project_path);
      indeg.set(g.project_path, (indeg.get(g.project_path) ?? 0) + 1);
    }
  }

  const order = groups.map((g) => g.project_path); // 선언 순서(안정성 기준).
  const queue = order.filter((p) => (indeg.get(p) ?? 0) === 0);
  const out: RepoGroup[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(byPath.get(p)!);
    for (const next of adj.get(p) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0 && !seen.has(next)) queue.push(next);
    }
  }
  // 순환에 걸려 빠진 그룹은 선언 순서대로 뒤에 붙인다(graceful — 데드락 방지).
  for (const p of order) {
    if (!seen.has(p)) out.push(byPath.get(p)!);
  }
  return out;
}

/**
 * 승인 카드들을 target_repo별로 그룹핑 → repo별 단일 ACRIntent. 같은 repo 카드는 phase를
 * 카드 prefix로 합쳐 한 intent에 담고, 서로 다른 카드는 독립 레벨(병렬)이 된다.
 *
 * 규칙(SPEC §1):
 *  1. target_repo 같은 카드 = 한 RepoGroup = 한 ACRIntent.
 *  2. l5_approved:true(일괄 승인 게이트 이미 통과 — native-orchestrator가 l5_approval_required phase 실행).
 *  3. depends_on_repos가 있으면 그룹을 위상정렬(선행 그룹 먼저).
 *
 * 빈 입력/유효 phase 없는 카드는 graceful(빈 그룹 미생성). 카드 선언 순서 유지(안정).
 */
export function buildBatchPlan(
  cards: BatchCard[],
  opts: BuildBatchPlanOptions,
): BatchPlan {
  const concurrency = Math.max(1, opts.concurrency);
  const batchId = opts.batchId ?? 'tiger';
  const list = Array.isArray(cards) ? cards : [];

  // target_repo 순서를 첫 등장 순으로 안정 보존.
  const order: string[] = [];
  const byRepo = new Map<string, BatchCard[]>();
  for (const card of list) {
    if (!card || typeof card.target_repo !== 'string' || !card.target_repo) continue;
    if (!Array.isArray(card.phases) || card.phases.length === 0) continue;
    if (!byRepo.has(card.target_repo)) {
      byRepo.set(card.target_repo, []);
      order.push(card.target_repo);
    }
    byRepo.get(card.target_repo)!.push(card);
  }

  const groups: RepoGroup[] = order.map((repo) => {
    const repoCards = byRepo.get(repo)!;
    const phases: CTOPhase[] = [];
    const cardIds: string[] = [];
    const dependsOnRepos = new Set<string>();
    let businessId: string | undefined;
    for (const card of repoCards) {
      cardIds.push(card.proposal_id);
      phases.push(...prefixCardPhases(card));
      if (businessId === undefined && card.business_id) businessId = card.business_id;
      for (const dep of card.depends_on_repos ?? []) {
        if (dep && dep !== repo) dependsOnRepos.add(dep);
      }
    }
    const intent: ACRIntent = {
      l5_task_id: `${batchId}:${repoName(repo)}`,
      task_title: `[호랑이 자가개선] ${repoName(repo)} — ${cardIds.length}개 카드`,
      phases,
      created_at: opts.nowIso,
      project_path: repo,
      l5_approved: true,
      ...(businessId ? { business_id: businessId } : {}),
    };
    return {
      project_path: repo,
      card_ids: cardIds,
      intent,
      depends_on_repos: [...dependsOnRepos],
    };
  });

  return { groups: topoSortGroups(groups), concurrency };
}
