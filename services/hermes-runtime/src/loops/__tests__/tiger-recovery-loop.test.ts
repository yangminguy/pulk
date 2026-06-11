// tiger-recovery-loop 단위테스트 — deps mock(NocoBase/agent-runtime 비의존), never-throw.
// 승인된 장애 → CTO 수정 dispatch → 호랑이 검증(merge>0=통과) → resolved/재시도/4회 escalated.

import {
  runTigerRecovery,
  type TigerRecoveryDeps,
  type RecoveryDispatchResult,
} from "../tiger-recovery-loop";
import type { RecoveryIncident } from "@l5/core";

const NOW = "2026-06-11T12:00:00.000Z";
const silentTelegram = { send: async () => ({ ok: true }) };

function inc(over: Partial<RecoveryIncident> = {}): RecoveryIncident {
  return {
    id: "i1",
    status: "approved",
    attempt_count: 0,
    target_repo: "/abs/repo",
    task_label: "키 콘텐츠 보고서",
    incident_type: "failed",
    error_summary: "TypeError x",
    ...over,
  };
}

function baseDeps(over: Partial<TigerRecoveryDeps>): TigerRecoveryDeps {
  return {
    fetchApprovedIncidents: async () => [],
    dispatchFix: async () => ({ mergedPhases: 1, waited: false }),
    updateIncident: async () => {},
    telegram: silentTelegram,
    now: NOW,
    ...over,
  };
}

describe("runTigerRecovery", () => {
  it("승인된 장애 0건 → skip(no dispatch)", async () => {
    const dispatchFix = jest.fn(async () => ({ mergedPhases: 1, waited: false }));
    const res = await runTigerRecovery(baseDeps({ dispatchFix }));
    expect(res.approved_loaded).toBe(0);
    expect(res.attempted).toBe(0);
    expect(dispatchFix).not.toHaveBeenCalled();
  });

  it("검증 통과(merge>0) → resolved + 알림", async () => {
    const updates: Array<{ id: string; patch: any }> = [];
    const sent: any[] = [];
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc()],
        dispatchFix: async () => ({ mergedPhases: 1, waited: false }),
        updateIncident: async (id, patch) => {
          updates.push({ id, patch });
        },
        telegram: { send: async (m) => { sent.push(m); return { ok: true }; } },
      }),
    );
    expect(res.resolved).toBe(1);
    expect(res.escalated).toBe(0);
    expect(res.notified).toBe(1);
    // 전이: fixing(attempt1) → testing → resolved.
    const statuses = updates.map((u) => u.patch.status);
    expect(statuses).toContain("fixing");
    expect(statuses).toContain("resolved");
    expect(sent[0].title).toContain("복구 완료");
  });

  it("dispatch 시작 시 attempt_count 1 증가", async () => {
    const updates: any[] = [];
    await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc({ attempt_count: 2 })],
        updateIncident: async (_id, patch) => { updates.push(patch); },
      }),
    );
    const fixing = updates.find((p) => p.status === "fixing");
    expect(fixing.attempt_count).toBe(3);
  });

  it("검증 실패(merge 0) + 상한 미만 → 재시도(approved로 되돌림)", async () => {
    const updates: any[] = [];
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc({ attempt_count: 1 })],
        dispatchFix: async () => ({ mergedPhases: 0, waited: false, reason: "verify 실패" }),
        updateIncident: async (_id, patch) => { updates.push(patch); },
      }),
    );
    expect(res.retried).toBe(1);
    expect(res.resolved).toBe(0);
    expect(res.escalated).toBe(0);
    // 마지막 패치는 approved 재큐잉(다음 폴링에서 재시도).
    expect(updates[updates.length - 1].status).toBe("approved");
    expect(updates[updates.length - 1].attempt_count).toBe(2);
  });

  it("상한(4) 도달 후 실패 → escalated + urgent 알림", async () => {
    const sent: any[] = [];
    const updates: any[] = [];
    const res = await runTigerRecovery(
      baseDeps({
        // attempt_count=3 → startFix가 4로 올림 → 실패 시 escalated.
        fetchApprovedIncidents: async () => [inc({ attempt_count: 3 })],
        dispatchFix: async () => ({ mergedPhases: 0, waited: false }),
        updateIncident: async (_id, patch) => { updates.push(patch); },
        telegram: { send: async (m) => { sent.push(m); return { ok: true }; } },
      }),
    );
    expect(res.escalated).toBe(1);
    expect(res.retried).toBe(0);
    expect(updates[updates.length - 1].status).toBe("escalated");
    expect(sent.some((m) => m.level === "urgent" && m.title.includes("사람이 봐야"))).toBe(true);
  });

  it("waited(토큰 소진) → 통과 아님(재시도)", async () => {
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc({ attempt_count: 0 })],
        dispatchFix: async () => ({ mergedPhases: 1, waited: true }),
      }),
    );
    expect(res.resolved).toBe(0);
    expect(res.retried).toBe(1);
  });

  it("dispatch 예외여도 never-throw → 실패로 환산(재시도)", async () => {
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc({ attempt_count: 0 })],
        dispatchFix: async () => {
          throw new Error("spawn boom");
        },
      }),
    );
    expect(res.attempted).toBe(1);
    expect(res.retried).toBe(1);
    expect(res.resolved).toBe(0);
  });

  it("승인 게이트: detected 행은 dispatch 안 함(방어)", async () => {
    const dispatchFix = jest.fn(async () => ({ mergedPhases: 1, waited: false }));
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => [inc({ status: "detected" })],
        dispatchFix,
      }),
    );
    expect(dispatchFix).not.toHaveBeenCalled();
    expect(res.attempted).toBe(0);
  });

  it("maxPerRun 상한 — 한 번에 처리 수 제한(토큰 폭주 방지)", async () => {
    const many: RecoveryIncident[] = Array.from({ length: 8 }, (_, i) =>
      inc({ id: `i${i}` }),
    );
    const dispatchFix = jest.fn(async () => ({ mergedPhases: 1, waited: false }));
    const res = await runTigerRecovery(
      baseDeps({ fetchApprovedIncidents: async () => many, dispatchFix, maxPerRun: 3 }),
    );
    expect(res.attempted).toBe(3);
    expect(dispatchFix).toHaveBeenCalledTimes(3);
  });

  it("fetchApprovedIncidents 예외 → never-throw, error 누적", async () => {
    const res = await runTigerRecovery(
      baseDeps({
        fetchApprovedIncidents: async () => {
          throw new Error("nocobase down");
        },
      }),
    );
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.attempted).toBe(0);
  });
});
