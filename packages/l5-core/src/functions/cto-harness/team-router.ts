// CTO Harness — Hierarchical Agent Team Router (PRD §29).
//
// 큰 PRD를 메인 에이전트별 Work Package로 분해하고, 각 패키지의 내부
// 오케스트레이션 모드(solo / sub-agents / 내부 팀)와 권장 역할을 결정한다.
// 순수 판단 로직만 담는다 — I/O·네트워크·git 실행 없음, 모든 분기는 결정적.
//
// 출처: FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md (§3.3, §6.1, §9, §12, §29).

import type {
  Complexity,
  HarnessRiskLevel,
  MainAgent,
  WorkPackageDomain,
  InternalExecutionMode,
  MainAgentWorkPackage,
  CheckName,
  OutputContract,
} from './types';

// ───────────────────────────── selectMainAgent (PRD §3.3) ─────────────────────────────

/**
 * 도메인 집합 → 메인 에이전트 매핑.
 * - ui/playwright 관련(ui 포함) → antigravity (시각 QA·UI 흐름 전담).
 * - test/review 중심(test 도메인만 존재) → codex (테스트·리뷰 전담).
 * - 그 외 구현(api/db/runner/harness/docs) → claude-code (기본 구현자).
 */
export function selectMainAgent(domains: WorkPackageDomain[]): MainAgent {
  // ui 도메인이 포함되면 시각/플레이라이트 영역 → antigravity.
  if (domains.includes('ui')) {
    return 'antigravity';
  }
  // 도메인이 test 하나뿐(리뷰/테스트 중심)이면 codex.
  if (domains.length > 0 && domains.every((d) => d === 'test')) {
    return 'codex';
  }
  // 그 외 구현 도메인은 claude-code.
  return 'claude-code';
}

// ───────────────────────────── selectInternalOrchestrationMode (PRD §6.1/§12) ─────────────────────────────

/**
 * 복잡도 → 내부 오케스트레이션 모드.
 * GUARDRAIL(PRD §12): C0/C1은 내부 팀 금지(solo), C2는 sub-agent까지만.
 * C5는 서로 다른 파일 스코프가 2개 이상일 때만 병렬 팀 허용.
 */
export function selectInternalOrchestrationMode(
  c: Complexity,
  opts?: { distinctFileScopes?: number; reason?: string },
): InternalExecutionMode {
  switch (c) {
    case 'C0':
    case 'C1':
      // 가장 가벼운 작업 — 내부 팀/서브에이전트 금지.
      return 'solo';
    case 'C2':
      // 서브에이전트까지만 허용.
      return 'solo_with_subagents';
    case 'C3':
    case 'C4':
      // 순차 내부 팀(보안/리뷰어 포함 여부는 roles에서 결정).
      return 'internal_sequential_team';
    case 'C5': {
      const scopes = opts?.distinctFileScopes ?? 1;
      // 독립적인 파일 스코프가 2개 이상이면 병렬, 아니면 순차.
      return scopes > 1 ? 'internal_parallel_team' : 'internal_sequential_team';
    }
    default:
      return 'solo';
  }
}

// ───────────────────────────── recommendedInternalRoles ─────────────────────────────

/**
 * 메인 에이전트 + 모드 → 내부 권장 역할 목록.
 * solo 모드면 내부 팀이 없으므로 빈 배열.
 */
export function recommendedInternalRoles(
  agent: MainAgent,
  mode: InternalExecutionMode,
): string[] {
  // solo는 내부 역할 분화 없음.
  if (mode === 'solo') {
    return [];
  }

  switch (agent) {
    case 'codex':
      return [
        'Spec Checker',
        'Test Reviewer',
        'Risk Reviewer',
        'Regression Analyst',
        'Verdict Writer',
      ];
    case 'antigravity':
      return [
        'UI Flow Reviewer',
        'Visual QA',
        'Playwright Scout',
        'Locator Reviewer',
        'UX Verdict Writer',
      ];
    case 'claude-code':
    default:
      return [
        'Context Scout',
        'Architect',
        'Implementer',
        'Self Verifier',
        'Handoff Writer',
      ];
  }
}

// ───────────────────────────── canParallelize (PRD §9) ─────────────────────────────

/** allowedFiles 패턴에서 디렉토리 prefix(마지막 세그먼트/글롭 제거)를 추출한다. */
function dirPrefixes(patterns: string[]): string[] {
  const prefixes: string[] = [];
  for (const raw of patterns) {
    const p = raw.trim();
    if (p === '') continue;
    // 글롭 와일드카드 직전까지를 prefix로 사용.
    const star = p.indexOf('*');
    const head = star >= 0 ? p.slice(0, star) : p;
    const slash = head.lastIndexOf('/');
    // 디렉토리 경계까지 잘라 prefix 정규화.
    const prefix = slash >= 0 ? head.slice(0, slash + 1) : head;
    prefixes.push(prefix);
  }
  return prefixes;
}

/** 두 prefix가 상위/하위 디렉토리로 겹치는지(공유 가능성) 판단. */
function prefixesOverlap(a: string, b: string): boolean {
  if (a === '' || b === '') return true; // 빈 prefix는 전체 범위 → 항상 겹침.
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 두 작업이 병렬 실행 가능한지 판단 (PRD §9).
 * - db/auth/deps를 건드리면(공유 상태 변경) 병렬 금지.
 * - allowedFiles 디렉토리 prefix가 겹칠 가능성이 있으면 병렬 금지.
 * - 그 외에는 병렬 허용.
 */
export function canParallelize(
  a: { allowedFiles: string[] },
  b: { allowedFiles: string[] },
  opts?: { touchesDb?: boolean; touchesAuth?: boolean; touchesDeps?: boolean },
): { ok: boolean; reason?: string } {
  if (opts?.touchesDb) {
    return { ok: false, reason: 'DB 스키마/마이그레이션은 공유 상태라 병렬 불가' };
  }
  if (opts?.touchesAuth) {
    return { ok: false, reason: '인증 경로는 공유 위험이라 병렬 불가' };
  }
  if (opts?.touchesDeps) {
    return { ok: false, reason: '의존성 변경은 lockfile 충돌 위험이라 병렬 불가' };
  }

  const prefixesA = dirPrefixes(a.allowedFiles);
  const prefixesB = dirPrefixes(b.allowedFiles);

  for (const pa of prefixesA) {
    for (const pb of prefixesB) {
      if (prefixesOverlap(pa, pb)) {
        return {
          ok: false,
          reason: `파일 범위가 겹칠 가능성: '${pa}' ↔ '${pb}'`,
        };
      }
    }
  }

  return { ok: true };
}

// ───────────────────────────── verification profile helper ─────────────────────────────

/** 도메인 집합 → 필수 검증 체크 목록 (결정적). */
function buildRequiredChecks(domains: WorkPackageDomain[]): CheckName[] {
  const checks: CheckName[] = ['typecheck', 'boundary'];
  // 구현/리뷰가 포함되면 테스트 필수.
  if (
    domains.some((d) =>
      ['api', 'db', 'runner', 'harness', 'test'].includes(d),
    )
  ) {
    checks.push('test');
  }
  // UI 작업은 build + playwright 시각 검증.
  if (domains.includes('ui')) {
    checks.push('build');
    checks.push('playwright');
  }
  return checks;
}

// ───────────────────────────── decomposeLargePRDToPackages (PRD §29) ─────────────────────────────

/** 모드별 내부 최대 스텝 수. */
function maxStepsForMode(mode: InternalExecutionMode): number {
  switch (mode) {
    case 'solo':
      return 1;
    case 'solo_with_subagents':
      return 3;
    case 'internal_sequential_team':
      return 5;
    case 'internal_parallel_team':
      return 8;
    default:
      return 1;
  }
}

/** 메인 에이전트 → 산출물 계약. */
function outputContractForAgent(agent: MainAgent): OutputContract {
  switch (agent) {
    case 'codex':
      return 'review_report';
    case 'antigravity':
      return 'ui_report';
    case 'claude-code':
    default:
      return 'patch';
  }
}

interface FeatureInput {
  objective: string;
  domains: WorkPackageDomain[];
  allowedFiles: string[];
  blockedFiles?: string[];
  complexity: Complexity;
  riskLevel?: HarnessRiskLevel;
  dependencies?: string[];
  reason?: string;
}

/**
 * 대형 PRD를 메인 에이전트별 Work Package 배열로 분해한다 (PRD §29).
 * - 각 feature → 1개 MainAgentWorkPackage.
 * - executionMode는 복잡도 기반(C0/C1은 solo 강제 — 내부 팀 금지).
 * - team/sub-agent를 쓸 때 reason이 비면 기본 사유 문자열을 채운다(PRD §12 가드).
 */
export function decomposeLargePRDToPackages(input: {
  parentTaskId: string;
  parentPlanId: string;
  features: FeatureInput[];
}): MainAgentWorkPackage[] {
  return input.features.map((feature, index) => {
    const assignedMainAgent = selectMainAgent(feature.domains);

    // 서로 다른 파일 스코프 수(병렬 판단용) — allowedFiles의 고유 디렉토리 prefix 개수.
    const distinctFileScopes = new Set(dirPrefixes(feature.allowedFiles)).size;

    let executionMode = selectInternalOrchestrationMode(feature.complexity, {
      distinctFileScopes,
      reason: feature.reason,
    });

    // GUARDRAIL(PRD §12): C0/C1은 내부 팀 금지 → solo 강제.
    if (feature.complexity === 'C0' || feature.complexity === 'C1') {
      executionMode = 'solo';
    }

    const useInternalTeam = executionMode.startsWith('internal');
    const useSubAgents = executionMode !== 'solo';

    // team/sub-agent를 쓰면 reason 필수 — 비어 있으면 기본 사유로 채운다.
    let reason = feature.reason;
    if (useSubAgents && (!reason || reason.trim() === '')) {
      reason = `복잡도 ${feature.complexity} 작업이라 내부 오케스트레이션(${executionMode}) 적용`;
    }

    return {
      packageId: `${input.parentTaskId}-pkg-${index}`,
      parentTaskId: input.parentTaskId,
      parentPlanId: input.parentPlanId,

      assignedMainAgent,

      objective: feature.objective,

      scope: {
        includedDomains: feature.domains,
        allowedFiles: feature.allowedFiles,
        blockedFiles: feature.blockedFiles ?? [],
        expectedOutputs: [outputContractForAgent(assignedMainAgent)],
      },

      orchestrationHint: {
        useSubAgents,
        useInternalTeam,
        recommendedInternalRoles: recommendedInternalRoles(
          assignedMainAgent,
          executionMode,
        ),
        maxInternalSteps: maxStepsForMode(executionMode),
        avoidOverEngineering: true,
        reason,
      },

      executionMode,

      verificationProfile: {
        requiredChecks: buildRequiredChecks(feature.domains),
        optionalChecks: [],
      },

      acceptanceCriteria: [],
      outputContract: outputContractForAgent(assignedMainAgent),
      dependencies: feature.dependencies ?? [],
      riskLevel: feature.riskLevel ?? 'D1',
    };
  });
}
