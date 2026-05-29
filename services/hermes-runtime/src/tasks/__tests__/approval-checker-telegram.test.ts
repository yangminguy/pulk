// Tests that runApprovalChecker fires Telegram for D4/D5 tasks.
import type { AgentTask } from "@l5/core";
import { runApprovalChecker } from "../approval-checker.js";
import type { TelegramClient, TelegramMessage } from "../../notifier/telegram.js";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-001",
    instruction_id: "instr-001",
    assigned_agent: "CTO",
    title: "D4 고위험 태스크",
    rationale: "외부 시스템 연동",
    expected_output: "완료",
    status: "needs_review",
    approval_required: true,
    risk_level: "D4",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function makeTelegramMock(): { client: TelegramClient; calls: TelegramMessage[] } {
  const calls: TelegramMessage[] = [];
  const client: TelegramClient = {
    send: jest.fn(async (msg: TelegramMessage) => {
      calls.push(msg);
      return { ok: true };
    }),
  };
  return { client, calls };
}

describe("runApprovalChecker — Telegram wire-up", () => {
  const silentNotifier = jest.fn<Promise<boolean>, [any]>().mockResolvedValue(true);

  beforeEach(() => {
    silentNotifier.mockClear();
  });

  it("sends Telegram warn for a D4 needs_review task", async () => {
    const { client, calls } = makeTelegramMock();
    const tasks = [makeTask({ risk_level: "D4" })];

    await runApprovalChecker(tasks, silentNotifier, null, client);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const call = calls.find((c) => c.dedupKey === "approval:task-001");
    expect(call).toBeDefined();
    expect(call!.level).toBe("warn");
    expect(call!.title).toContain("D4");
  });

  it("sends Telegram urgent for a D5 needs_review task", async () => {
    const { client, calls } = makeTelegramMock();
    const tasks = [makeTask({ id: "task-d5", risk_level: "D5" })];

    await runApprovalChecker(tasks, silentNotifier, null, client);

    const call = calls.find((c) => c.dedupKey === "approval:task-d5");
    expect(call).toBeDefined();
    expect(call!.level).toBe("urgent");
  });

  it("does not send Telegram for a D3 task (not escalated)", async () => {
    const { client, calls } = makeTelegramMock();
    const tasks = [makeTask({ id: "task-d3", risk_level: "D3" })];

    await runApprovalChecker(tasks, silentNotifier, null, client);

    // D3 non-escalated tasks should NOT trigger D4/D5 path
    const d3Call = calls.find((c) => c.dedupKey === "approval:task-d3");
    expect(d3Call).toBeUndefined();
  });

  it("sends Telegram for escalated_from_d3 task", async () => {
    const { client, calls } = makeTelegramMock();
    const sourceRef = JSON.stringify({
      escalated_from_d3: true,
      escalated_approval_level: "founder_only",
      judge: { verdict: "escalate", rationale: "외부 영향" },
    });
    const tasks = [
      makeTask({
        id: "task-esc",
        risk_level: "D3",
        source_ref: sourceRef,
      }),
    ];

    await runApprovalChecker(tasks, silentNotifier, null, client);

    const call = calls.find((c) => c.dedupKey === "approval:task-esc");
    expect(call).toBeDefined();
    expect(call!.level).toBe("warn");
    expect(call!.title).toContain("escalated");
  });
});
