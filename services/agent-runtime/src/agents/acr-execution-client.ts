// ACR Execution-Runs HTTP client (PRD §9.1/§9.2/§9.3).
//
// pulk CTO가 ACR Kernel의 POST /api/execution-runs 레일로 작업을 디스패치할 때
// 쓰는 타입 안전 클라이언트. 기존 acr-client.ts 의 graceful fallback 패턴을
// 그대로 모방한다 — ACR이 안 떠 있어도 throw 하지 않고 null/경고로 흘려보내
// pulk 파이프라인이 계속 동작하게 한다.
//
// 모든 외부 액션은 위험도(D1~D4)를 포함한다(요청 본문 risk_level). 시크릿은
// env(ACR_BASE_URL / ACR_API_KEY)로만 주입한다 — 하드코딩 금지.

import type {
  Complexity,
  ExecutionMode,
  ExecutionRunRequest,
  HarnessRiskLevel,
} from "@l5/core";

const ACR_BASE_URL = process.env["ACR_BASE_URL"] ?? "http://localhost:3001";
const ACR_API_KEY = process.env["ACR_API_KEY"] ?? "";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(ACR_API_KEY ? { "X-API-Key": ACR_API_KEY } : {}),
  };
}

// Re-export the request contract so callers import it from one place.
export type { ExecutionRunRequest };

/** POST /api/execution-runs (§9.1) 응답. */
export interface CreateExecutionRunResponse {
  run_id: string;
  status: string;
  worktree_path?: string;
  branch?: string;
}

/** GET /api/execution-runs/:run_id (§9.2) 응답. */
export interface GetExecutionRunResponse {
  run_id: string;
  task_id: string;
  status: string;
  agent: string;
  worktree_path?: string;
  branch?: string;
  current_phase?: string;
  log_tail?: string;
  changed_files?: string[];
}

/** POST /api/execution-runs/:run_id/result (§9.3) 요청. */
export interface SubmitExecutionResultRequest {
  run_id: string;
  status: string;
  changed_files?: string[];
  checks?: Record<string, string>;
  diff_stat?: string;
  summary?: string;
  next_action?: string;
}

/**
 * POST /api/execution-runs — ExecutionRun 생성(§9.1).
 * 실패 시(서버 미가동/네트워크/4xx·5xx) throw 하지 않고 null 반환.
 */
export async function createExecutionRun(
  req: ExecutionRunRequest,
): Promise<CreateExecutionRunResponse | null> {
  try {
    const res = await fetch(`${ACR_BASE_URL}/api/execution-runs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      console.warn(`[ACR] createExecutionRun returned ${res.status} — continuing`);
      return null;
    }
    return (await res.json()) as CreateExecutionRunResponse;
  } catch (err) {
    console.warn(
      "[ACR] createExecutionRun failed (server may not be running) —",
      (err as Error).message,
    );
    return null;
  }
}

/**
 * GET /api/execution-runs/:run_id — ExecutionRun 조회(§9.2).
 * 실패 시 null 반환.
 */
export async function getExecutionRun(
  runId: string,
): Promise<GetExecutionRunResponse | null> {
  try {
    const res = await fetch(
      `${ACR_BASE_URL}/api/execution-runs/${encodeURIComponent(runId)}`,
      { method: "GET", headers: headers() },
    );
    if (!res.ok) {
      console.warn(`[ACR] getExecutionRun(${runId}) returned ${res.status}`);
      return null;
    }
    return (await res.json()) as GetExecutionRunResponse;
  } catch (err) {
    console.warn(`[ACR] getExecutionRun(${runId}) failed —`, (err as Error).message);
    return null;
  }
}

/**
 * POST /api/execution-runs/:run_id/result — 실행 결과 제출(§9.3).
 * 실패 시 false, 성공 시 true.
 */
export async function submitExecutionResult(
  req: SubmitExecutionResultRequest,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${ACR_BASE_URL}/api/execution-runs/${encodeURIComponent(req.run_id)}/result`,
      { method: "POST", headers: headers(), body: JSON.stringify(req) },
    );
    if (!res.ok) {
      console.warn(`[ACR] submitExecutionResult returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[ACR] submitExecutionResult failed —", (err as Error).message);
    return false;
  }
}

// 타입 재노출: 호출부가 한 곳에서 import 하도록.
export type { Complexity, ExecutionMode, HarnessRiskLevel };
