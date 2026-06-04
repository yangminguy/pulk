// Night BPR Loop
// End-of-day Business Performance Review: aggregates results, computes BPR, and records insights for learning.

import type { LoopContext, LoopResult } from "./types.js";

export async function runNightBPRLoop(
  context: LoopContext,
): Promise<LoopResult> {
  // TODO: implement with Trigger.dev — schedule nightly, compute BPR via @l5/core, persist reusable insights.
  void context;
  return {
    loop: "night-bpr-loop",
    status: "skipped",
    summary: "TODO: implement night BPR loop",
    actions: [],
  };
}
