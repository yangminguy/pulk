// CTO Native Orchestration — 순수 타입/계약.
// ACR(별도 Next.js 앱)을 은퇴시키고, CTO가 phase로 나눈 작업을 Claude Code(CLI/Workflow)가
// 직접 실행하는 경로의 순수 판단 로직. 실제 spawn/worktree/HTTP 부작용은 여기 없다(서비스 레이어).
// 자산 출처(이식): ACR repo lib/runner/spawn-runner.ts, lib/agents/{agent-model-router,
// agent-fallback-selector,recovery-scheduler}.ts. 이 모듈은 NocoBase 없이 테스트 가능해야 한다.

/** CTO가 phase에 배정하는 실행 에이전트(토큰 풀). hermes/omc는 실행자가 아니라 제외. */
export type MainAgent = 'claude-code' | 'codex' | 'antigravity';

/** Claude 토큰 풀 모델 — Opus 4.8 반영(ACR은 4-7이었음). */
export type ClaudeModel = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5';
/** Codex 토큰 풀 모델. */
export type CodexModel = 'gpt-5.5';
/** Antigravity 토큰 풀 모델. */
export type AntigravityModel =
  | 'gemini-3.5-flash-high'
  | 'gemini-3.5-flash-medium'
  | 'gemini-3.1-pro-low'
  | 'gemini-3.1-pro-high';
export type ModelId = ClaudeModel | CodexModel | AntigravityModel;

/** 작업 종류 — 에이전트/모델 라우팅의 입력(ACR agent-model-router의 TaskKind 이식). */
export type TaskKind =
  | 'implementation'
  | 'qa'
  | 'test'
  | 'code_review'
  | 'ui'
  | 'ux_copy'
  | 'architecture'
  | 'security'
  | 'release'
  | 'database'
  | 'deployment'
  | 'documentation'
  | 'unknown';

// ── CLI 실행 커맨드 (cli-command.ts) ─────────────────────────────────────────

/** buildAgentCommand 입력. */
export interface BuildCommandInput {
  agent: MainAgent;
  prompt: string;
  cwd: string;
  /** 풀별 모델 지정(생략 시 CLI 기본/세션 기본). */
  model?: ModelId;
  /** claude warm 세션: 첫 phase는 세션 id 부여, 이후 resume. codex/agy 무시. */
  claudeSessionId?: string;
  /** true면 `--resume <id>`, false/생략이면 `--session-id <id>`(첫 phase). */
  claudeResume?: boolean;
}

/**
 * spawn(cmd, args, {cwd, stdio})로 바로 넘길 수 있는 실행 커맨드.
 * stdinNull=true면 stdin을 무시(즉시 EOF)해야 한다 — codex는 인자 prompt를 받고도
 * stdin 입력을 추가로 기다려 블록한다(PoC에서 'Reading additional input from stdin...' 재현).
 * ACR spawn-runner가 stdio:['ignore','pipe','pipe']로 막던 바로 그 동작.
 */
export interface CliCommand {
  cmd: string;
  args: string[];
  cwd: string;
  stdinNull: boolean;
}

// ── 모델/에이전트 라우팅 (model-map.ts) ──────────────────────────────────────

/** TaskKind → 선호 실행 에이전트(ACR getPreferredAgentForTask 이식). */
export type AgentForTaskKind = (taskKind: TaskKind) => MainAgent;
/** (에이전트, TaskKind) → 선호 모델(ACR getPreferredModelsForTask 이식). 없으면 undefined. */
export type ModelForTask = (agent: MainAgent, taskKind: TaskKind) => ModelId | undefined;

// ── Fallback (fallback.ts) ───────────────────────────────────────────────────

/** 토큰 소진/불가용 시 인계 후보. ACR agent-fallback-selector 이식:
 *  claude-code→codex, codex→claude-code, antigravity→claude-code. */
export type RecommendFallbackAgent = (current: MainAgent) => MainAgent | null;
/** 최대 3단계 인계 체인. */
export type GetFallbackChain = (current: MainAgent) => MainAgent[];

// ── Recovery (recovery.ts) ───────────────────────────────────────────────────

export type QuotaStatus = 'available' | 'rate_limited' | 'exhausted';

/** 풀(에이전트)의 가용 상태 — quota 추적기에서 채워짐. */
export interface AgentPoolState {
  agent: MainAgent;
  quotaStatus: QuotaStatus;
  /** rate_limited/exhausted일 때 회복 추정 시각(ISO). */
  nextRetryAt?: string;
}

/** 미완료(대기) task. */
export interface WaitingTask {
  id: string;
  taskKind: TaskKind;
  primaryAgent: MainAgent;
  primaryModel?: ModelId;
  /** 이 시각 이후 재시도 가능(ISO). 없으면 즉시. */
  nextRetryAt?: string;
  reason: string;
}

export type RecoveryAction = 'run' | 'handoff' | 'wait';

/**
 * 결정론적 회복/인계 판단. ACR recovery-scheduler(dry-run 제안)를 실행 가능한 결정으로.
 *  - run: primary 풀이 가용 → 그대로 실행
 *  - handoff: primary가 소진이고 fallback 풀이 가용 → fallback 에이전트로 인계(살아있는 풀이 끌어감)
 *  - wait: 가용 풀 없음 → nextRetryAt까지 대기
 */
export interface RecoveryDecision {
  taskId: string;
  action: RecoveryAction;
  agent: MainAgent;
  model?: ModelId;
  reason: string;
  /** action='wait'일 때 가장 이른 회복 추정 시각(ISO) — orchestrator의 ScheduleWakeup 입력. */
  estimatedReadyAt?: string;
}

/** decideRecovery 입력. nowIso는 결정론을 위해 호출자가 주입(Date.now 직접 호출 금지). */
export interface DecideRecoveryInput {
  task: WaitingTask;
  pools: AgentPoolState[];
  nowIso: string;
}
export type DecideRecovery = (input: DecideRecoveryInput) => RecoveryDecision;
