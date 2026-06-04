// Approval Required Checker
// Surfaces actions gated behind Founder approval (per D1-D5 risk levels) so they don't stall silently.

import type { LoopContext, LoopResult } from "./types.js";

export async function runApprovalRequiredChecker(
  context: LoopContext,
): Promise<LoopResult> {
  // TODO: implement with Trigger.dev — find pending approval gates, notify Founder, track resolution.
  void context;
  return {
    loop: "approval-required-checker",
    status: "skipped",
    summary: "TODO: implement approval required checker",
    actions: [],
  };
}
