import { runDailyBriefGenerator } from "../daily-brief-generator.js";
import type { DailyBrief } from "../daily-brief-generator.js";
import type { AgentTask } from "@l5/core";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-001",
    instruction_id: "instr-001",
    assigned_agent: "CMO",
    title: "Test task",
    rationale: "test",
    expected_output: "test output",
    status: "queued",
    approval_required: false,
    created_at: "2026-05-27T00:00:00Z",
    updated_at: "2026-05-27T00:00:00Z",
    ...overrides,
  };
}

describe("runDailyBriefGenerator", () => {
  it("returns all-zero counts for empty task list", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>();
    const result = await runDailyBriefGenerator([], notifier);

    expect(result.brief.active_count).toBe(0);
    expect(result.brief.blocked_count).toBe(0);
    expect(result.brief.approval_pending_count).toBe(0);
    expect(result.brief.blocked_tasks).toHaveLength(0);
    expect(result.brief.approval_items).toHaveLength(0);
    expect(result.brief.recommendations).toHaveLength(0);
  });

  it("does not call notifier when no blocked or approval-pending tasks", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>();
    await runDailyBriefGenerator([makeTask({ status: "queued" })], notifier);

    expect(notifier).not.toHaveBeenCalled();
  });

  it("includes CEO 검토 recommendation when blocked tasks exist", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>().mockResolvedValue(true);
    const result = await runDailyBriefGenerator(
      [makeTask({ id: "t-blocked", status: "blocked" })],
      notifier,
    );

    expect(result.brief.recommendations.some((r) => r.includes("CEO 검토"))).toBe(true);
    expect(result.brief.blocked_count).toBe(1);
  });

  it("includes Founder 승인 recommendation when approval-pending tasks exist", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>().mockResolvedValue(true);
    const result = await runDailyBriefGenerator(
      [makeTask({ id: "t-approval", status: "needs_review", approval_required: true })],
      notifier,
    );

    expect(result.brief.recommendations.some((r) => r.includes("Founder 승인"))).toBe(true);
    expect(result.brief.approval_pending_count).toBe(1);
  });

  it("calls notifier when blocked tasks exist and returns notification_sent true", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>().mockResolvedValue(true);
    const result = await runDailyBriefGenerator(
      [makeTask({ id: "t-b", status: "blocked" })],
      notifier,
    );

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(result.notification_sent).toBe(true);
  });

  it("calls notifier when approval-pending tasks exist", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>().mockResolvedValue(true);
    await runDailyBriefGenerator(
      [makeTask({ id: "t-a", status: "needs_review", approval_required: true })],
      notifier,
    );

    expect(notifier).toHaveBeenCalledTimes(1);
  });

  it("active_count counts queued, running, needs_review statuses", async () => {
    const notifier = jest.fn<Promise<boolean>, [DailyBrief]>().mockResolvedValue(true);
    const tasks = [
      makeTask({ id: "t1", status: "queued" }),
      makeTask({ id: "t2", status: "running" }),
      makeTask({ id: "t3", status: "needs_review" }),
      makeTask({ id: "t4", status: "done" }),
    ];
    const result = await runDailyBriefGenerator(tasks, notifier);

    expect(result.brief.active_count).toBe(3);
  });
});
