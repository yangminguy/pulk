// Auto-approve test suite for D3 24h auto-approval logic.
// Uses the same assertion pattern as dry-run.ts (pure TypeScript, no jest dependency).
// Run with: node --loader ts-node/esm src/tasks/__tests__/auto-approve.test.ts

import type { AgentTask } from "@l5/core";
import {
  autoApproveExpiredD3Tasks,
  getApprovalQueue,
} from "../../api/approval-queue.js";

function makeTask(overrides: Partial<AgentTask>): AgentTask {
  return {
    id: "task-aa-001",
    instruction_id: "instr-aa-001",
    assigned_agent: "CMO",
    title: "Auto-approve test task",
    rationale: "Testing D3 auto-approve",
    expected_output: "Result",
    status: "needs_review",
    approval_required: true,
    risk_level: "D3",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// --- Test: 25h-old D3 task is auto-approved ---
{
  const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const task = makeTask({ id: "t-d3-25h", risk_level: "D3", created_at: createdAt, updated_at: createdAt });
  const now = new Date();

  const { updatedTasks, approved_count } = autoApproveExpiredD3Tasks([task], now);

  console.assert(approved_count === 1, `Expected approved_count=1, got ${approved_count}`);
  console.assert(
    updatedTasks[0].status === "done",
    `Expected status='done', got '${updatedTasks[0].status}'`,
  );
  console.log("✓ 25h D3 task → auto-approved (status='done')");
}

// --- Test: 23h-old D3 task stays needs_review ---
{
  const createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const task = makeTask({ id: "t-d3-23h", risk_level: "D3", created_at: createdAt, updated_at: createdAt });
  const now = new Date();

  const { updatedTasks, approved_count } = autoApproveExpiredD3Tasks([task], now);

  console.assert(approved_count === 0, `Expected approved_count=0, got ${approved_count}`);
  console.assert(
    updatedTasks[0].status === "needs_review",
    `Expected status='needs_review', got '${updatedTasks[0].status}'`,
  );
  console.log("✓ 23h D3 task → still needs_review (not expired)");
}

// --- Test: D4 task is never auto-approved even after 25h ---
{
  const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const task = makeTask({ id: "t-d4-25h", risk_level: "D4", created_at: createdAt, updated_at: createdAt });
  const now = new Date();

  const { updatedTasks, approved_count } = autoApproveExpiredD3Tasks([task], now);

  console.assert(approved_count === 0, `Expected approved_count=0 for D4, got ${approved_count}`);
  console.assert(
    updatedTasks[0].status === "needs_review",
    `Expected D4 status='needs_review', got '${updatedTasks[0].status}'`,
  );
  console.log("✓ D4 task after 25h → not auto-approved");
}

// --- Test: D5 task is never auto-approved even after 25h ---
{
  const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const task = makeTask({ id: "t-d5-25h", risk_level: "D5", created_at: createdAt, updated_at: createdAt });
  const now = new Date();

  const { updatedTasks, approved_count } = autoApproveExpiredD3Tasks([task], now);

  console.assert(approved_count === 0, `Expected approved_count=0 for D5, got ${approved_count}`);
  console.assert(
    updatedTasks[0].status === "needs_review",
    `Expected D5 status='needs_review', got '${updatedTasks[0].status}'`,
  );
  console.log("✓ D5 task after 25h → not auto-approved");
}

// --- Test: getApprovalQueue includes auto_approve_at only for D3 ---
{
  const now = new Date().toISOString();
  const d3Task = makeTask({ id: "t-d3-queue", risk_level: "D3", created_at: now, updated_at: now });
  const d4Task = makeTask({ id: "t-d4-queue", risk_level: "D4", created_at: now, updated_at: now });

  const queue = getApprovalQueue([d3Task, d4Task]);

  const d3Item = queue.items.find((i) => i.task_id === "t-d3-queue");
  const d4Item = queue.items.find((i) => i.task_id === "t-d4-queue");

  console.assert(d3Item?.auto_approve_at !== undefined, "D3 queue item should have auto_approve_at");
  console.assert(d4Item?.auto_approve_at === undefined, "D4 queue item should not have auto_approve_at");
  console.log("✓ getApprovalQueue: D3 has auto_approve_at, D4 does not");
}

// --- Test: mixed task list — only D3 25h task is approved ---
{
  const ago25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const now_str = new Date().toISOString();

  const tasks: AgentTask[] = [
    makeTask({ id: "t-mix-d3-25h", risk_level: "D3", created_at: ago25h, updated_at: ago25h }),
    makeTask({ id: "t-mix-d3-23h", risk_level: "D3", created_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), updated_at: now_str }),
    makeTask({ id: "t-mix-d4-25h", risk_level: "D4", created_at: ago25h, updated_at: ago25h }),
    makeTask({ id: "t-mix-d5-25h", risk_level: "D5", created_at: ago25h, updated_at: ago25h }),
  ];

  const { updatedTasks, approved_count } = autoApproveExpiredD3Tasks(tasks, new Date());

  console.assert(approved_count === 1, `Expected 1 auto-approved, got ${approved_count}`);
  const d3_25h = updatedTasks.find((t) => t.id === "t-mix-d3-25h");
  const d3_23h = updatedTasks.find((t) => t.id === "t-mix-d3-23h");
  const d4_25h = updatedTasks.find((t) => t.id === "t-mix-d4-25h");
  const d5_25h = updatedTasks.find((t) => t.id === "t-mix-d5-25h");
  console.assert(d3_25h?.status === "done", "D3 25h should be done");
  console.assert(d3_23h?.status === "needs_review", "D3 23h should stay needs_review");
  console.assert(d4_25h?.status === "needs_review", "D4 25h should stay needs_review");
  console.assert(d5_25h?.status === "needs_review", "D5 25h should stay needs_review");
  console.log("✓ mixed task list: only D3 25h task auto-approved");
}

console.log("\nAll auto-approve assertions passed.");
