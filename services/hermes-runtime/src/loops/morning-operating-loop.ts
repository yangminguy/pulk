// Morning Operating Loop
// Daily kickoff: reviews overnight state, sets the day's priorities, and queues agent runs.

import type { LoopContext, LoopResult } from "./types.js";

export async function runMorningOperatingLoop(
  context: LoopContext,
): Promise<LoopResult> {
  // TODO: implement with Trigger.dev — schedule daily, pull active workflows, invoke @l5/agent-runtime.
  void context;
  return {
    loop: "morning-operating-loop",
    status: "skipped",
    summary: "TODO: implement morning operating loop",
    actions: [],
  };
}
