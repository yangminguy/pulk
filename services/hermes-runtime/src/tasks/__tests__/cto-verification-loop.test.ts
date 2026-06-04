import {
  parseRetryCount,
  shouldRetry,
  runCTOVerificationLoop,
  MAX_RETRIES,
} from "../cto-verification-loop";
import type { AgentTask } from "@l5/core";

jest.mock("@l5/agent-runtime", () => ({
  runCTOAgent: jest.fn(async () => ({ decision: "re-attempted" })),
}));

import { runCTOAgent } from "@l5/agent-runtime";

const baseTask: AgentTask = {
  id: "t1",
  instruction_id: "i1",
  assigned_agent: "CTO",
  title: "build feature X",
  rationale: "user asked",
  expected_output: "endpoint working",
  status: "needs_review",
  approval_required: false,
  risk_level: "D2",
  phase: "execution_build",
  blocker: "verifier:fail Process exited with code 1. retry=true. phase=spec",
  created_at: "2026-05-28T00:00:00Z",
  updated_at: "2026-05-28T00:00:00Z",
};

describe("parseRetryCount", () => {
  it("returns 0 when no tag", () => {
    expect(parseRetryCount("verifier:fail something")).toBe(0);
    expect(parseRetryCount("")).toBe(0);
    expect(parseRetryCount(null)).toBe(0);
  });

  it("parses cto_retry=N", () => {
    expect(parseRetryCount("cto_retry=1. failed again")).toBe(1);
    expect(parseRetryCount("verifier:fail x. cto_retry=2")).toBe(2);
  });
});

describe("shouldRetry", () => {
  it("retries fresh verifier:fail with retry=true", () => {
    expect(shouldRetry(baseTask)).toBe(true);
  });

  it("skips non-CTO tasks", () => {
    expect(shouldRetry({ ...baseTask, assigned_agent: "CMO" })).toBe(false);
  });

  it("skips tasks not in needs_review", () => {
    expect(shouldRetry({ ...baseTask, status: "done" })).toBe(false);
  });

  it("skips when blocker lacks verifier:fail marker", () => {
    expect(shouldRetry({ ...baseTask, blocker: "manual review please" })).toBe(false);
  });

  it("skips when retry not recommended", () => {
    expect(
      shouldRetry({ ...baseTask, blocker: "verifier:fail x. retry=false" }),
    ).toBe(false);
  });

  it("stops after MAX_RETRIES attempts", () => {
    expect(
      shouldRetry({
        ...baseTask,
        blocker: `verifier:fail x. retry=true. cto_retry=${MAX_RETRIES}`,
      }),
    ).toBe(false);
  });
});

describe("runCTOVerificationLoop", () => {
  beforeEach(() => {
    (runCTOAgent as jest.Mock).mockClear();
  });

  it("re-dispatches eligible task and marks running with incremented retry", async () => {
    const updates: Array<{ id: string; patch: any }> = [];
    const updater = async (id: string, patch: any) => {
      updates.push({ id, patch });
    };
    const r = await runCTOVerificationLoop([baseTask], updater);
    expect(r.considered).toBe(1);
    expect(r.retried).toBe(1);
    expect(runCTOAgent).toHaveBeenCalledTimes(1);
    expect(updates[0].patch.status).toBe("running");
    expect(updates[0].patch.blocker).toContain("cto_retry=1");
  });

  it("skips tasks at retry limit", async () => {
    const stuck = {
      ...baseTask,
      blocker: `verifier:fail x. retry=true. cto_retry=${MAX_RETRIES}`,
    };
    const r = await runCTOVerificationLoop([stuck], async () => {});
    expect(r.retried).toBe(0);
    expect(r.skipped[0].reason).toBe("not-retryable");
    expect(runCTOAgent).not.toHaveBeenCalled();
  });

  it("records dispatch failure", async () => {
    (runCTOAgent as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const updates: Array<{ id: string; patch: any }> = [];
    const r = await runCTOVerificationLoop([baseTask], async (id, patch) => {
      updates.push({ id, patch });
    });
    expect(r.retried).toBe(0);
    expect(r.skipped[0].reason).toContain("boom");
    expect(updates[0].patch.blocker).toContain("dispatch failed");
  });
});
