// generateRoadmapFromPRD — turn a PRD into 3–N plain-language roadmap milestones.
//
// LLM path: the model breaks the PRD into founder-facing milestones (plain
// Korean, no developer jargon). Deterministic fallback (no LLM / parse failure):
// derive milestones from the PRD's own structure (numbered/bulleted lines, then
// headings, then paragraphs), so the roadmap is still useful offline.

import type {
  GenerateRoadmapInput,
  GenerateRoadmapOptions,
  RoadmapItemDraft,
} from './types';

const DEFAULT_MAX_ITEMS = 6;

const LLM_SYSTEM = [
  '너는 제품 로드맵 설계자다. 주어진 PRD를 비개발자(창업자)가 이해할 수 있는',
  '제품 마일스톤(로드맵 항목) 3~6개로 나눈다.',
  '각 항목은 개발 용어가 아니라 "어떤 가치를 만드는지"를 평이한 한국어로 설명한다.',
  '논리적 순서(먼저 만들어야 할 것 → 나중)대로 sequence를 매긴다.',
  '반드시 아래 JSON만 출력한다(설명 금지):',
  '{ "items": [ { "title": string, "summary": string, "objective": string, "sequence": number } ] }',
  '- title: 짧은 마일스톤 이름 (예: "회원 가입 흐름")',
  '- summary: 한 줄 평이한 설명 (이 항목이 만드는 가치)',
  '- objective: 무엇이 되면 이 항목이 끝났다고 볼 수 있는지 (평이하게)',
].join('\n');

function clampItems(items: RoadmapItemDraft[], max: number): RoadmapItemDraft[] {
  return items
    .slice(0, Math.max(1, max))
    .map((it, i) => ({ ...it, sequence: i + 1 }));
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

async function generateWithLLM(
  input: GenerateRoadmapInput,
  llm: NonNullable<GenerateRoadmapOptions['llm']>,
  max: number,
): Promise<RoadmapItemDraft[] | null> {
  const raw = await llm.complete({
    system: LLM_SYSTEM,
    user: [
      input.project_title ? `프로젝트: ${input.project_title}` : '',
      input.business_context ? `회사 맥락: ${input.business_context}` : '',
      `최대 ${max}개 항목.`,
      'PRD:',
      input.prd,
    ]
      .filter(Boolean)
      .join('\n'),
    trace_name: 'roadmap.generateFromPRD',
  });

  try {
    const obj = JSON.parse(extractJson(raw)) as {
      items?: Array<Partial<RoadmapItemDraft>>;
    };
    if (!obj.items || !Array.isArray(obj.items) || obj.items.length === 0) {
      return null;
    }
    const items: RoadmapItemDraft[] = obj.items
      .filter((it) => typeof it.title === 'string' && it.title.trim().length > 0)
      .map((it, i) => ({
        title: String(it.title).trim(),
        summary: String(it.summary ?? '').trim(),
        objective: String(it.objective ?? '').trim(),
        sequence: typeof it.sequence === 'number' ? it.sequence : i + 1,
      }));
    return items.length > 0 ? clampItems(items, max) : null;
  } catch {
    return null;
  }
}

/** Deterministic fallback — derive milestones from the PRD's own structure.
 * Order of preference: numbered/bulleted lines → markdown headings →
 * paragraphs → a single "전체 구현" item. Never throws, always ≥1 item. */
export function fallbackRoadmap(
  input: GenerateRoadmapInput,
  max: number = DEFAULT_MAX_ITEMS,
): RoadmapItemDraft[] {
  const text = (input.prd ?? '').trim();
  const lines = text.split('\n').map((l) => l.trim());

  const stripMarker = (l: string): string =>
    l.replace(/^(?:[-*•]|\d+[.)]|#{1,6})\s*/, '').trim();

  // 1) numbered / bulleted list items.
  const bullets = lines
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
    .map(stripMarker)
    .filter(Boolean);
  // 2) markdown headings.
  const headings = lines
    .filter((l) => /^#{1,6}\s+/.test(l))
    .map(stripMarker)
    .filter(Boolean);
  // 3) non-empty paragraphs.
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const source =
    bullets.length >= 2 ? bullets : headings.length >= 2 ? headings : paras;

  if (source.length === 0) {
    return [
      {
        title: input.project_title?.trim() || '전체 구현',
        summary: text ? text.slice(0, 80) : '제품 전체 구현',
        objective: '요청한 제품이 동작하는 상태가 된다',
        sequence: 1,
      },
    ];
  }

  return clampItems(
    source.map((s, i) => ({
      title: s.length > 40 ? `${s.slice(0, 38)}…` : s,
      summary: s.length > 90 ? `${s.slice(0, 88)}…` : s,
      objective: `${s.length > 40 ? `${s.slice(0, 38)}…` : s} 완료`,
      sequence: i + 1,
    })),
    max,
  );
}

/** PRD → roadmap milestones. Uses the LLM when supplied; falls back to a
 * structural heuristic on absence or LLM failure. Always returns ≥1 item. */
export async function generateRoadmapFromPRD(
  input: GenerateRoadmapInput,
  opts: GenerateRoadmapOptions = {},
): Promise<RoadmapItemDraft[]> {
  const max = opts.max_items ?? DEFAULT_MAX_ITEMS;
  if (opts.llm) {
    const viaLLM = await generateWithLLM(input, opts.llm, max);
    if (viaLLM && viaLLM.length > 0) return viaLLM;
  }
  return fallbackRoadmap(input, max);
}
