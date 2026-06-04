// Stalled Workflow Detector
// Periodically scans active workflows for ones that have not progressed and flags them for intervention.

import type { LoopContext, LoopResult } from "./types.js";

export async function runStalledWorkflowDetector(
  context: LoopContext,
): Promise<LoopResult> {
  // TODO: implement with Trigger.dev — scan workflow state, detect staleness thresholds, raise alerts.
  void context;
  return {
    loop: "stalled-workflow-detector",
    status: "skipped",
    summary: "TODO: implement stalled workflow detector",
    actions: [],
  };
}
