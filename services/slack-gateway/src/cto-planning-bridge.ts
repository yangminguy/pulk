// CTO structured-planning bridge — Slack thread ↔ pulk CTO planning rail.
//
// 'plan'    → cto:planMessage  (persists the turn in cto_planning_messages; the
//             CTO replies conversationally until it proposes a PLAN)
// 'approve' → resolve the thread's latest proposed plan → cto:approvePlan
//             (creates roadmap_items + agent_tasks on the existing rail)
//
// The Slack thread IS the planning thread: thread_id = slack-<channel>-<thread_ts>,
// so approval always maps back to the right conversation without local state.
// Pure formatting + a structural port → unit-testable with fakes.

import type { CtoIntent } from './router.js';
import type { PulkPlanningPort, CtoPlanSummary } from './pulk-api.js';

/** Deterministic planning-thread id for a Slack thread. */
export function slackThreadId(channel: string, threadTs: string): string {
  return `slack-${channel}-${threadTs}`;
}

/**
 * True when this Slack thread already hosts a CTO planning conversation (any
 * cto_planning_messages record exists for it). Lookup failure → false
 * (fail-open: preserve the existing generic-executive behavior).
 */
export async function isPlanningThread(
  threadId: string,
  pulk: PulkPlanningPort,
): Promise<boolean> {
  try {
    return await pulk.threadHasMessages(threadId);
  } catch {
    return false;
  }
}

/**
 * Sticky-planning promotion. A 'generic' CTO intent that arrives as a *follow-up
 * inside an existing planning thread* is promoted to 'plan' so it stays on the
 * structured rail. Without this, a follow-up whose wording lacks a planning
 * keyword leaks to the generic executor — which treated it as an implementation
 * order and wrote into main pre-approval (the live incident). New messages (no
 * thread reply) and already-classified intents pass through unchanged.
 */
export async function resolveCtoIntent(
  baseIntent: CtoIntent,
  isThreadReply: boolean,
  threadId: string,
  pulk: PulkPlanningPort,
): Promise<{ intent: CtoIntent; sticky: boolean }> {
  if (baseIntent === 'generic' && isThreadReply && (await isPlanningThread(threadId, pulk))) {
    return { intent: 'plan', sticky: true };
  }
  return { intent: baseIntent, sticky: false };
}

function planSummaryText(plan: CtoPlanSummary, ctoMessageId: string): string {
  const lines: string[] = [];
  const title =
    plan.project_proposal?.suggested_project_title ??
    (plan.prd ?? '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ??
    '(제목 없음)';
  lines.push(`📋 *CTO 계획 제안* — ${title}`);
  if (plan.project_proposal?.is_new_project) {
    lines.push(`🆕 새 프로젝트 제안: ${plan.project_proposal.suggested_project_title ?? ''}`);
  }
  const prdPreview = (plan.prd ?? '').trim().slice(0, 300);
  if (prdPreview) lines.push(`\n*PRD 요약*\n${prdPreview}${(plan.prd ?? '').length > 300 ? '…' : ''}`);
  lines.push(`\n*로드맵* ${plan.roadmap_items?.length ?? 0}개 / *태스크* ${plan.tasks?.length ?? 0}개`);
  for (const it of (plan.roadmap_items ?? []).slice(0, 6)) {
    lines.push(`  ${it.sequence ?? '·'}. ${it.title}`);
  }
  if (plan.token_estimate?.total_tokens) {
    lines.push(`예상 토큰: ~${Math.round(plan.token_estimate.total_tokens / 1000)}k`);
  }
  lines.push('\n✅ 승인이 필요합니다 — 이 스레드에 *"승인"* 이라고 답하면 로드맵과 태스크가 생성됩니다.');
  lines.push(`(plan id: ${ctoMessageId})`);
  return lines.join('\n');
}

/**
 * Handle one classified CTO planning/approval turn. Returns the Slack reply.
 * NocoBase failures surface as a clear operational error (no silent fallback
 * to the generic executive — the founder asked for the structured rail).
 */
export async function handleCtoPlanning(
  intent: Exclude<CtoIntent, 'generic'>,
  instruction: string,
  threadId: string,
  pulk: PulkPlanningPort,
): Promise<string> {
  try {
    if (intent === 'plan') {
      const r = await pulk.planMessage(threadId, instruction);
      if (r.plan) return planSummaryText(r.plan, r.cto_message_id);
      return `🧠 *CTO 기획*\n${r.reply}\n\n_계획이 준비되면 이 스레드에서 승인 여부를 물어봅니다._`;
    }

    // intent === 'approve'
    const pending = await pulk.latestProposedPlan(threadId);
    if (!pending) {
      return '승인 대기 중인 계획이 이 스레드에 없습니다. 먼저 기획 요청(예: "PRD 만들어줘")으로 계획을 만들어 주세요.';
    }
    const r = await pulk.approvePlan(pending.cto_message_id);
    if (r.already_approved) return 'ℹ️ 이 계획은 이미 승인되어 있습니다.';
    const taskCount = r.task_ids?.length ?? 0;
    const roadmapCount = r.roadmap_item_ids?.length ?? 0;
    return [
      `✅ *계획 승인 완료* (plan id: ${pending.cto_message_id})`,
      r.new_project ? `🆕 새 프로젝트 생성됨 (project: ${r.project_id})` : null,
      `로드맵 ${roadmapCount}개, 태스크 ${taskCount}개 생성 → 상태 *queued* (CTO 실행 레일 대기)`,
      '추적: Control Room(로드맵 진행률) + Notion "코딩 워크플로우 로그" / PRD는 "PRD저장소"에 동기화됩니다.',
    ]
      .filter(Boolean)
      .join('\n');
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return `⚠️ pulk 기획 API 호출 실패: ${m}\nNocoBase가 실행 중인지, NOCOBASE_URL/NOCOBASE_TOKEN 설정을 확인해 주세요.`;
  }
}
