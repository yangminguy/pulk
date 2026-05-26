// Trigger.dev cron schedule definitions for Hermes tasks.
// These are reference constants; wire them into your Trigger.dev project
// entry point when the Trigger.dev SDK is installed.

export const HERMES_SCHEDULES = {
  // Stalled task detector: every hour
  STALLED_TASK_DETECTOR: "0 * * * *",

  // Approval checker daily brief: every day at 09:00
  APPROVAL_CHECKER: "0 9 * * *",
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
