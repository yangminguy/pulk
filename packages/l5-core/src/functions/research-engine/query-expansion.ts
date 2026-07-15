// research-engine — query expansion (EXPAND phase, §4.1).
//
// Splits a topic into sub-questions / synonyms / methodology / cases / failures /
// counter-arguments / trends and emits 8~14 KR+EN search queries.
// Split into a prompt builder + a strict parser (LLM-free testable) + a fully
// deterministic fallback, so the phase never fails: the spec mandates a
// deterministic fallback when the LLM is unavailable or returns junk (§4.1).

import type { LLMClient } from '../ceo-orchestration/types';
import {
  Market,
  QueryAngle,
  ResearchParseError,
  ResolvedResearchRequest,
  SearchQuery,
  requireArray,
  requireString,
  strictJsonObject,
} from './types';

const MIN_QUERIES = 8;
const MAX_QUERIES = 14;

const VALID_ANGLES: QueryAngle[] = [
  'core',
  'subquestion',
  'synonym',
  'methodology',
  'case_study',
  'failure',
  'counterargument',
  'trend',
];

// Fixed KR/EN modifiers, one per non-core angle.
const KR_MODIFIERS: Array<{ angle: QueryAngle; suffix: string }> = [
  { angle: 'methodology', suffix: '방법' },
  { angle: 'case_study', suffix: '사례' },
  { angle: 'failure', suffix: '실패 이유' },
  { angle: 'counterargument', suffix: '반론' },
  { angle: 'trend', suffix: '최신 트렌드' },
  { angle: 'subquestion', suffix: '핵심 원리' },
];
const EN_MODIFIERS: Array<{ angle: QueryAngle; suffix: string }> = [
  { angle: 'methodology', suffix: 'how to' },
  { angle: 'case_study', suffix: 'case study' },
  { angle: 'failure', suffix: 'mistakes' },
  { angle: 'counterargument', suffix: 'myths' },
  { angle: 'trend', suffix: 'latest' },
  { angle: 'subquestion', suffix: 'fundamentals' },
];

function marketOfLang(lang: OutputLang): Market {
  return lang === 'ko' ? 'KR' : 'US';
}

type OutputLang = 'ko' | 'en';

/**
 * Deterministic query set: `topic` + fixed modifiers for each requested market's
 * language. Always yields 8~14 queries when both markets are present.
 */
export function deterministicQueries(req: ResolvedResearchRequest): SearchQuery[] {
  const out: SearchQuery[] = [];
  if (req.markets.includes('KR')) {
    out.push({ q: req.topic, lang: 'ko', market: 'KR', angle: 'core' });
    for (const m of KR_MODIFIERS) {
      out.push({ q: `${req.topic} ${m.suffix}`, lang: 'ko', market: 'KR', angle: m.angle });
    }
  }
  if (req.markets.includes('US')) {
    out.push({ q: req.topic, lang: 'en', market: 'US', angle: 'core' });
    for (const m of EN_MODIFIERS) {
      out.push({ q: `${m.suffix} ${req.topic}`, lang: 'en', market: 'US', angle: m.angle });
    }
  }
  return clampQueries(out);
}

/** De-duplicate by (lang,q) and cap at MAX_QUERIES. */
export function clampQueries(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  const out: SearchQuery[] = [];
  for (const query of queries) {
    const key = `${query.lang}::${query.q.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

export function buildQueryExpansionPrompt(req: ResolvedResearchRequest): {
  system: string;
  user: string;
} {
  const markets = req.markets.join(', ');
  const system =
    '너는 리서치 검색어 설계자다. 주어진 주제를 하위질문·동의어·방법론·사례·실패사례·' +
    '반론·최신흐름 관점으로 분해해 YouTube 검색어를 만든다. ' +
    `요청 시장(${markets})에 맞춰 한국어(ko)와 영어(en) 검색어를 골고루 만든다. ` +
    `총 ${MIN_QUERIES}~${MAX_QUERIES}개. 검색어는 2~5단어로 짧게(긴 문장 금지). ` +
    '반드시 JSON만 출력: {"queries":[{"q":string,"lang":"ko"|"en","angle":' +
    '"core"|"subquestion"|"synonym"|"methodology"|"case_study"|"failure"|"counterargument"|"trend"}]}';
  const lines = [`주제: ${req.topic}`, `목적: ${req.researchPurpose}`];
  if (req.researchQuestion) lines.push(`리서치 질문: ${req.researchQuestion}`);
  if (req.targetAudience) lines.push(`대상 독자: ${req.targetAudience}`);
  return { system, user: lines.join('\n') };
}

/** Strict parse of the LLM query response. Throws ResearchParseError on failure. */
export function parseQueryExpansionResponse(
  raw: string,
  req: ResolvedResearchRequest,
): SearchQuery[] {
  const obj = strictJsonObject(raw);
  const arr = requireArray(obj, 'queries');
  const out: SearchQuery[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const q = requireString(o.q, 'q');
    const lang: OutputLang | null = o.lang === 'en' ? 'en' : o.lang === 'ko' ? 'ko' : null;
    if (lang === null) continue;
    const market = marketOfLang(lang);
    if (!req.markets.includes(market)) continue;
    const angle: QueryAngle = VALID_ANGLES.includes(o.angle as QueryAngle)
      ? (o.angle as QueryAngle)
      : 'core';
    out.push({ q, lang, market, angle });
  }
  if (out.length === 0) {
    throw new ResearchParseError('no valid queries in response');
  }
  return clampQueries(out);
}

/**
 * Full EXPAND: LLM expansion, deterministic fallback on any failure. Never
 * throws. When the LLM returns fewer than the floor, its queries are merged
 * with the deterministic set to guarantee ≥ MIN_QUERIES.
 */
export async function expandQueries(
  req: ResolvedResearchRequest,
  llm: LLMClient,
): Promise<SearchQuery[]> {
  const prompt = buildQueryExpansionPrompt(req);
  let llmQueries: SearchQuery[] = [];
  try {
    const raw = await llm.complete({
      system: prompt.system,
      user: prompt.user,
      trace_name: 'research.expandQueries',
    });
    llmQueries = parseQueryExpansionResponse(raw, req);
  } catch {
    llmQueries = [];
  }

  if (llmQueries.length >= MIN_QUERIES) return llmQueries;
  return clampQueries([...llmQueries, ...deterministicQueries(req)]);
}
