import { buildProjectStatusMarkdown } from "./builder";
import type { ProjectStatusInput } from "./builder";

const BASE_BUSINESS: ProjectStatusInput["business"] = {
  id: "biz-001",
  name: "TestBiz",
  one_liner: "A test business",
  current_phase: "phase-3",
  lifecycle_stage: "build",
};

const NOW = "2026-05-29T10:00:00.000Z";

function makeTask(
  overrides: Partial<ProjectStatusInput["agentTasks"][number]> = {},
): ProjectStatusInput["agentTasks"][number] {
  return {
    id: "task-001",
    title: "Do something",
    assigned_agent: "CTO",
    risk_level: "D2",
    status: "done",
    created_at: "2026-05-29T09:00:00Z",
    updated_at: "2026-05-29T09:30:00Z",
    ...overrides,
  };
}

describe("buildProjectStatusMarkdown", () => {
  it("empty input — produces minimum headers", () => {
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);

    expect(md).toContain("# TestBiz — A test business");
    expect(md).toContain("Last updated:");
    expect(md).toContain("## Active CTO Plan");
    expect(md).toContain("## Recent Agent Activity (last 20)");
    expect(md).toContain("## Open Decisions / Blockers");
    expect(md).toContain("## Insights → Memory");
  });

  it("full input — all sections rendered with content", () => {
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [makeTask()],
      handoffs: [
        { from_agent: "CEO", to_agent: "CTO", at: "2026-05-29T08:00:00Z" },
      ],
      ctoPlan: {
        plan_id: "plan-abc",
        phases: [
          { name: "phase1", runtime: "claude opus", status: "done", updated_at: "2026-05-29T07:00:00Z" },
          { name: "phase2", runtime: "codex", status: "in_progress" },
          { name: "phase3", status: "planned" },
        ],
      },
      openItems: [
        { kind: "blocked", task_id: "task-002", note: "waiting on infra" },
        { kind: "pending_approval", task_id: "task-003" },
      ],
      insights: [{ at: "2026-05-29T06:00:00Z", note: "Users prefer async flow" }],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);

    // Header
    expect(md).toContain("# TestBiz — A test business");
    expect(md).toContain("Phase: phase-3 · Lifecycle: build");

    // CTO Plan section
    expect(md).toContain("plan_id: plan-abc");
    expect(md).toContain("phase1");
    expect(md).toContain("✅");
    expect(md).toContain("phase2");
    expect(md).toContain("🟡");
    expect(md).toContain("phase3");
    expect(md).toContain("⏳");

    // Activity table has the task
    expect(md).toContain("CTO");
    expect(md).toContain("Do something");
    expect(md).toContain("D2");

    // Open items
    expect(md).toContain("waiting on infra");
    expect(md).toContain("task-003");

    // Insights
    expect(md).toContain("Users prefer async flow");
  });

  it("21 tasks — renders exactly 20 rows", () => {
    const tasks = Array.from({ length: 21 }, (_, i) =>
      makeTask({
        id: `task-${i}`,
        title: `Task number ${i}`,
        updated_at: `2026-05-29T${String(i).padStart(2, "0")}:00:00Z`,
      }),
    );
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: tasks,
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);

    // Count data rows in the table (lines starting with "|" minus the header and separator)
    const tableRows = md
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| when") && !l.startsWith("|---"));
    expect(tableRows).toHaveLength(20);
  });

  it("pii_level=high — title still appears but email in title is masked", () => {
    const task = makeTask({
      id: "task-pii",
      title: "Contact user@example.com about onboarding",
      pii_level: "high",
    });
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [task],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);

    expect(md).not.toContain("user@example.com");
    expect(md).toContain("[masked]");
  });

  it("email pattern in title — masked regardless of pii_level", () => {
    const task = makeTask({
      id: "task-email",
      title: "Send report to admin@company.org",
    });
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [task],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);

    expect(md).not.toContain("admin@company.org");
    expect(md).toContain("[masked]");
  });

  it("no ctoPlan — renders placeholder", () => {
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);
    expect(md).toContain("plan_id: —");
  });

  it("failed status maps to ❌", () => {
    const input: ProjectStatusInput = {
      business: BASE_BUSINESS,
      agentTasks: [makeTask({ status: "failed" })],
      generatedAt: NOW,
    };
    const md = buildProjectStatusMarkdown(input);
    expect(md).toContain("❌");
  });
});
