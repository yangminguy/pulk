// Hermes cron schedule definitions.
// Use these constants with launchd (macOS) or any cron runner.

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

  // Repetition analyzer: every 2 hours at :00
  REPETITION_ANALYZER: "0 */2 * * *",
} as const;

