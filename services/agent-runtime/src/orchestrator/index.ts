// Native Orchestrator 배럴. ACR을 대체해 CTO phase를 로컬에서 직접 실행하는 레이어.
export {
  dispatchToNativeOrchestrator,
  type NativeOrchestratorDeps,
  type NativeRunSummary,
  type PhaseRunSink,
  type PhaseRunRecord,
  type PhaseRunPatch,
} from './native-orchestrator.js';
export { runAgentCommand, type RunAgentResult, type RunAgentOptions } from './spawn-agent.js';
export {
  createPhaseWorktree,
  mergePhaseWorktree,
  removePhaseWorktree,
  type PhaseWorktree,
} from './worktree.js';
export {
  buildPhaseExecutionPrompt,
  type BuildPhasePromptOptions,
} from './phase-prompt.js';
