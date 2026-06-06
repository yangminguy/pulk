// CTO Harness — shared type contracts.
//
// pulk CTO(상위 판단자)가 생성하는 Work Order / Work Package와, ACR Kernel(별도
// 저장소의 실행 커널)이 실행 결과로 돌려주는 ExecutionRun / Result Packet의
// 표준 계약을 정의한다. 이 패키지는 "판단 로직"만 담고, 실제 worktree 생성·CLI
// 실행·HTTP 라우트는 ACR Kernel(agent-control-room) 책임이다.
//
// 출처: FINAL_pulk_cto_acr_kernel_harness_agent_team_prd.md (§8, §10, §14, §16, §10/§11 Team).

import type { RuntimeType } from '../../types/acr-intent';

// ───────────────────────────── 복잡도 / 위험도 ─────────────────────────────

/** 작업 복잡도 (PRD §6.1). C0 가장 가벼움 → C5 대형 리팩터링. */
export type Complexity = 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5';

/** ExecutionRun 실행 모드 (PRD §6.2). */
export type ExecutionMode =
  | 'safe_solo'
  | 'implement_verify'
  | 'strict_sandbox'
  | 'parallel_patch_queue';

/** Harness 실행 레일 (PRD §14.4). */
export type HarnessMode =
  | 'direct'
  | 'safe_solo'
  | 'standard'
  | 'strict'
  | 'parallel_patch';

/** Work Order 위험도 (PRD §10). */
export type HarnessRiskLevel = 'D0' | 'D1' | 'D2' | 'D3' | 'D4';

/** 실행 에이전트. RuntimeType('omc' 포함)와 별개로 PRD가 정의한 4종. */
export type ExecutionAgent = 'claude-code' | 'codex' | 'antigravity' | 'hermes';

/** Work Package를 받을 수 있는 메인 에이전트 (hermes는 감시 전용이라 제외). */
export type MainAgent = 'claude-code' | 'codex' | 'antigravity';

// ───────────────────────────── 검증 ─────────────────────────────

export type CheckName =
  | 'typecheck'
  | 'lint'
  | 'test'
  | 'build'
  | 'playwright'
  | 'boundary';

export type CheckStatus = 'pass' | 'fail' | 'skipped';

export type ExecutionChecks = Partial<Record<CheckName, CheckStatus>>;

export interface VerificationProfile {
  typecheck: boolean;
  lint: boolean;
  test: boolean;
  build: boolean;
  playwright: boolean;
  boundary: boolean;
}

// ───────────────────────────── ExecutionRun (PRD §8.2) ─────────────────────────────

export type ExecutionRunStatus =
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'verifying'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'boundary_violation';

export interface ExecutionRun {
  id: string;
  taskId: string;
  source: 'pulk-cto';

  agent: ExecutionAgent;
  status: ExecutionRunStatus;

  repoPath: string;
  baseBranch: string;
  worktreePath?: string;
  runBranch?: string;

  prompt: string;
  acceptanceCriteria: string[];

  allowedFiles: string[];
  blockedFiles: string[];

  complexity: Complexity;
  mode: ExecutionMode;

  checks: ExecutionChecks;

  changedFiles: string[];
  diffStat?: string;
  logTail?: string;

  resultSummary?: string;
  nextAction?: string;

  createdAt: string;
  updatedAt: string;
}

// ───────────────────────────── Work Order (PRD §10) ─────────────────────────────

export interface CTOExecutionWorkOrder {
  taskId: string;
  feature: string;
  spec: string[];
  design: {
    targetFiles: string[];
    expectedModules: string[];
    dependencies: string[];
  };
  risk: {
    level: HarnessRiskLevel;
    reason: string;
    requiresApproval: boolean;
  };
  contextPack: {
    globalRules: string[];
    pathRules: string[];
    docsIndex: string[];
  };
  execution: {
    agent: ExecutionAgent;
    complexity: Complexity;
    mode: ExecutionMode;
    verification: CheckName[];
  };
}

// ───────────────────────────── Harness I/O (PRD §14.5 / §14.6) ─────────────────────────────

export interface HarnessInput {
  runId: string;
  taskId: string;

  repoPath: string;
  baseBranch: string;

  agent: ExecutionAgent;

  prompt: string;
  acceptanceCriteria: string[];

  allowedFiles: string[];
  blockedFiles: string[];

  complexity: Complexity;
  mode: HarnessMode;

  verificationProfile: VerificationProfile;

  contextPack: {
    globalRules: string[];
    pathRules: string[];
    docsIndex: string[];
    handoff?: string;
  };
}

export type Recommendation =
  | 'merge_ready'
  | 'human_review'
  | 'retry_same_agent'
  | 'retry_with_verifier'
  | 'discard_patch'
  | 'blocked';

export interface HarnessArtifacts {
  logPath?: string;
  diffPath?: string;
  screenshotPath?: string;
  handoffPath?: string;
}

export interface HarnessOutput {
  runId: string;
  taskId: string;

  status: 'passed' | 'failed' | 'blocked' | 'needs_approval' | 'boundary_violation';

  changedFiles: string[];
  diffStat: string;

  checks: ExecutionChecks;
  artifacts: HarnessArtifacts;

  summary: string;
  nextAction: string;
  recommendation: Recommendation;
}

// ───────────────────────────── Result Packet (PRD §16) ─────────────────────────────

export type ResultRecommendation =
  | 'merge_ready'
  | 'human_review'
  | 'retry_same_agent'
  | 'retry_with_verifier'
  | 'blocked'
  | 'discard_patch';

export interface ExecutionResultPacket {
  runId: string;
  taskId: string;
  status: ExecutionRunStatus;
  agent: ExecutionAgent;

  summary: string;
  changedFiles: string[];
  diffStat: string;

  checks: ExecutionChecks;
  artifacts: HarnessArtifacts;

  recommendation: ResultRecommendation;
  nextAction: string;
}

// ───────────────────────────── Command Guard (PRD §14.8) ─────────────────────────────

export interface CommandGuardResult {
  allowed: boolean;
  reason?: string;
  riskLevel: 'safe' | 'warning' | 'blocked';
}

// ───────────────────────────── Boundary Check (PRD §12.3) ─────────────────────────────

export interface BoundaryCheckResult {
  status: 'pass' | 'fail';
  /** allowedFiles 패턴 밖이거나 blockedFiles에 걸린 파일들. */
  violations: string[];
  /** blockedFiles에 매칭된 파일 (boundary_violation 사유). */
  blocked: string[];
  /** allowedFiles 패턴 밖의 파일 (범위 이탈). */
  outOfScope: string[];
}

// ───────────────────────────── Agent Team (PRD §29) ─────────────────────────────

export type WorkPackageDomain =
  | 'api'
  | 'ui'
  | 'db'
  | 'runner'
  | 'harness'
  | 'test'
  | 'docs';

export type InternalExecutionMode =
  | 'solo'
  | 'solo_with_subagents'
  | 'internal_sequential_team'
  | 'internal_parallel_team';

export type OutputContract =
  | 'patch'
  | 'review_report'
  | 'test_patch'
  | 'ui_report'
  | 'handoff'
  | 'result_packet';

export interface MainAgentWorkPackage {
  packageId: string;
  parentTaskId: string;
  parentPlanId: string;

  assignedMainAgent: MainAgent;

  objective: string;

  scope: {
    includedDomains: WorkPackageDomain[];
    allowedFiles: string[];
    blockedFiles: string[];
    expectedOutputs: string[];
  };

  orchestrationHint: {
    useSubAgents: boolean;
    useInternalTeam: boolean;
    recommendedInternalRoles: string[];
    maxInternalSteps: number;
    avoidOverEngineering: boolean;
    /** team/sub-agent 사용 사유 (없으면 ACR Harness가 rejected, PRD §12). */
    reason?: string;
  };

  executionMode: InternalExecutionMode;

  verificationProfile: {
    requiredChecks: CheckName[];
    optionalChecks: string[];
  };

  acceptanceCriteria: string[];
  outputContract: OutputContract;
  dependencies: string[];
  riskLevel: HarnessRiskLevel;
}

export type TeamRunMode =
  | 'main_agent_solo'
  | 'main_agent_with_subagents'
  | 'multi_main_agent_sequential'
  | 'multi_main_agent_parallel';

export type DependencyEdgeType = 'blocks' | 'informs' | 'verifies' | 'merges_after';

export type ConflictPolicy = 'fail_on_overlap' | 'ordered_merge' | 'manual_review';

export type TeamRunStatus =
  | 'planned'
  | 'running'
  | 'partial'
  | 'verifying'
  | 'passed'
  | 'failed'
  | 'needs_human_review';

export interface AgentTeamRun {
  teamRunId: string;
  parentTaskId: string;
  parentPlanId: string;

  mode: TeamRunMode;
  workPackages: MainAgentWorkPackage[];

  executionRuns: Array<{
    runId: string;
    packageId: string;
    mainAgent: MainAgent;
    status: string;
  }>;

  dependencyGraph: Array<{
    fromPackageId: string;
    toPackageId: string;
    type: DependencyEdgeType;
  }>;

  conflictPolicy: ConflictPolicy;
  status: TeamRunStatus;
  finalResultPacket?: TeamResultPacket;
}

export type PackageRecommendation =
  | 'merge_ready'
  | 'retry'
  | 'human_review'
  | 'discard'
  | 'split_task';

export type FinalTeamRecommendation =
  | 'merge_ready'
  | 'retry_failed_package'
  | 'manual_review'
  | 'split_again'
  | 'discard_team_result';

export interface TeamResultPacket {
  teamRunId: string;
  parentTaskId: string;

  status: 'passed' | 'partial' | 'failed' | 'blocked' | 'needs_human_review';

  packageResults: Array<{
    packageId: string;
    mainAgent: MainAgent;
    status: string;
    summary: string;
    changedFiles: string[];
    checks: Record<string, string>;
    risks: string[];
    recommendation: PackageRecommendation;
  }>;

  conflicts: Array<{
    files: string[];
    packages: string[];
    reason: string;
    resolution: 'none' | 'ordered_merge' | 'manual_review' | 'discard_one';
  }>;

  finalChecks: {
    typecheck?: string;
    build?: string;
    test?: string;
    playwright?: string;
    boundary?: string;
  };

  finalRecommendation: FinalTeamRecommendation;
  nextAction: string;
}

// Re-export for convenience so downstream imports stay in one place.
export type { RuntimeType };
