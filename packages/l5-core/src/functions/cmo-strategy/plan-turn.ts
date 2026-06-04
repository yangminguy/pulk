// runCmoStrategyTurn — one turn of the founder ↔ CMO Video Room conversation.
//
// Stage-aware: the CMO reads the current workflow status, responds in the PRD
// §6.4 format, proposes the stage's artifact, and — at a gate stage — raises an
// approval request. LLM-driven with a deterministic stage-script fallback so the
// CMO always responds usefully even when no model is configured.

import { GATE_BY_STATUS, requiresApproval } from '../video-room/state-machine';
import type { VideoRoomGateType } from '../video-room/types';
import { STAGE_SCRIPT } from './stage-script';
import type {
  CmoApprovalProposal,
  CmoStageProposal,
  CmoStrategyContext,
  CmoStrategyMessage,
  CmoStrategyOptions,
  CmoStrategyTurnResult,
} from './types';

const SYSTEM = [
  '너는 회사의 CMO다. Founder와 대화하며 유튜브 콘텐츠 전략을 설계한다.',
  'Pulk CMO Video Room의 워크플로우(상태머신)를 단계별로 진행한다.',
  '비개발자 Founder가 이해할 수 있게 평이한 한국어로 말한다.',
  '',
  '핵심 규칙(PRD §14 금지 행동):',
  '- Business PT Context Loading 없이 키 콘텐츠 후보를 확정하지 않는다.',
  '- Viewtrap 리서치 없이 키 콘텐츠를 확정하지 않는다.',
  '- 키 콘텐츠 1개 승인 없이 풀링 콘텐츠 5개를 확정하지 않는다.',
  '- 브릿지 없는 풀링 콘텐츠를 승인 요청하지 않는다.',
  '- Founder 승인 없이 다음 단계로 넘어가지 않는다.',
  '',
  'CMO 응답 포맷(자연스러운 한국어로, 필요한 항목만):',
  '현재 단계 / 현재 상황 / 핵심 판단 / 근거 / 선택지 / 추천안 / 승인 필요 여부 / 다음 액션',
  '',
  '반드시 아래 JSON만 출력한다(설명/마크다운 금지):',
  '{',
  '  "reply": string,                 // Founder에게 할 말(위 포맷)',
  '  "ready_to_advance": boolean,     // 현재 단계 작업이 충분히 완료됐으면 true',
  '  "proposal": {                    // 현재 단계의 산출물 카드(없으면 null)',
  '    "summary": string,             // 카드 한 줄 요약',
  '    "data": object|null            // 단계별 구조화 데이터(후보 목록/풀링세트/썸네일 등)',
  '  } | null,',
  '  "gate": {                        // 승인 단계일 때만, 아니면 null',
  '    "title": string,',
  '    "context": string,',
  '    "options": string[],           // 예: ["승인","수정 요청","다른 후보 보기","보류"]',
  '    "recommended_option": string',
  '  } | null',
  '}',
].join('\n');

function buildUser(
  history: CmoStrategyMessage[],
  founderMessage: string,
  ctx: CmoStrategyContext,
): string {
  const g = STAGE_SCRIPT[ctx.status];
  const lines: string[] = [];
  lines.push(`현재 워크플로우 단계: ${ctx.status} (${g.label})`);
  lines.push(`이 단계에서 CMO가 할 일: ${g.focus}`);
  if (ctx.project_title) lines.push(`프로젝트: ${ctx.project_title}`);
  if (ctx.product) lines.push(`상품: ${ctx.product}`);
  if (ctx.target_audience) lines.push(`타깃: ${ctx.target_audience}`);
  if (ctx.business_goal) lines.push(`목표: ${ctx.business_goal}`);
  lines.push(`Business PT 컨텍스트 로딩 여부: ${ctx.context_loaded ? '완료' : '미완료'}`);
  if (ctx.selected_key_content_title) lines.push(`확정된 키 콘텐츠: ${ctx.selected_key_content_title}`);
  if (typeof ctx.pulling_set_size === 'number') lines.push(`현재 풀링 콘텐츠 수: ${ctx.pulling_set_size}/5`);
  if (ctx.notes?.length) {
    lines.push('이전 단계 메모:');
    for (const n of ctx.notes) lines.push(`- ${n}`);
  }
  lines.push('', '대화 내역:');
  for (const m of history) lines.push(`${m.role === 'founder' ? 'Founder' : 'CMO'}: ${m.text}`);
  lines.push(`Founder: ${founderMessage}`);
  return lines.join('\n');
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

function normalizeProposal(
  raw: unknown,
  status: CmoStrategyContext['status'],
): CmoStageProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const summary = String(p.summary ?? '').trim();
  if (!summary) return null;
  return { stage: status, summary, data: p.data ?? null };
}

function normalizeGate(
  raw: unknown,
  gateType: VideoRoomGateType | undefined,
  fallbackTitle: string,
): CmoApprovalProposal | null {
  if (!gateType) return null;
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const options =
    Array.isArray(p.options) && p.options.length
      ? p.options.map((o) => String(o))
      : ['승인', '수정 요청', '다른 후보 보기', '보류'];
  const title = String(p.title ?? '').trim() || fallbackTitle;
  return {
    gate_type: gateType,
    title,
    context: String(p.context ?? '').trim(),
    options,
    recommended_option:
      typeof p.recommended_option === 'string' && p.recommended_option.trim()
        ? p.recommended_option.trim()
        : options[0],
  };
}

/**
 * Run one founder→CMO strategy turn. Never throws. When an LLM is provided it
 * drives the reply + stage artifact + gate; otherwise a deterministic
 * stage-script reply is returned (plus an auto-built gate at gate stages).
 */
export async function runCmoStrategyTurn(
  history: CmoStrategyMessage[],
  founderMessage: string,
  ctx: CmoStrategyContext,
  opts: CmoStrategyOptions = {},
): Promise<CmoStrategyTurnResult> {
  const status = ctx.status;
  const gateType = GATE_BY_STATUS[status];

  if (opts.llm) {
    try {
      const raw = await opts.llm.complete({
        system: SYSTEM,
        user: buildUser(history, founderMessage, ctx),
        trace_name: 'cmo.strategyTurn',
      });
      const obj = JSON.parse(extractJson(raw)) as {
        reply?: string;
        ready_to_advance?: boolean;
        proposal?: unknown;
        gate?: unknown;
      };
      const reply =
        typeof obj.reply === 'string' && obj.reply.trim()
          ? obj.reply.trim()
          : STAGE_SCRIPT[status].prompt;
      return {
        reply,
        proposal: normalizeProposal(obj.proposal, status),
        gate: requiresApproval(status)
          ? normalizeGate(obj.gate, gateType, STAGE_SCRIPT[status].label)
          : null,
        ready_to_advance: Boolean(obj.ready_to_advance),
      };
    } catch {
      // fall through to deterministic stage script
    }
  }

  return {
    reply: STAGE_SCRIPT[status].prompt,
    proposal: null,
    gate: requiresApproval(status)
      ? normalizeGate(null, gateType, STAGE_SCRIPT[status].label)
      : null,
    ready_to_advance: false,
  };
}
