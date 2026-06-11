// tiger-dispatch-loop 단위테스트 — deps mock(NocoBase/agent-runtime 비의존), never-throw.
// 승인분 → 카드 → repo별 병렬 → 학습축적(memory + proposal 패치) 흐름을 검증한다.

import {
  runTigerDispatch,
  defaultCardPhaseBuilder,
  type TigerDispatchDeps,
  type BatchRunResultShape,
} from "../tiger-dispatch-loop";
import { encodeTargetRef, type BatchPlan } from "@l5/core";

const NOW = "2026-06-11T03:30:00.000Z";

const silentTelegram = { send: async () => ({ ok: true }) };

function baseDeps(over: Partial<TigerDispatchDeps>): TigerDispatchDeps {
  return {
    fetchApproved: async () => [],
    runBatch: async () => ({ group_results: [], exhausted_agents: [] }),
    createMemory: async () => "mem-id",
    telegram: silentTelegram,
    now: NOW,
    pulkRoot: "/Users/x/pulk",
    ...over,
  };
}

describe("runTigerDispatch", () => {
  it("승인 카드 0건 → skip(no IO)", async () => {
    const runBatch = jest.fn(async () => ({ group_results: [], exhausted_agents: [] }));
    const res = await runTigerDispatch(baseDeps({ runBatch }));
    expect(res.approved_loaded).toBe(0);
    expect(res.cards_built).toBe(0);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("승인분 → 카드 빌드 → buildBatchPlan → runBatch 호출", async () => {
    let receivedPlan: BatchPlan | undefined;
    const res = await runTigerDispatch(
      baseDeps({
        fetchApproved: async () => [
          { proposal_id: "p1", source_ref: encodeTargetRef("cto_hermes_runtime"), executive: "CTO", target_id: "cto_hermes_runtime" },
        ],
        runBatch: async (plan): Promise<BatchRunResultShape> => {
          receivedPlan = plan;
          return {
            group_results: plan.groups.map((g) => ({
              project_path: g.project_path,
              card_ids: g.card_ids,
              status: "completed" as const,
            })),
            exhausted_agents: [],
          };
        },
      }),
    );
    expect(res.cards_built).toBe(1);
    expect(res.groups).toBe(1);
    expect(res.merged).toBe(1);
    expect(receivedPlan?.groups[0].card_ids).toEqual(["p1"]);
  });

  it("성공(completed) 카드 → MemoryEntry(bpr) + proposal implemented 패치", async () => {
    const memories: any[] = [];
    const patches: any[] = [];
    await runTigerDispatch(
      baseDeps({
        fetchApproved: async () => [
          { proposal_id: "p1", source_ref: encodeTargetRef("cto_hermes_runtime"), executive: "CTO", target_id: "cto_hermes_runtime" },
        ],
        runBatch: async (plan) => ({
          group_results: plan.groups.map((g) => ({ project_path: g.project_path, card_ids: g.card_ids, status: "completed" as const })),
          exhausted_agents: [],
        }),
        createMemory: async (m) => { memories.push(m); return "id"; },
        patchProposal: async (p) => { patches.push(p); },
      }),
    );
    expect(memories[0].category).toBe("bpr");
    expect(patches[0]).toMatchObject({ proposal_id: "p1", status: "implemented" });
  });

  it("held 카드 → MemoryEntry(failure) + proposal proposed 잔류(재시도)", async () => {
    const memories: any[] = [];
    const patches: any[] = [];
    const res = await runTigerDispatch(
      baseDeps({
        fetchApproved: async () => [
          { proposal_id: "p9", source_ref: encodeTargetRef("cto_hermes_runtime"), executive: "CTO", target_id: "cto_hermes_runtime" },
        ],
        runBatch: async (plan) => ({
          group_results: plan.groups.map((g) => ({ project_path: g.project_path, card_ids: g.card_ids, status: "held" as const, reason: "merge conflict" })),
          exhausted_agents: [],
        }),
        createMemory: async (m) => { memories.push(m); return "id"; },
        patchProposal: async (p) => { patches.push(p); },
      }),
    );
    expect(res.held).toBe(1);
    expect(memories[0].category).toBe("failure");
    expect(memories[0].reusable_context).toBe("merge conflict");
    expect(patches[0]).toMatchObject({ status: "proposed", retryable: true });
  });

  it("해석 불가 source_ref → skipped 카운트, 카드 0건이면 runBatch 미호출", async () => {
    const runBatch = jest.fn(async () => ({ group_results: [], exhausted_agents: [] }));
    const res = await runTigerDispatch(
      baseDeps({
        fetchApproved: async () => [
          { proposal_id: "bad", source_ref: "garbage", executive: "CTO", target_id: "" },
        ],
        runBatch,
      }),
    );
    expect(res.skipped).toBe(1);
    expect(res.cards_built).toBe(0);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("fetchApproved throw → never-throw, errors 누적", async () => {
    const res = await runTigerDispatch(
      baseDeps({ fetchApproved: async () => { throw new Error("db down"); } }),
    );
    expect(res.errors[0]).toContain("fetchApproved");
    expect(res.approved_loaded).toBe(0);
  });

  it("defaultCardPhaseBuilder는 code→qa 2 phase(qa는 code 의존)", () => {
    const phases = defaultCardPhaseBuilder({ proposal_id: "p1", target_id: "t", project_path: "/r" });
    expect(phases.map((p) => p.name)).toEqual(["code", "qa"]);
    expect(phases[1].depends_on).toEqual(["code"]);
    expect(phases[0].verify_command).toContain("tsc");
  });
});
