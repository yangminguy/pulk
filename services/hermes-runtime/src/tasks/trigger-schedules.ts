// Trigger.dev cron schedule definitions for Hermes tasks.
// These are reference constants; wire them into your Trigger.dev project
// entry point when the Trigger.dev SDK is installed.

/** Hours after which a D3 (low-external-risk) task is automatically approved. */
export const D3_AUTO_APPROVE_HOURS = 24;

// D5 double-gate implementation guide:
// D5 tasks require two sequential approvals before any external action is taken:
//   Gate 1 — RiskQA review: RiskQA agent must evaluate the task and set status='needs_review'.
//   Gate 2 — Founder approval: only after Gate 1 is cleared can the Founder approve.
// Until both gates are cleared, blocked=true is forced by executeAgentTask().
// Wire a dedicated "d5-double-gate-checker" Trigger.dev task if automated Gate 1 escalation is needed.

export const HERMES_SCHEDULES = {
  // Stalled task detector: every hour
  STALLED_TASK_DETECTOR: "0 * * * *",

  // Approval checker daily brief: every day at 09:00
  APPROVAL_CHECKER: "0 9 * * *",

  // Daily brief generator: every day at 09:00
  DAILY_BRIEF_GENERATOR: "0 9 * * *",

  // Memory review generator: every Friday at 17:00
  MEMORY_REVIEW_GENERATOR: "0 17 * * 5",
} as const;

// Example Trigger.dev v3 wiring (add @trigger.dev/sdk to package.json when ready):
//
// import { schedules } from "@trigger.dev/sdk/v3";
// import { runStalledTaskDetector } from "./stalled-task-detector.js";
// import { runApprovalChecker } from "./approval-checker.js";
//
// export const stalledTaskDetectorTask = schedules.task({
//   id: "stalled-task-detector",
//   cron: HERMES_SCHEDULES.STALLED_TASK_DETECTOR,
//   run: async () => {
//     const tasks = await fetchAgentTasks();
//     return runStalledTaskDetector(tasks, sendCEOAlert);
//   },
// });
//
// export const approvalCheckerTask = schedules.task({
//   id: "approval-checker",
//   cron: HERMES_SCHEDULES.APPROVAL_CHECKER,
//   run: async () => {
//     const tasks = await fetchAgentTasks();
//     return runApprovalChecker(tasks, sendFounderBrief);
//   },
// });
//
// export const dailyBriefGeneratorTask = schedules.task({
//   id: "daily-brief-generator",
//   cron: HERMES_SCHEDULES.DAILY_BRIEF_GENERATOR,
//   run: async () => {
//     const tasks = await fetchAgentTasks();
//     return runDailyBriefGenerator(tasks, sendFounderBrief);
//   },
// });
