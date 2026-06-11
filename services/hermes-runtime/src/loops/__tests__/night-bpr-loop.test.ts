// night-bpr-loop(호랑이 분석) 단위테스트 — deps mock, never-throw 검증.
// 정본 SPEC §3,§9. Claude 호출은 stub(실제 spawn 금지).
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runTigerAnalysis, type TigerAnalysisDeps } from "../night-bpr-loop";
import type { CollectBottlenecksResult } from "@l5/core";

const NOW = "2026-06-11T03:00:00.000Z";

function candidatesFixture(): CollectBottlenecksResult {
  return {
    collected_at: NOW,
    total_signals: 5,
    candidates: [
      {
        fingerprint: "fp1",
        executive: "CMO",
        tool_id: "cmo_slide_video_factory",
        repo: "/Users/wonminyang/ai-slide-video-factory",
        kind: "error",
        title: "render timeout",
        occurrences: 4,
        first_seen: "2026-06-10T01:00:00.000Z",
        last_seen: "2026-06-10T22:00:00.000Z",
        sources: [{ source: "tool_log", ref: "log:1" }],
        sample_detail: "ETIMEDOUT",
        max_pii_level: "none",
        priority_score: 80,
        related_task_ids: [],
        related_business_ids: [],
      },
    ],
    by_executive: { CMO: 1 },
    dropped_pii: 0,
  };
}

function goodClaudeStdout(): string {
  return JSON.stringify([
    {
      candidate_id: "fp1",
      problem: "렌더 타임아웃",
      root_cause: "동기 렌더 락",
      planned_fix: "잡 큐 분리",
      effort_estimate: "M",
      impact: "high",
      risk_level: "D2",
      confidence: 0.8,
    },
  ]);
}

async function makeStateDir(candidates: CollectBottlenecksResult | null): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), "tiger-test-"));
  if (candidates) {
    await fs.writeFile(
      join(dir, "tiger-candidates.json"),
      JSON.stringify(candidates),
      "utf-8",
    );
  }
  return dir;
}

function silentTelegram() {
  return { send: jest.fn(async () => ({ ok: true })) };
}

function baseDeps(over: Partial<TigerAnalysisDeps>): TigerAnalysisDeps {
  return {
    createBPRLog: jest.fn(async () => "bpr-1"),
    createProposal: jest.fn(async () => "wip-1"),
    createMemory: jest.fn(async () => "mem-1"),
    runClaude: jest.fn(async () => ({ exitCode: 0, stdout: goodClaudeStdout(), stderr: "" })),
    telegram: silentTelegram(),
    now: NOW,
    ...over,
  };
}

describe("runTigerAnalysis", () => {
  it("creates cards on happy path (bpr+proposal+memory+telegram)", async () => {
    const stateDir = await makeStateDir(candidatesFixture());
    const deps = baseDeps({ stateDir });
    const res = await runTigerAnalysis(deps);

    expect(res.candidates_loaded).toBe(1);
    expect(res.prepared).toBe(1);
    expect(res.cards_created).toBe(1);
    expect(res.model).toBe("claude-sonnet-4-6"); // single easy candidate
    expect(res.notification_sent).toBe(true);
    expect(deps.createBPRLog).toHaveBeenCalledTimes(1);
    expect(deps.createProposal).toHaveBeenCalledTimes(1);
    expect(deps.createMemory).toHaveBeenCalledTimes(1);

    // state file persisted with target/repo mapping
    const cardsState = JSON.parse(
      await fs.readFile(join(stateDir, "tiger-cards-2026-06-11.json"), "utf-8"),
    );
    expect(cardsState.cards[0].proposal_id).toBe("wip-1");
    expect(cardsState.cards[0].repo_path).toBe("/Users/wonminyang/ai-slide-video-factory");

    // known ids advanced for dedup
    const known = JSON.parse(
      await fs.readFile(join(stateDir, "tiger-known-cards.json"), "utf-8"),
    );
    expect(known.known_card_ids).toContain("fp1");
  });

  it("skips silently when candidates file missing", async () => {
    const stateDir = await makeStateDir(null);
    const deps = baseDeps({ stateDir });
    const res = await runTigerAnalysis(deps);
    expect(res.candidates_loaded).toBe(0);
    expect(res.cards_created).toBe(0);
    expect(deps.runClaude).not.toHaveBeenCalled();
  });

  it("skips when all candidates already known", async () => {
    const stateDir = await makeStateDir(candidatesFixture());
    await fs.writeFile(
      join(stateDir, "tiger-known-cards.json"),
      JSON.stringify({ known_card_ids: ["fp1"] }),
      "utf-8",
    );
    const deps = baseDeps({ stateDir });
    const res = await runTigerAnalysis(deps);
    expect(res.prepared).toBe(0);
    expect(res.cards_created).toBe(0);
    expect(deps.runClaude).not.toHaveBeenCalled();
  });

  it("graceful when claude exits non-zero (never-throw, 0 cards)", async () => {
    const stateDir = await makeStateDir(candidatesFixture());
    const deps = baseDeps({
      stateDir,
      runClaude: jest.fn(async () => ({ exitCode: 124, stdout: "", stderr: "timeout" })),
    });
    const res = await runTigerAnalysis(deps);
    expect(res.cards_created).toBe(0);
    expect(res.errors.some((e) => e.includes("claude exit 124"))).toBe(true);
    expect(deps.createBPRLog).not.toHaveBeenCalled();
  });

  it("graceful when claude returns garbage (parse 0 cards)", async () => {
    const stateDir = await makeStateDir(candidatesFixture());
    const deps = baseDeps({
      stateDir,
      runClaude: jest.fn(async () => ({ exitCode: 0, stdout: "not json", stderr: "" })),
    });
    const res = await runTigerAnalysis(deps);
    expect(res.cards_created).toBe(0);
  });

  it("does not throw when persistence adapters fail", async () => {
    const stateDir = await makeStateDir(candidatesFixture());
    const deps = baseDeps({
      stateDir,
      createProposal: jest.fn(async () => {
        throw new Error("nocobase down");
      }),
    });
    const res = await runTigerAnalysis(deps);
    // proposal failed → card not counted, but no throw and errors recorded.
    expect(res.cards_created).toBe(0);
    expect(res.errors.some((e) => e.includes("createProposal"))).toBe(true);
  });
});
