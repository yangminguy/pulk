// research-engine — book composer (COMPOSE phase, §12-A).
//
// Turns the canonical synthesis (principles/conflicts/KR-US + knowledge atoms)
// into a *book-style deep manuscript* instead of a metadata dump. Three LLM
// stages, each split into a prompt builder + a strict/tolerant parser + a
// deterministic fallback so no single failure sinks the run:
//
//   1. OUTLINE  — design the table of contents over an 8-chapter skeleton,
//                 mapping principle/atom ids to each chapter. Fallback: a
//                 deterministic cluster/claimType distribution.
//   2. EXCERPT  — pure: pull raw transcript excerpts in a ±window around each
//                 atom (per-chapter char budget, evenly split), keeping the
//                 timestamp + sourceUrl so the prose can cite the original.
//   3. WRITE    — one LLM call per chapter: goal + full atom text (NEVER
//                 truncated) + excerpts + previous chapter titles → 1.5k~3.5k
//                 char prose in outputLanguage. Fallback: deterministic
//                 atom-based render.
//   4. ASSEMBLE — pure: preface (auto) + chapters + appendix (reliability
//                 evidence rendered by report.ts and injected as a string).
//
// I/O-free: transcripts, video titles, and the appendix string are injected by
// the pipeline (which owns the store). Everything here is unit-testable.

import type { LLMClient } from '../ceo-orchestration/types';
import {
  ACTIONABLE_CHAPTER_KINDS,
  BOOK_CHAPTER_KINDS,
  BookChapterKind,
  BookChapterSpec,
  BookOutline,
  ChapterExcerpt,
  KnowledgeAtom,
  OutputLanguage,
  ResearchParseError,
  ResearchPurpose,
  ResolvedResearchRequest,
  SynthesizedPrinciple,
  Transcript,
  requireArray,
  requireString,
  strictJsonObject,
} from './types';
import { segmentsInRange } from './atom-extraction';

// ---------------------------------------------------------------------------
// Fixed 8-chapter skeleton (§12-A)
// ---------------------------------------------------------------------------

interface SkeletonChapter {
  kind: BookChapterKind;
  title: string;
  goal: string;
}

const SKELETON: SkeletonChapter[] = [
  { kind: 'overview', title: '전체 개요 — 이 주제의 지형', goal: '주제 전체를 조망하고 왜 중요한지, 무엇을 다루는지 지도를 그린다.' },
  { kind: 'concepts', title: '핵심 개념', goal: '기초 개념부터 점진적으로 심화하며 독자가 용어와 원리를 체득하게 한다.' },
  { kind: 'methodology', title: '아키텍처·방법론', goal: '검증된 원칙들을 방법론 수준에서 구조적으로 설명한다.' },
  { kind: 'howto', title: '구체적 실행 방법', goal: '단계별 how-to로 실제 실행 절차를 번호와 예시로 제시한다.' },
  { kind: 'cases', title: '사례와 실패담', goal: '실제 사례·실패 경험에서 배우는 교훈을 원문 근거와 함께 전달한다.' },
  { kind: 'conflicts', title: '충돌 지점과 판단 기준', goal: '주장이 엇갈리는 지점을 드러내고 언제 무엇을 택할지 판단 기준을 준다.' },
  { kind: 'apply', title: '실전 적용 가이드', goal: '체크리스트·템플릿·바로 쓰는 시나리오로 즉시 실행 가능하게 만든다.' },
  { kind: 'glossary', title: '용어집과 출처', goal: '핵심 용어를 정의하고 근거가 된 출처를 정리한다.' },
];

/** Purpose-specific emphasis for the 'apply' chapter (§12-A). */
function applyChapterFor(purpose: ResearchPurpose): SkeletonChapter {
  if (purpose === 'CONTENT_PLANNING') {
    return {
      kind: 'apply',
      title: '실전 적용 가이드 — 콘텐츠 기획 워크시트',
      goal: '이 주제로 콘텐츠를 기획할 때 바로 채워 쓰는 워크시트(타깃 문제·핵심 메시지·차별화·아이디어)를 제공한다.',
    };
  }
  return SKELETON.find((c) => c.kind === 'apply')!;
}

function skeletonFor(purpose: ResearchPurpose): SkeletonChapter[] {
  return SKELETON.map((c) => (c.kind === 'apply' ? applyChapterFor(purpose) : c));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Seconds → "m:ss" for the inline `[제목 (mm:ss)](url)` citation. */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function langLabel(lang: OutputLanguage): string {
  return lang === 'en' ? '영어(English)' : '한국어';
}

/** Strip a leading/trailing markdown code fence if the model wrapped its prose. */
export function stripCodeFences(raw: string): string {
  let s = (raw ?? '').trim();
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  return s;
}

// ---------------------------------------------------------------------------
// 1. OUTLINE
// ---------------------------------------------------------------------------

function atomIndexLines(atoms: KnowledgeAtom[]): string {
  return atoms.map((a) => `- ${a.claimId} [${a.claimType}] ${a.claim}`).join('\n');
}

function principleLines(principles: SynthesizedPrinciple[]): string {
  return principles.map((p) => `- ${p.id} (${p.kind}) ${p.statement}`).join('\n');
}

export function buildOutlinePrompt(params: {
  request: ResolvedResearchRequest;
  principles: SynthesizedPrinciple[];
  atoms: KnowledgeAtom[];
}): { system: string; user: string } {
  const { request, principles, atoms } = params;
  const skeleton = skeletonFor(request.researchPurpose);
  const skeletonText = skeleton
    .map((c, i) => `${i + 1}. [${c.kind}] ${c.title} — ${c.goal}`)
    .join('\n');

  const system =
    '너는 한 권의 실용서를 설계하는 편집자다. 주어진 원칙과 아톰(주장)을 바탕으로 ' +
    `책 목차를 설계한다. 반드시 아래 8개 골격을 그 순서대로 유지하되, 각 챕터의 title/goal은 ` +
    '주제에 맞게 구체화하고, 관련 principle id와 atom id를 배정한다. ' +
    '각 챕터에는 kind를 골격의 kind로 태깅한다. ' +
    `모든 title/goal은 ${langLabel(request.outputLanguage)}로 쓴다. ` +
    '없는 id를 지어내지 말 것. 반드시 JSON만 출력: ' +
    '{"chapters":[{"chapterId":string,"kind":' +
    '"overview"|"concepts"|"methodology"|"howto"|"cases"|"conflicts"|"apply"|"glossary",' +
    '"title":string,"goal":string,"principleIds":[string],"atomIds":[string]}]}';

  const user = [
    `주제: ${request.topic}`,
    `목적: ${request.researchPurpose}`,
    request.researchQuestion ? `리서치 질문: ${request.researchQuestion}` : '',
    request.targetAudience ? `대상 독자: ${request.targetAudience}` : '',
    '',
    '[8개 챕터 골격 — 순서 고정]',
    skeletonText,
    '',
    '[원칙]',
    principleLines(principles) || '(없음)',
    '',
    '[아톰 인덱스]',
    atomIndexLines(atoms) || '(없음)',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { system, user };
}

function coerceKind(v: unknown, index: number): BookChapterKind {
  if (typeof v === 'string' && BOOK_CHAPTER_KINDS.includes(v as BookChapterKind)) {
    return v as BookChapterKind;
  }
  return BOOK_CHAPTER_KINDS[Math.min(index, BOOK_CHAPTER_KINDS.length - 1)];
}

/** Strict parse of the outline response. Throws ResearchParseError on failure. */
export function parseOutlineResponse(raw: string): BookOutline {
  const obj = strictJsonObject(raw);
  const arr = requireArray(obj, 'chapters');
  const chapters: BookChapterSpec[] = [];
  arr.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const title = requireString(o.title, 'title');
    const chapterId =
      typeof o.chapterId === 'string' && o.chapterId.trim() ? o.chapterId.trim() : `ch${index + 1}`;
    chapters.push({
      chapterId,
      kind: coerceKind(o.kind, index),
      title,
      goal: typeof o.goal === 'string' ? o.goal.trim() : '',
      principleIds: Array.isArray(o.principleIds)
        ? o.principleIds.filter((x): x is string => typeof x === 'string')
        : [],
      atomIds: Array.isArray(o.atomIds)
        ? o.atomIds.filter((x): x is string => typeof x === 'string')
        : [],
    });
  });
  if (chapters.length === 0) throw new ResearchParseError('no valid chapters in outline');
  return { chapters };
}

function atomsByType(atoms: KnowledgeAtom[], types: KnowledgeAtom['claimType'][]): string[] {
  return atoms.filter((a) => types.includes(a.claimType)).map((a) => a.claimId);
}

/**
 * Deterministic fallback outline over the 8-chapter skeleton. Distributes
 * principles by kind and atoms by claimType so every chapter has material and
 * nothing is silently dropped. Pure.
 */
export function fallbackOutline(
  request: ResolvedResearchRequest,
  principles: SynthesizedPrinciple[],
  atoms: KnowledgeAtom[],
): BookOutline {
  const skeleton = skeletonFor(request.researchPurpose);
  const commonIds = principles.filter((p) => p.kind === 'common' || p.kind === 'conditional').map((p) => p.id);
  const conflictIds = principles.filter((p) => p.kind === 'conflict' || p.kind === 'kr_us_diff').map((p) => p.id);
  const conflictAtomIds = principles
    .filter((p) => p.kind === 'conflict' || p.kind === 'kr_us_diff')
    .flatMap((p) => p.atomIds);
  const allAtomIds = atoms.map((a) => a.claimId);

  const byKind: Record<BookChapterKind, { principleIds: string[]; atomIds: string[] }> = {
    overview: { principleIds: commonIds.slice(0, 6), atomIds: [] },
    concepts: { principleIds: [], atomIds: atomsByType(atoms, ['framework']) },
    methodology: { principleIds: commonIds, atomIds: atomsByType(atoms, ['causal_claim', 'framework']) },
    howto: { principleIds: [], atomIds: atomsByType(atoms, ['instruction', 'practitioner_heuristic']) },
    cases: { principleIds: [], atomIds: atomsByType(atoms, ['case_study']) },
    conflicts: { principleIds: conflictIds, atomIds: conflictAtomIds },
    apply: { principleIds: commonIds.slice(0, 8), atomIds: atomsByType(atoms, ['instruction', 'practitioner_heuristic']) },
    glossary: { principleIds: [], atomIds: allAtomIds },
  };

  const chapters: BookChapterSpec[] = skeleton.map((c, i) => ({
    chapterId: `ch${i + 1}-${c.kind}`,
    kind: c.kind,
    title: c.title,
    goal: c.goal,
    principleIds: byKind[c.kind].principleIds,
    atomIds: byKind[c.kind].atomIds,
  }));
  return { chapters };
}

/** Full OUTLINE: LLM design, deterministic fallback, id sanitization. */
export async function composeOutline(params: {
  request: ResolvedResearchRequest;
  principles: SynthesizedPrinciple[];
  atoms: KnowledgeAtom[];
  llm: LLMClient;
}): Promise<BookOutline> {
  const { request, principles, atoms, llm } = params;
  let outline: BookOutline;
  try {
    const prompt = buildOutlinePrompt({ request, principles, atoms });
    const raw = await llm.complete({ ...prompt, trace_name: 'research.book.outline' });
    outline = parseOutlineResponse(raw);
  } catch {
    return fallbackOutline(request, principles, atoms);
  }
  // Sanitize hallucinated ids to the real pools.
  const atomIdSet = new Set(atoms.map((a) => a.claimId));
  const principleIdSet = new Set(principles.map((p) => p.id));
  outline.chapters = outline.chapters.map((c) => ({
    ...c,
    principleIds: c.principleIds.filter((id) => principleIdSet.has(id)),
    atomIds: c.atomIds.filter((id) => atomIdSet.has(id)),
  }));
  return outline;
}

// ---------------------------------------------------------------------------
// 2. EXCERPT (pure)
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_SECONDS = 90;
const DEFAULT_CHAPTER_CHAR_BUDGET = 8000;

/**
 * Gather raw transcript excerpts for a chapter's atoms: a ±window around each
 * atom, evenly splitting a per-chapter character budget across the atoms, and
 * keeping the timestamp + sourceUrl for citation. Pure — transcripts and titles
 * are injected. Atoms with no transcript / no overlapping segments are skipped.
 */
export function gatherChapterExcerpts(params: {
  atoms: KnowledgeAtom[];
  transcripts: Map<string, Transcript>;
  videoTitles: Map<string, string>;
  windowSeconds?: number;
  totalCharBudget?: number;
}): ChapterExcerpt[] {
  const windowSeconds = params.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const totalBudget = params.totalCharBudget ?? DEFAULT_CHAPTER_CHAR_BUDGET;
  const atoms = params.atoms;
  if (atoms.length === 0) return [];

  const perAtom = Math.max(1, Math.floor(totalBudget / atoms.length));
  const out: ChapterExcerpt[] = [];
  for (const atom of atoms) {
    const t = params.transcripts.get(atom.videoId);
    if (!t) continue;
    const lo = atom.startSeconds - windowSeconds;
    const hi = Math.max(atom.startSeconds, atom.endSeconds) + windowSeconds;
    const range = segmentsInRange(t.segments, lo, hi);
    if (range.length === 0) continue;

    let text = range
      .map((s) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > perAtom) {
      text = text.slice(0, Math.max(0, perAtom - 1)).trimEnd() + '…';
    }
    out.push({
      atomId: atom.claimId,
      videoId: atom.videoId,
      videoTitle: params.videoTitles.get(atom.videoId) ?? atom.videoId,
      startSeconds: atom.startSeconds,
      timestamp: mmss(atom.startSeconds),
      sourceUrl: atom.sourceUrl,
      text,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. WRITE
// ---------------------------------------------------------------------------

const MIN_CHAPTER_CHARS = 800;

function atomFullText(atoms: KnowledgeAtom[], videoTitles: Map<string, string>): string {
  if (atoms.length === 0) return '(이 챕터에 배정된 아톰 없음 — 원칙과 목표에 근거해 서술)';
  return atoms
    .map((a) => {
      const title = videoTitles.get(a.videoId) ?? a.videoId;
      return [
        `- 주장: ${a.claim}`,
        a.explanation ? `  설명: ${a.explanation}` : '',
        a.evidence ? `  근거(원문): ${a.evidence}` : '',
        `  출처: [${title} (${mmss(a.startSeconds)})](${a.sourceUrl})`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

function excerptText(excerpts: ChapterExcerpt[]): string {
  if (excerpts.length === 0) return '(발췌 없음)';
  return excerpts
    .map((e) => `- [${e.videoTitle} (${e.timestamp})](${e.sourceUrl})\n  「${e.text}」`)
    .join('\n');
}

export function buildChapterWritePrompt(params: {
  chapter: BookChapterSpec;
  atoms: KnowledgeAtom[];
  excerpts: ChapterExcerpt[];
  previousTitles: string[];
  request: ResolvedResearchRequest;
  videoTitles: Map<string, string>;
}): { system: string; user: string } {
  const { chapter, atoms, excerpts, previousTitles, request, videoTitles } = params;
  const lang = langLabel(request.outputLanguage);
  const actionable = ACTIONABLE_CHAPTER_KINDS.includes(chapter.kind);

  const rules = [
    `모든 문장은 ${lang}로 쓴다. 영어 용어는 괄호로 병기만 한다(예: 오케스트레이션(orchestration)).`,
    '1,500~3,500자 분량의 산문. 제목/카운트 나열식 금지 — 개념을 점진적으로 심화하는 교육적 어조.',
    '아톰의 claim/explanation/evidence를 잘라내지 말고 녹여 쓴다. 근거를 인용할 때 인라인 출처 링크 `[영상제목 (mm:ss)](url)`를 문장에 붙인다.',
    '앞 챕터 제목 목록과 중복되는 내용은 반복하지 말고 자연스럽게 이어간다.',
    '이 챕터 제목을 최상위 제목으로 다시 쓰지 말 것(조립 시 상위에서 붙는다). 소제목이 필요하면 `###`를 쓴다.',
  ];
  if (actionable) {
    rules.push(
      '이 챕터는 실행 챕터다: 번호가 매겨진 단계(1. 2. 3. …)와 바로 점검 가능한 체크리스트(- [ ] …), 그리고 즉시 적용 예시를 반드시 포함한다.',
    );
  }
  if (chapter.kind === 'apply' && request.researchPurpose === 'CONTENT_PLANNING') {
    rules.push('실전 적용은 콘텐츠 기획 워크시트 형태로: 타깃 문제 / 핵심 메시지 / 차별화 관점 / 콘텐츠 아이디어 칸을 채우도록 구성한다.');
  }

  const system =
    '너는 실용서를 집필하는 저자다. 아래 자료를 근거로 한 챕터를 완성한다. ' +
    '반드시 마크다운 산문만 출력한다(JSON 금지). 규칙:\n' +
    rules.map((r) => `- ${r}`).join('\n');

  const user = [
    `[주제] ${request.topic}`,
    `[이 챕터] ${chapter.title}`,
    `[챕터 목표] ${chapter.goal}`,
    '',
    '[앞선 챕터 제목]',
    previousTitles.length ? previousTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(없음 — 첫 챕터)',
    '',
    '[이 챕터가 다뤄야 할 아톰(주장 전문)]',
    atomFullText(atoms, videoTitles),
    '',
    '[원문 발췌 — 디테일을 살리는 데 사용]',
    excerptText(excerpts),
  ].join('\n');

  return { system, user };
}

/** Parse a WRITE response: strip fences, require >= MIN_CHAPTER_CHARS. */
export function parseChapterMarkdown(raw: string): string {
  const text = stripCodeFences(raw);
  if (text.length < MIN_CHAPTER_CHARS) {
    throw new ResearchParseError(`chapter too short (${text.length} < ${MIN_CHAPTER_CHARS})`);
  }
  return text;
}

/**
 * Deterministic fallback render for a chapter whose WRITE failed (parse/timeout/
 * transport). Renders the chapter goal + each atom's full text with a sourced
 * link — no truncation. Never throws. Pure.
 */
export function renderChapterFallback(
  chapter: BookChapterSpec,
  atoms: KnowledgeAtom[],
  videoTitles: Map<string, string>,
): string {
  const out: string[] = [];
  if (chapter.goal) out.push(`> 이 챕터의 목표: ${chapter.goal}`, '');
  if (atoms.length === 0) {
    out.push('_(집필에 사용할 근거 자료가 부족해 자동 요약을 생성하지 못했습니다. 부록의 주장 표를 참고하세요.)_');
    return out.join('\n');
  }
  for (const a of atoms) {
    const title = videoTitles.get(a.videoId) ?? a.videoId;
    out.push(`### ${a.claim}`);
    if (a.explanation) out.push('', a.explanation);
    if (a.evidence) out.push('', `> ${a.evidence}`);
    out.push('', `출처: [${title} (${mmss(a.startSeconds)})](${a.sourceUrl})`, '');
  }
  return out.join('\n').trim();
}

/**
 * Write one chapter. LLM prose on success; deterministic atom-based fallback on
 * any failure (parse too-short, transport, timeout) so the run never dies on a
 * single chapter (§12-A). Returns `fallback:true` when the fallback was used.
 */
export async function writeChapter(params: {
  chapter: BookChapterSpec;
  atoms: KnowledgeAtom[];
  excerpts: ChapterExcerpt[];
  previousTitles: string[];
  request: ResolvedResearchRequest;
  videoTitles: Map<string, string>;
  llm: LLMClient;
}): Promise<{ markdown: string; fallback: boolean }> {
  const { chapter, atoms, videoTitles, llm } = params;
  try {
    const prompt = buildChapterWritePrompt(params);
    const raw = await llm.complete({
      ...prompt,
      trace_name: `research.book.write.${chapter.chapterId}`,
    });
    return { markdown: parseChapterMarkdown(raw), fallback: false };
  } catch {
    return { markdown: renderChapterFallback(chapter, atoms, videoTitles), fallback: true };
  }
}

// ---------------------------------------------------------------------------
// 4. ASSEMBLE (pure)
// ---------------------------------------------------------------------------

/** Auto preface: topic, how to read, and the full chapter map. Deterministic. */
export function renderPreface(outline: BookOutline, request: ResolvedResearchRequest): string {
  const out: string[] = [];
  out.push(`# ${request.topic}`, '');
  out.push('## 서문 — 이 책을 읽는 법', '');
  const audience = request.targetAudience ? `${request.targetAudience}를 위해 ` : '';
  out.push(
    `이 책은 ${audience}"${request.topic}"에 대한 한·미 영상 자료를 분석해 한 권으로 엮은 심층 원고입니다. ` +
      '앞에서 뒤로 읽으면 전체 지형에서 시작해 핵심 개념, 방법론, 구체적 실행, 사례, 판단 기준, 실전 적용까지 점진적으로 깊어집니다. ' +
      '각 주장에는 원본 영상의 타임스탬프 출처가 인라인으로 달려 있어 바로 원문을 확인할 수 있습니다. ' +
      '신뢰성 근거(조사 방법·공통/충돌 주장 표·검증 결과·출처)는 맨 끝 부록에 정리했습니다.',
    '',
  );
  if (request.researchQuestion) {
    out.push(`이 책이 답하려는 질문: ${request.researchQuestion}`, '');
  }
  out.push('### 전체 지도', '');
  outline.chapters.forEach((c, i) => {
    out.push(`${i + 1}. **${c.title}** — ${c.goal}`);
  });
  out.push('');
  return out.join('\n');
}

/**
 * Assemble the full book: preface + chapters (in outline order) + appendix.
 * Chapter prose is injected (Map chapterId → markdown); a missing chapter gets a
 * placeholder. The appendix (reliability evidence) is rendered elsewhere and
 * passed in as a string. Pure.
 */
export function assembleBook(params: {
  outline: BookOutline;
  request: ResolvedResearchRequest;
  chapters: Map<string, string>;
  appendixMarkdown: string;
}): string {
  const { outline, request, chapters, appendixMarkdown } = params;
  const out: string[] = [];
  out.push(renderPreface(outline, request));

  outline.chapters.forEach((c, i) => {
    out.push(`## ${i + 1}. ${c.title}`, '');
    const body = chapters.get(c.chapterId);
    out.push(body && body.trim() ? body.trim() : '_(이 챕터는 생성되지 않았습니다.)_', '');
  });

  if (appendixMarkdown.trim()) {
    out.push(appendixMarkdown.trim(), '');
  }
  return out.join('\n');
}
