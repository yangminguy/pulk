// CMO Video Room — Batch render domain logic (승인 완료분 일괄 렌더).
//
// 목적: 풀링/키 콘텐츠 프로젝트들이 승인 게이트를 모두 통과해 'rendering' 상태로
// 모이면(= cmo:submitRender가 factory jobs/ 인박스에 잡을 push한 상태), 오케스트레이터가
// 한 번에 순차 렌더할 대상을 고르고(planBatchRender), 실행 결과를 텔레그램 알림
// 메시지로 요약한다(summarizeBatchRender).
//
// 동시 병렬 렌더는 의도적으로 하지 않는다 — Remotion이 프레임 렌더를 CPU 코어
// 전체로 이미 병렬화하므로, 잡 단위는 순차(또는 매우 낮은 동시성)가 총 시간이 더 짧고
// node_modules/.remotion 번들 캐시 경합도 없다. "한 번에 시작"이 목표이지
// "동시에 실행"이 목표가 아니다.
//
// Pure functions; no Date/randomUUID/fs. 실행(spawn)·조회(HTTP)·알림(telegram)은
// 오케스트레이터(hermes-runtime)가 주입한다.

import type { ObservedRenderStatus } from './render-pipeline';

// ── Candidate / Plan ─────────────────────────────────────────────────────────

/** 오케스트레이터가 수집해 오는 프로젝트별 관찰값(사실). 판단은 planBatchRender가. */
export interface BatchRenderCandidate {
  project_id: string;
  project_title: string;
  /** video_room_projects.status (VideoRoomStatus). 'rendering'만 렌더 대상. */
  project_status: string;
  /** factory job slug (예: l5-<spec_id>). 없으면 잡 미제출 → 스킵. */
  factory_slug?: string | null;
  /** factory jobs/<file>.json 절대경로. 렌더 커맨드 입력. */
  job_path?: string | null;
  /** deriveRenderJobStatus 결과(파일 기반 관찰). null이면 상태 조회 실패. */
  observed_status?: ObservedRenderStatus | null;
}

export interface BatchRenderPlanItem {
  project_id: string;
  project_title: string;
  factory_slug: string;
  job_path: string;
}

export interface BatchRenderSkip {
  project_id: string;
  project_title: string;
  reason: string;
}

export interface BatchRenderPlan {
  to_render: BatchRenderPlanItem[];
  skipped: BatchRenderSkip[];
}

/**
 * 렌더 대상 선별(결정론):
 *   - project_status !== 'rendering'           → 스킵 (승인 게이트 미통과/이미 통과 후 단계)
 *   - factory_slug 또는 job_path 없음           → 스킵 (submitRender 미실행)
 *   - observed_status:
 *       'queued'     → 렌더 대상
 *       'rendering'  → 스킵 (이미 진행 중 — 중복 실행 금지)
 *       'completed'  → 스킵 (이미 완료)
 *       'failed'     → 스킵 (사람 확인 필요 — 자동 재시도 금지)
 *       'not_found'  → 스킵 (잡 파일 없음)
 *       null         → 스킵 (상태 조회 실패)
 *   - 같은 factory_slug 중복                    → 첫 항목만 (멱등)
 */
export function planBatchRender(candidates: BatchRenderCandidate[]): BatchRenderPlan {
  const to_render: BatchRenderPlanItem[] = [];
  const skipped: BatchRenderSkip[] = [];
  const seenSlugs = new Set<string>();

  for (const c of candidates) {
    const skip = (reason: string) =>
      skipped.push({ project_id: c.project_id, project_title: c.project_title, reason });

    if (c.project_status !== 'rendering') {
      skip(`status=${c.project_status} (rendering 아님)`);
      continue;
    }
    const slug = (c.factory_slug ?? '').trim();
    const jobPath = (c.job_path ?? '').trim();
    if (!slug || !jobPath) {
      skip('factory 잡 미제출 (slug/job_path 없음)');
      continue;
    }
    if (c.observed_status == null) {
      skip('렌더 상태 조회 실패');
      continue;
    }
    if (c.observed_status !== 'queued') {
      const reasonByStatus: Record<Exclude<ObservedRenderStatus, 'queued'>, string> = {
        rendering: '이미 렌더 진행 중',
        completed: '이미 렌더 완료',
        failed: '이전 렌더 실패 — 사람 확인 필요',
        not_found: '잡 파일 없음',
      };
      skip(reasonByStatus[c.observed_status]);
      continue;
    }
    if (seenSlugs.has(slug)) {
      skip(`중복 slug(${slug})`);
      continue;
    }
    seenSlugs.add(slug);
    to_render.push({
      project_id: c.project_id,
      project_title: c.project_title,
      factory_slug: slug,
      job_path: jobPath,
    });
  }

  return { to_render, skipped };
}

// ── Result / Telegram summary ────────────────────────────────────────────────

export interface BatchRenderItemResult {
  project_id: string;
  project_title: string;
  factory_slug: string;
  status: 'completed' | 'failed';
  error?: string;
  /** render_report.json의 totalSeconds (완료 시). */
  total_seconds?: number;
  /** evaluateRenderArtifacts 결과 (완료 시). */
  qa_result?: 'pass' | 'fail' | null;
}

export interface BatchRenderSummaryMessage {
  title: string;
  body: string;
  level: 'info' | 'warn';
  dedupKey: string;
}

function fmtDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? ` (${m}분 ${s}초)` : ` (${s}초)`;
}

/**
 * 배치 실행 결과 → 텔레그램 알림 메시지.
 * 렌더한 게 하나도 없으면 null (알림 스팸 방지 — 호출자는 notify를 건너뛴다).
 * dedupKey는 batch_id 기준(같은 배치 중복 발송 방지).
 */
export function summarizeBatchRender(
  results: BatchRenderItemResult[],
  batchId: string,
): BatchRenderSummaryMessage | null {
  if (results.length === 0) return null;

  const ok = results.filter((r) => r.status === 'completed');
  const failed = results.filter((r) => r.status === 'failed');
  const qaFailed = ok.filter((r) => r.qa_result === 'fail');

  const lines: string[] = [];
  for (const r of ok) {
    const qaNote = r.qa_result === 'fail' ? ' — ⚠️ QA fail' : '';
    lines.push(`✅ ${r.project_title}${fmtDuration(r.total_seconds)}${qaNote}`);
  }
  for (const r of failed) {
    lines.push(`❌ ${r.project_title} — ${r.error ?? '원인 미상'}`);
  }

  const title =
    failed.length === 0
      ? `영상 일괄 렌더 완료 ${ok.length}/${results.length}건`
      : `영상 일괄 렌더 ${ok.length}건 성공 · ${failed.length}건 실패`;

  const tail: string[] = [];
  if (qaFailed.length > 0) tail.push(`QA fail ${qaFailed.length}건은 Video Room에서 확인 필요.`);
  if (ok.length > 0) tail.push('업로드는 승인 게이트 뒤에서 진행하세요.');

  return {
    title,
    body: [lines.join('\n'), tail.join(' ')].filter(Boolean).join('\n\n'),
    level: failed.length > 0 || qaFailed.length > 0 ? 'warn' : 'info',
    dedupKey: `video-batch-render:${batchId}`,
  };
}
