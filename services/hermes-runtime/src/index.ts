// @l5/hermes-runtime entrypoint
// Trigger.dev-backed scheduled loops that drive the L5 operating cadence. All loops are scaffolds; see TODOs.

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

export { getApprovalQueue, approveTask, rejectTask } from "./api/approval-queue.js";
export type {
  ApprovalQueueItem,
  ApprovalQueueResponse,
  ApproveTaskRequest,
  RejectTaskRequest,
  ApprovalActionResponse,
} from "./api/approval-queue.js";

export { HERMES_SCHEDULES } from "./tasks/trigger-schedules.js";
