// CTO Harness — Team Orchestrator (PRD §29 Hierarchical Agent Team).
//
// decompose → prompt → (execution-run request) → aggregate 의 순수 판단 경로를
// 하나로 묶는다. 실제 HTTP/worktree 실행은 ACR Kernel(별도 저장소)과 호출부
// (agent-runtime)가 담당한다. 이 모듈은 I/O·네트워크 없이 결정적으로 동작한다.
//
// 핵심 결정:
//  - 팀(다중 run) vs 단일 run: 복잡도 C5 또는 feature 2개 이상이면 팀.
//  - GUARDRAIL(PRD §12): C0/C1은 팀 금지 — feature가 여러 개여도 각 패키지는
//    solo executionMode로 강등되며, "팀"으로 승격하지 않는다.
//  - 각 패키지 → buildMainAgentPrompt 로 9블록 프롬프트, 그리고 ACR
//    POST /api/execution-runs(§9.1) 요청 payload 로 변환.
//
// 출처: FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md (§9, §12, §29).

import type {
  Complexity,
  ExecutionMode,
  HarnessRiskLevel,
  MainAgent,
  MainAgentWorkPackage,
  TeamResultPacket,
  WorkPackageDomain,
} from './types';
import { decomposeLargePRDToPackages } from './team-router';
import { buildMainAgentPrompt } from './prompt-builder';
import { aggregateTeamResult } from './result-aggregator';
import { complexityToMode } from './complexity-router';
import { DEFAULT_BLOCKED } from './boundary-check';

// ───────────────────────────── 입력/출력 계약 ─────────────────────────────

/** 분해 대상 feature 한 건 (decomposeLargePRDToPackages 입력의 외부 노출형). */
export interface TeamFeatureInput {
  objective: string;
  domains: WorkPackageDomain[];
  allowedFiles: string[];
  blockedFiles?: string[];
  complexity: Complexity;
  riskLevel?: HarnessRiskLevel;
  dependencies?: string[];
  reason?: string;
  /** ACR acceptance_criteria(§9.1) — 패키지 검증 기준. */
  acceptanceCriteria?: string[];
}

export interface PlanTeamRunInput {
  parentTaskId: string;
  parentPlanId: string;
  /** ACR 실행 cwd (POST /api/execution-runs repo_path). */
  repoPath: string;
  /** 분기 base (POST /api/execution-runs base_branch). 기본 'main'. */
  baseBranch?: string;
  features: TeamFeatureInput[];
}

/** ExecutionRun을 받을 수 있는 메인 에이전트. RuntimeType과 별개. */
export type ExecutionRunAgent = MainAgent | 'hermes';

/** ACR POST /api/execution-runs (§9.1) 요청 본문. snake_case 계약을 그대로 따른다. */
export interface ExecutionRunRequest {
  task_id: string;
  repo_path: string;
  base_branch: string;
  agent: ExecutionRunAgent;
  prompt: string;
  acceptance_criteria: string[];
  allowed_files: string[];
  blocked_files: string[];
  complexity: Complexity;
  mode: ExecutionMode;
  risk_level: HarnessRiskLevel;
}

/** Work Package + 프롬프트 + ACR 실행 요청을 한 묶음으로. */
export interface PlannedExecutionRun {
  package: MainAgentWorkPackage;
  prompt: string;
  request: ExecutionRunRequest;
}

export type TeamRunKind = 'solo' | 'team';

export interface TeamRunPlan {
  /** 'team' = 다중 run(2개 이상), 'solo' = 단일 run. */
  kind: TeamRunKind;
  parentTaskId: string;
  parentPlanId: string;
  runs: PlannedExecutionRun[];
}

// ───────────────────────────── 팀 승격 판단 ─────────────────────────────

/** HarnessRiskLevel(D0~D4) → CTOPhase 위험도(D1~D5) 대신, 여기서는 D0를 D1로만 정규화. */
function normalizeRisk(level: HarnessRiskLevel | undefined): HarnessRiskLevel {
  return level ?? 'D1';
}

/** 복잡도 순서 비교 (C0 < ... < C5). */
const COMPLEXITY_ORDER: Complexity[] = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];
function rank(c: Complexity): number {
  return COMPLEXITY_ORDER.indexOf(c);
}

/**
 * 팀(다중 run) 승격 여부 (PRD §29 + §12 가드).
 *
 * - feature가 1개면 항상 solo.
 * - C0/C1만으로 구성된 작업은 팀 금지(가장 가벼운 작업 — solo).
 * - 그 외, feature 2개 이상이거나 최고 복잡도가 C5면 팀.
 */
export function shouldRunAsTeam(features: TeamFeatureInput[]): boolean {
  if (features.length <= 1) return false;

  const maxComplexity = features.reduce<Complexity>(
    (max, f) => (rank(f.complexity) > rank(max) ? f.complexity : max),
    'C0',
  );

  // GUARDRAIL: 전부 C0/C1이면(가벼운 작업) 팀으로 올리지 않는다.
  if (rank(maxComplexity) <= rank('C1')) return false;

  return features.length >= 2 || maxComplexity === 'C5';
}

// ───────────────────────────── planTeamRun ─────────────────────────────

/**
 * 큰 작업을 분해해 실행 계획(팀 또는 단일 run)을 만든다.
 *
 * decompose → 각 패키지 buildMainAgentPrompt → ACR §9.1 요청 payload.
 * blocked_files 는 항상 DEFAULT_BLOCKED 를 합쳐 하드 블록을 보장한다.
 * 호출부(agent-runtime)는 runs 를 순회하며 createExecutionRun 을 호출한다.
 */
export function planTeamRun(input: PlanTeamRunInput): TeamRunPlan {
  const baseBranch = input.baseBranch ?? 'main';
  const packages = decomposeLargePRDToPackages({
    parentTaskId: input.parentTaskId,
    parentPlanId: input.parentPlanId,
    features: input.features,
  });

  const runs: PlannedExecutionRun[] = packages.map((pkg, index) => {
    const feature = input.features[index];
    // 패키지의 수용 기준은 feature가 제공하면 사용, 없으면 패키지 기본값.
    const acceptanceCriteria =
      feature?.acceptanceCriteria && feature.acceptanceCriteria.length > 0
        ? feature.acceptanceCriteria
        : pkg.acceptanceCriteria;
    const enrichedPkg: MainAgentWorkPackage =
      acceptanceCriteria === pkg.acceptanceCriteria
        ? pkg
        : { ...pkg, acceptanceCriteria };

    const prompt = buildMainAgentPrompt(enrichedPkg);
    const complexity = feature?.complexity ?? 'C2';
    const blockedFiles = Array.from(
      new Set([...enrichedPkg.scope.blockedFiles, ...DEFAULT_BLOCKED]),
    );

    const request: ExecutionRunRequest = {
      task_id: enrichedPkg.packageId,
      repo_path: input.repoPath,
      base_branch: baseBranch,
      agent: enrichedPkg.assignedMainAgent,
      prompt,
      acceptance_criteria: acceptanceCriteria,
      allowed_files: enrichedPkg.scope.allowedFiles,
      blocked_files: blockedFiles,
      complexity,
      mode: complexityToMode(complexity),
      risk_level: normalizeRisk(enrichedPkg.riskLevel),
    };

    return { package: enrichedPkg, prompt, request };
  });

  return {
    kind: shouldRunAsTeam(input.features) ? 'team' : 'solo',
    parentTaskId: input.parentTaskId,
    parentPlanId: input.parentPlanId,
    runs,
  };
}

// ───────────────────────────── buildTeamResultFromRuns ─────────────────────────────

/** ACR 가 돌려준 패키지별 실행 결과(§9.3 요약형). */
export interface RunResultInput {
  packageId: string;
  mainAgent: MainAgent;
  status: string;
  summary?: string;
  changedFiles?: string[];
  checks?: Record<string, string>;
  risks?: string[];
  recommendation?: TeamResultPacket['packageResults'][number]['recommendation'];
}

type PackageResult = TeamResultPacket['packageResults'][number];

/** status → 패키지 권고 기본값(명시값이 없을 때). */
function defaultRecommendation(status: string): PackageResult['recommendation'] {
  const s = status.toLowerCase();
  if (s === 'passed' || s === 'merge_ready') return 'merge_ready';
  if (s === 'blocked' || s === 'boundary_violation') return 'discard';
  return 'human_review';
}

/**
 * 다중 run 결과를 TeamResultPacket 으로 통합한다(aggregateTeamResult 진입점).
 *
 * 호출부는 createExecutionRun → getExecutionRun/submitExecutionResult 로 모은
 * 패키지별 결과를 RunResultInput[] 로 전달한다. 충돌 탐지·최종 권고는
 * result-aggregator 가 결정론적으로 산출한다.
 */
export function buildTeamResultFromRuns(input: {
  teamRunId: string;
  parentTaskId: string;
  results: RunResultInput[];
  finalChecks?: TeamResultPacket['finalChecks'];
}): TeamResultPacket {
  const packageResults: PackageResult[] = input.results.map((r) => ({
    packageId: r.packageId,
    mainAgent: r.mainAgent,
    status: r.status,
    summary: r.summary ?? '',
    changedFiles: r.changedFiles ?? [],
    checks: r.checks ?? {},
    risks: r.risks ?? [],
    recommendation: r.recommendation ?? defaultRecommendation(r.status),
  }));

  return aggregateTeamResult({
    teamRunId: input.teamRunId,
    parentTaskId: input.parentTaskId,
    packageResults,
    finalChecks: input.finalChecks,
  });
}
