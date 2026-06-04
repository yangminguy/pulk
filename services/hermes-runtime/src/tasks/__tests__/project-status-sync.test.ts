import { runProjectStatusSync } from "../project-status-sync";
import { buildProjectStatusMarkdown } from "@l5/core";

const NOW = "2026-05-29T10:00:00.000Z";

function makeProjectData() {
  return {
    agentTasks: [
      {
        id: "task-1",
        title: "Implement auth",
        assigned_agent: "CTO",
        risk_level: "D2" as const,
        status: "done",
        created_at: "2026-05-29T08:00:00Z",
        updated_at: "2026-05-29T09:00:00Z",
      },
    ],
    handoffs: [],
    ctoPlan: {
      plan_id: "plan-001",
      phases: [
        { name: "setup", status: "done" as const, updated_at: "2026-05-29T07:00:00Z" },
        { name: "build", status: "in_progress" as const },
      ],
    },
    openItems: [],
    insights: [],
  };
}

describe("runProjectStatusSync", () => {
  it("2 projects both succeed — updated=2, failed=0", async () => {
    const written: Record<string, string> = {};

    const result = await runProjectStatusSync({
      listActiveBusinesses: async () => [
        { id: "biz-a", name: "Biz A", one_liner: "First biz", current_phase: "p1", lifecycle_stage: "build" },
        { id: "biz-b", name: "Biz B", lifecycle_stage: "design" },
      ],
      fetchProjectData: async () => makeProjectData(),
      writeStatusFile: async (id, md) => { written[id] = md; },
      logger: () => {},
    });

    expect(result.updated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.details).toHaveLength(2);
    expect(result.details[0]).toEqual({ businessId: "biz-a", ok: true });
    expect(result.details[1]).toEqual({ businessId: "biz-b", ok: true });
    expect(Object.keys(written)).toContain("biz-a");
    expect(Object.keys(written)).toContain("biz-b");
  });

  it("1 project fetch fails — updated=1, failed=1, details has error", async () => {
    const result = await runProjectStatusSync({
      listActiveBusinesses: async () => [
        { id: "biz-ok", name: "OK Biz" },
        { id: "biz-fail", name: "Fail Biz" },
      ],
      fetchProjectData: async (id) => {
        if (id === "biz-fail") throw new Error("nocobase timeout");
        return makeProjectData();
      },
      writeStatusFile: async () => {},
      logger: () => {},
    });

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(1);
    const failDetail = result.details.find((d) => d.businessId === "biz-fail");
    expect(failDetail?.ok).toBe(false);
    expect(failDetail?.error).toContain("nocobase timeout");
  });

  it("writeStatusFile receives markdown matching buildProjectStatusMarkdown output", async () => {
    const biz = { id: "biz-c", name: "Biz C", one_liner: "Test", current_phase: "p2", lifecycle_stage: "sales" };
    const projectData = makeProjectData();
    let capturedMarkdown = "";

    await runProjectStatusSync({
      listActiveBusinesses: async () => [biz],
      fetchProjectData: async () => projectData,
      writeStatusFile: async (_, md) => { capturedMarkdown = md; },
      logger: () => {},
    });

    // Re-build expected markdown (generatedAt will differ, so compare structure)
    expect(capturedMarkdown).toContain("# Biz C — Test");
    expect(capturedMarkdown).toContain("## Active CTO Plan");
    expect(capturedMarkdown).toContain("plan_id: plan-001");
    expect(capturedMarkdown).toContain("## Recent Agent Activity (last 20)");
    expect(capturedMarkdown).toContain("## Open Decisions / Blockers");
    expect(capturedMarkdown).toContain("## Insights → Memory");
    expect(capturedMarkdown).toContain("Implement auth");
  });

  it("listActiveBusinesses fails — returns empty result without throwing", async () => {
    const result = await runProjectStatusSync({
      listActiveBusinesses: async () => { throw new Error("DB down"); },
      fetchProjectData: async () => makeProjectData(),
      writeStatusFile: async () => {},
      logger: () => {},
    });

    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.details).toHaveLength(0);
  });
});
