import { executeAgentTask } from "../index";
import type { AgentTask } from "../../../types/orchestration";

function makeCoSTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-cos-001",
    instruction_id: "instr-001",
    assigned_agent: "ChiefOfStaff",
    title: "Generate daily operating brief",
    rationale: "Daily operating cadence",
    expected_output: "Daily brief with active/blocked/approval summary",
    status: "queued",
    approval_required: false,
    created_at: "2026-05-27T00:00:00Z",
    updated_at: "2026-05-27T00:00:00Z",
    ...overrides,
  };
}

describe("chiefOfStaffHandler", () => {
  it("returns status completed", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.status).toBe("completed");
  });

  it("returns updated_status done", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.updated_status).toBe("done");
  });

  it("returns approval_required false", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.approval_required).toBe(false);
  });

  it("returns risk_level D1", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.risk_level).toBe("D1");
  });

  it("returns blocked false", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.blocked).toBe(false);
  });

  it("output has all required protocol fields", () => {
    const result = executeAgentTask(makeCoSTask());
    const { output } = result;
    expect(output.current_situation).toBeTruthy();
    expect(output.goal).toBeTruthy();
    expect(output.recommendation).toBeTruthy();
    expect(output.next_owner).toBe("ceo");
    expect(output.action_items.length).toBeGreaterThan(0);
  });

  it("insight_to_record contains brief summary", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.output.insight_to_record).toContain("active:");
    expect(result.output.insight_to_record).toContain("blocked:");
  });

  it("generates handoff with from_agent ChiefOfStaff", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.handoff?.from_agent).toBe("ChiefOfStaff");
    expect(result.handoff?.task_id).toBe("task-cos-001");
  });

  it("aggregates blocked task count from context", () => {
    const result = executeAgentTask(makeCoSTask(), {
      blockedTasks: [
        { task_id: "t1", title: "blocked task", assigned_agent: "CMO" },
      ],
      currentTasks: [],
      approvalQueue: [],
    });
    expect(result.output.insight_to_record).toContain("blocked: 1");
    expect(result.output.recommendation).toContain("CEO 검토");
  });

  it("returns no validation errors", () => {
    const result = executeAgentTask(makeCoSTask());
    expect(result.validation_errors).toHaveLength(0);
  });
});
