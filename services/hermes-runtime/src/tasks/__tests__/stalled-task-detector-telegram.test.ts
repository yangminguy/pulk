// Tests that runStalledTaskDetector fires Telegram for stalled tasks.
import type { AgentTask } from "@l5/core";
import { runStalledTaskDetector } from "../stalled-task-detector.js";
import type { TelegramClient, TelegramMessage } from "../../notifier/telegram.js";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-001",
    instruction_id: "instr-001",
    assigned_agent: "CMO",
    title: "마케팅 캠페인 실행",
    rationale: "PMF 검증",
    expected_output: "캠페인 결과",
    status: "blocked",
    approval_required: false,
    created_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
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

describe("runStalledTaskDetector — Telegram wire-up", () => {
  const silentNotifier = jest.fn<Promise<string[]>, [any]>().mockResolvedValue(["notified"]);

  beforeEach(() => {
    silentNotifier.mockClear();
  });

  it("sends Telegram warn for a blocked task", async () => {
    const { client, calls } = makeTelegramMock();
    const tasks = [makeTask({ status: "blocked" })];

    await runStalledTaskDetector(tasks, silentNotifier, client);

    expect(calls.length).toBe(1);
    expect(calls[0].level).toBe("warn");
    expect(calls[0].dedupKey).toBe("stalled:task-001");
    expect(calls[0].title).toContain("CMO");
    expect(calls[0].body).toContain("마케팅 캠페인 실행");
    expect(calls[0].body).toMatch(/\d+분 동안 진행 없음/);
  });

  it("sends Telegram warn for an overdue task (24h+)", async () => {
    const { client, calls } = makeTelegramMock();
    const overdueTask = makeTask({
      id: "task-overdue",
      status: "running",
      updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });

    await runStalledTaskDetector([overdueTask], silentNotifier, client);

    expect(calls.length).toBe(1);
    expect(calls[0].dedupKey).toBe("stalled:task-overdue");
    expect(calls[0].level).toBe("warn");
  });

  it("does not send Telegram when no stalled tasks", async () => {
    const { client, calls } = makeTelegramMock();
    const recentTask = makeTask({
      status: "running",
      updated_at: new Date().toISOString(),
    });

    await runStalledTaskDetector([recentTask], silentNotifier, client);

    expect(calls.length).toBe(0);
  });

  it("sends one Telegram per stalled task", async () => {
    const { client, calls } = makeTelegramMock();
    const tasks = [
      makeTask({ id: "task-a", status: "blocked" }),
      makeTask({ id: "task-b", status: "blocked" }),
    ];

    await runStalledTaskDetector(tasks, silentNotifier, client);

    expect(calls.length).toBe(2);
    const keys = calls.map((c) => c.dedupKey);
    expect(keys).toContain("stalled:task-a");
    expect(keys).toContain("stalled:task-b");
  });
});
