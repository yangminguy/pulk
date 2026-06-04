// runCtoPlanningTurn — one turn of the founder ↔ CTO planning conversation.
//
// The CTO either keeps the conversation going (asking clarifying questions) or,
// when it has enough, returns a single PLAN (PRD + roadmap + tasks + optional
// new-project proposal) for the founder to approve in one go. LLM-driven with a
// graceful deterministic fallback (a reply asking for more detail; never a plan
// without a model, since planning is inherently conversational).

import type {
  CtoPlanningContext,
  CtoPlanningMessage,
  CtoPlanningOptions,
  CtoPlanningTurnResult,
  CtoPlan,
  CtoPlanTaskDraft,
  ProjectProposal,
} from './types';
import type { RoadmapItemDraft } from '../roadmap/types';

const DEFAULT_MAX_ROADMAP = 6;

const SYSTEM = [
  '너는 회사의 CTO다. 창업자와 대화하며 제품 아이디어를 실행 가능한 계획으로 다듬는다.',
  '비개발자인 창업자가 이해할 수 있게 평이한 한국어로 말한다.',
  '',
  '대화 원칙:',
  '- 아이디어가 모호하면 한 번에 1~2개의 핵심 질문만 한다(과도한 질문 금지).',
  '- 충분히 구체화되면 계획(plan)을 제안한다.',
  '- 기존 프로젝트와 명확히 다른 새로운 일이면 project_proposal로 "새 프로젝트"를 제안하고,',
  '  주어진 businesses 중 어디에 넣을지(business_id)와 프로젝트 이름을 제시한다.',
  '- 기존 프로젝트에 들어갈 일이면 project_proposal은 null로 둔다.',
  '',
  '반드시 아래 JSON만 출력한다(설명/마크다운 금지):',
  '{',
  '  "reply": string,           // 창업자에게 할 말',
  '  "ready": boolean,          // 계획을 제안할 준비가 됐으면 true',
  '  "plan": {                  // ready=true일 때만',
  '    "prd": string,           // 평이한 제품 요구 문서',
  '    "roadmap_items": [ { "title": string, "summary": string, "objective": string, "sequence": number } ],',
  '    "tasks": [ { "title": string, "rationale": string, "expected_output": string, "roadmap_sequence": number } ],',
  '    "project_proposal": { "is_new_project": boolean, "business_id": string|null, "suggested_project_title": string, "rationale": string } | null',
  '  } | null',
  '}',
].join('\n');

function buildUser(
  history: CtoPlanningMessage[],
  founderMessage: string,
  ctx: CtoPlanningContext,
): string {
  const lines: string[] = [];
  if (ctx.project_title) lines.push(`현재 프로젝트: ${ctx.project_title}`);
  if (ctx.businesses?.length) {
    lines.push(
      `사업 목록: ${ctx.businesses.map((b) => `${b.title}(id=${b.id})`).join(', ')}`,
    );
  }
  if (ctx.existing_projects?.length) {
    lines.push(
      `기존 프로젝트: ${ctx.existing_projects
        .map((p) => `${p.title}(business=${p.business_id})`)
        .join(', ')}`,
    );
  }
  lines.push('', '대화 내역:');
  for (const m of history) {
    lines.push(`${m.role === 'founder' ? '창업자' : 'CTO'}: ${m.text}`);
  }
  lines.push(`창업자: ${founderMessage}`);
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

function normalizeRoadmap(
  raw: unknown,
  max: number,
): RoadmapItemDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .filter((it) => typeof it.title === 'string' && (it.title as string).trim())
    .slice(0, Math.max(1, max))
    .map((it, i) => ({
      title: String(it.title).trim(),
      summary: String(it.summary ?? '').trim(),
      objective: String(it.objective ?? '').trim(),
      sequence: i + 1,
    }));
}

function normalizeTasks(
  raw: unknown,
  roadmapLen: number,
): CtoPlanTaskDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .filter((it) => typeof it.title === 'string' && (it.title as string).trim())
    .map((it) => {
      const seq = typeof it.roadmap_sequence === 'number' ? it.roadmap_sequence : 1;
      return {
        title: String(it.title).trim(),
        rationale: String(it.rationale ?? '').trim(),
        expected_output: String(it.expected_output ?? '').trim(),
        // Clamp to a valid roadmap index (1..roadmapLen), default 1.
        roadmap_sequence:
          roadmapLen > 0 ? Math.min(Math.max(1, seq), roadmapLen) : 1,
      };
    });
}

function normalizeProposal(raw: unknown): ProjectProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.is_new_project !== true) return null;
  return {
    is_new_project: true,
    business_id:
      typeof p.business_id === 'string' && p.business_id ? p.business_id : null,
    suggested_project_title: String(p.suggested_project_title ?? '새 프로젝트').trim(),
    rationale: String(p.rationale ?? '').trim(),
  };
}

function normalizePlan(raw: unknown, max: number): CtoPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const roadmap_items = normalizeRoadmap(p.roadmap_items, max);
  const tasks = normalizeTasks(p.tasks, roadmap_items.length);
  const prd = String(p.prd ?? '').trim();
  // A usable plan needs at least a PRD or one roadmap item; otherwise treat as
  // "not ready yet" so the conversation continues.
  if (!prd && roadmap_items.length === 0) return null;
  return {
    prd,
    roadmap_items,
    tasks,
    project_proposal: normalizeProposal(p.project_proposal),
  };
}

/** Run one founder→CTO planning turn. Returns the CTO's reply and, when the CTO
 * is ready, a full plan to approve. Never throws. */
export async function runCtoPlanningTurn(
  history: CtoPlanningMessage[],
  founderMessage: string,
  ctx: CtoPlanningContext = {},
  opts: CtoPlanningOptions = {},
): Promise<CtoPlanningTurnResult> {
  const max = opts.max_roadmap_items ?? DEFAULT_MAX_ROADMAP;

  if (opts.llm) {
    try {
      const raw = await opts.llm.complete({
        system: SYSTEM,
        user: buildUser(history, founderMessage, ctx),
        trace_name: 'cto.planningTurn',
      });
      const obj = JSON.parse(extractJson(raw)) as {
        reply?: string;
        ready?: boolean;
        plan?: unknown;
      };
      const reply =
        typeof obj.reply === 'string' && obj.reply.trim()
          ? obj.reply.trim()
          : '계속 이야기해 주세요.';
      const plan = obj.ready ? normalizePlan(obj.plan, max) : null;
      return { reply, plan };
    } catch {
      // fall through to deterministic reply
    }
  }

  return {
    reply:
      '아이디어를 조금 더 구체적으로 알려주세요. 누가, 어떤 문제를, 어떻게 해결하길 원하시나요? (자동 기획 모델이 비활성화된 환경에서는 계획 제안이 제한됩니다.)',
    plan: null,
  };
}
