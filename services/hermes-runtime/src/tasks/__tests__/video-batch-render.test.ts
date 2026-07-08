import { runVideoBatchRender, type VideoBatchRenderDeps } from "../video-batch-render";
import type { BatchRenderCandidate } from "@l5/core";

const candidate = (over: Partial<BatchRenderCandidate> = {}): BatchRenderCandidate => ({
  project_id: "p1",
  project_title: "풀링 1",
  project_status: "rendering",
  factory_slug: "l5-spec-1",
  job_path: "/factory/jobs/l5-spec-1.json",
  observed_status: "queued",
  ...over,
});

function makeDeps(over: Partial<VideoBatchRenderDeps> = {}): VideoBatchRenderDeps & {
  notifyCalls: any[];
  renderCalls: string[];
} {
  const notifyCalls: any[] = [];
  const renderCalls: string[] = [];
  return {
    notifyCalls,
    renderCalls,
    batchId: "2026-06-12T00:00:00Z",
    fetchCandidates: async () => [candidate()],
    renderJob: async (item) => {
      renderCalls.push(item.factory_slug);
      return { ok: true };
    },
    reconcile: async () => ({ status: "completed", total_seconds: 120, qa_result: "pass" }),
    notify: async (msg) => {
      notifyCalls.push(msg);
      return { ok: true };
    },
    ...over,
  };
}

describe("runVideoBatchRender", () => {
  it("렌더 대상 없으면 skipped + 알림 없음", async () => {
    const deps = makeDeps({ fetchCandidates: async () => [] });
    const res = await runVideoBatchRender(deps);
    expect(res.status).toBe("skipped");
    expect(res.notified).toBe(false);
    expect(deps.notifyCalls).toHaveLength(0);
  });

  it("queued 잡들을 순차 렌더하고 텔레그램 알림을 보낸다", async () => {
    const deps = makeDeps({
      fetchCandidates: async () => [
        candidate(),
        candidate({ project_id: "p2", project_title: "풀링 2", factory_slug: "l5-spec-2", job_path: "/j/2.json" }),
      ],
    });
    const res = await runVideoBatchRender(deps);
    expect(res.status).toBe("ok");
    expect(deps.renderCalls).toEqual(["l5-spec-1", "l5-spec-2"]);
    expect(res.results.every((r) => r.status === "completed")).toBe(true);
    expect(res.notified).toBe(true);
    expect(deps.notifyCalls[0].title).toContain("2/2건");
  });

  it("한 건 실패해도 나머지는 계속 렌더한다", async () => {
    const deps = makeDeps({
      fetchCandidates: async () => [
        candidate(),
        candidate({ project_id: "p2", project_title: "풀링 2", factory_slug: "l5-spec-2", job_path: "/j/2.json" }),
      ],
      renderJob: async (item) =>
        item.factory_slug === "l5-spec-1" ? { ok: false, error: "remotion exit 1" } : { ok: true },
    });
    const res = await runVideoBatchRender(deps);
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toMatchObject({ status: "failed", error: "remotion exit 1" });
    expect(res.results[1].status).toBe("completed");
    expect(deps.notifyCalls[0].level).toBe("warn");
  });

  it("렌더는 성공했지만 reconcile이 completed가 아니면 실패로 기록한다", async () => {
    const deps = makeDeps({
      reconcile: async () => ({ status: "rendering" }),
    });
    const res = await runVideoBatchRender(deps);
    expect(res.results[0].status).toBe("failed");
    expect(res.results[0].error).toContain("rendering");
  });

  it("renderJob이 throw해도 배치는 죽지 않는다", async () => {
    const deps = makeDeps({
      renderJob: async () => {
        throw new Error("spawn ENOENT");
      },
    });
    const res = await runVideoBatchRender(deps);
    expect(res.results[0]).toMatchObject({ status: "failed", error: "spawn ENOENT" });
  });

  it("notify 실패 시 notified=false지만 결과는 ok", async () => {
    const deps = makeDeps({ notify: async () => ({ ok: false, reason: "telegram not configured" }) });
    const res = await runVideoBatchRender(deps);
    expect(res.status).toBe("ok");
    expect(res.notified).toBe(false);
  });
});
