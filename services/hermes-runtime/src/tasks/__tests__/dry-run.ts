// Dry-run verification for Task #6: Approval Queue & Hermes integration.
// Run with: node --loader ts-node/esm src/tasks/__tests__/dry-run.ts

import type { AgentTask } from "@l5/core";
import { getApprovalQueue, approveTask, rejectTask } from "../../api/approval-queue.js";
import { runStalledTaskDetector } from "../stalled-task-detector.js";
import { runApprovalChecker } from "../approval-checker.js";

const now = new Date().toISOString();
const ago25h = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

const tasks: AgentTask[] = [
  {
    id: "t1",
    instruction_id: "i1",
    assigned_agent: "CMO",
    title: "고객 인터뷰 이메일 초안",
    rationale: "PMF 실험 시작 전 고객 의사 확인",
    expected_output: "이메일 초안 3종",
    status: "needs_review",
    approval_required: true,
    risk_level: "D4",
    created_at: now,
    updated_at: now,
  },
  {
    id: "t2",
    instruction_id: "i1",
    assigned_agent: "CTO",
    title: "기술 스택 검토",
    rationale: "빌드 전 타당성 확인",
    expected_output: "검토 보고서",
    status: "blocked",
    approval_required: false,
    blocker: "PRD 미완성",
    created_at: now,
    updated_at: now,
  },
  {
    id: "t3",
    instruction_id: "i2",
    assigned_agent: "CRO",
    title: "리드 세그먼트 분석",
    rationale: "타겟 고객 정의",
    expected_output: "세그먼트 리스트",
    status: "running",
    approval_required: false,
    created_at: ago25h,
    updated_at: ago25h,
  },
];

// 1. Approval Queue
const queue = getApprovalQueue(tasks);
console.assert(queue.total === 1, "approval queue should have 1 item");
console.assert(queue.items[0].task_id === "t1", "approval item should be t1");
console.assert(queue.items[0].risk_level === "D4", "risk_level should be D4");
console.log("✓ getApprovalQueue:", queue.total, "item(s)");

// 2. Approve
const { response: approveResp } = approveTask(tasks[0], { task_id: "t1", notes: "승인" });
console.assert(approveResp.new_status === "done");
console.log("✓ approveTask:", approveResp.message);

// 3. Reject
const { response: rejectResp } = rejectTask(tasks[0], { task_id: "t1", explanation: "내용 불충분" });
console.assert(rejectResp.new_status === "killed");
console.log("✓ rejectTask:", rejectResp.message);

// 4. Stalled task detector
const stalledResult = await runStalledTaskDetector(tasks, async (stalled) => {
  return stalled.map((s) => `alert:${s.task_id}`);
});
console.assert(stalledResult.stalled_count === 2, `expected 2 stalled, got ${stalledResult.stalled_count}`);
console.assert(stalledResult.stalled_tasks.some((s) => s.stall_reason === "blocked"));
console.assert(stalledResult.stalled_tasks.some((s) => s.stall_reason === "overdue"));
console.log("✓ runStalledTaskDetector:", stalledResult.stalled_count, "stalled task(s)");
console.log("  alerts:", stalledResult.alerts_sent);

// 5. Approval checker daily brief
const checkerResult = await runApprovalChecker(tasks, async (brief) => {
  console.log("  brief message:", brief.message);
  return true;
});
console.assert(checkerResult.brief.pending_count === 1);
console.assert(checkerResult.notification_sent === true);
console.log("✓ runApprovalChecker: pending", checkerResult.brief.pending_count);

console.log("\nAll dry-run assertions passed.");
