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
  OpenQuestion,
  ProjectProposal,
} from './types';
import type { RoadmapItemDraft } from '../roadmap/types';
import { estimatePlanTokens } from '../token-estimate';
import { completeJsonWithRetry } from '../llm-json';
import { formatScoutForPrompt } from './scout';

const DEFAULT_MAX_ROADMAP = 6;

const SYSTEM = [
  '너는 회사의 CTO다. 창업자와 대화하며 제품 아이디어를 실행 가능한 계획으로 다듬는다.',
  '비개발자인 창업자가 이해할 수 있게 평이한 한국어로 말한다.',
  '',
  '대화 원칙:',
  '- 아이디어가 모호하면 한 번에 1~2개의 핵심 질문만 한다(과도한 질문 금지).',
  '- 매 턴 open_questions에 "아직 정해지지 않은 결정 항목"을 전부 나열한다(대상 사용자, 저장 위치, 기존 기능과의 관계 등).',
  '  각 항목에 blocking(이 답 없이는 계획 확정 불가)을 정직하게 표시한다. blocking이 남아 있으면 plan을 제안하지 말고 그 항목을 질문하라.',
  '- 충분히 구체화되면 계획(plan)을 제안한다.',
  '- repo 실측 정보가 주어지면 반드시 근거로 사용한다: 기존 코드 재사용을 우선하고, 이미 있는 것을 다시 만드는 태스크를 내지 마라.',
  '- 각 태스크에 acceptance_criteria(측정 가능한 완료 조건 2~4개)를 붙인다. 각 조건은 "무엇을 실행/확인하면 통과인지"가 명확해야 한다',
  '  (예: "pnpm test -- foo 통과", "GET /api/x 가 200과 items[]를 반환"). "잘 동작한다" 같은 모호한 조건 금지.',
  '- 기존 프로젝트와 명확히 다른 새로운 일이면 project_proposal로 "새 프로젝트"를 제안하고,',
  '  주어진 businesses 중 어디에 넣을지(business_id)와 프로젝트 이름을 제시한다.',
  '- 기존 프로젝트에 들어갈 일이면 project_proposal은 null로 둔다.',
  '',
  '반드시 아래 JSON만 출력한다(설명/마크다운 금지):',
  '{',
  '  "reply": string,           // 창업자에게 할 말',
  '  "ready": boolean,          // 계획을 제안할 준비가 됐으면 true',
  '  "open_questions": [ { "question": string, "blocking": boolean } ],  // 미정 결정 항목(없으면 빈 배열)',
  '  "plan": {                  // ready=true일 때만',
  '    "prd": string,           // 평이한 제품 요구 문서',
  '    "roadmap_items": [ { "title": string, "summary": string, "objective": string, "sequence": number } ],',
  '    "tasks": [ { "title": string, "rationale": string, "expected_output": string, "roadmap_sequence": number, "size": "tiny"|"small"|"feature"|"big", "acceptance_criteria": string[] } ],',
  '    // size = 시니어 개발자로서 판단한 작업 규모. tiny=한 줄/사소, small=작은 수정, feature=일반 기능, big=대형/구조 변경. 토큰 비용 추정에 쓰인다.',
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
  // S1 Plan Grounding — repo 실측 요약이 있으면 프롬프트에 주입한다.
  const scout = formatScoutForPrompt(ctx.repo_scout);
  if (scout) {
    lines.push('', scout);
  }
  lines.push('', '대화 내역:');
  for (const m of history) {
    lines.push(`${m.role === 'founder' ? '창업자' : 'CTO'}: ${m.text}`);
  }
  lines.push(`창업자: ${founderMessage}`);
  return lines.join('\n');
}

/** S5 — 모델이 낸 open_questions를 정규화한다(비정형 입력 graceful). */
function normalizeOpenQuestions(raw: unknown): OpenQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .filter((it) => typeof it.question === 'string' && (it.question as string).trim())
    .slice(0, 10)
    .map((it) => ({
      question: String(it.question).trim(),
      blocking: it.blocking === true,
    }));
}

/** S6 — acceptance_criteria 정규화: 문자열 배열, 항목당 트림, 최대 5개. */
function normalizeCriteria(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 5);
  return list.length ? list : undefined;
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
      const size =
        it.size === 'tiny' || it.size === 'small' || it.size === 'feature' || it.size === 'big'
          ? it.size
          : undefined;
      const criteria = normalizeCriteria(it.acceptance_criteria);
      return {
        title: String(it.title).trim(),
        rationale: String(it.rationale ?? '').trim(),
        expected_output: String(it.expected_output ?? '').trim(),
        // Clamp to a valid roadmap index (1..roadmapLen), default 1.
        roadmap_sequence:
          roadmapLen > 0 ? Math.min(Math.max(1, seq), roadmapLen) : 1,
        ...(size ? { size } : {}),
        ...(criteria ? { acceptance_criteria: criteria } : {}),
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
    // Forecast budget so the founder sees the rough token cost before approving.
    token_estimate: estimatePlanTokens(
      tasks.map((t) => ({ title: t.title, rationale: t.rationale, size: t.size })),
    ),
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
    // S4 — 스키마 강제 + 자동 재시도. regex 1-shot 파싱의 silent fallback을 제거한다.
    const { value } = await completeJsonWithRetry(opts.llm, {
      system: SYSTEM,
      user: buildUser(history, founderMessage, ctx),
      trace_name: 'cto.planningTurn',
      validate: (v) => {
        if (!v || typeof v !== 'object') return null;
        const o = v as Record<string, unknown>;
        if (typeof o.reply !== 'string' || !o.reply.trim()) return null;
        return o as { reply: string; ready?: boolean; plan?: unknown; open_questions?: unknown };
      },
    });

    if (value) {
      const reply = value.reply.trim();
      const open_questions = normalizeOpenQuestions(value.open_questions);
      let plan = value.ready ? normalizePlan(value.plan, max) : null;

      // S5 모호성 게이트 — blocking 미정 항목이 남아 있으면 계획을 확정하지 않는다.
      // 감(ready=true)이 아니라 산출물(blocking 목록)이 게이트다.
      const blocking = open_questions.filter((q) => q.blocking);
      if (plan && blocking.length > 0) {
        plan = null;
        const asks = blocking.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
        return {
          reply: `${reply}\n\n계획을 확정하기 전에 먼저 정해야 할 항목이 있습니다:\n${asks}`,
          plan: null,
          open_questions,
        };
      }
      return { reply, plan, open_questions };
    }
    // 재시도까지 실패 → deterministic reply로 강등(아래).
  }

  return {
    reply:
      '아이디어를 조금 더 구체적으로 알려주세요. 누가, 어떤 문제를, 어떻게 해결하길 원하시나요? (자동 기획 모델이 비활성화된 환경에서는 계획 제안이 제한됩니다.)',
    plan: null,
  };
}
