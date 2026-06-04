import type { AgentTask } from "@l5/core";
import type { LLMClient } from "@l5/core";
import { judgeNeedsReviewD3Tasks } from "../approval-checker.js";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-001",
    instruction_id: "instr-001",
    assigned_agent: "CTO",
    title: "Test D3 task",
    rationale: "Internal update",
    expected_output: "Module updated",
    status: "needs_review",
    approval_required: true,
    risk_level: "D3",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLLM(verdict: string, rationale = "테스트 판단"): LLMClient {
  return {
    complete: async () =>
      JSON.stringify({ verdict, rationale, conditions: [] }),
  };
}

describe("judgeNeedsReviewD3Tasks", () => {
  const now = new Date();

  it("D3 needs_review + LLM pass → task status becomes done", async () => {
    const tasks = [makeTask()];
    const llm = makeLLM("pass", "단일 모듈 내부 작업");

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    expect(result.passed_count).toBe(1);
    expect(result.updatedTasks[0].status).toBe("done");

    // Judge metadata recorded in source_ref
    const meta = JSON.parse(result.updatedTasks[0].source_ref ?? "{}");
    expect(meta.judge.verdict).toBe("pass");
    expect(meta.judge.used_llm).toBe(true);
  });

  it("D3 needs_review + LLM escalate → status stays needs_review, source_ref records escalated_from_d3", async () => {
    const tasks = [makeTask({ title: "고객 이메일 발송" })];
    const llm = makeLLM("escalate", "외부 사용자에게 영향");

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    expect(result.escalated_count).toBe(1);
    expect(result.passed_count).toBe(0);
    const task = result.updatedTasks[0];
    expect(task.status).toBe("needs_review");
    expect(task.approval_required).toBe(true);

    const meta = JSON.parse(task.source_ref ?? "{}");
    expect(meta.escalated_from_d3).toBe(true);
    expect(meta.escalated_approval_level).toBe("founder_only");
    expect(meta.judge.verdict).toBe("escalate");
  });

  it("D3 needs_review + LLM hold → no status change, meta judge recorded", async () => {
    const tasks = [makeTask()];
    const llm = makeLLM("hold", "모호한 범위");

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    expect(result.held_count).toBe(1);
    expect(result.passed_count).toBe(0);
    const task = result.updatedTasks[0];
    expect(task.status).toBe("needs_review");

    const meta = JSON.parse(task.source_ref ?? "{}");
    expect(meta.judge.verdict).toBe("hold");
  });

  it("D3 needs_review + LLM throws → status stays needs_review (24h fallback handles it)", async () => {
    const tasks = [makeTask()];
    const llm: LLMClient = {
      complete: async () => { throw new Error("LLM network error"); },
    };

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    // judgeD3Task catches LLM errors internally and returns hold+used_llm=false.
    // So judged_count=1, held_count=1, status stays needs_review.
    expect(result.judged_count).toBe(1);
    expect(result.held_count).toBe(1);
    expect(result.updatedTasks[0].status).toBe("needs_review");
    // Judge meta is recorded so 24h timer can still fire later.
    const meta = JSON.parse(result.updatedTasks[0].source_ref ?? "{}");
    expect(meta.judge.used_llm).toBe(false);
    expect(meta.judge.verdict).toBe("hold");
  });

  it("D4 needs_review → judge not called, task unchanged", async () => {
    let called = false;
    const llm: LLMClient = {
      complete: async () => {
        called = true;
        return JSON.stringify({ verdict: "pass", rationale: "should not run" });
      },
    };
    const tasks = [makeTask({ risk_level: "D4" })];

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    expect(called).toBe(false);
    expect(result.judged_count).toBe(0);
    expect(result.updatedTasks[0].status).toBe("needs_review");
  });

  it("D3 done task is not re-judged", async () => {
    let called = false;
    const llm: LLMClient = {
      complete: async () => {
        called = true;
        return JSON.stringify({ verdict: "pass", rationale: "should not run" });
      },
    };
    const tasks = [makeTask({ status: "done" })];

    const result = await judgeNeedsReviewD3Tasks(tasks, llm, now);

    expect(called).toBe(false);
    expect(result.judged_count).toBe(0);
  });

  it("llm=null → all D3 tasks held (deterministic fallback)", async () => {
    const tasks = [makeTask(), makeTask({ id: "task-002" })];

    const result = await judgeNeedsReviewD3Tasks(tasks, null, now);

    // judgeD3Task with null llm returns hold + used_llm=false, no throw
    expect(result.held_count).toBe(2);
    expect(result.passed_count).toBe(0);
    result.updatedTasks.forEach((t) => {
      expect(t.status).toBe("needs_review");
      const meta = JSON.parse(t.source_ref ?? "{}");
      expect(meta.judge.used_llm).toBe(false);
    });
  });
});
