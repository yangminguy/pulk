// Hermes task: video-batch-render — 승인 완료분 일괄 렌더 + 텔레그램 알림.
//
// 흐름: [후보 수집] → planBatchRender(l5-core) → [잡별 순차 렌더] → [상태 재조회/전진]
//       → summarizeBatchRender(l5-core) → [텔레그램 알림].
//
// 역할 분리:
//   - 판단(어떤 잡을 렌더하나, 메시지 내용)  = l5-core/video-room/batch-render (pure)
//   - 실행(HTTP/spawn/telegram)              = 주입된 deps (runner.ts가 wiring)
//
// 순차 실행이 의도다 — Remotion이 잡 내부에서 이미 CPU 병렬화하므로 잡 단위 동시
// 실행은 더 느리고 번들 캐시 경합 위험만 키운다.
//
// 위험도: 렌더는 로컬 산출물 생성(D1). 외부 액션(YouTube 업로드 등)은 여기서 절대
// 수행하지 않는다 — 업로드는 기존 승인 게이트 흐름 그대로.

import {
  planBatchRender,
  summarizeBatchRender,
  type BatchRenderCandidate,
  type BatchRenderPlan,
  type BatchRenderPlanItem,
  type BatchRenderItemResult,
  type BatchRenderSummaryMessage,
} from "@l5/core";

export interface ReconcileOutcome {
  /** cmo:getRenderStatus 재조회 결과 (deriveRenderJobStatus 값). */
  status: "not_found" | "queued" | "rendering" | "completed" | "failed";
  total_seconds?: number;
  qa_result?: "pass" | "fail" | null;
  error?: string;
}

export interface VideoBatchRenderDeps {
  /** 'rendering' 상태 프로젝트들 + factory 잡 관찰값 수집. */
  fetchCandidates(): Promise<BatchRenderCandidate[]>;
  /** factory에서 잡 1건 렌더(블로킹, 수 분). ok=false면 실패로 기록. */
  renderJob(item: BatchRenderPlanItem): Promise<{ ok: boolean; error?: string }>;
  /** 렌더 후 cmo:getRenderStatus 호출 — DB 반영 + rendering→qa 자동 전진 포함. */
  reconcile(item: BatchRenderPlanItem): Promise<ReconcileOutcome>;
  /** 텔레그램 발송 (hermes notifier). 실패해도 throw하지 않는다. */
  notify(msg: BatchRenderSummaryMessage): Promise<{ ok: boolean; reason?: string }>;
  /** 배치 식별자(dedup 키용). 보통 ISO timestamp. */
  batchId: string;
}

export interface VideoBatchRenderResult {
  status: "ok" | "skipped";
  plan: BatchRenderPlan;
  results: BatchRenderItemResult[];
  notified: boolean;
}

export async function runVideoBatchRender(
  deps: VideoBatchRenderDeps,
): Promise<VideoBatchRenderResult> {
  const candidates = await deps.fetchCandidates();
  const plan = planBatchRender(candidates);

  if (plan.to_render.length === 0) {
    return { status: "skipped", plan, results: [], notified: false };
  }

  const results: BatchRenderItemResult[] = [];
  for (const item of plan.to_render) {
    const base = {
      project_id: item.project_id,
      project_title: item.project_title,
      factory_slug: item.factory_slug,
    };

    let renderOutcome: { ok: boolean; error?: string };
    try {
      renderOutcome = await deps.renderJob(item);
    } catch (err) {
      renderOutcome = { ok: false, error: (err as Error).message };
    }

    if (!renderOutcome.ok) {
      results.push({ ...base, status: "failed", error: renderOutcome.error ?? "render failed" });
      continue; // 한 건 실패해도 나머지는 계속 렌더한다.
    }

    // 렌더 성공 → 상태 재조회(파일 기반)로 확정 + 프로젝트 rendering→qa 전진.
    try {
      const rec = await deps.reconcile(item);
      if (rec.status === "completed") {
        results.push({
          ...base,
          status: "completed",
          total_seconds: rec.total_seconds,
          qa_result: rec.qa_result ?? null,
        });
      } else {
        results.push({
          ...base,
          status: "failed",
          error: rec.error ?? `렌더 후 상태가 ${rec.status} (completed 아님)`,
        });
      }
    } catch (err) {
      results.push({
        ...base,
        status: "failed",
        error: `상태 재조회 실패: ${(err as Error).message}`,
      });
    }
  }

  const summary = summarizeBatchRender(results, deps.batchId);
  let notified = false;
  if (summary) {
    const sent = await deps.notify(summary);
    notified = sent.ok;
  }

  return { status: "ok", plan, results, notified };
}
