// @l5/hermes-runtime entrypoint
// Scheduled loops that drive the L5 operating cadence. All loops are scaffolds; see TODOs.

export * from "./loops/types.js";
export { runMorningOperatingLoop } from "./loops/morning-operating-loop.js";
export { runNightBPRLoop } from "./loops/night-bpr-loop.js";
export { runStalledWorkflowDetector } from "./loops/stalled-workflow-detector.js";
export { runPMFDeadlineChecker } from "./loops/pmf-deadline-checker.js";
export { runApprovalRequiredChecker } from "./loops/approval-required-checker.js";

export { runStalledTaskDetector } from "./tasks/stalled-task-detector.js";
export type { StalledTaskReport, StalledTaskDetectorResult } from "./tasks/stalled-task-detector.js";

export { runApprovalChecker } from "./tasks/approval-checker.js";
export type { PendingApprovalItem, DailyApprovalBrief, ApprovalCheckerResult } from "./tasks/approval-checker.js";

export { runDailyBriefGenerator } from "./tasks/daily-brief-generator.js";
export type { DailyBrief, DailyBriefResult } from "./tasks/daily-brief-generator.js";

export { getApprovalQueue, approveTask, rejectTask } from "./api/approval-queue.js";
export type {
  ApprovalQueueItem,
  ApprovalQueueResponse,
  ApproveTaskRequest,
  RejectTaskRequest,
  ApprovalActionResponse,
} from "./api/approval-queue.js";

export { runMemoryReviewGenerator } from "./tasks/memory-review-generator.js";
export type { MemoryReviewGeneratorResult } from "./tasks/memory-review-generator.js";

export { HERMES_SCHEDULES } from "./tasks/trigger-schedules.js";

export { runRepetitionAnalyzer } from "./tasks/repetition-analyzer.js";
export type { RepetitionAnalysisResult } from "./tasks/repetition-analyzer.js";

export { runCTOPhaseReview } from "./tasks/cto-phase-review.js";
export type { CTOPhaseReviewResult } from "./tasks/cto-phase-review.js";

export {
  runRepetitionAnalyzerLive,
  runApprovalCheckerLive,
  runDailyBriefGeneratorLive,
  runStalledTaskDetectorLive,
  runCTOPhaseReviewLive,
  syncD3AutoApprovals,
} from "./runner.js";

export { fetchAgentTasks, createAgentTask, updateAgentTask, saveFounderMemory, fetchFounderMemories } from "./api/nocobase-client.js";
export type { FounderMemoryEntry } from "./api/nocobase-client.js";
export { notifyACRApprovalRequired, registerACRProject } from "./api/acr-client.js";
