// @l5/agent-runtime entrypoint

export * from "./agents/types.js";
export { runCEOAgent } from "./agents/ceo.js";
export { runChiefOfStaffAgent } from "./agents/chief-of-staff.js";
export { runCMOAgent } from "./agents/cmo.js";
export { runCROAgent } from "./agents/cro.js";
export { runCPOAgent } from "./agents/cpo.js";
export { runCTOAgent } from "./agents/cto.js";
export { runCOOAgent } from "./agents/coo.js";
export { runCFOAgent } from "./agents/cfo.js";
export { runRiskQAAgent } from "./agents/risk-qa.js";
export { healFailedTask, classifyFailure } from "./self-heal.js";
export type { HealOutcome, HealInput, FailureKind } from "./self-heal.js";
export { dispatchToNativeOrchestrator } from "./orchestrator/index.js";
export type { NativeOrchestratorDeps, NativeRunSummary } from "./orchestrator/index.js";
export { runApprovedBatch } from "./orchestrator/index.js";
export type {
  BatchRunResult,
  GroupRunResult,
  GroupStatus,
  BatchRunnerOverrides,
} from "./orchestrator/index.js";
