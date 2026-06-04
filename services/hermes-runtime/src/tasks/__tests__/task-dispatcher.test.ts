import { runTaskDispatcher } from "../task-dispatcher";
import type { AgentTask } from "@l5/core";

// Mock all agent runners from @l5/agent-runtime
jest.mock("@l5/agent-runtime", () => ({
  runCMOAgent: jest.fn(),
  runCROAgent: jest.fn(),
  runCPOAgent: jest.fn(),
  runCTOAgent: jest.fn(),
  runCOOAgent: jest.fn(),
  runCFOAgent: jest.fn(),
  runRiskQAAgent: jest.fn(),
  runChiefOfStaffAgent: jest.fn(),
}));

import {
  runCTOAgent,
  runCMOAgent,
} from "@l5/agent-runtime";

const baseCTOTask: AgentTask = {
  id: "task-cto-1",
  instruction_id: "instr-1",
  assigned_agent: "CTO",
  title: "Implement auth service",
  rationale: "Users need secure login",
  expected_output: "Working JWT auth endpoint",
  status: "queued",
  approval_required: false,
  risk_level: "D2",
  phase: "execution_build",
  created_at: "2026-05-29T00:00:00Z",
  updated_at: "2026-05-29T00:00:00Z",
};

beforeEach(() => {
  (runCTOAgent as jest.Mock).mockReset();
  (runCMOAgent as jest.Mock).mockReset();
});

describe("runTaskDispatcher — happy path", () => {
  it("queued+approval_required=false CTO task calls runCTOAgent and stays running (ACR owns completion via taskCallback)", async () => {
    (runCTOAgent as jest.Mock).mockResolvedValueOnce({
      decision: "ACR dispatched",
      requires_founder_approval: false,
    });

    const updates: Array<{ id: string; updates: any }> = [];
    const updater = jest.fn(async (id: string, u: any) => {
      updates.push({ id, updates: u });
    });

    const result = await runTaskDispatcher([baseCTOTask], updater);

    expect(runCTOAgent).toHaveBeenCalledTimes(1);
    expect(runCTOAgent).toHaveBeenCalledWith({
      task: {
        id: "task-cto-1",
        title: "Implement auth service",
        rationale: "Users need secure login",
        expected_output: "Working JWT auth endpoint",
        phase: "execution_build",
        risk_level: "D2",
      },
    });

    // Only updater call: status → running. The CTO task was dispatched to ACR for
    // async execution; it stays "running" so the Control Room shows live progress.
    // taskCallback(all_done) — not the dispatcher — marks it done later.
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("task-cto-1");
    expect(updates[0].updates.status).toBe("running");

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.results[0]).toMatchObject({
      task_id: "task-cto-1",
      agent: "CTO",
      status: "running",
      decision: "ACR dispatched",
    });
  });
});

describe("runTaskDispatcher — requires_founder_approval → needs_review", () => {
  it("maps requires_founder_approval=true to needs_review status", async () => {
    (runCTOAgent as jest.Mock).mockResolvedValueOnce({
      decision: "CTO requires clarification",
      requires_founder_approval: true,
    });

    const updates: Array<{ id: string; updates: any }> = [];
    const updater = jest.fn(async (id: string, u: any) => {
      updates.push({ id, updates: u });
    });

    const result = await runTaskDispatcher([baseCTOTask], updater);

    // running first, then needs_review
    expect(updates[0].updates.status).toBe("running");
    expect(updates[1].updates.status).toBe("needs_review");

    expect(result.results[0].status).toBe("needs_review");
  });
});

describe("runTaskDispatcher — runner throws → blocked", () => {
  it("sets status=blocked and records blocker message on runner exception", async () => {
    (runCTOAgent as jest.Mock).mockRejectedValueOnce(new Error("ACR unreachable"));

    const updates: Array<{ id: string; updates: any }> = [];
    const updater = jest.fn(async (id: string, u: any) => {
      updates.push({ id, updates: u });
    });

    const result = await runTaskDispatcher([baseCTOTask], updater);

    expect(updates[0].updates.status).toBe("running");
    expect(updates[1].updates.status).toBe("blocked");
    expect(updates[1].updates.blocker).toContain("ACR unreachable");

    expect(result.results[0].status).toBe("blocked");
    expect(result.processed).toBe(1);
  });
});

describe("runTaskDispatcher — approval_required=true task is skipped", () => {
  it("does not call runCTOAgent and increments skipped when approval_required=true", async () => {
    const approvalTask: AgentTask = {
      ...baseCTOTask,
      id: "task-cto-2",
      approval_required: true,
      status: "queued",
    };

    const updater = jest.fn(async () => {});
    const result = await runTaskDispatcher([approvalTask], updater);

    expect(runCTOAgent).not.toHaveBeenCalled();
    expect(updater).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("runTaskDispatcher — non-queued task is skipped", () => {
  it("skips a CTO task that is already in running state", async () => {
    const runningTask: AgentTask = { ...baseCTOTask, status: "running" };

    const updater = jest.fn(async () => {});
    const result = await runTaskDispatcher([runningTask], updater);

    expect(runCTOAgent).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });
});

describe("runTaskDispatcher — unknown agent is skipped", () => {
  it("skips a queued task with no registered runner", async () => {
    const unknownTask: AgentTask = {
      ...baseCTOTask,
      id: "task-unknown-1",
      assigned_agent: "UNKNOWN_AGENT" as any,
    };

    const updater = jest.fn(async () => {});
    const result = await runTaskDispatcher([unknownTask], updater);

    expect(updater).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(0);
  });
});

describe("runTaskDispatcher — mixed batch", () => {
  it("processes only eligible tasks and skips the rest", async () => {
    (runCTOAgent as jest.Mock).mockResolvedValueOnce({
      decision: "done",
      requires_founder_approval: false,
    });
    (runCMOAgent as jest.Mock).mockResolvedValueOnce({
      decision: "done",
      requires_founder_approval: false,
    });

    const approvalTask: AgentTask = { ...baseCTOTask, id: "t-skip", approval_required: true };
    const cmoTask: AgentTask = {
      ...baseCTOTask,
      id: "task-cmo-1",
      assigned_agent: "CMO",
      approval_required: false,
    };

    const updater = jest.fn(async () => {});
    const result = await runTaskDispatcher(
      [baseCTOTask, approvalTask, cmoTask],
      updater,
    );

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(runCTOAgent).toHaveBeenCalledTimes(1);
    expect(runCMOAgent).toHaveBeenCalledTimes(1);
  });
});
